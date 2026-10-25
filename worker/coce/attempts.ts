// CO/CE exam attempts (docs/COCE.md §3). The attempt lives here: the deadline is the server's clock, the answers
// come in small PATCHes while the exam runs, and the score is computed on the server from the exam's own file
// (public/data/exam-<section>-<NN>.json, read through ASSETS: static, no database). A person sees only their own rows.
import { type Env, json, fail, nowIso, day, daysAgoIso, addWrites, holdReached, claimStart, releaseStart, readJson } from "../util.ts";
import type { Me } from "../auth.ts";
import { type Level, type Section, LEVELS, POINTS } from "../../shared/progress.ts";
import reference from "../sim/exam-reference.json" with { type: "json" };
import { runningMock, toMockRow } from "../mock/row.ts";
import { guardAmount, canaryPlacement, trapped } from "../guard.ts";

/** minutes allowed */
export const DURATION_MIN: Record<Section, number> = { co: 35, ce: 60 };
/** exams in the bank (exam-co-01 … exam-co-40) */
export const EXAMS = 40;
/** answers are still taken this long after the deadline (the browser's last PATCH on the way) */
const GRACE_MS = 120_000;
/** rows the list gives at most */
const LIST_MAX = 200;

type Key = "A" | "B" | "C" | "D";
export type Answer = Key | "-";
export type Answers = Record<string, Answer>;
type Ended = "done" | "time" | "abandon";
/** how the attempt is taken: the real conditions, or the same questions and clock with free movement */
export type Mode = "exam" | "training";
type ByLevel = Record<Level, { right: number; of: number }>;

type Row = {
  id: number; user_id: string; section: Section; exam: number; started_at: string; deadline_at: string;
  finished_at: string | null; ended: Ended | null; answers: string; score: number | null; nclc: number | null;
  right_count: number | null; wrong_count: number | null; blank_count: number | null; by_level: string | null;
  mode: Mode;
};

export type AttemptRow = {
  id: number; section: Section; exam: number; mode: Mode; startedAt: string; deadlineAt: string; finishedAt: string | null;
  ended: Ended | null; score: number | null; nclc: number | null; right: number | null; wrong: number | null; blank: number | null;
};
export type Attempt = AttemptRow & { answers: Answers; byLevel?: ByLevel };

type ExamQuestion = { placement: string; level: Level; answer: Key };

const isSection = (v: unknown): v is Section => v === "co" || v === "ce";
const isKey = (v: unknown): v is Key => v === "A" || v === "B" || v === "C" || v === "D";
const isMode = (v: unknown): v is Mode => v === "exam" || v === "training";
/** "CO-12-05": section, exam 01…40, position 01…39 */
const PLACEMENT = /^C[OE]-\d{2}-(0[1-9]|[12]\d|3\d)$/;
const COLS = "id, user_id, section, exam, started_at, deadline_at, finished_at, ended, answers, score, nclc, right_count, wrong_count, blank_count, by_level, mode";

const parseJson = <T>(s: string | null, fallback: T): T => { try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } };

const toRow = (r: Row): AttemptRow => ({
  id: r.id, section: r.section, exam: r.exam, mode: r.mode === "training" ? "training" : "exam", startedAt: r.started_at, deadlineAt: r.deadline_at, finishedAt: r.finished_at,
  ended: r.ended, score: r.score, nclc: r.nclc, right: r.right_count, wrong: r.wrong_count, blank: r.blank_count,
});
const toAttempt = (r: Row): Attempt => {
  const a: Attempt = { ...toRow(r), answers: parseJson<Answers>(r.answers, {}) };
  if (r.finished_at && r.by_level) a.byLevel = parseJson<ByLevel>(r.by_level, emptyByLevel());
  return a;
};
const emptyByLevel = (): ByLevel => {
  const out = {} as ByLevel;
  for (const l of LEVELS) out[l] = { right: 0, of: 0 };
  return out;
};

/* ---------- scoring ---------- */

type Range = { nclc: number; comprehension_orale: number[]; comprehension_ecrite: number[] };
const NCLC_ROWS: Range[] = reference.nclc.rows;

/** the NCLC level of a score (IRCC table), null below NCLC 4 */
export function nclcOf(section: Section, score: number): number | null {
  const field = section === "co" ? "comprehension_orale" : "comprehension_ecrite";
  for (const r of NCLC_ROWS) { const [lo, hi] = r[field]; if (score >= lo && score <= hi) return r.nclc; }
  return null;
}

