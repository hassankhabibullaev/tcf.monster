/**
 * Structured marking grid (names, weights, sources, language ceiling, caps). Descriptors and rationale live in
 * docs/rubric.md, which is loaded into the scorer's prompt; a test checks the two stay in sync. NON-OFFICIAL grid.
 */
import { SPEAKING, WRITING, type Skill, type TaskNo } from "../config.ts";

/**
 * source: what the criterion can honestly be judged from. "transcript" criteria are scored as soon as the task ends;
 * "audio" criteria (fluency, pronunciation) stay locked until the candidate asks for the full analysis of the recording.
 */
export type Criterion = { name: string; weight: number; kind: "task" | "language"; source: "transcript" | "audio"; /** false: counts in the score but not in the language ceiling (spelling is delivery, not level) */ ceiling?: boolean };
/** every criterion is scored out of 20 on the official CECRL ↔ /20 correspondence: A2 4–5, B1 6–9, B2 10–13, C1 14–15, C2 16–20 */
export const SCORE_MAX = 20;

const T = "transcript" as const;
/**
 * The rows follow the three orders France Éducation international publishes for both expression tests (2026-10-24):
 * linguistic (Vocabulary, Grammar, Spelling / Fluency, Pronunciation), pragmatic (thematic development and, spoken,
 * interaction → Task completion; structure, coherence and cohesion → Organization) and sociolinguistic (fit to the
 * situation: addressee, register → Task completion).
 * Writing: the same five rows for the three tasks. Spelling counts in the mark but not in the language ceiling (it is
 * delivery, not level).
 */
const WRITTEN: Criterion[] = [
  // the two pragmatic rows share the 1.5 « Task completion » had alone: the calibration of the mark does not move
  { name: "Task completion", weight: 1, kind: "task", source: T },
  { name: "Organization", weight: 0.5, kind: "task", source: T },
  { name: "Vocabulary", weight: 1, kind: "language", source: T },
  { name: "Grammar", weight: 1.5, kind: "language", source: T },
  { name: "Spelling", weight: 1, kind: "language", source: T, ceiling: false },
];
/**
 * Speaking: the same six rows for the three tasks, named in English like the result screen. What each task asks for
 * (answers about oneself, questions that obtain information, an argued opinion) is judged in « Task completion », the
 * order and linking of what is said in « Organization »; the language rows weigh the larger part of the mark, as a TCF
 * score is a language level.
 */
const SPOKEN: Criterion[] = [
  { name: "Task completion", weight: 1, kind: "task", source: T },
  { name: "Organization", weight: 0.5, kind: "task", source: T },
  { name: "Vocabulary", weight: 1, kind: "language", source: T },
  { name: "Grammar", weight: 1.5, kind: "language", source: T },
  { name: "Fluency", weight: 1, kind: "language", source: "audio" },
  { name: "Pronunciation", weight: 1, kind: "language", source: "audio" },
];

export const RUBRIC: Record<Skill, Record<TaskNo, Criterion[]>> = {
  writing: { 1: WRITTEN, 2: WRITTEN, 3: WRITTEN },
  speaking: { 1: SPOKEN, 2: SPOKEN, 3: SPOKEN },
};

/**
 * Language ceiling. A TCF score is a language level: a perfectly executed task shows the examiner has enough to judge,
 * it does not raise the level. So a task criterion cannot exceed the language average by more than TASK_MARGIN, and
 * the overall score cannot exceed it by more than OVERALL_MARGIN. (The other direction is handled by CAPS below.)
 */
export const TASK_MARGIN = 3;
export const OVERALL_MARGIN = 1;

export type CriterionScore = { name: string; score: number; reason?: string };

/** The scorer first names a level, then a score; the score is kept inside the level it named (models judge levels better than numbers). */
export const LEVEL_RANGE: Record<string, [number, number]> = { A1: [1, 3], A2: [4, 5], "B1-": [6, 7], "B1+": [8, 9], "B2-": [10, 11], "B2+": [12, 13], C1: [14, 15], "C2-": [16, 17], "C2+": [18, 20] };
export function scoreInLevel(level: string | undefined, score: number): number {
  const r = level ? LEVEL_RANGE[level] : undefined;
  const n = Math.round(Number.isFinite(score) ? score : 0);
  if (n === 0 || !r) return Math.max(0, Math.min(SCORE_MAX, n));
  return Math.max(r[0], Math.min(r[1], n));
}
export type ScoredCriterion = CriterionScore & { weight: number; kind: Criterion["kind"]; source: Criterion["source"]; /** the model's score before the language ceiling, when the ceiling lowered it */ cappedFrom?: number };
export type ScoreResult = { criteria: ScoredCriterion[]; /** names of the criteria still waiting for the audio analysis */ locked: string[]; languageAverage: number; score20: number; ceilingApplied: boolean; taskScoreMax: number };

