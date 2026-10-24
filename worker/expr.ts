// The expression simulator's HTTP routes (/api/expr/*) and the Gemini key's status (/api/me/key). Every /api/expr call
// runs inside the simulator's request context (worker/sim/ctx.ts): the signed-in person and their language. The
// person's key, what they write and say, and the corrections stay in their browser (web/app/sim/browser-score.ts,
// work.ts): the server holds the sessions, the subjects and the marks, and never calls Google.
import { type Env, json, fail, nowIso, readJson, day, daysAgoIso, addWrites, BUDGET_HOLD, claimStart, releaseStart } from "./util.ts";

import type { Me } from "./auth.ts";
import { runningMock, toMockRow } from "./mock/row.ts";
import {
  withCtx, AiError, aiErrorResponse,
  startSession, getSession, listSessions, abandonSession, deleteSession, forgetSession, NotFoundError,
  prepareTask, liveScript, realtimeFailed, logRealtimeUsage,
  storeWritingResult, storeSpeakingResult,
} from "./sim/index.ts";
import { ctx } from "./sim/ctx.ts";
import { askedFrom } from "../shared/sim/asked-core.ts";
import { guardAmount } from "./guard.ts";


type Body = Record<string, unknown>;
type TaskNo = 1 | 2 | 3;
const taskNo = (v: unknown): TaskNo => ([1, 2, 3].includes(Number(v)) ? (Number(v) as TaskNo) : 1);
const KEY_STATUS = ["ok", "none", "error", "quota"] as const;

/** the person's language; null = no such account */
export async function access(env: Env, me: Me) {
  const u = await env.DB.prepare("SELECT lang FROM users WHERE id = ?").bind(me.id).first<{ lang: string }>();
  if (!u) return null;
  return { lang: (u.lang === "en" ? "en" : "fr") as "fr" | "en" };
}

/* ---------- the key's status ---------- */

/**
 * The key lives in the person's browser and is checked there with Google. The browser tells the account how it went
 * (ok · none · error · quota, with Google's message), so the admin knows who is set up; a key itself is refused.
 */
export async function handleKey(req: Request, env: Env, me: Me): Promise<Response> {
  if (req.method !== "POST") return fail(405, "POST");
  const b = (await readJson<Body>(req)) ?? {};
  if ("key" in b) return json({ error: "key_stays_in_browser" }, 400);
  const status = KEY_STATUS.find((x) => x === b.status);
  if (!status) return fail(400, "status");
  const error = status === "error" || status === "quota" ? String(b.error ?? "").slice(0, 300) || null : null;
  await env.DB.prepare("UPDATE users SET gemini_status = ?, gemini_error = ?, gemini_checked_at = ? WHERE id = ?").bind(status, error, status === "none" ? null : nowIso(), me.id).run();
  return json({ ok: true, status });
}

/* ---------- the simulator ---------- */

export async function handleExpr(req: Request, env: Env, me: Me, path: string, url: URL): Promise<Response> {
  const a = await access(env, me);
  if (!a) return fail(401, "signed out");
  try {
    return await withCtx({ env, user: { id: me.id, email: me.email }, lang: a.lang }, () => route(req, env, me, path, url));
  } catch (e) {
    // somebody else's session, or none: it does not exist for this person
    if (e instanceof NotFoundError) return json({ error: "not found", code: "not_found" }, 404);
    // the database's own words are not for the browser
    if (e instanceof Error && !(e instanceof AiError) && /D1_|SQLITE|sqlite/i.test(e.message)) { console.error(e); return json({ error: "server error", code: "error" }, 500); }
    return aiErrorResponse(e);
  }
}

/** the routes that take one method only: anything else is 405, not 404 */
const METHODS: Record<string, string> = {
  "/expr/start": "POST", "/expr/sessions": "GET", "/expr/oral/prepare": "POST", "/expr/oral/realtime": "POST", "/expr/result": "POST",
};

