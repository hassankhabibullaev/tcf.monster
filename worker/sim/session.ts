// Sessions and tasks of the simulator (`expr_sessions`, `expr_tasks`): start one, read it, close it. Every read is
// scoped to the signed-in person (ctx.ts): a session that is not theirs does not exist for them.
import { ctx } from "./ctx.ts";
import { all, one, run, stmt, batch, sessionRow, taskRow, type SessionRaw, type SessionRow, type TaskRaw, type TaskRow } from "./db.ts";
import { nowIso, randomId, safeJson } from "./util.ts";
import { SPEAKING, SPEC_VERSION, WRITING, maxPoints, nclcFor, normalizeTasks, totalSeconds, type Skill, type TaskNo } from "./config.ts";
import { pickTopics, promptFromTopic } from "./prompts.ts";
import { publicPrompt, type GeneratedPrompt, type PublicPrompt, type SessionSummary, type TaskResultSummary } from "./types.ts";

export type Section = "ee" | "eo";
export type Kind = "practice" | "exam";
/** "task" = one task in practice; "full" otherwise (the runners branch on it) */
export type Mode = "task" | "full";
export type StartedSession = {
  sessionId: string;
  skill: Skill;
  kind: Kind;
  mode: Mode;
  micMode: "live" | "ptt" | null;
  tasks: { id: string; taskNo: TaskNo; prompt: PublicPrompt }[];
  totalSeconds: number;
};

export const skillOf = (section: string): Skill => (section === "ee" ? "writing" : "speaking");
export const sectionOf = (skill: Skill): Section => (skill === "writing" ? "ee" : "eo");

/** a session or a task that is not the person's, or does not exist: the routes answer 404 */
export class NotFoundError extends Error {}

/** The session, only if it belongs to the person. Every session-scoped read goes through here. */
async function ownedSession(id: string): Promise<SessionRow | null> {
  const r = await one<SessionRaw>("SELECT * FROM expr_sessions WHERE id = ? AND user_id = ?", id, ctx().user.id);
  return r ? sessionRow(r) : null;
}

/**
 * A new session and its tasks. An exam is always the three tasks; practice takes the tâches asked for. The subjects
 * come from the `topics` table (prompts.ts): the ones the person chose (`topicIds`), the others drawn at random.
 */
export async function startSession(opts: { section: Section; kind: Kind; taches: unknown; topicIds?: Partial<Record<TaskNo, number>>; mode?: "live" | "ptt" | null; /** a stage of a mock exam (docs/MOCK-EXAM.md): the row points at it, hidden from the EE/EO lists */ mockId?: number | null; /** the mock's own clock for the stage (the writing stage keeps the official 60 min) */ seconds?: number | null; startedAt?: string }): Promise<StartedSession> {
  const skill = skillOf(opts.section);
  const tasks = opts.kind === "exam" ? ([1, 2, 3] as TaskNo[]) : normalizeTasks(opts.taches);
  const topics = await pickTopics(opts.section, tasks, opts.topicIds);
  const id = randomId();
  const now = opts.startedAt ?? nowIso();
  const seconds = opts.seconds ?? totalSeconds(skill, tasks);
  const micMode = skill === "speaking" ? (opts.mode === "live" || opts.mode === "ptt" ? opts.mode : null) : null;
  const writes = [stmt("INSERT INTO expr_sessions (id, user_id, section, kind, taches, mode, mock_id, status, started_at, seconds) VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?)", id, ctx().user.id, opts.section, opts.kind, JSON.stringify(tasks), micMode, opts.mockId ?? null, now, seconds)];
  const out: StartedSession["tasks"] = [];
  for (const t of tasks) {
    const topic = topics[t] ?? null;
    const p = promptFromTopic(opts.section, t, topic);
    const tid = randomId();
    writes.push(stmt("INSERT INTO expr_tasks (id, session_id, task_no, topic_id, prompt_json, status, started_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)", tid, id, t, topic?.id ?? null, JSON.stringify(p), now));
    out.push({ id: tid, taskNo: t, prompt: publicPrompt(p) });
  }
  await batch(writes);
  return { sessionId: id, skill, kind: opts.kind, mode: opts.kind === "practice" && tasks.length === 1 ? "task" : "full", micMode, tasks: out, totalSeconds: seconds };
}

export async function getTask(sessionId: string, taskNo: number): Promise<TaskRow> {
  if (!(await ownedSession(sessionId))) throw new NotFoundError("session introuvable");
  const t = await one<TaskRaw>("SELECT * FROM expr_tasks WHERE session_id = ? AND task_no = ?", sessionId, taskNo);
  if (!t) throw new NotFoundError("tâche introuvable");
  return taskRow(t);
}

export function promptOf(row: { promptJson: string }): GeneratedPrompt {
  return safeJson<GeneratedPrompt>(row.promptJson, { id: "", skill: "writing", task: 1, theme: "", topic: "", consigne: "", timeLimitSeconds: 0, generatedAt: "", specVersion: SPEC_VERSION, source: "bank" });
}

export async function getSession(id: string): Promise<{ session: SessionRow; tasks: TaskRow[] } | null> {
  const s = await ownedSession(id);
  if (!s) return null;
  const tasks = (await all<TaskRaw>("SELECT * FROM expr_tasks WHERE session_id = ? ORDER BY task_no", id)).map(taskRow);
  return { session: s, tasks };
}

