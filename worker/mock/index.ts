// The mock exam's routes (/api/mock/*, docs/MOCK-EXAM.md §6.3). The sitting lives here: the server owns the clock
// (clock.ts), the paper is frozen at the start (paper.ts), the CO/CE answers come in small PATCHes, the EE/EO stages
// are simulator sessions pointing at the mock (their texts and turns go through /api/expr/* as today), and the
// results are computed when the four exist. Every route runs inside the simulator's request context (the person,
// their language). A mock needs a working Gemini key; the key lives in the person's browser, which checks it before
// a sitting opens (web/app/mock/MockPage.tsx).
import { type Env, json, fail, nowIso, day, daysAgoIso, addWrites, holdReached, readJson, claimStart, releaseStart } from "../util.ts";
import type { Me } from "../auth.ts";
import { isOwnerEmail } from "../access.ts";
import { guardAmount } from "../guard.ts";
import { access } from "../expr.ts";
import { withCtx, startSession, abandonSession, forgetSession, NotFoundError, AiError, aiErrorResponse } from "../sim/index.ts";
import { all, one } from "../sim/db.ts";
import { advance, begin, endBreak, endTest, isPending, skip, stageEndsAt, testAfter, type Advanced, type Position } from "./clock.ts";
import { buildPaper, seenOf, PaperError } from "./paper.ts";
import { pickMockTopics } from "./topics.ts";
import { certificateDue, overallOf, scoreCoce } from "./score.ts";
import { answersOf, endedOf, paperOf, parse, resultOf, runningMock, toMock, toMockRow, topicsOf } from "./row.ts";
import { COLS, GRACE_MS, PENDING_S, STAGE_SECONDS, isTest, type Answer, type Ended, type EndedJson, type ExprResult, type KeyRow, type Paper, type Result, type Row, type Stage, type Status, type TestStage, type Topics } from "./types.ts";

export { runningMock, toMockRow } from "./row.ts";

/** rows the list gives at most */
const LIST_MAX = 100;
/** an EE/EO practice session started this recently still counts as running (older ones were left behind) */
const SESSION_BLOCK_MS = 2 * 3600_000;
/** a sitting nobody moved for this long is closed by the nightly job */
const STALE_MS = 12 * 3600_000;

type Body = Record<string, unknown>;
const isKey = (v: unknown): v is Answer => v === "A" || v === "B" || v === "C" || v === "D" || v === "-";
const owner = (env: Env, me: Me) => isOwnerEmail(env, me.email) || env.ADMIN_OPEN === "1";

const select = (env: Env, id: number, userId?: string) =>
  userId == null
    ? env.DB.prepare(`SELECT ${COLS} FROM mocks WHERE id = ?`).bind(id).first<Row>()
    : env.DB.prepare(`SELECT ${COLS} FROM mocks WHERE id = ? AND user_id = ?`).bind(id, userId).first<Row>();

/* ---------- the key files ---------- */

/** the answer keys live in R2 under private/ (scripts/upload-keys.mjs at each deploy), never among the site's files;
 *  this Mac's build still has them beside the pages, read when R2 has none */
async function loadKey(env: Env, section: "co" | "ce"): Promise<KeyRow[] | null> {
  try {
    const obj = await env.FILES.get(`private/key-${section}.json`);
    let text: string;
    if (obj) text = await obj.text();
    else {
      const r = await env.ASSETS.fetch(new Request(`https://assets/data/key-${section}.json`));
      if (!r.ok) return null;
      text = await r.text();
    }
    const rows = JSON.parse(text) as Partial<KeyRow>[];
    if (!Array.isArray(rows) || !rows.length) return null;
    return rows.filter((q): q is KeyRow => typeof q.id === "string" && typeof q.level === "string" && isKey(q.answer) && (q.answer as string) !== "-");
  } catch { return null; }
}

/* ---------- moving the sitting ---------- */

