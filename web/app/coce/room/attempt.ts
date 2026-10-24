// An exam attempt as the server gives it (docs/COCE.md §3).
import type { Level } from "../../../../shared/progress.ts";
import type { Section } from "../bank.ts";

/** how an attempt is taken: the real conditions, or the same questions and clock with free movement */
export type AttemptMode = "exam" | "training";

export type Attempt = {
  id: string; section: Section; exam: number;
  /** missing on rows from before the column: read as exam */
  mode?: AttemptMode;
  startedAt: string; deadlineAt: string; finishedAt: string | null;
  ended: "done" | "time" | "abandon" | null;
  score: number | null; nclc: number | null; right: number | null; wrong: number | null; blank: number | null;
  /** by placement: "B", or "-" for a question skipped because its audio failed */
  answers?: Record<string, string>;
  byLevel?: Partial<Record<Level, { right: number; of: number }>>;
};

export const DURATION_MIN: Record<Section, number> = { co: 35, ce: 60 };
export const EXAM_QUESTIONS = 39;

/** the key an exam file's answers are stored under */
export const placementOf = (q: { placement?: string; id: string }) => q.placement ?? q.id;
