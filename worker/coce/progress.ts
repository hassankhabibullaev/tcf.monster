// Practice progress (CO · CE): GET /api/progress?section= gives the six levels; POST /api/sync takes a bundle of
// events the browser already applied and stores the result (docs/COCE.md §2). The rules are shared/progress.ts, the
// same file the browser runs. Free plan: one row write per (section, level) touched, one per practice day touched,
// counted in `budget`; past the hold line the answer is { hold: true } and the browser keeps its queue.
import { type Env, json, fail, nowIso, day, addWrites, BUDGET_HOLD } from "../util.ts";
import type { Me } from "../auth.ts";
import { type Event, type Level, type Section, type State, LEVELS, apply, emptyState } from "../../shared/progress.ts";

/** longest bundle read (bytes) and most events taken from one */
const MAX_BODY = 256 * 1024;
const MAX_EVENTS = 500;
/** seconds spent on one question counted at most (a tab left open is not practice) */
const MAX_DT = 120;
/** a bundle stamped further ahead than this (seconds) is moved back as a whole */
const FUTURE_SLACK = 60;
/** no event is older than this (2025-01-01, before the app existed): a stamp in 1970 would make up a practice day */
const MIN_T = 1_735_689_600;
/** entries one level's state may hold (the largest level has 234 questions): made-up question ids cannot grow a row */
const MAX_Q = 2000;

const SECTIONS: readonly Section[] = ["co", "ce"];
const isSection = (v: unknown): v is Section => v === "co" || v === "ce";
const isLevel = (v: unknown): v is Level => (LEVELS as readonly unknown[]).includes(v);
const isKey = (v: unknown): v is "A" | "B" | "C" | "D" => v === "A" || v === "B" || v === "C" || v === "D";
const ID = /^[\w-]{1,40}$/;

type SyncEvent = Event & { dt?: number };

/** a valid event, trimmed to its fields, or null (bad ones are dropped, not refused) */
export function cleanEvent(raw: unknown): SyncEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== "string" || !ID.test(e.id)) return null;
  if (!isSection(e.section) || !isLevel(e.level)) return null;
  if (typeof e.t !== "number" || !Number.isFinite(e.t) || e.t < MIN_T) return null;
  const base = { id: e.id, section: e.section, level: e.level, t: e.t };
  const qid = typeof e.qid === "string" && e.qid.length > 0 && e.qid.length <= 64 ? e.qid : null;
  switch (e.type) {
    case "answer": {
      if (!qid || !isKey(e.key) || typeof e.right !== "boolean") return null;
      const out: SyncEvent = { ...base, type: "answer", qid, key: e.key, right: e.right };
      if (typeof e.dt === "number" && Number.isFinite(e.dt) && e.dt > 0) out.dt = Math.min(MAX_DT, Math.floor(e.dt));
      return out;
    }
    case "mark":
      if (!qid || (e.s !== "green" && e.s !== "amber")) return null;
      return { ...base, type: "mark", qid, s: e.s };
    case "reset":
      if (!qid) return null;
      return { ...base, type: "reset", qid };
    case "pos":
      if (typeof e.n !== "number" || !Number.isInteger(e.n) || e.n < 1 || e.n > 10000) return null;
      return { ...base, type: "pos", n: e.n };
    default:
      return null;
  }
}

/**
 * A bundle from a browser whose clock runs ahead is moved back as a whole, so its latest event is at most a minute
 * past the server's now; the order and the gaps inside it stay (a far-future stamp would block every later answer
 * to the same question).
 */
export function shiftBundle<T extends { t: number }>(events: T[], nowSeconds: number): T[] {
  let max = 0;
  for (const e of events) if (e.t > max) max = e.t;
  const over = max - (nowSeconds + FUTURE_SLACK);
  return over > 0 ? events.map((e) => ({ ...e, t: e.t - over })) : events;
}

const parseState = (data: string | null | undefined): State => {
  if (!data) return emptyState();
  try {
    const s = JSON.parse(data) as Partial<State>;
    const out: State = { v: 1, q: s.q && typeof s.q === "object" ? s.q : {}, pos: typeof s.pos === "number" ? s.pos : null };
    if (s.x && typeof s.x === "object" && Object.keys(s.x).length) out.x = s.x;
    return out;
  } catch { return emptyState(); }
};