export type SessionListItem = { id: string; section: Section; kind: Kind; taches: number[]; mode: "live" | "ptt" | null; status: string; startedAt: string; finishedAt: string | null; score: number | null; nclc: number | null; level: string | null; summary: SessionSummary | null };

/** The person's sessions, newest first (the stages of a mock exam stay out: they open from the mock's results page). */
export async function listSessions(limit = 50): Promise<SessionListItem[]> {
  const rows = await all<SessionRaw>("SELECT * FROM expr_sessions WHERE user_id = ? AND mock_id IS NULL ORDER BY started_at DESC LIMIT ?", ctx().user.id, Math.max(1, Math.min(200, Math.floor(limit))));
  return rows.map(sessionRow).map((s) => ({ id: s.id, section: s.section, kind: s.kind, taches: s.taches, mode: s.mode, status: s.status, startedAt: s.startedAt, finishedAt: s.finishedAt, score: s.score, nclc: s.nclc, level: s.level, summary: safeJson<SessionSummary | null>(s.summaryJson, null) }));
}

/** A session the candidate left and did not come back to: closed as « abandoned », nothing more is scored, what was scored stays. */
export async function abandonSession(id: string) {
  const s = await ownedSession(id);
  if (!s || s.status !== "in_progress") return;
  // every task was handed in and only the marks are missing (slow or failed scoring): not a session left behind.
  // It stays open, and its page in the history offers to score it again.
  const rows = await all<{ status: string }>("SELECT status FROM expr_tasks WHERE session_id = ?", id);
  if (rows.length && rows.every((t) => t.status === "grading" || t.status === "done")) return;
  await run("UPDATE expr_sessions SET status = 'abandoned', finished_at = ? WHERE id = ?", nowIso(), id);
}

export async function deleteSession(id: string) {
  if (!(await ownedSession(id))) return;
  // a task already handed in or marked is work: the session is closed as abandoned instead, and its marks stay
  const rows = await all<{ status: string }>("SELECT status FROM expr_tasks WHERE session_id = ?", id);
  if (rows.some((t) => t.status === "grading" || t.status === "done")) { await abandonSession(id); return; }
  // nothing else to remove: the recordings, the texts and the transcripts never left the person's browser
  await batch([stmt("DELETE FROM expr_tasks WHERE session_id = ?", id), stmt("DELETE FROM expr_sessions WHERE id = ?", id)]);
}

/**
 * `?forget=1`: a session that is over (done or abandoned) goes for good, tasks and marks included, at its owner's
 * request from the history list. One still in progress is treated as a plain delete (abandoned when a task was
 * handed in, erased otherwise).
 */
export async function forgetSession(id: string) {
  const s = await ownedSession(id);
  if (!s) return;
  if (s.status !== "done" && s.status !== "abandoned") { await deleteSession(id); return; }
  await batch([stmt("DELETE FROM expr_tasks WHERE session_id = ?", id), stmt("DELETE FROM expr_sessions WHERE id = ?", id)]);
}

/** Aggregate for a session: task points (6/6/8 scale) summed and rescaled to /20. A subset is labelled partial. */
export function computeSummary(skill: Skill, selected: TaskNo[], rows: { taskNo: number; score20: number | null; level: string | null; nclc: number | null; marksJson: string | null }[]): SessionSummary {
  const cfg = skill === "writing" ? WRITING.tasks : SPEAKING.tasks;
  const tasks: TaskResultSummary[] = rows.map((r) => {
    const fb = safeJson<{ taskScore?: number; taskScoreMax?: number }>(r.marksJson, {});
    const t = r.taskNo as TaskNo;
    const max = cfg[t]?.maxPoints ?? 0;
    const pts = fb.taskScore != null ? fb.taskScore : r.score20 != null ? (r.score20 / 20) * max : null;
    return { taskNo: t, score20: r.score20, level: r.level, nclc: r.nclc, taskPoints: pts != null ? Number(pts.toFixed(2)) : null, taskPointsMax: max };
  });
  const graded = tasks.filter((t) => t.taskPoints != null);
  const pointsMax = maxPoints(skill, selected);
  const points = graded.length ? Number(graded.reduce((a, b) => a + (b.taskPoints ?? 0), 0).toFixed(2)) : null;
  const gradedMax = graded.reduce((a, b) => a + (b.taskPointsMax ?? 0), 0);
  // whole number, like a real TCF score
  const score20 = points != null && gradedMax > 0 ? Math.round((points / gradedMax) * 20) : null;
  const m = score20 != null ? nclcFor(score20, skill) : null;
  return { tasks, score20, level: m?.cecrl ?? null, nclc: m?.nclc ?? null, points, pointsMax, partial: selected.length < 3 };
}

/** Marks the session done when every task is graded; returns the summary (null if still in progress). */
export async function finalizeIfDone(sessionId: string): Promise<SessionSummary | null> {
  const s = await ownedSession(sessionId);
  if (!s) return null;
  const rows = (await all<TaskRaw>("SELECT * FROM expr_tasks WHERE session_id = ? ORDER BY task_no", sessionId)).map(taskRow);
  if (!rows.every((t) => t.status === "done")) return null;
  const summary = computeSummary(skillOf(s.section), normalizeTasks(s.taches), rows);
  await run("UPDATE expr_sessions SET status = 'done', finished_at = ?, score = ?, nclc = ?, level = ?, summary_json = ? WHERE id = ?", nowIso(), summary.score20, summary.nclc, summary.level, JSON.stringify(summary), sessionId);
  return summary;
}
