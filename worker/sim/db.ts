// Tiny helpers over the request's D1 (ctx.ts) and the two simulator tables of migration 0003. Column names are the
// snake_case ones of the migration; the mappers give the ported code the camelCase rows it was written against.
import { dbOf } from "./ctx.ts";
import { safeJson } from "./util.ts";

type Arg = string | number | null | undefined | boolean;
const clean = (args: Arg[]) => args.map((a) => (a === undefined ? null : typeof a === "boolean" ? Number(a) : a));

export async function one<T>(sql: string, ...args: Arg[]): Promise<T | null> {
  return (await dbOf().prepare(sql).bind(...clean(args)).first()) as T | null;
}
export async function all<T>(sql: string, ...args: Arg[]): Promise<T[]> {
  const r = await dbOf().prepare(sql).bind(...clean(args)).all();
  return (r.results ?? []) as T[];
}
export async function run(sql: string, ...args: Arg[]): Promise<number> {
  const r = await dbOf().prepare(sql).bind(...clean(args)).run();
  return Number(r.meta?.changes ?? 0);
}
export type Stmt = { sql: string; args: Arg[] };
export const stmt = (sql: string, ...args: Arg[]): Stmt => ({ sql, args });
/** several writes in one transaction */
export async function batch(stmts: Stmt[]): Promise<void> {
  if (!stmts.length) return;
  const db = dbOf();
  await db.batch(stmts.map((s) => db.prepare(s.sql).bind(...clean(s.args))));
}

/* ---------- expr_sessions ---------- */

export type SessionRaw = { id: string; user_id: string; section: string; kind: string; taches: string; mode: string | null; mock_id: number | null; status: string; started_at: string; finished_at: string | null; score: number | null; nclc: number | null; level: string | null; summary_json: string | null; seconds: number | null };
export type SessionRow = { id: string; userId: string; section: "ee" | "eo"; kind: "practice" | "exam"; /** the JSON text of the tâches, as the old `tasks_json` column */ tasksJson: string; taches: number[]; mode: "live" | "ptt" | null; mockId: number | null; status: string; startedAt: string; finishedAt: string | null; score: number | null; nclc: number | null; level: string | null; summaryJson: string | null; seconds: number | null };

export const sessionRow = (r: SessionRaw): SessionRow => ({
  id: r.id,
  userId: r.user_id,
  section: r.section === "ee" ? "ee" : "eo",
  kind: r.kind === "exam" ? "exam" : "practice",
  tasksJson: r.taches,
  taches: safeJson<number[]>(r.taches, [1, 2, 3]),
  mode: r.mode === "live" || r.mode === "ptt" ? r.mode : null,
  mockId: r.mock_id,
  status: r.status,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  score: r.score,
  nclc: r.nclc,
  level: r.level,
  summaryJson: r.summary_json,
  seconds: r.seconds,
});

/* ---------- expr_tasks ---------- */

// A task keeps its subject and its marks only: what the candidate wrote or said, and the corrections of it, stay in
// their browser (web/app/sim/work.ts; migration 0012).
export type TaskRaw = { id: string; session_id: string; task_no: number; topic_id: number | null; prompt_json: string; duration_s: number | null; word_count: number | null; status: string; marks_json: string | null; score20: number | null; level: string | null; nclc: number | null; started_at: string | null; submitted_at: string | null };
export type TaskRow = { id: string; sessionId: string; taskNo: number; topicId: number | null; promptJson: string; durationS: number | null; wordCount: number | null; status: string; marksJson: string | null; score20: number | null; level: string | null; nclc: number | null; startedAt: string | null; submittedAt: string | null };

export const taskRow = (r: TaskRaw): TaskRow => ({
  id: r.id,
  sessionId: r.session_id,
  taskNo: r.task_no,
  topicId: r.topic_id,
  promptJson: r.prompt_json,
  durationS: r.duration_s,
  wordCount: r.word_count,
  status: r.status,
  marksJson: r.marks_json,
  score20: r.score20,
  level: r.level,
  nclc: r.nclc,
  startedAt: r.started_at,
  submittedAt: r.submitted_at,
});

/** `UPDATE expr_tasks SET … WHERE id = ?` from a camelCase object (keys are mapped to the columns; nothing else is accepted) */
const TASK_COLS: Record<string, string> = { promptJson: "prompt_json", durationS: "duration_s", wordCount: "word_count", status: "status", marksJson: "marks_json", score20: "score20", level: "level", nclc: "nclc", startedAt: "started_at", submittedAt: "submitted_at" };
export async function updateTask(id: string, set: Partial<Record<keyof typeof TASK_COLS, Arg>>): Promise<void> {
  const keys = Object.keys(set).filter((k) => TASK_COLS[k]);
  if (!keys.length) return;
  await run(`UPDATE expr_tasks SET ${keys.map((k) => `${TASK_COLS[k]} = ?`).join(", ")} WHERE id = ?`, ...keys.map((k) => set[k] as Arg), id);
}