const posOf = (r: Row): Position => ({ stage: r.stage, stageStartedAt: r.stage_started_at, breakUntil: r.break_until });

/** the EE or EO result from its session, null while the stage was never reached */
async function exprResult(env: Env, sessionId: string | null): Promise<ExprResult | null> {
  if (!sessionId) return null;
  const s = await env.DB.prepare("SELECT status, score, nclc, level FROM expr_sessions WHERE id = ?").bind(sessionId).first<{ status: string; score: number | null; nclc: number | null; level: string | null }>();
  if (!s) return null;
  const t = await env.DB.prepare("SELECT COUNT(*) n FROM expr_tasks WHERE session_id = ? AND status = 'done' AND score20 IS NOT NULL").bind(sessionId).first<{ n: number }>();
  return { score20: s.status === "done" ? s.score : null, nclc: s.status === "done" ? s.nclc : null, level: s.status === "done" ? s.level : null, marked: t?.n ?? 0, of: 3, status: s.status };
}

/**
 * Writes the moves of `adv` on the row: a closed CO/CE is scored from the paper, a closed EE/EO notes how it ended
 * (its marks come through the simulator), a started EE/EO gets its session, and the position moves. One batch, one
 * count of writes. Returns the row read back.
 */
async function apply(env: Env, row: Row, adv: Advanced, extra: Partial<EndedJson> = {}): Promise<Row> {
  const ended = { ...endedOf(row), ...extra };
  const paper = paperOf(row);
  const sets: string[] = [], args: unknown[] = [];
  for (const c of adv.closes) {
    ended[c.stage] = c.how;
    if (c.stage === "co" || c.stage === "ce") {
      const result = scoreCoce(c.stage, paper[c.stage], answersOf(row, c.stage), c.how, c.at);
      sets.push(`${c.stage}_result = ?`); args.push(JSON.stringify(result));
    }
  }
  const topics = topicsOf(row);
  for (const s of adv.starts) {
    if (s.stage === "ee" && !row.ee_session_id) {
      const started = await startSession({ section: "ee", kind: "exam", taches: [1, 2, 3], topicIds: topics.ee != null ? { 1: topics.ee } : {}, mockId: row.id, seconds: STAGE_SECONDS.ee, startedAt: s.at });
      row.ee_session_id = started.sessionId;
      sets.push("ee_session_id = ?"); args.push(started.sessionId);
      await addWrites(env, 4);
    }
    if (s.stage === "eo" && !row.eo_session_id) {
      const ids: Partial<Record<2 | 3, number>> = {};
      if (topics.eo.t2 != null) ids[2] = topics.eo.t2;
      if (topics.eo.t3 != null) ids[3] = topics.eo.t3;
      const started = await startSession({ section: "eo", kind: "exam", taches: [1, 2, 3], topicIds: ids, mode: row.mic_mode === "ptt" ? "ptt" : "live", mockId: row.id, startedAt: s.at });
      row.eo_session_id = started.sessionId;
      sets.push("eo_session_id = ?"); args.push(started.sessionId);
      await addWrites(env, 4);
    }
  }
  const moved = adv.stage !== row.stage || adv.stageStartedAt !== row.stage_started_at || adv.breakUntil !== row.break_until;
  if (moved) { sets.push("stage = ?", "stage_started_at = ?", "break_until = ?"); args.push(adv.stage, adv.stageStartedAt, adv.breakUntil); }
  if (adv.stage === "marking" && row.status === "running") { sets.push("status = 'marking'"); }
  if (adv.closes.length || Object.keys(extra).length) { sets.push("ended_json = ?"); args.push(JSON.stringify(ended)); }
  if (!sets.length) return row;
  await env.DB.prepare(`UPDATE mocks SET ${sets.join(", ")} WHERE id = ?`).bind(...args, row.id).run();
  await addWrites(env, 1);
  return (await select(env, row.id))!;
}

