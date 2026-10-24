/**
 * The browser side's own copy of the simulator's types, figures and pure helpers (from expression: config/tcf.ts,
 * lib/sim/types.ts, lib/sim/timing.ts, lib/eval/evidence.ts, highlight.ts, rubric.ts, lib/utils.ts). Copied, not
 * imported: the page bundle must never pull the Worker's code.
 */

export type Skill = "writing" | "speaking";
export type TaskNo = 1 | 2 | 3;
export type Level = "A2" | "B1" | "B2" | "C1" | "C2";
export type SessionKind = "practice" | "exam";
export type Mode = "task" | "full";
/** how the candidate's turn ends: the app hears the pause (live) or the button (push to talk) */
export type MicMode = "live" | "ptt";

/* ---------- the exam's figures (content/exam-reference.json + the owner's per-task writing times) ---------- */

export type WritingTaskConfig = { task: TaskNo; label: string; wordsMin: number; wordsMax: number; minutes: number; maxPoints: number };
export const WRITING: { totalMinutes: number; tasks: Record<TaskNo, WritingTaskConfig> } = {
  totalMinutes: 50,
  tasks: {
    1: { task: 1, label: "Tâche 1", wordsMin: 60, wordsMax: 120, minutes: 10, maxPoints: 6 },
    2: { task: 2, label: "Tâche 2", wordsMin: 120, wordsMax: 150, minutes: 15, maxPoints: 6 },
    3: { task: 3, label: "Tâche 3", wordsMin: 120, wordsMax: 180, minutes: 25, maxPoints: 8 },
  },
};

export type SpeakingTaskConfig = { task: TaskNo; label: string; name: string; prepSeconds: number; speakSeconds: number; maxPoints: number };
export const SPEAKING: { approxMinutes: number; tasks: Record<TaskNo, SpeakingTaskConfig> } = {
  approxMinutes: 12,
  tasks: {
    1: { task: 1, label: "Tâche 1", name: "Entretien dirigé sans préparation", prepSeconds: 0, speakSeconds: 120, maxPoints: 6 },
    2: { task: 2, label: "Tâche 2", name: "Exercice en interaction avec préparation", prepSeconds: 120, speakSeconds: 210, maxPoints: 6 },
    3: { task: 3, label: "Tâche 3", name: "Expression d'un point de vue sans préparation", prepSeconds: 0, speakSeconds: 270, maxPoints: 8 },
  },
};

