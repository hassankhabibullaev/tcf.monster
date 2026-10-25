// The app's side of the expression simulator: starting a session, keeping it for the room, the history, the topics.
import { api } from "./api.ts";

export type Section = "ee" | "eo";
export type TaskNo = 1 | 2 | 3;
export type Kind = "practice" | "exam";
export type MicMode = "live" | "ptt";

/** what the server answers on /api/expr/start (worker/sim/session.ts) */
export type StartedSession = {
  sessionId: string;
  skill: "writing" | "speaking";
  kind: Kind;
  mode: "task" | "full";
  micMode: MicMode | null;
  tasks: { id: string; taskNo: TaskNo; prompt: Record<string, any> }[];
  totalSeconds: number;
};

export type SessionRow = { id: string; section: Section; kind: Kind; taches: number[]; mode: MicMode | null; status: "in_progress" | "done" | "abandoned"; startedAt: string; finishedAt: string | null; score: number | null; nclc: number | null; level: string | null; summary: unknown };

export const sectionOf = (skill: "writing" | "speaking"): Section => (skill === "writing" ? "ee" : "eo");

/** the official times (worker/sim/config.ts), for a session rebuilt after a reload */
const WRITING_MIN: Record<TaskNo, number> = { 1: 10, 2: 15, 3: 25 };
const SPEAKING_S: Record<TaskNo, number> = { 1: 120, 2: 120 + 210, 3: 270 };
/** the official 60 min when the three writing tasks go together (shared/sim/config.ts writingTotalSeconds) */
export const totalSecondsOf = (skill: "writing" | "speaking", taches: TaskNo[]) =>
  skill === "writing" && new Set(taches).size === 3 ? 60 * 60 : taches.reduce((n, t) => n + (skill === "writing" ? WRITING_MIN[t] * 60 : SPEAKING_S[t]), 0);

/** the started session is kept for the room (a reload rebuilds it from the server and this browser) */
const key = (id: string) => `expr-session-${id}`;
export function keepStarted(s: StartedSession, startedAtMs: number) {
  try { sessionStorage.setItem(key(s.sessionId), JSON.stringify({ s, startedAtMs })); } catch { /* private mode */ }
}
export function loadStarted(id: string): { s: StartedSession; startedAtMs: number } | null {
  try { return JSON.parse(sessionStorage.getItem(key(id)) ?? "null"); } catch { return null; }
}

export async function startExpr(o: { section: Section; kind: Kind; taches: TaskNo[]; topicIds?: Partial<Record<TaskNo, number>>; mode?: MicMode | null }) {
  const s = await api<StartedSession>("/expr/start", o);
  keepStarted(s, Date.now());
  return s;
}

/** the candidate-facing part of a stored prompt (the examiner's plan and briefing never reach the page) */
export function publicPrompt(p: Record<string, any>) {
  const { examinerPlan: _a, hiddenModel: _b, roleplay, ...rest } = p;
  void _a; void _b;
  return { ...rest, roleplay: roleplay ? { situation: roleplay.situation, examinerRole: roleplay.examinerRole } : undefined };
}

/** a session as the server stores it (GET /api/expr/session/:id: subjects and marks), completed with what this
 *  browser kept (sim/work.ts, loadSession: the text, the turns, the evaluation…) → what the room and the result page need */
export type StoredSession = { session: { id: string; section: Section; kind: Kind; taches: TaskNo[] | string; mode: MicMode | null; status: string; startedAt: string; finishedAt: string | null; summaryJson?: string | null }; tasks: StoredTask[] };
export type StoredTask = {
  id: string; taskNo: TaskNo; promptJson: string; wordCount: number | null; score20: number | null; level: string | null; nclc: number | null; status: string; durationS: number | null; submittedAt?: string | null;
  /** the server's marks (numbers and the grid's rows: shared/sim/marks.ts) */
  marksJson?: string | null;
  /* kept in this browser (sim/work.ts) */
  responseText?: string | null; turnsJson?: string; feedbackJson?: string | null; detailJson?: string | null; versionsJson?: string | null;
  /** marked, but its text and corrections are on another device */
  elsewhere?: boolean;
};

export const tachesOf = (v: TaskNo[] | string): TaskNo[] => (Array.isArray(v) ? v : (JSON.parse(v) as TaskNo[]));

export function rebuildStarted(d: StoredSession): StartedSession {
  const skill = d.session.section === "ee" ? "writing" : "speaking";
  const taches = tachesOf(d.session.taches);
  return {
    sessionId: d.session.id, skill, kind: d.session.kind, mode: d.session.kind === "practice" && taches.length === 1 ? "task" : "full", micMode: d.session.mode,
    tasks: d.tasks.map((t) => ({ id: t.id, taskNo: t.taskNo, prompt: publicPrompt(JSON.parse(t.promptJson)), stored: { status: t.status, responseText: t.responseText ?? null, wordCount: t.wordCount, turnsJson: t.turnsJson ?? "[]", score20: t.score20, level: t.level, nclc: t.nclc, feedbackJson: t.feedbackJson ?? null, detailJson: t.detailJson ?? null, versionsJson: t.versionsJson ?? null, durationS: t.durationS, elsewhere: t.elsewhere } })),
    totalSeconds: totalSecondsOf(skill, taches),
  };
}

export const safeJson = <T,>(s: string | null | undefined, fallback: T): T => { if (!s) return fallback; try { return JSON.parse(s) as T; } catch { return fallback; } };