/** the four results and the overall, from the row and its sessions */
async function results(env: Env, row: Row): Promise<Result> {
  const [ee, eo] = await Promise.all([exprResult(env, row.ee_session_id), exprResult(env, row.eo_session_id)]);
  const r = { co: resultOf(row, "co"), ce: resultOf(row, "ce"), ee, eo };
  return { ...r, overall: overallOf(r), at: nowIso() };
}

/** in the marking stage: once the four results exist the sitting is done (one write); `force` closes it with what exists */
async function finalize(env: Env, row: Row, force = false): Promise<Row> {
  if (row.status !== "marking" && !(force && row.status === "running")) return row;
  const r = await results(env, row);
  const complete = r.ee?.status === "done" && r.eo?.status === "done" && r.co && r.ce;
  if (!complete && !force) return row;
  const ended = endedOf(row);
  const status: Status = "done";
  const cert = certificateDue(status, ended, r);
  await env.DB.prepare("UPDATE mocks SET status = ?, stage = 'over', finished_at = ?, result_json = ?, certificate = ? WHERE id = ?").bind(status, r.at, JSON.stringify(r), cert ? 1 : 0, row.id).run();
  await addWrites(env, 1);
  return (await select(env, row.id))!;
}

/** the row brought to where the clock says, and finalized when its marks are in */
async function open(env: Env, row: Row): Promise<Row> {
  if (row.finished_at) return row;
  const adv = advance(posOf(row), Date.now());
  const moved = await apply(env, row, adv);
  return finalize(env, moved);
}

/** the sitting ends here: the running test is scored as it stands, the rest is not taken, no certificate */
async function abandon(env: Env, row: Row, how: Ended = "abandon"): Promise<Row> {
  if (row.finished_at) return row;
  let r = row;
  if (isTest(r.stage)) r = await apply(env, r, endTest(posOf(r), Date.now(), "abandon"), { [r.stage]: how });
  // left during a break: the test that was to follow was never taken
  else if (r.stage === "break1" || r.stage === "break2" || r.stage === "break3") r = await apply(env, r, { ...posOf(r), closes: [], starts: [] }, { [testAfter(r.stage)]: how });
  for (const sid of [r.ee_session_id, r.eo_session_id]) if (sid) await abandonSession(sid).catch(() => null);
  const res = await results(env, r);
  await env.DB.prepare("UPDATE mocks SET status = 'abandoned', stage = 'over', finished_at = ?, result_json = ?, certificate = 0 WHERE id = ?").bind(res.at, JSON.stringify(res), r.id).run();
  await addWrites(env, 1);
  return (await select(env, r.id))!;
}

/** the nightly job: sittings nobody moved for twelve hours are abandoned as `stale`; markings never finished are closed with what exists */
export async function finalizeStaleMocks(env: Env): Promise<number> {
  // a bounded batch a night (an abandoned mock left over closes the next night, or when its owner comes back)
  const { results: rows } = await env.DB.prepare(`SELECT ${COLS} FROM mocks WHERE finished_at IS NULL LIMIT 100`).all<Row>();
  let n = 0;
  for (const row of rows) {
    const last = Math.max(Date.parse(row.started_at), Date.parse(row.stage_started_at ?? "") || 0, Date.parse(row.break_until ?? "") || 0);
    if (Date.now() - last < STALE_MS) continue;
    const me = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(row.user_id).first<{ id: string; email: string }>();
    if (!me) continue;
    const a = await access(env, { ...me, sid: "" } as Me);
    await withCtx({ env, user: me, lang: a?.lang ?? "fr" }, async () => {
      const r = await apply(env, row, advance(posOf(row), Date.now()));
      if (r.status === "marking") await finalize(env, r, true);
      else await abandon(env, r, "stale");
    }).catch((e) => console.error("stale mock", row.id, e));
    n++;
  }
  return n;
}

/* ---------- routes ---------- */