/** GET /api/progress?section=co → { levels: { A1: State, … }, updatedAt } (missing rows are empty states) */
export async function handleProgress(req: Request, env: Env, me: Me, url: URL): Promise<Response> {
  if (req.method !== "GET") return fail(405, "GET");
  const section = url.searchParams.get("section");
  if (!isSection(section)) return fail(400, "section");
  const { results } = await env.DB.prepare("SELECT level, data, updated_at FROM progress WHERE user_id = ? AND section = ?")
    .bind(me.id, section).all<{ level: string; data: string; updated_at: string }>();
  const levels = {} as Record<Level, State>;
  for (const l of LEVELS) levels[l] = emptyState();
  let updatedAt: string | null = null;
  for (const r of results) {
    if (!isLevel(r.level)) continue;
    levels[r.level] = parseState(r.data);
    if (!updatedAt || r.updated_at > updatedAt) updatedAt = r.updated_at;
  }
  return json({ levels, updatedAt });
}

/** POST /api/sync { events } → { ok: true, applied } or { hold: true } */
export async function handleSync(req: Request, env: Env, me: Me): Promise<Response> {
  if (req.method !== "POST") return fail(405, "POST");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return fail(413, "too large");
  const text = await req.text();
  if (text.length > MAX_BODY) return fail(413, "too large");
  let body: { events?: unknown } | null = null;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!body || !Array.isArray(body.events)) return fail(400, "events");

  const nowSec = Date.now() / 1000;
  // a bundle poisoned with one absurd stamp is moved back so far that its other events fall before MIN_T: dropped too
  const events = shiftBundle(body.events.slice(0, MAX_EVENTS).map(cleanEvent).filter((e): e is SyncEvent => e !== null), nowSec).filter((e) => e.t >= MIN_T);
  if (!events.length) return json({ ok: true, applied: 0 });

  // the day's write budget, before anything is written
  const spent = await env.DB.prepare("SELECT writes FROM budget WHERE day = ?").bind(day(env.APP_TZ)).first<{ writes: number }>();
  if ((spent?.writes ?? 0) >= BUDGET_HOLD) return json({ hold: true });

  // the rows this bundle touches, read once
  const touched = new Set(events.map((e) => `${e.section}/${e.level}`));
  const sections = SECTIONS.filter((s) => events.some((e) => e.section === s));
  const { results } = await env.DB.prepare(`SELECT section, level, data FROM progress WHERE user_id = ? AND section IN (${sections.map(() => "?").join(", ")})`)
    .bind(me.id, ...sections).all<{ section: string; level: string; data: string }>();
  const before = new Map<string, State>();
  for (const r of results) if (touched.has(`${r.section}/${r.level}`)) before.set(`${r.section}/${r.level}`, parseState(r.data));
  const states = new Map<string, State>(before);

  // apply in order; a practice day counts only the answers that changed something (a resent bundle adds nothing)
  type DayRow = { day: string; section: Section; level: Level; answered: number; wrong: number; seconds: number; lastAt: string };
  const days = new Map<string, DayRow>();
  let applied = 0;
  for (const e of events) {
    const k = `${e.section}/${e.level}`;
    const s = states.get(k) ?? emptyState();
    // a level is full: an answer to yet another (made-up) question is ignored; known questions still change
    if (e.type === "answer" && e.qid && !s.q[e.qid] && Object.keys(s.q).length >= MAX_Q) continue;
    const next = apply(s, e);
    if (next === s) continue;
    states.set(k, next);
    applied++;
    if (e.type !== "answer") continue;
    const at = new Date(e.t * 1000);
    const d = day(env.APP_TZ, at);
    const dk = `${d}/${k}`;
    const row = days.get(dk) ?? { day: d, section: e.section, level: e.level, answered: 0, wrong: 0, seconds: 0, lastAt: "" };
    row.answered++;
    if (!e.right) row.wrong++;
    row.seconds += e.dt ?? 0;
    const iso = at.toISOString();
    if (iso > row.lastAt) row.lastAt = iso;
    days.set(dk, row);
  }

  // one batch: a row per (section, level) that changed, a row per practice day touched
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [];
  for (const [k, s] of states) {
    if (s === before.get(k)) continue;
    const [section, level] = k.split("/");
    stmts.push(env.DB.prepare(`INSERT INTO progress (user_id, section, level, data, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, section, level) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .bind(me.id, section, level, JSON.stringify(s), now));
  }
  for (const r of days.values()) {
    stmts.push(env.DB.prepare(`INSERT INTO practice_days (user_id, day, section, level, answered, wrong, seconds, last_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, day, section, level) DO UPDATE SET answered = answered + excluded.answered, wrong = wrong + excluded.wrong,
      seconds = seconds + excluded.seconds, last_at = max(last_at, excluded.last_at)`)
      .bind(me.id, r.day, r.section, r.level, r.answered, r.wrong, r.seconds, r.lastAt));
  }
  if (stmts.length) {
    await env.DB.batch(stmts);
    await addWrites(env, stmts.length);
  }
  return json({ ok: true, applied });
}