export function tasksLabel(tasks: TaskNo[]): string {
  if (tasks.length === 3) return "Tâches 1, 2 et 3";
  if (tasks.length === 2) return `Tâches ${tasks[0]} et ${tasks[1]}`;
  return `Tâche ${tasks[0]}`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function wordCount(text: string): number {
  return (text || "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/* ---------- a session and its tasks ---------- */

/** writing: rewrites kept per task after the result */
export const MAX_REVISIONS = 6;

export type SourceDocument = { author: string; stance: "pour" | "contre"; text: string };
/** what the candidate may see of a prompt (the examiner's plan and notes never leave the server) */
export type PublicPrompt = {
  id: string;
  skill: Skill;
  task: TaskNo;
  targetLevel?: Level;
  theme: string;
  topic: string;
  /** T3 writing: title shown above the two documents */
  title?: string;
  consigne: string;
  wordCountMin?: number;
  wordCountMax?: number;
  timeLimitSeconds: number;
  prepTimeSeconds?: number;
  sourceDocuments?: SourceDocument[];
  roleplay?: { situation: string; examinerRole: string; register?: "tu" | "vous"; kind?: string };
  generatedAt: string;
  specVersion: string;
  source: "bank" | "generated";
};

/** what the rooms and the results read of a prompt (the page may hand the whole PublicPrompt or a looser row) */
export type PromptView = { title?: string; consigne?: string; sourceDocuments?: SourceDocument[]; [k: string]: unknown };

export type StartedSession = {
  sessionId: string;
  skill: Skill;
  kind: SessionKind;
  mode: Mode;
  /** null for writing */
  micMode: MicMode | null;
  tasks: { id: string; taskNo: TaskNo; prompt: PromptView; /** what the server already holds for the task (a session reopened: another device, a cleared browser) */ stored?: StoredTaskState | null }[];
  totalSeconds: number;
};
/** a task as the server marked it, with what this browser kept of it (work.ts), read when a room is rebuilt */
export type StoredTaskState = { status: string; responseText: string | null; wordCount: number | null; turnsJson: string; score20: number | null; level: string | null; nclc: number | null; feedbackJson: string | null; detailJson: string | null; versionsJson: string | null; durationS: number | null; elsewhere?: boolean };

/** `clipId`: the candidate's recording, kept only in the browser that made it (clips.ts) */
export type Turn = { role: "examiner" | "candidate"; text: string; t: number; clipId?: string; durationS?: number; stitched?: boolean; latencyMs?: number };

export type TaskResultSummary = { taskNo: TaskNo; score20: number | null; level: string | null; nclc: number | null; taskPoints?: number | null; taskPointsMax?: number };
export type SessionSummary = {
  tasks: TaskResultSummary[];
  score20: number | null;
  level: string | null;
  nclc: number | null;
  points: number | null;
  pointsMax: number;
  partial: boolean;
};

/* ---------- the marking's shapes the page reads ---------- */

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
/** the official /20 ↔ level correspondence (IRCC table); `span` = how many score points the level covers */
export const CEFR_LEVELS: { id: Cefr; min: number; max: number; span: number }[] = [
  { id: "A1", min: 0, max: 3, span: 3 },
  { id: "A2", min: 4, max: 5, span: 2 },
  { id: "B1", min: 6, max: 9, span: 4 },
  { id: "B2", min: 10, max: 13, span: 4 },
  { id: "C1", min: 14, max: 15, span: 2 },
  { id: "C2", min: 16, max: 20, span: 5 },
];
export function cefrOf(score20: number) {
  const s = Math.max(0, Math.min(20, Math.round(score20)));
  return CEFR_LEVELS.find((l) => s >= l.min && s <= l.max) ?? CEFR_LEVELS[0];
}

export type Tip =
  | { kind: "fix"; label: string; said: string; say: string; note: string }
  | { kind: "sound"; label: string; said: string; say: string; note: string; answer?: number; atS?: number }
  | { kind: "next"; label: string; say: string; note: string };

export type CorrectionKind = "grammar" | "spelling" | "lexis" | "register" | "pronunciation" | "task";
export type Correction = { excerpt: string; suggestion: string; tip: string; kind: CorrectionKind; sub?: string };
export type VocabItem = { used: string; better: string; example: string };
export type Segment = { text: string; corr?: Correction };

const stripQuotes = (s: string) => s.trim().replace(/^[«"'\s]+|[»"'\s.…]+$/g, "");

/** Splits `text` into plain and corrected segments: first unused occurrence of each excerpt, case-insensitive, no overlap. */
export function segmentsOf(text: string, corrections: Correction[]): Segment[] {
  const spans: { start: number; end: number; corr: Correction }[] = [];
  const lower = text.toLowerCase();
  for (const c of corrections) {
    const needle = stripQuotes(c.excerpt).toLowerCase();
    if (needle.length < 2) continue;
    let from = 0;
    while (from <= lower.length) {
      const i = lower.indexOf(needle, from);
      if (i < 0) break;
      const end = i + needle.length;
      if (!spans.some((s) => i < s.end && end > s.start)) {
        spans.push({ start: i, end, corr: c });
        break;
      }
      from = i + 1;
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start > pos) out.push({ text: text.slice(pos, s.start) });
    out.push({ text: text.slice(s.start, s.end), corr: s.corr });
    pos = s.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

/** older evaluations: a band 0–6 maps to the middle of its level, never linearly (a solid B1 must not read as B2) */
export const BAND_MAX = 6;
export const BAND_TO_20 = [0, 2, 4.5, 7.5, 11.5, 14.5, 19] as const;
export function bandAverageTo20(avg: number): number {
  const a = Math.max(0, Math.min(BAND_MAX, avg));
  const lo = Math.floor(a);
  const hi = Math.min(BAND_MAX, lo + 1);
  return BAND_TO_20[lo] + (BAND_TO_20[hi] - BAND_TO_20[lo]) * (a - lo);
}

/** writing: a version rewritten after the result (browser-score.ts, markRevision; kept in work.ts) */
export type Revision = { text: string; wordCount: number; score20: number; level: string; nclc: number; evaluation: Record<string, unknown>; corrections: Correction[] | null; at: string };

/* ---------- timing rules of the live exchange (lib/sim/timing.ts, whole) ----------
 * - the clock never cuts the candidate: the examiner does, by voice, and the recording goes on `tailS` after she
 *   starts, so the last words are kept and marked;
 * - a question she asks is always listened to: a candidate who is answering at zero gets `graceS` more, then she
 *   speaks up, and that is the candidate's cue to stop;
 * - a question the candidate asks (Tâche 2) is always answered when it was started with `minAskS` or more left;
 * - Tâche 1: her two follow-up questions are owed whatever the clock says; after them she goes on asking while at
 *   least `minAskS` remains;
 * - Tâche 3: she never interrupts a candidate who is speaking before the official time, and stops them there
 *   exactly; whenever the candidate stops she asks a follow-up if `minAskS` (30 s) or more remain, else she closes;
 * - a hard ceiling (`overrunS`) ends a task whatever happens.
 */

export type Timing = {
  prepS: number;
  speakS: number;
  silenceS: number;
  introSilenceS?: number;
  resumeS: number;
  minSpeechS: number;
  firstInterjectS: number | null;
  minDevelopS: number;
  idleRelanceS: number;
  tailS: number;
  graceS: number;
  minAskS: number;
  introMaxS: number | null;
  minFollowUps: number;
  overrunS: number;
  stallS: number | null;
  stallAskS: number;
  idleAtZeroS: number;
};

const base = { tailS: 2, resumeS: 3.5, introMaxS: null, minFollowUps: 0, stallS: null, stallAskS: 0, idleAtZeroS: 4 };
export const TIMING: Record<TaskNo, Timing> = {
  1: { ...base, prepS: SPEAKING.tasks[1].prepSeconds, speakS: SPEAKING.tasks[1].speakSeconds, silenceS: 2.4, introSilenceS: 3.2, minSpeechS: 2, firstInterjectS: null, minDevelopS: 0, idleRelanceS: 7, graceS: 5, minAskS: 10, introMaxS: 90, minFollowUps: 2, overrunS: 30 },
  2: { ...base, prepS: SPEAKING.tasks[2].prepSeconds, speakS: SPEAKING.tasks[2].speakSeconds, silenceS: 1.0, minSpeechS: 1.2, firstInterjectS: null, minDevelopS: 0, idleRelanceS: 6, graceS: 5, minAskS: 10, overrunS: 30 },
  3: { ...base, prepS: SPEAKING.tasks[3].prepSeconds, speakS: SPEAKING.tasks[3].speakSeconds, silenceS: 3.2, minSpeechS: 4, firstInterjectS: null, minDevelopS: 0, idleRelanceS: 8, graceS: 0, minAskS: 30, stallS: null, stallAskS: 0, overrunS: 15 },
};

export type Clock = { elapsed: number; introDone: boolean; asked: number; questionEndAt: number; turnStartAt: number };

export function followUpsOwed(t: Timing, c: Clock): boolean {
  return t.minFollowUps > 0 && c.introDone && c.asked < t.minFollowUps && c.elapsed < t.speakS + t.overrunS;
}
export function canAsk(t: Timing, c: Clock): boolean {
  return followUpsOwed(t, c) || t.speakS - c.elapsed >= t.minAskS;
}
export function questionDeservesAnswer(t: Timing, c: Clock): boolean {
  return c.turnStartAt > 0 && t.speakS - c.turnStartAt >= t.minAskS;
}
export function cutAt(t: Timing, c: Clock): number {
  return Math.min(t.speakS + t.overrunS, Math.max(t.speakS, c.questionEndAt) + t.graceS);
}
export function timeIsUp(t: Timing, c: Clock & { midAnswer: boolean; idle?: boolean }): boolean {
  if (c.elapsed >= t.speakS + t.overrunS) return true;
  if (c.elapsed < t.speakS) return false;
  if (c.midAnswer) return c.elapsed >= cutAt(t, c);
  if (c.idle) return c.elapsed >= Math.max(t.speakS, c.questionEndAt) + t.idleAtZeroS;
  return !followUpsOwed(t, c);
}
export function introCut(t: Timing, segS: number, silenceS: number): boolean {
  if (t.introMaxS == null) return false;
  return segS >= t.introMaxS || (segS >= t.introMaxS - 6 && silenceS >= 0.5);
}
/** the last seconds: the clock turns amber, then blinks; past zero it shows « temps écoulé » */
export const WARN_S = 20;
export const BLINK_S = 10;