export async function handleMock(req: Request, env: Env, me: Me, path: string, url: URL): Promise<Response> {
  const a = await access(env, me);
  if (!a) return fail(401, "signed out");
  try {
    return await withCtx({ env, user: { id: me.id, email: me.email }, lang: a.lang }, () => route(req, env, me, path, url));
  } catch (e) {
    if (e instanceof PaperError) { console.error(e); return json({ error: "bank" }, 500); }
    if (e instanceof NotFoundError) return json({ error: "not found" }, 404);
    if (e instanceof Error && !(e instanceof AiError) && /D1_|SQLITE|sqlite/i.test(e.message)) { console.error(e); return fail(500, "server error"); }
    return aiErrorResponse(e);
  }
}

async function route(req: Request, env: Env, me: Me, path: string, url: URL): Promise<Response> {
  const post = req.method === "POST";
  const body = async (): Promise<Body> => (await readJson<Body>(req)) ?? {};

  if (path === "/mock") {
    if (!post) return fail(405, "POST");
    const b = await body();
    const micMode = b.micMode === "ptt" ? "ptt" : b.micMode === "live" ? "live" : null;
    if (!micMode) return fail(400, "micMode");
    const running = await runningMock(env, me.id);
    if (running) return json({ error: "running", mock: toMockRow(await open(env, running)) }, 409);
    // never while an exam attempt or a simulator session runs (docs/MOCK-EXAM.md §7)
    const attempt = await env.DB.prepare("SELECT id, section, exam FROM attempts WHERE user_id = ? AND finished_at IS NULL AND deadline_at >= ? ORDER BY id LIMIT 1").bind(me.id, new Date(Date.now() - GRACE_MS).toISOString()).first<{ id: number; section: string; exam: number }>();
    if (attempt) return json({ error: "attempt_running", attempt }, 409);
    const session = await env.DB.prepare("SELECT id, section FROM expr_sessions WHERE user_id = ? AND status = 'in_progress' AND mock_id IS NULL AND started_at >= ? ORDER BY started_at DESC LIMIT 1").bind(me.id, new Date(Date.now() - SESSION_BLOCK_MS).toISOString()).first<{ id: string; section: string }>();
    if (session) return json({ error: "session_running", session }, 409);
    if (await holdReached(env)) return json({ error: "hold" }, 503);
    const { row: slot, today } = await claimStart(env, me.id, "mock");
    const stopped = await guardAmount(env, me, "starts", today, req);
    if (stopped) { await releaseStart(env, slot); return stopped; }
    // the paper: the whole bank by the quotas, never a question of a previous mock while there are fresh ones
    const [keyCo, keyCe, previous] = await Promise.all([loadKey(env, "co"), loadKey(env, "ce"), env.DB.prepare("SELECT paper_json, topics_json FROM mocks WHERE user_id = ? ORDER BY started_at").bind(me.id).all<{ paper_json: string; topics_json: string }>()]);
    if (!keyCo || !keyCe) { await releaseStart(env, slot); return json({ error: "bank" }, 500); }
    const papers = previous.results.map((r) => { const p = parse<Partial<Paper>>(r.paper_json, {}); return { co: p.co ?? [], ce: p.ce ?? [] }; });
    const paper: Paper = { co: buildPaper(keyCo, seenOf(papers, "co")), ce: buildPaper(keyCe, seenOf(papers, "ce")) };
    const had = previous.results.map((r) => parse<Partial<Topics>>(r.topics_json, {}));
    const topics = await pickMockTopics({ ee: had.map((t) => t.ee).filter((x): x is number => typeof x === "number"), eoParts: had.map((t) => t.eo?.partId).filter((x): x is number => typeof x === "number") });
    const now = nowIso();
    // the first test is entered pending: its clock starts when the room is rendered (`begin`), at the latest in 90 s
    const latest = new Date(Date.now() + PENDING_S * 1000).toISOString();
    const r = await env.DB.prepare("INSERT INTO mocks (user_id, started_at, status, stage, stage_started_at, break_until, paper_json, topics_json, mic_mode) VALUES (?, ?, 'running', 'co', NULL, ?, ?, ?, ?)")
      .bind(me.id, now, latest, JSON.stringify(paper), JSON.stringify(topics), micMode).run();
    await addWrites(env, 1);
    // two starts at once (a double tap, two tabs): the older row stands, this one is taken back
    const live = await env.DB.prepare(`SELECT ${COLS} FROM mocks WHERE user_id = ? AND finished_at IS NULL ORDER BY id LIMIT 1`).bind(me.id).first<Row>();
    if (live && live.id !== r.meta.last_row_id) {
      await env.DB.prepare("DELETE FROM mocks WHERE id = ? AND finished_at IS NULL").bind(r.meta.last_row_id).run();
      await releaseStart(env, slot);
      return json({ error: "running", mock: toMockRow(live) }, 409);
    }
    return json({ mock: toMock(live ?? (await select(env, Number(r.meta.last_row_id)))!) }, 201);
  }

  if (path === "/mock/running") {
    if (post) return fail(405, "GET");
    const row = await runningMock(env, me.id);
    return json({ mock: row ? toMockRow(await open(env, row)) : null });
  }

  if (path === "/mock/list") {
    if (post) return fail(405, "GET");
    const { results: rows } = await env.DB.prepare(`SELECT ${COLS} FROM mocks WHERE user_id = ? ORDER BY started_at DESC, id DESC LIMIT ?`).bind(me.id, LIST_MAX).all<Row>();
    const out = [];
    for (const r of rows) out.push(toMockRow(r.finished_at ? r : await open(env, r)));
    return json({ mocks: out });
  }

  const m = path.match(/^\/mock\/(\d{1,12})(?:\/(next|abandon|finalize|skip|begin))?$/);
  if (!m) return fail(404, "not found");
  const id = Number(m[1]);
  let row = await select(env, id, me.id);
  if (!row) return fail(404, "not found");
  const action = m[2];

  if (!action && req.method === "GET") return json({ mock: toMock(await open(env, row)) });

  if (!action && req.method === "DELETE") {
    if (!row.finished_at) return json({ error: "running", mock: toMockRow(row) }, 409);
    for (const sid of [row.ee_session_id, row.eo_session_id]) if (sid) await forgetSession(sid).catch(() => null);
    await env.DB.prepare("DELETE FROM mocks WHERE id = ? AND user_id = ? AND finished_at IS NOT NULL").bind(row.id, me.id).run();
    await addWrites(env, 1);
    return json({ ok: true });
  }

  if (!action && req.method === "PATCH") {
    if (row.finished_at) return json({ error: "finished", mock: toMockRow(row) }, 409);
    row = await open(env, row);
    const b = await body();
    const stage = b.stage === "co" || b.stage === "ce" ? b.stage : null;
    if (!stage) return fail(400, "stage");
    if (row.stage !== stage || isPending(posOf(row))) return json({ error: "late", mock: toMockRow(row) }, 409);
    const end = stageEndsAt(posOf(row)) ?? 0;
    const at = typeof b.at === "number" ? b.at : typeof b.at === "string" ? Date.parse(b.at) : NaN;
    if (Date.now() > end && Number.isFinite(at) && at > end) return json({ error: "late", mock: toMockRow(row) }, 409);
    const given = b.answers && typeof b.answers === "object" && !Array.isArray(b.answers) ? (b.answers as Record<string, unknown>) : null;
    if (!given) return fail(400, "answers");
    const ids = new Set(paperOf(row)[stage].map((q) => q.id));
    const answers = answersOf(row, stage);
    let changed = false, n = 0;
    for (const [qid, v] of Object.entries(given)) {
      if (++n > 100) break;
      if (!ids.has(qid) || !isKey(v) || answers[qid] === v) continue;
      answers[qid] = v;
      changed = true;
    }
    if (changed) {
      await env.DB.prepare(`UPDATE mocks SET ${stage}_answers = ? WHERE id = ? AND finished_at IS NULL`).bind(JSON.stringify(answers), row.id).run();
      await addWrites(env, 1);
      row = (await select(env, row.id))!;
    }
    return json({ mock: toMock(row) });
  }

  if (!post) return fail(405, "POST");
  if (action === "abandon") {
    if (row.finished_at) return json({ error: "finished", mock: toMockRow(row) }, 409);
    return json({ mock: toMock(await abandon(env, row)) });
  }
  if (action === "finalize") {
    row = await open(env, row);
    return json({ mock: toMock(row) });
  }
  // the room is rendered: the pending test's clock starts now (a second call changes nothing)
  if (action === "begin") {
    if (row.finished_at) return json({ error: "finished", mock: toMockRow(row) }, 409);
    row = await open(env, row);
    if (isPending(posOf(row))) row = await apply(env, row, begin(posOf(row), Date.now()));
    return json({ mock: toMock(row) });
  }
  if (action === "skip") {
    if (!owner(env, me)) return fail(403, "owner only");
    if (row.finished_at) return json({ error: "finished", mock: toMockRow(row) }, 409);
    row = await open(env, row);
    row = await apply(env, row, skip(posOf(row), Date.now()));
    return json({ mock: toMock(await finalize(env, row)) });
  }
  // next: the end of the running test (Terminer, the clock at zero) or of the running break (« Continuer », zero, the press)
  if (row.finished_at) return json({ error: "finished", mock: toMockRow(row) }, 409);
  row = await open(env, row);
  const b = await body();
  const from = typeof b.from === "string" ? (b.from as Stage) : null;
  if (!from) return fail(400, "from");
  // the stage already moved past `from` (a second call, the clock did it): the row as it is
  if (row.stage !== from) return json({ mock: toMock(row) });
  if (isTest(row.stage)) {
    const how = b.how === "abandon" ? "abandon" : "done";
    row = await apply(env, row, endTest(posOf(row), Date.now(), how));
  } else if (row.stage === "break1" || row.stage === "break2" || row.stage === "break3") {
    const moved = endBreak(posOf(row), Date.now());
    row = await apply(env, row, moved, moved.stage === "eo" ? { eoLateS: moved.lateS } : {});
  }
  return json({ mock: toMock(await finalize(env, row)) });
}