/** right answers add their level's points: the real sum, no floor */
export function scoreAnswers(section: Section, questions: ExamQuestion[], answers: Answers) {
  let sum = 0, right = 0, wrong = 0, blank = 0;
  const byLevel = emptyByLevel();
  for (const q of questions) {
    const a = answers[q.placement];
    const lv = byLevel[q.level] ?? (byLevel[q.level] = { right: 0, of: 0 });
    lv.of++;
    if (!a || a === "-") { blank++; continue; }
    if (a === q.answer) { right++; lv.right++; sum += POINTS[q.level] ?? 0; } else wrong++;
  }
  // the points as they add up (the official scale floors at 100; the owner wants the real sum shown)
  const score = sum;
  return { score, nclc: nclcOf(section, score), right, wrong, blank, byLevel };
}

/** the exam's file, as the Content piece exports it; null when it is missing or is not the file (a page, say) */
/** an exam file read once per server (the 80 files never change between deploys): only what scoring needs is kept */
const examsOf = new WeakMap<object, Map<string, Promise<ExamQuestion[] | null>>>();
function loadExam(env: Env, section: Section, exam: number): Promise<ExamQuestion[] | null> {
  // kept per set of built files (one in production; each test brings its own)
  let exams = examsOf.get(env.ASSETS);
  if (!exams) { exams = new Map(); examsOf.set(env.ASSETS, exams); }
  const k = `${section}-${exam}`;
  let p = exams.get(k);
  if (!p) {
    p = readExam(env, section, exam).then((q) => q?.map(({ placement, level, answer }) => ({ placement, level, answer }) as ExamQuestion) ?? null);
    p.then((q) => { if (!q) exams!.delete(k); });
    exams.set(k, p);
  }
  return p;
}
async function readExam(env: Env, section: Section, exam: number): Promise<ExamQuestion[] | null> {
  try {
    const r = await env.ASSETS.fetch(new Request(`https://assets/data/exam-${section}-${String(exam).padStart(2, "0")}.json`));
    if (!r.ok) return null;
    const rows = (await r.json()) as Partial<ExamQuestion>[];
    if (!Array.isArray(rows) || !rows.length) return null;
    // the file's hidden question (position 40, worker/guard.ts) is never scored
    return rows.filter((q): q is ExamQuestion => typeof q.placement === "string" && PLACEMENT.test(q.placement) && typeof q.level === "string" && isKey(q.answer));
  } catch {
    return null;
  }
}

/** "CO-12-" — the placements that belong to this attempt's exam; answers for any other are not kept */
const prefixOf = (section: Section, exam: number) => `${section.toUpperCase()}-${String(exam).padStart(2, "0")}-`;

/** an answer for the exam file's hidden question (worker/guard.ts canaryPlacement): no page shows it, a program sent it */
function canaryOf(row: Row, b: Record<string, unknown>): string | null {
  const given = b.answers && typeof b.answers === "object" && !Array.isArray(b.answers) ? Object.keys(b.answers) : [];
  const prefix = prefixOf(row.section, row.exam);
  return given.find((k) => k.startsWith(prefix) && canaryPlacement(k)) ?? null;
}

/** the answers a request brings, laid over the row's (only this exam's placements, at most 100); inside the grace only
 *  answers stamped before the deadline count. Returns "late" when they come too late, else whether anything changed. */
function mergeAnswers(row: Row, b: Record<string, unknown>): "late" | boolean {
  const deadline = Date.parse(row.deadline_at);
  const at = typeof b.at === "number" ? b.at : typeof b.at === "string" ? Date.parse(b.at) : NaN;
  if (Date.now() > deadline && Number.isFinite(at) && at > deadline) return "late";
  const given = b.answers && typeof b.answers === "object" && !Array.isArray(b.answers) ? (b.answers as Record<string, unknown>) : null;
  if (!given) return false;
  const answers = parseJson<Answers>(row.answers, {});
  const prefix = prefixOf(row.section, row.exam);
  let changed = false, n = 0;
  for (const [placement, v] of Object.entries(given)) {
    if (++n > 100) break;
    if (!PLACEMENT.test(placement) || !placement.startsWith(prefix) || !(isKey(v) || v === "-")) continue;
    if (answers[placement] === v) continue;
    answers[placement] = v;
    changed = true;
  }
  if (changed) row.answers = JSON.stringify(answers);
  return changed;
}

/* ---------- finishing ---------- */

/** the UPDATE that closes an attempt with its score */
async function finishStatement(env: Env, row: Row, ended: Ended, at: string): Promise<D1PreparedStatement | null> {
  const questions = await loadExam(env, row.section, row.exam);
  if (!questions) return null;
  const s = scoreAnswers(row.section, questions, parseJson<Answers>(row.answers, {}));
  return env.DB.prepare("UPDATE attempts SET finished_at = ?, ended = ?, score = ?, nclc = ?, right_count = ?, wrong_count = ?, blank_count = ?, by_level = ?, answers = ? WHERE id = ? AND finished_at IS NULL")
    .bind(at, ended, s.score, s.nclc, s.right, s.wrong, s.blank, JSON.stringify(s.byLevel), row.answers, row.id);
}

