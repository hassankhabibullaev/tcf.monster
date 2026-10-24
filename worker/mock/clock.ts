// The timeline of a sitting (docs/MOCK-EXAM.md §3.2), pure. The server owns the clock: a stage lasts its official
// time from `stage_started_at`; a break lasts its time from the stage's end; CE and EE are entered by themselves when
// their break ends; the speaking stage waits for a press (the microphone needs the person). A test that is entered is
// first *pending* (`stage_started_at` null, `break_until` = the latest start): its clock starts when the browser says
// the room is rendered (`begin`), or by itself at that latest start. `advance` says, for a row and the time now, where
// the sitting stands and which stages closed on the way.
import { BREAK_SECONDS, GRACE_MS, PENDING_S, STAGES, STAGE_SECONDS, isBreak, isTest, type BreakStage, type Ended, type Stage, type TestStage } from "./types.ts";

export type Position = { stage: Stage; stageStartedAt: string | null; breakUntil: string | null };
export type Close = { stage: TestStage; at: string; how: Ended };
export type Start = { stage: TestStage; at: string };
export type Advanced = Position & { closes: Close[]; starts: Start[] };

export const next = (s: Stage): Stage => STAGES[Math.min(STAGES.length - 1, STAGES.indexOf(s) + 1)];
export const breakAfter = (s: TestStage): BreakStage | null => (s === "co" ? "break1" : s === "ce" ? "break2" : s === "ee" ? "break3" : null);
export const testAfter = (b: BreakStage): TestStage => (b === "break1" ? "ce" : b === "break2" ? "ee" : "eo");
const iso = (ms: number) => new Date(ms).toISOString();

/** when the running stage ends (ms), null for a break, a pending test or when nothing runs */
export function stageEndsAt(p: Position): number | null {
  if (!isTest(p.stage) || !p.stageStartedAt) return null;
  return Date.parse(p.stageStartedAt) + STAGE_SECONDS[p.stage] * 1000;
}
/** a test entered whose clock has not started yet */
export const isPending = (p: Position) => isTest(p.stage) && !p.stageStartedAt;
/** a test is entered: pending, with its latest start */
const enter = (t: TestStage, atMs: number): Position => ({ stage: t, stageStartedAt: null, breakUntil: iso(atMs + PENDING_S * 1000) });

/**
 * Moves the position forward to where the clock says it is. A test past its end (plus the grace: the browser's last
 * answers may still be on the way) closes as `time` at its official end and its break starts there; a break past
 * its end starts the next test at that moment, except the speaking stage, which waits. `now` in ms.
 */
export function advance(p: Position, now: number, grace = GRACE_MS): Advanced {
  let cur: Position = { ...p };
  const closes: Close[] = [], starts: Start[] = [];
  for (let guard = 0; guard < STAGES.length * 2; guard++) {
    if (isPending(cur)) {
      // the room never said it was rendered: the clock starts at the latest start
      const latest = cur.breakUntil ? Date.parse(cur.breakUntil) : NaN;
      if (!(now > latest)) break;
      cur = { stage: cur.stage, stageStartedAt: iso(latest), breakUntil: null };
      continue;
    }
    if (isTest(cur.stage)) {
      const end = stageEndsAt(cur);
      if (end == null || now <= end + grace) break;
      closes.push({ stage: cur.stage, at: iso(end), how: "time" });
      const b = breakAfter(cur.stage);
      cur = b ? { stage: b, stageStartedAt: null, breakUntil: iso(end + BREAK_SECONDS[b] * 1000) } : { stage: "marking", stageStartedAt: iso(end), breakUntil: null };
      continue;
    }
    if (isBreak(cur.stage)) {
      const until = cur.breakUntil ? Date.parse(cur.breakUntil) : NaN;
      const t = testAfter(cur.stage);
      if (t === "eo" || !(now > until)) break; // the speaking stage waits for the person
      starts.push({ stage: t, at: cur.breakUntil! });
      cur = enter(t, until);
      continue;
    }
    break;
  }
  return { ...cur, closes, starts };
}

/** the person ends the running test now (Terminer, or the clock at zero on their screen): its break starts now */
export function endTest(p: Position, now: number, how: "done" | "abandon"): Advanced {
  if (!isTest(p.stage)) return { ...p, closes: [], starts: [] };
  const end = stageEndsAt(p); // null while pending: the test closes now
  // a finish that reaches the server after the stage's end is a time-out, whatever the browser says
  const at = end != null && now > end ? end : now;
  const b = breakAfter(p.stage);
  const close: Close = { stage: p.stage, at: iso(at), how: end != null && now > end ? "time" : how };
  return b
    ? { stage: b, stageStartedAt: null, breakUntil: iso(at + BREAK_SECONDS[b] * 1000), closes: [close], starts: [] }
    : { stage: "marking", stageStartedAt: iso(at), breakUntil: null, closes: [close], starts: [] };
}

/** the person leaves the break now (« Continuer maintenant », zero reached, or the press that starts the speaking stage): the next test is entered, pending */
export function endBreak(p: Position, now: number): Advanced & { lateS: number } {
  if (!isBreak(p.stage)) return { ...p, closes: [], starts: [], lateS: 0 };
  const t = testAfter(p.stage);
  const until = p.breakUntil ? Date.parse(p.breakUntil) : now;
  // CE and EE were entered by themselves at the break's end; the speaking stage is entered on the press
  const at = t === "eo" ? now : Math.min(now, until);
  const lateS = t === "eo" ? Math.max(0, Math.round((now - until) / 1000)) : 0;
  return { ...enter(t, at), closes: [], starts: [{ stage: t, at: iso(at) }], lateS };
}

/** the room is rendered: the pending test's clock starts now (never later than its latest start) */
export function begin(p: Position, now: number): Advanced {
  if (!isPending(p)) return { ...p, closes: [], starts: [] };
  const latest = p.breakUntil ? Date.parse(p.breakUntil) : now;
  return { stage: p.stage, stageStartedAt: iso(Math.min(now, latest)), breakUntil: null, closes: [], starts: [] };
}

/** the owner's switch: the running test ends now, or the break is over now (the speaking stage still waits for its press) */
export function skip(p: Position, now: number): Advanced {
  if (isTest(p.stage)) return endTest({ ...p, stageStartedAt: iso(now - STAGE_SECONDS[p.stage] * 1000) }, now + 1, "done");
  if (isBreak(p.stage)) {
    const t = testAfter(p.stage);
    const moved: Position = { ...p, breakUntil: iso(now) };
    return t === "eo" ? { ...moved, closes: [], starts: [] } : endBreak(moved, now);
  }
  return { ...p, closes: [], starts: [] };
}