/** the dashboard's numbers (worker/stats.ts): the mocks' count, best overall, the last one's four NCLC */
export async function mockStats(env: Env, userId: string) {
  const { results: rows } = await env.DB.prepare("SELECT id, started_at, finished_at, status, result_json FROM mocks WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY started_at").bind(userId).all<{ id: number; started_at: string; finished_at: string; status: string; result_json: string | null }>();
  let best: number | null = null;
  const done = rows.map((r) => ({ ...r, result: parse<Result | null>(r.result_json, null) }));
  for (const r of done) if (r.result?.overall != null) best = Math.max(best ?? 0, r.result.overall);
  const last = done[done.length - 1];
  return {
    count: rows.length, best,
    last: last ? { id: last.id, at: last.finished_at, status: last.status, nclc: { co: last.result?.co?.nclc ?? null, ce: last.result?.ce?.nclc ?? null, ee: last.result?.ee?.nclc ?? null, eo: last.result?.eo?.nclc ?? null }, overall: last.result?.overall ?? null } : null,
    /** the CO/CE results of every finished mock, for the sections' series */
    coce: done.flatMap((r) => (["co", "ce"] as const).flatMap((s) => (r.result?.[s] ? [{ section: s, nclc: r.result[s]!.nclc, at: r.finished_at, id: r.id }] : []))),
  };
}