async function finishRow(env: Env, row: Row, ended: Ended): Promise<Row | null> {
  const at = nowIso();
  const st = await finishStatement(env, row, ended, at);
  if (!st) return null;
  await st.run();
  await addWrites(env, 1);
  return (await env.DB.prepare(`SELECT ${COLS} FROM attempts WHERE id = ?`).bind(row.id).first<Row>()) ?? null;
}

/** the person's running attempt, closed first with `time` when its deadline has passed (plus the grace) */
/** what runs for this person: the exam attempt and the mock (the band works the mock's stage out from the clock rules,
 *  docs/MOCK-EXAM.md §3.3); also sent with GET /me, so a page load needs no request of its own for it */
export async function runningNow(env: Env, userId: string) {
  const [row, mock] = await Promise.all([running(env, userId), runningMock(env, userId)]);
  return { attempt: row ? toAttempt(row) : null, mock: mock ? toMockRow(mock) : null };
}

async function running(env: Env, userId: string): Promise<Row | null> {
  const row = await env.DB.prepare(`SELECT ${COLS} FROM attempts WHERE user_id = ? AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1`).bind(userId).first<Row>();
  if (!row) return null;
  if (Date.now() <= Date.parse(row.deadline_at) + GRACE_MS) return row;
  await finishRow(env, row, "time");
  return null;
}