/**
 * Scores given per criterion (/20) → task score (/20, unrounded; callers round after the non-fulfilment caps).
 * Only the criteria present in `given` count: right after the task that is the transcript criteria; once the audio
 * analysis has run, all of them — the ceiling is then recomputed with fluency and pronunciation.
 */
export function scoreFromCriteria(skill: Skill, task: TaskNo, given: CriterionScore[]): ScoreResult {
  const crit = RUBRIC[skill][task];
  const clamp = (n: number) => Math.max(0, Math.min(SCORE_MAX, Number.isFinite(n) ? n : 0));
  const have = crit.flatMap((c) => {
    const g = given.find((x) => x.name === c.name);
    return g ? [{ ...c, score: clamp(g.score), reason: g.reason }] : [];
  });
  const lang = have.filter((c) => c.kind === "language" && c.ceiling !== false);
  const languageAverage = lang.length ? lang.reduce((s, c) => s + c.score, 0) / lang.length : SCORE_MAX;
  const criteria: ScoredCriterion[] = have.map((c) => {
    const cap = languageAverage + TASK_MARGIN;
    return c.kind === "task" && c.score > cap ? { ...c, score: Number(cap.toFixed(1)), cappedFrom: c.score } : c;
  });
  const wsum = criteria.reduce((s, c) => s + c.weight, 0);
  const mean = wsum ? criteria.reduce((s, c) => s + c.score * c.weight, 0) / wsum : 0;
  const ceiling = languageAverage + OVERALL_MARGIN;
  return {
    criteria,
    locked: crit.filter((c) => !have.some((h) => h.name === c.name)).map((c) => c.name),
    languageAverage: Number(languageAverage.toFixed(2)),
    // the ceiling must still hold once the score is rounded to a whole number: 10.5 would round up to 11
    score20: mean > ceiling ? Math.floor(ceiling + 1e-9) : Number(mean.toFixed(2)),
    ceilingApplied: mean > ceiling,
    taskScoreMax: maxPointsOf(skill, task),
  };
}

/** Caps on the task's /20 (docs/rubric.md §2). */
export const CAPS = {
  empty: 0,
  offTask: 6,
  missingElement: 11,
  register: 11,
  lengthMinor: 11,
  lengthMajor: 8,
  lengthMajorDeviation: 0.25,
  shortSpeech: 8,
  shortSpeechRatio: 0.4,
} as const;

export type Fulfilment = {
  /** right text type / right task (e.g. questions asked in speaking T2, two documents compared in writing T3) */
  textTypeOk: boolean;
  registerOk: boolean;
  requiredElementsMissing: string[];
};

export type LengthFacts = { wordCount: number; min: number; max: number };

export function maxPointsOf(skill: Skill, task: TaskNo): number {
  return skill === "writing" ? WRITING.tasks[task].maxPoints : SPEAKING.tasks[task].maxPoints;
}

/** Applies the non-fulfilment caps to a /20 and returns the capped value plus the reasons. */
export function applyCaps(score20: number, f: Fulfilment, opts: { empty?: boolean; length?: LengthFacts | null; speechRatio?: number | null }): { score20: number; caps: string[] } {
  const caps: { cap: number; why: string }[] = [];
  if (opts.empty) caps.push({ cap: CAPS.empty, why: "production vide ou inaudible" });
  if (!f.textTypeOk) caps.push({ cap: CAPS.offTask, why: "hors sujet ou mauvais type de texte / de tâche" });
  if (f.requiredElementsMissing.length) caps.push({ cap: CAPS.missingElement, why: `élément obligatoire absent : ${f.requiredElementsMissing.join(", ")}` });
  if (!f.registerOk) caps.push({ cap: CAPS.register, why: "registre inadapté" });
  if (opts.length) {
    const { wordCount, min, max } = opts.length;
    if (wordCount < min || wordCount > max) {
      const dev = wordCount < min ? (min - wordCount) / min : (wordCount - max) / max;
      const major = dev > CAPS.lengthMajorDeviation;
      caps.push({ cap: major ? CAPS.lengthMajor : CAPS.lengthMinor, why: `${wordCount} mots hors de la fourchette ${min}–${max} (écart ${Math.round(dev * 100)} %)` });
    }
  }
  if (opts.speechRatio != null && opts.speechRatio < CAPS.shortSpeechRatio) caps.push({ cap: CAPS.shortSpeech, why: `temps de parole ${Math.round(opts.speechRatio * 100)} % de la durée de la tâche` });
  const capped = caps.reduce((s, c) => Math.min(s, c.cap), score20);
  // real TCF scores are whole numbers
  return { score20: Math.round(capped), caps: caps.filter((c) => c.cap < score20).map((c) => `${c.why} → plafond ${c.cap}/20`) };
}
