// « Signaler un problème » on a practice question (docs/COCE.md §2): POST /api/disputes stores one row with the
// person's message; GET /api/disputes?section=&level= lists the ids of the questions they already reported in that
// level, so the button says « Signalé ». Free plan: one row a report, at most 20 a person a day, none past the hold.
import { type Env, json, fail, nowIso, day, daysAgoIso, readJson, addWrites, BUDGET_HOLD } from "../util.ts";
import type { Me } from "../auth.ts";
import { LEVELS } from "../../shared/progress.ts";

export const DISPUTES_PER_DAY = 20;
export const MAX_MESSAGE = 2000;
const ID = /^[\w-]{1,64}$/;

export async function handleDisputes(req: Request, env: Env, me: Me, url: URL): Promise<Response> {
  if (req.method === "GET") {
    const section = url.searchParams.get("section"), level = url.searchParams.get("level");
    if (section !== "co" && section !== "ce") return fail(400, "section");
    if (!(LEVELS as readonly string[]).includes(level ?? "")) return fail(400, "level");
    const { results } = await env.DB.prepare("SELECT DISTINCT question_id q FROM disputes WHERE user_id = ? AND section = ? AND level = ?").bind(me.id, section, level).all<{ q: string }>();
    return json({ ids: results.map((r) => r.q) });
  }
  if (req.method !== "POST") return fail(405, "GET or POST");
  const b = await readJson<Record<string, unknown>>(req);
  if (!b) return fail(400, "json");
  if (b.section !== "co" && b.section !== "ce") return fail(400, "section");
  if (!(LEVELS as readonly unknown[]).includes(b.level)) return fail(400, "level");
  if (typeof b.questionId !== "string" || !ID.test(b.questionId)) return fail(400, "questionId");
  const n = Number(b.n);
  if (!Number.isInteger(n) || n < 1 || n > 10000) return fail(400, "n");
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message) return fail(400, "message");
  if (message.length > MAX_MESSAGE) return fail(400, "too_long");
  const [spent, mine] = await Promise.all([
    env.DB.prepare("SELECT writes FROM budget WHERE day = ?").bind(day(env.APP_TZ)).first<{ writes: number }>(),
    env.DB.prepare("SELECT COUNT(*) n FROM disputes WHERE user_id = ? AND created_at >= ?").bind(me.id, daysAgoIso(1)).first<{ n: number }>(),
  ]);
  if ((spent?.writes ?? 0) >= BUDGET_HOLD) return json({ error: "hold" }, 503);
  if ((mine?.n ?? 0) >= DISPUTES_PER_DAY) return json({ error: "daily_cap" }, 429);
  const r = await env.DB.prepare("INSERT INTO disputes (user_id, section, level, question_id, n, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(me.id, b.section, b.level, b.questionId, n, message, nowIso()).run();
  await addWrites(env, 1);
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}