/** the nightly job: every running attempt past its deadline, any person, scored as `time`; returns how many */
export async function finalizeStale(env: Env): Promise<number> {
  const cutoff = new Date(Date.now() - GRACE_MS).toISOString();
  // only the newest 20 000 attempts are looked at (a range of ids: the rows read stay bounded however large the table
  // grows); an older one still running is closed the next time its owner opens the app (GET /me asks what runs)
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM attempts WHERE id > (SELECT COALESCE(MAX(id), 0) FROM attempts) - 20000 AND finished_at IS NULL AND deadline_at < ? LIMIT 200`).bind(cutoff).all<Row>();
  if (!results.length) return 0;
  const at = nowIso();
  const stmts: D1PreparedStatement[] = [];
  for (const row of results) {
    const st = await finishStatement(env, row, "time", at);
    if (st) stmts.push(st);
  }
  if (stmts.length) { await env.DB.batch(stmts); await addWrites(env, stmts.length); }
  return stmts.length;
}

/* ---------- routes ---------- */

type Body = Record<string, unknown>;
const readBody = async (req: Request): Promise<Body> => { const b = await readJson<Body>(req); return b && typeof b === "object" ? b : {}; };

export async function handleAttempts(req: Request, env: Env, me: Me, path: string, url: URL): Promise<Response> {
  const post = req.method === "POST";

  if (path === "/attempts") {
    if (req.method === "GET") {
      const section = url.searchParams.get("section");
      if (!isSection(section)) return fail(400, "section");
      await running(env, me.id);
      const { results } = await env.DB.prepare(`SELECT ${COLS} FROM attempts WHERE user_id = ? AND section = ? ORDER BY started_at DESC, id DESC LIMIT ?`)
        .bind(me.id, section, LIST_MAX).all<Row>();
      return json({ attempts: results.map(toRow) });
    }
    if (!post) return fail(405, "GET or POST");
    const b = await readBody(req);
    const section = b.section;
    const exam = Number(b.exam);
    if (!isSection(section)) return fail(400, "section");
    if (!Number.isInteger(exam) || exam < 1 || exam > EXAMS) return fail(400, "exam");
    // the mode is optional (exam); anything but exam | training is refused
    if (b.mode != null && !isMode(b.mode)) return fail(400, "mode");
    const mode: Mode = isMode(b.mode) ? b.mode : "exam";
    const open = await running(env, me.id);
    if (open) return json({ running: toAttempt(open) }, 409);
    // never while a mock exam runs (docs/MOCK-EXAM.md §7)
    const mock = await runningMock(env, me.id);
    if (mock) return json({ error: "mock_running", mock: toMockRow(mock) }, 409);
    if (await holdReached(env)) return json({ error: "hold" }, 503);
    const { row: slot, today } = await claimStart(env, me.id, "attempt");
    const stopped = await guardAmount(env, me, "starts", today, req);
    if (stopped) { await releaseStart(env, slot); return stopped; }
    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + DURATION_MIN[section] * 60_000);
    const r = await env.DB.prepare("INSERT INTO attempts (user_id, section, exam, mode, started_at, deadline_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(me.id, section, exam, mode, startedAt.toISOString(), deadlineAt.toISOString()).run();
    await addWrites(env, 2);
    // read back the oldest live attempt of the person: ours, unless a second start slipped in between the check above
    // and the insert (a double tap, two tabs): then the older one stands and this row is taken back
    const live = await env.DB.prepare(`SELECT ${COLS} FROM attempts WHERE user_id = ? AND finished_at IS NULL AND deadline_at >= ? ORDER BY id LIMIT 1`)
      .bind(me.id, new Date(Date.now() - GRACE_MS).toISOString()).first<Row>();
    if (live && live.id !== r.meta.last_row_id) {
      await env.DB.prepare("DELETE FROM attempts WHERE id = ? AND finished_at IS NULL").bind(r.meta.last_row_id).run();
      await releaseStart(env, slot);
      return json({ running: toAttempt(live) }, 409);
    }
    const row = live ?? (await env.DB.prepare(`SELECT ${COLS} FROM attempts WHERE id = ?`).bind(r.meta.last_row_id).first<Row>());
    return json({ attempt: toAttempt(row!) }, 201);
  }

  if (path === "/attempts/running") {
    if (req.method !== "GET") return fail(405, "GET");
    return json(await runningNow(env, me.id));
  }

  const m = path.match(/^\/attempts\/(\d{1,12})(\/finish)?$/);
  if (!m) return fail(404, "not found");
  const id = Number(m[1]);
  let row = await env.DB.prepare(`SELECT ${COLS} FROM attempts WHERE id = ? AND user_id = ?`).bind(id, me.id).first<Row>();
  if (!row) return fail(404, "not found");
  const late = () => Date.now() > Date.parse(row!.deadline_at) + GRACE_MS;

  if (m[2]) {
    if (!post) return fail(405, "POST");
    if (row.finished_at) return json({ error: "finished", attempt: toAttempt(row) }, 409);
    const b = await readBody(req);
    const canary = canaryOf(row, b);
    if (canary) return trapped(env, req, `canary question answered (${canary})`, me);
    const asked = b.ended === "abandon" ? "abandon" : b.ended === "done" ? "done" : null;
    if (!asked) return fail(400, "ended");
    // the last answers may ride with the finish (stored by the finishing UPDATE itself, no extra write)
    if (!late()) mergeAnswers(row, b);
    // a finish that arrives after the deadline (the room froze at 00:00 and sent it) is a time-out, grace or not
    const pastDeadline = Date.now() > Date.parse(row.deadline_at);
    const done = await finishRow(env, row, late() || pastDeadline ? "time" : asked);
    if (!done) return fail(500, "exam file missing");
    return json({ attempt: toAttempt(done) });
  }

  if (req.method === "GET") {
    if (!row.finished_at && late()) row = (await finishRow(env, row, "time")) ?? row;
    return json({ attempt: toAttempt(row) });
  }

  // a finished attempt of one's own goes for good (the dashboard and the lists no longer count it); one still running
  // is kept (409): it ends first, by its owner or by the clock
  if (req.method === "DELETE") {
    if (!row.finished_at) return json({ error: "running", attempt: toAttempt(row) }, 409);
    await env.DB.prepare("DELETE FROM attempts WHERE id = ? AND user_id = ? AND finished_at IS NOT NULL").bind(row.id, me.id).run();
    await addWrites(env, 1);
    return json({ ok: true });
  }

  if (req.method === "PATCH") {
    if (row.finished_at) return json({ error: "finished", attempt: toAttempt(row) }, 409);
    if (late()) {
      const done = await finishRow(env, row, "time");
      return json({ error: "late", attempt: toAttempt(done ?? row) }, 409);
    }
    const b = await readBody(req);
    if (!b.answers || typeof b.answers !== "object" || Array.isArray(b.answers)) return fail(400, "answers");
    const canary = canaryOf(row, b);
    if (canary) return trapped(env, req, `canary question answered (${canary})`, me);
    // inside the grace only answers stamped before the deadline are taken (a stamp is optional)
    const changed = mergeAnswers(row, b);
    if (changed === "late") return json({ error: "late", attempt: toAttempt(row) }, 409);
    if (changed) {
      await env.DB.prepare("UPDATE attempts SET answers = ? WHERE id = ? AND finished_at IS NULL").bind(row.answers, row.id).run();
      await addWrites(env, 1);
    }
    return json({ attempt: toAttempt(row) });
  }

  return fail(405, "GET, PATCH, DELETE or POST");
}
