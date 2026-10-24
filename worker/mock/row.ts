// The mock row as the database holds it and as the browser reads it; the plain « is one running » the attempts and
// the simulator ask before they start (no timeline here: that is worker/mock/index.ts, inside the mock's own routes).
import type { Env } from "../util.ts";
import { isPending, stageEndsAt } from "./clock.ts";
import { COLS, type Answer, type CoceResult, type EndedJson, type Mock, type MockRow, type Paper, type Result, type Row, type Topics } from "./types.ts";

export const parse = <T>(s: string | null | undefined, fallback: T): T => { try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } };
export const paperOf = (r: Row): Paper => { const p = parse<Partial<Paper>>(r.paper_json, {}); return { co: p.co ?? [], ce: p.ce ?? [] }; };
export const topicsOf = (r: Row): Topics => { const t = parse<Partial<Topics>>(r.topics_json, {}); return { ee: t.ee ?? null, eo: { partId: t.eo?.partId ?? null, t2: t.eo?.t2 ?? null, t3: t.eo?.t3 ?? null } }; };
export const endedOf = (r: Row): EndedJson => parse<EndedJson>(r.ended_json, {});
export const answersOf = (r: Row, s: "co" | "ce"): Record<string, Answer> => parse<Record<string, Answer>>(s === "co" ? r.co_answers : r.ce_answers, {});
export const resultOf = (r: Row, s: "co" | "ce"): CoceResult | null => parse<CoceResult | null>(s === "co" ? r.co_result : r.ce_result, null);

export function toMockRow(r: Row): MockRow {
  const ends = stageEndsAt({ stage: r.stage, stageStartedAt: r.stage_started_at, breakUntil: r.break_until });
  return {
    id: r.id, startedAt: r.started_at, finishedAt: r.finished_at, status: r.status, stage: r.stage, stageStartedAt: r.stage_started_at,
    stageEndsAt: ends == null ? null : new Date(ends).toISOString(), breakUntil: r.break_until, pending: isPending({ stage: r.stage, stageStartedAt: r.stage_started_at, breakUntil: r.break_until }),
    micMode: r.mic_mode === "live" || r.mic_mode === "ptt" ? r.mic_mode : null, ended: endedOf(r), result: parse<Result | null>(r.result_json, null), certificate: !!r.certificate,
    eeSessionId: r.ee_session_id, eoSessionId: r.eo_session_id,
  };
}
export const toMock = (r: Row): Mock => ({ ...toMockRow(r), paper: paperOf(r), answers: { co: answersOf(r, "co"), ce: answersOf(r, "ce") }, coResult: resultOf(r, "co"), ceResult: resultOf(r, "ce") });

/** the person's unfinished mock, as stored (not advanced) */
export const runningMock = (env: Env, userId: string) =>
  env.DB.prepare(`SELECT ${COLS} FROM mocks WHERE user_id = ? AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1`).bind(userId).first<Row>();
