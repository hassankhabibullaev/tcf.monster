/**
 * Writing (and the mistake lists of both skills), the part that needs no server: score a text handed in, list every
 * mistake of a text or of what was said, check a rewrite. Runs in the person's browser with their own Gemini key
 * (web/app/sim/browser-score.ts). It reads nothing and writes nothing: the caller keeps what it returns.
 */
import { wordCount, nowIso } from "./util.ts";
import { SPEAKING, WRITING, nclcFor, type TaskNo } from "./config.ts";
import { copiedPassages, type Correction } from "./eval/highlight.ts";
import { evaluateProduction, type Evaluation } from "./eval/evaluate.ts";
import { proofread, proofreadSpeech } from "./eval/proofread.ts";
import type { GeneratedPrompt, Turn } from "./types.ts";

/** version 2: the COMPLETE list of mistakes, from the sentence-by-sentence reading (eval/proofread.ts) */
export type Detail = { version: 2; corrections: Correction[]; advice: string[] };
export type Revision = { text: string; wordCount: number; score20: number; level: string; nclc: number; evaluation: Evaluation; /** the complete list of mistakes (null: that reading failed, the scorer's shorter list is shown) */ corrections: Correction[] | null; at: string };

const consigneOf = (p: GeneratedPrompt) => `${p.title ? `${p.title} — ` : ""}${p.consigne}`;

/** every mistake of a written text */
export async function detailOfText(taskNo: TaskNo, prompt: GeneratedPrompt, text: string): Promise<Detail> {
  const r = await proofread({ text, taskNo, consigne: consigneOf(prompt) });
  return { version: 2, corrections: r.corrections, advice: [] };
}

/** every mistake that was SAID, answer by answer (what cannot be heard is the transcriber's, not the candidate's) */
export async function detailOfSpeech(taskNo: TaskNo, prompt: GeneratedPrompt, allTurns: Turn[]): Promise<Detail> {
  const turns = allTurns.filter((t) => t.text && t.text !== "(inaudible)");
  const production = turns.filter((t) => t.role === "candidate").map((t) => t.text).join("\n");
  if (!production.trim()) return { version: 2, corrections: [], advice: [] };
  const shown = turns.map((t) => `${t.role === "examiner" ? "Examinatrice" : "CANDIDAT"} : ${t.text}`).join("\n");
  const r = await proofreadSpeech({ dialogue: shown, candidate: production, taskName: `Tâche ${taskNo} — ${SPEAKING.tasks[taskNo].name}. ${SPEAKING.tasks[taskNo].objective}`, consigne: consigneOf(prompt) });
  return { version: 2, corrections: r.corrections, advice: [] };
}

export type WritingScore = { evaluation: Evaluation | null; detail: Detail | null; score20: number; level: string; nclc: number; wordCount: number };

/** a text handed in: scored (one call) while every mistake is listed (another; its failure never fails the mark) */
export async function scoreWriting(opts: { taskId: string; taskNo: TaskNo; prompt: GeneratedPrompt; text: string; elapsedS: number }): Promise<WritingScore> {
  const cfg = WRITING.tasks[opts.taskNo];
  const wc = wordCount(opts.text);
  // nothing handed in: task not done, 0/20
  if (wc === 0) return { evaluation: null, detail: null, score20: 0, level: "A1", nclc: 0, wordCount: 0 };
  const detailP = detailOfText(opts.taskNo, opts.prompt, opts.text).catch(() => null);
  const docs = opts.prompt.sourceDocuments ?? [];
  const evaluation = await evaluateProduction({
    taskId: opts.taskId, skill: "writing", task: opts.taskNo, prompt: opts.prompt, production: opts.text,
    facts: { wordCount: wc, wordsMin: cfg.wordsMin, wordsMax: cfg.wordsMax, withinRange: wc >= cfg.wordsMin && wc <= cfg.wordsMax, elapsedSeconds: opts.elapsedS, ...(docs.length ? { copied: copiedPassages(opts.text, docs.map((d) => d.text)) } : {}) },
  });
  const m = nclcFor(evaluation.score20, "writing");
  return { evaluation, detail: await detailP, score20: evaluation.score20, level: m.cecrl, nclc: m.nclc, wordCount: wc };
}

/** a rewrite on the result page: scored and proofread (practice: it never changes the task's mark) */
export async function scoreRevision(opts: { taskId: string; taskNo: TaskNo; prompt: GeneratedPrompt; text: string }): Promise<Revision> {
  const cfg = WRITING.tasks[opts.taskNo];
  const wc = wordCount(opts.text);
  const docs = opts.prompt.sourceDocuments ?? [];
  const proofP = detailOfText(opts.taskNo, opts.prompt, opts.text).catch((e) => { console.warn("proofreading of a revision failed", e); return null; });
  const evaluation = await evaluateProduction({ taskId: opts.taskId, skill: "writing", task: opts.taskNo, prompt: opts.prompt, production: opts.text, facts: { ...(docs.length ? { copied: copiedPassages(opts.text, docs.map((d) => d.text)) } : {}), wordCount: wc, wordsMin: cfg.wordsMin, wordsMax: cfg.wordsMax, withinRange: wc >= cfg.wordsMin && wc <= cfg.wordsMax, elapsedSeconds: 0 } });
  const m = nclcFor(evaluation.score20, "writing");
  return { text: opts.text, wordCount: wc, score20: evaluation.score20, level: m.cecrl, nclc: m.nclc, evaluation, corrections: (await proofP)?.corrections ?? null, at: nowIso() };
}
