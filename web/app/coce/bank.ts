// The question bank as the browser sees it: static files under /data/ (docs/COCE.md §1), each fetched once per visit.
import type { Level } from "../../../shared/progress.ts";

export type Section = "co" | "ce";
export type Key = "A" | "B" | "C" | "D";

export type Option = { key: Key; text: string | null; textEn: string | null; reason: string | null };
/** a timed word; `p: 1` = it starts a new speech line (a new speaker turn or paragraph) */
export type Word = { w: string; s: number; e: number; p?: 1 };
export type Segments = { options: [number, number][] | null; question: [number, number] | null };

export type Question = {
  id: string; section: Section; level: Level;
  stem: string; stemEn: string | null;
  options: Option[];
  answer: Key;
  hint: { fr: string; en: string } | null;
  keySentence: string | null; keySentenceEn: string | null; explanation: string | null;
  audio: string | null; image: string | null;
  transcript: string | null; transcriptEn: string | null;
  words: Word[] | null;
  segments: Segments | null;
  maxPlays: number;
  passage: string | null; passageEn: string | null; passageImage: string | null;
  practiceOnly: boolean;
  /** exam files only */
  placement?: string; position?: number;
};

export type BankIndex = {
  builtAt: string;
  points: Record<Level, number>;
  examCount: Record<Level, number>;
  levels: Record<Section, Record<Level, number>>;
  exams: number;
};

const cache = new Map<string, Promise<unknown>>();

function load<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(path, { credentials: "same-origin" }).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json() as Promise<T>;
    });
    // a failed load is forgotten, so the next call tries again
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

export const loadIndex = () => load<BankIndex>("/data/bank.json");
export const loadLevel = (section: Section, level: Level) => load<Question[]>(`/data/${section}-${level}.json`);
export const loadExam = (section: Section, nn: number) => load<Question[]>(`/data/exam-${section}-${String(nn).padStart(2, "0")}.json`);

/** a question's number is its index + 1 in the level file */
export const numberOf = (questions: Question[], id: string) => questions.findIndex((q) => q.id === id) + 1;
