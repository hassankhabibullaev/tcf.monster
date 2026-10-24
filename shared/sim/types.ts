// The shapes shared by the station, the scorer and the browser: the subject of a task, a turn of the dialogue, the
// summary of a session.
import type { Skill, TaskNo } from "./config.ts";

/** writing: rewrites kept per task after the result (each one costs two AI calls) */
export const MAX_REVISIONS = 6;

/** `stance` was set by the old generator; the documents of the topics table carry none */
export type SourceDocument = { author: string; stance?: "pour" | "contre"; text: string };
export type Roleplay = {
  situation: string;
  examinerRole: string;
  /** what the situation calls for: « tu » with a friend, colleague or neighbour, « vous » otherwise */
  register: "tu" | "vous";
  /** who she is for the candidate (prompts.ts relationOf) */
  kind: string;
};
/** Examiner-side plan (Tâche 1), never shown to the candidate. */
export type ExaminerPlan = {
  /** questions used only when the follow-ups could not be planned from the presentation (fallback) */
  questions?: string[];
  /** questions actually planned from the candidate's self-presentation */
  followUps?: string[];
};

/** The subject of a task (worker/sim/prompts.ts). Stored as expr_tasks.prompt_json. */
export type GeneratedPrompt = {
  id: string;
  skill: Skill;
  task: TaskNo;
  theme: string;
  /** short internal topic label (anti-repetition) */
  topic: string;
  /** T3 writing: title shown above the two documents */
  title?: string;
  consigne: string;
  wordCountMin?: number;
  wordCountMax?: number;
  timeLimitSeconds: number;
  prepTimeSeconds?: number;
  sourceDocuments?: SourceDocument[];
  roleplay?: Roleplay;
  examinerPlan?: ExaminerPlan;
  generatedAt: string;
  specVersion: string;
  source: "bank";
};

/** Candidate-facing view: without the examiner's plan, and only the situation and role of the role-play. */
export function publicPrompt(p: GeneratedPrompt): Omit<GeneratedPrompt, "examinerPlan" | "roleplay"> & { roleplay?: Pick<Roleplay, "situation" | "examinerRole"> } {
  const { examinerPlan: _ep, roleplay, ...rest } = p;
  void _ep;
  return { ...rest, roleplay: roleplay ? { situation: roleplay.situation, examinerRole: roleplay.examinerRole } : undefined };
}
export type PublicPrompt = ReturnType<typeof publicPrompt>;

/** No audio here: the recordings stay in the person's browser (IndexedDB); `clipId` is the browser's name for the clip of a candidate turn. */
export type Turn = { role: "examiner" | "candidate"; text: string; t: number; clipId?: string; durationS?: number; /** joined from pieces transcribed during the answer; re-transcribed whole before scoring */ stitched?: boolean; /** examiner: ms between the end of the candidate's speech and her first sound */ latencyMs?: number };

export type TaskResultSummary = { taskNo: TaskNo; score20: number | null; level: string | null; nclc: number | null; taskPoints?: number | null; taskPointsMax?: number };
export type SessionSummary = {
  tasks: TaskResultSummary[];
  /** aggregate /20 across the tasks run */
  score20: number | null;
  level: string | null;
  nclc: number | null;
  points: number | null;
  pointsMax: number;
  partial: boolean;
};