async function route(req: Request, env: Env, me: Me, path: string, url: URL): Promise<Response> {
  const post = req.method === "POST";
  const body = async () => (await readJson<Body>(req)) ?? {};
  if (METHODS[path] && METHODS[path] !== req.method) return fail(405, METHODS[path]);

  if (path === "/expr/start" && post) {
    const b = await body();
    const section = b.section === "ee" ? "ee" : b.section === "eo" ? "eo" : null;
    if (!section) return fail(400, "section");
    const kind = b.kind === "exam" ? "exam" : "practice";
    const mode = b.mode === "live" || b.mode === "ptt" ? b.mode : null;
    const ids: Partial<Record<TaskNo, number>> = {};
    if (b.topicIds && typeof b.topicIds === "object") for (const [k, v] of Object.entries(b.topicIds as Record<string, unknown>)) if ([1, 2, 3].includes(Number(k)) && Number.isInteger(Number(v))) ids[Number(k) as TaskNo] = Number(v);
    // free-plan guard: the day's write budget (shared with progress) and a per-person cap on sessions
    const spent = await env.DB.prepare("SELECT writes FROM budget WHERE day = ?").bind(day(env.APP_TZ)).first<{ writes: number }>();
    if ((spent?.writes ?? 0) >= BUDGET_HOLD) return json({ error: "hold" }, 503);
    // never while a mock exam runs (docs/MOCK-EXAM.md §7)
    const mock = await runningMock(env, me.id);
    if (mock) return json({ error: "mock_running", mock: toMockRow(mock) }, 409);
    const { row: slot, today } = await claimStart(env, me.id, "session");
    const stopped = await guardAmount(env, me, "starts", today);
    if (stopped) { await releaseStart(env, slot); return stopped; }
    const started = await startSession({ section, kind, taches: kind === "exam" ? [1, 2, 3] : b.taches, topicIds: ids, mode }).catch(async (e) => { await releaseStart(env, slot); throw e; });
    await addWrites(env, 2 + started.tasks.length);
    return json(started);
  }
  // marks computed in the browser (worker/sim/results.ts checks them and keeps the numbers only)
  if (path === "/expr/result" && post) {
    const b = await body();
    const sid = String(b.sessionId ?? ""), n = taskNo(b.taskNo);
    const r = (await getSession(sid))?.session.section === "eo"
      ? await storeSpeakingResult({ sessionId: sid, taskNo: n, durationS: b.durationS, score20: b.score20, marks: b.marks })
      : await storeWritingResult({ sessionId: sid, taskNo: n, wordCount: b.wordCount, elapsedS: b.elapsedS, score20: b.score20, marks: b.marks });
    await addWrites(env, 2);
    return json(r);
  }
  if (path === "/expr/sessions" && !post) return json({ sessions: await listSessions(Math.min(200, Number(url.searchParams.get("limit")) || 50)) });

  const m = path.match(/^\/expr\/session\/([\w-]+)$/);
  if (m) {
    if (req.method === "GET") { const s = await getSession(m[1]); return s ? json(s) : fail(404, "not found"); }
    // DELETE keeps a session with work in it (abandoned instead); ?forget=1 erases one that is over, marks and all
    if (req.method === "DELETE") { if (url.searchParams.get("forget") === "1") await forgetSession(m[1]); else await deleteSession(m[1]); return json({ ok: true }); }
    if (req.method === "PATCH") {
      const b = await body();
      if (b.status !== "abandoned") return fail(400, "status");
      await abandonSession(m[1]);
      return json({ ok: true });
    }
    return fail(405, "GET, PATCH or DELETE");
  }

  // the browser sends the Tâche 1 questions it remembers (shared/sim/asked-core.ts): used for this answer, not kept
  if (path === "/expr/oral/prepare" && post) { const b = await body(); return json(await withAsked(b, () => prepareTask(String(b.sessionId), taskNo(b.taskNo)))); }

  // the live examiner's script; the browser adds what was said, and opens the session with the person's own key
  if (path === "/expr/oral/realtime" && post) {
    const b = (await body()) as { sessionId?: string; taskNo?: number; usage?: never; turns?: number; failed?: string; model?: string; asked?: unknown };
    const sid = String(b.sessionId ?? "");
    const n = taskNo(b.taskNo ?? 2);
    if (typeof b.failed === "string") {
      await realtimeFailed(sid, `${b.failed}${b.model ? ` [${b.model}]` : ""}`);
      return json({ ok: true });
    }
    if (b.usage) {
      await logRealtimeUsage(sid, typeof b.model === "string" && b.model ? b.model : "", b.usage, Number(b.turns) || 0, n);
      return json({ ok: true });
    }
    return json(await withAsked(b, () => liveScript(sid, n)));
  }

  return fail(404, "not found");
}

/** runs `f` with the questions the browser says were already asked (read by worker/sim/asked.ts) */
function withAsked<T>(b: Body, f: () => Promise<T>): Promise<T> {
  ctx().asked = askedFrom(b.asked);
  return f();
}
