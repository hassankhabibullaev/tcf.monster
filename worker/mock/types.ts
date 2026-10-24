// The shapes of the mock exam (docs/MOCK-EXAM.md §6): the row, the paper, the results, the stages and their times.
import type { Level, Section as CoceSection } from "../../shared/progress.ts";

export type Stage = "co" | "break1" | "ce" | "break2" | "ee" | "break3" | "eo" | "marking" | "over";
export const STAGES: readonly Stage[] = ["co", "break1", "ce", "break2", "ee", "break3", "eo", "marking", "over"];
export type TestStage = "co" | "ce" | "ee" | "eo";
export const TESTS: readonly TestStage[] = ["co", "ce", "ee", "eo"];
export type BreakStage = "break1" | "break2" | "break3";
export const isTest = (s: Stage): s is TestStage => s === "co" || s === "ce" || s === "ee" || s === "eo";
export const isBreak = (s: Stage): s is BreakStage => s === "break1" || s === "break2" || s === "break3";

/** the official times; the speaking stage's number is the server's hard stop (the runner ends it earlier by itself) */
export const STAGE_SECONDS: Record<TestStage, number> = { co: 35 * 60, ce: 60 * 60, ee: 60 * 60, eo: 20 * 60 };
/** the breaks (docs/MOCK-EXAM.md §9 b) */
export const BREAK_SECONDS: Record<BreakStage, number> = { break1: 5 * 60, break2: 5 * 60, break3: 15 * 60 };
/** answers are still taken this long after a stage's end (the browser's last PATCH on the way), as attempts do */
export const GRACE_MS = 120_000;
/** a test entered waits for the browser to say its room is rendered (`begin`), at most this long: then it starts by itself */
export const PENDING_S = 90;
/** the speaking stage waits for a press after its break; a press later than this withholds the certificate */
export const EO_LATE_ALLOWANCE_S = 5 * 60;
/** the official level quotas of a 39-question paper */
export const QUOTA: Record<Level, number> = { A1: 4, A2: 6, B1: 9, B2: 10, C1: 6, C2: 4 };
export const PAPER_SIZE = 39;

export type Key = "A" | "B" | "C" | "D";
export type Answer = Key | "-";
/** one line of public/data/key-<section>.json, and of the paper */
export type KeyRow = { id: string; level: Level; answer: Key };
export type Paper = Record<CoceSection, KeyRow[]>;
export type Topics = { ee: number | null; eo: { partId: number | null; t2: number | null; t3: number | null } };
export type Ended = "done" | "time" | "abandon" | "stale";
export type EndedJson = Partial<Record<TestStage, Ended>> & { eoLateS?: number };
export type ByLevel = Record<Level, { right: number; of: number }>;
export type CoceResult = { score: number; nclc: number | null; right: number; wrong: number; blank: number; byLevel: ByLevel; ended: Ended; at: string };
export type ExprResult = { score20: number | null; nclc: number | null; level: string | null; marked: number; of: number; status: string };
export type Result = { co: CoceResult | null; ce: CoceResult | null; ee: ExprResult | null; eo: ExprResult | null; overall: number | null; at: string };
export type Status = "running" | "marking" | "done" | "abandoned";

export type Row = {
  id: number; user_id: string; started_at: string; finished_at: string | null;
  status: Status; stage: Stage; stage_started_at: string | null; break_until: string | null;
  paper_json: string; topics_json: string; co_answers: string; ce_answers: string; co_result: string | null; ce_result: string | null;
  ee_session_id: string | null; eo_session_id: string | null; ended_json: string; mic_mode: string | null; result_json: string | null; certificate: number;
};
export const COLS = "id, user_id, started_at, finished_at, status, stage, stage_started_at, break_until, paper_json, topics_json, co_answers, ce_answers, co_result, ce_result, ee_session_id, eo_session_id, ended_json, mic_mode, result_json, certificate";

/** what the browser gets (the list leaves the paper and the answers out) */
export type MockRow = {
  id: number; startedAt: string; finishedAt: string | null; status: Status; stage: Stage; stageStartedAt: string | null; stageEndsAt: string | null; breakUntil: string | null;
  /** a test entered whose clock waits for the room to be rendered (`breakUntil` is then its latest start) */
  pending: boolean;
  micMode: "live" | "ptt" | null; ended: EndedJson; result: Result | null; certificate: boolean;
  eeSessionId: string | null; eoSessionId: string | null;
};
export type Mock = MockRow & { paper: Paper; answers: Record<CoceSection, Record<string, Answer>>; coResult: CoceResult | null; ceResult: CoceResult | null };
