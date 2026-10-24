// A task's marks as the server keeps them: numbers and the grid's own row names, nothing the candidate wrote or said.
// The full evaluation (reasons, corrections, tips, quotes) stays in the browser that made it (web/app/sim/work.ts);
// another device shows these marks alone.
import type { Evaluation } from "./eval/evaluate.ts";
import type { Skill, TaskNo } from "./config.ts";
import { RUBRIC } from "./eval/rubric.ts";

export type Marks = {
  stage: "transcript" | "full";
  score20: number;
  /** the task's points on its own scale (6 · 6 · 8); null on marks carried over from before 2026-10 */
  taskScore: number | null;
  taskScoreMax: number | null;
  criteria: { name: string; score: number }[];
  /** criteria still waiting for the recording's analysis (speaking) */
  locked: string[];
};

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : null;
};

/**
 * The marks of an evaluation, or of anything claiming to be one (the server runs this on what a browser sends): only
 * the rows the grid has for this task are kept, by name, with their scores; every free text is dropped.
 */
export function marksOf(skill: Skill, task: TaskNo, v: unknown): Marks | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const e = v as Partial<Evaluation> & Record<string, unknown>;
  const names = new Set((RUBRIC[skill]?.[task] ?? []).map((c) => c.name));
  const score20 = num(e.score20, 0, 20);
  if (score20 == null) return null;
  const criteria = (Array.isArray(e.criteria) ? e.criteria : []).flatMap((c) => {
    const r = c as { name?: unknown; score?: unknown };
    const score = num(r?.score, 0, 20);
    return typeof r?.name === "string" && names.has(r.name) && score != null ? [{ name: r.name, score }] : [];
  });
  const locked = (Array.isArray(e.locked) ? e.locked : []).filter((n): n is string => typeof n === "string" && names.has(n));
  return {
    stage: e.stage === "full" ? "full" : "transcript",
    score20,
    taskScore: num(e.taskScore, 0, 20),
    taskScoreMax: num(e.taskScoreMax, 0, 20),
    criteria: [...new Map(criteria.map((c) => [c.name, c])).values()],
    locked: [...new Set(locked)],
  };
}
