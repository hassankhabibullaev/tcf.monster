// The timeline: a stage closes at its official end once the grace is over, its break starts there, CE and EE start by
// themselves, the speaking stage waits, Terminer and « Continuer maintenant » move the clock, the owner's skip too.
import { describe, it, expect } from "vitest";
import { advance, begin, endBreak, endTest, isPending, skip, stageEndsAt } from "../../worker/mock/clock.ts";
import { BREAK_SECONDS, PENDING_S, STAGE_SECONDS } from "../../worker/mock/types.ts";

const T0 = Date.parse("2026-10-19T08:00:00.000Z");
const min = (n: number) => n * 60_000;
const at = (ms: number) => new Date(ms).toISOString();
const co = { stage: "co" as const, stageStartedAt: at(T0), breakUntil: null };

describe("advance", () => {
  it("inside the stage and its grace nothing moves", () => {
    expect(advance(co, T0 + min(34)).closes).toEqual([]);
    expect(advance(co, T0 + min(35) + 119_000).stage).toBe("co");
  });
  it("past the grace CO closes at 35:00 (not now) and the break runs from there", () => {
    const a = advance(co, T0 + min(40));
    expect(a.closes).toEqual([{ stage: "co", at: at(T0 + min(35)), how: "time" }]);
    expect(a.stage).toBe("break1");
    expect(a.breakUntil).toBe(at(T0 + min(40)));
    expect(a.starts).toEqual([]);
  });
  it("a break past its end enters CE pending at the break's end; 90 s later CE runs by itself; a whole morning away runs CO, CE and EE out and waits before EO", () => {
    const a = advance(co, T0 + min(41));
    expect(a.stage).toBe("ce");
    expect(isPending(a)).toBe(true);
    expect(a.stageStartedAt).toBeNull();
    expect(a.breakUntil).toBe(at(T0 + min(40) + PENDING_S * 1000));
    expect(a.starts).toEqual([{ stage: "ce", at: at(T0 + min(40)) }]);
    // the room never said it was rendered: the clock starts at the latest start
    const later = advance(co, T0 + min(42));
    expect(later.stageStartedAt).toBe(at(T0 + min(40) + PENDING_S * 1000));
    expect(later.breakUntil).toBeNull();
    const b = advance(co, T0 + min(600));
    expect(b.stage).toBe("break3");
    expect(b.closes.map((c) => c.stage)).toEqual(["co", "ce", "ee"]);
    expect(b.starts.map((s) => s.stage)).toEqual(["ce", "ee"]);
    // CO 35 + 5 + (90 s) + CE 60 + 5 + (90 s) + EE 60 = 168 min, then the 15-minute break that waits
    expect(b.breakUntil).toBe(at(T0 + min(165 + 15) + 2 * PENDING_S * 1000));
    expect(advance(b, T0 + min(2000)).stage).toBe("break3");
  });
  it("begin starts a pending test now, never later than its latest start; a second begin changes nothing", () => {
    const pending = { stage: "ce" as const, stageStartedAt: null, breakUntil: at(T0 + PENDING_S * 1000) };
    const b = begin(pending, T0 + 5000);
    expect(b).toMatchObject({ stage: "ce", stageStartedAt: at(T0 + 5000), breakUntil: null });
    expect(begin(pending, T0 + min(3)).stageStartedAt).toBe(at(T0 + PENDING_S * 1000));
    expect(begin(b, T0 + min(1))).toMatchObject({ stageStartedAt: at(T0 + 5000) });
    expect(stageEndsAt(pending)).toBeNull();
    // a pending test ended (an abandon during the announcement) closes now
    expect(endTest(pending, T0 + 3000, "abandon").closes[0]).toEqual({ stage: "ce", at: at(T0 + 3000), how: "abandon" });
  });
  it("the speaking stage closes at its hard stop and the marking begins there", () => {
    const eo = { stage: "eo" as const, stageStartedAt: at(T0), breakUntil: null };
    expect(stageEndsAt(eo)).toBe(T0 + STAGE_SECONDS.eo * 1000);
    const a = advance(eo, T0 + min(25));
    expect(a.stage).toBe("marking");
    expect(a.closes[0]).toEqual({ stage: "eo", at: at(T0 + min(20)), how: "time" });
    expect(advance({ stage: "marking", stageStartedAt: at(T0), breakUntil: null }, T0 + min(999)).closes).toEqual([]);
  });
});

describe("the person's moves", () => {
  it("Terminer in CE at 12 min closes it now as done and its break starts now", () => {
    const ce = { stage: "ce" as const, stageStartedAt: at(T0), breakUntil: null };
    const a = endTest(ce, T0 + min(12), "done");
    expect(a.closes).toEqual([{ stage: "ce", at: at(T0 + min(12)), how: "done" }]);
    expect(a.stage).toBe("break2");
    expect(a.breakUntil).toBe(at(T0 + min(12) + BREAK_SECONDS.break2 * 1000));
    // after the end it is a time-out at the official end, whatever the browser says
    const late = endTest(ce, T0 + min(61), "done");
    expect(late.closes[0]).toEqual({ stage: "ce", at: at(T0 + min(60)), how: "time" });
    // the speaking stage ends into the marking
    expect(endTest({ stage: "eo", stageStartedAt: at(T0), breakUntil: null }, T0 + min(11), "done").stage).toBe("marking");
    expect(endTest({ stage: "break1", stageStartedAt: null, breakUntil: at(T0) }, T0, "done").closes).toEqual([]);
  });
  it("« Continuer maintenant » enters CE pending now; at zero or later the latest start still counts from the break's end", () => {
    const b = { stage: "break1" as const, stageStartedAt: null, breakUntil: at(T0 + min(5)) };
    const early = endBreak(b, T0 + min(2));
    expect(early).toMatchObject({ stage: "ce", stageStartedAt: null, breakUntil: at(T0 + min(2) + PENDING_S * 1000) });
    expect(endBreak(b, T0 + min(7)).breakUntil).toBe(at(T0 + min(5) + PENDING_S * 1000));
    expect(endBreak(b, T0 + min(7)).lateS).toBe(0);
  });
  it("the speaking stage is entered on the press, and the lateness is counted", () => {
    const b = { stage: "break3" as const, stageStartedAt: null, breakUntil: at(T0 + min(15)) };
    const early = endBreak(b, T0 + min(10));
    expect(early.stage).toBe("eo");
    expect(early.breakUntil).toBe(at(T0 + min(10) + PENDING_S * 1000));
    expect(early.lateS).toBe(0);
    const late = endBreak(b, T0 + min(22));
    expect(late.breakUntil).toBe(at(T0 + min(22) + PENDING_S * 1000));
    expect(late.lateS).toBe(420);
  });
  it("the owner's skip ends the stage now (as time) and ends a break now; the speaking stage still waits for its press", () => {
    const s = skip(co, T0 + min(3));
    expect(s.stage).toBe("break1");
    expect(s.closes[0].how).toBe("time");
    expect(s.breakUntil).toBe(at(T0 + min(3) + BREAK_SECONDS.break1 * 1000));
    const b = skip({ stage: "break1", stageStartedAt: null, breakUntil: at(T0 + min(60)) }, T0);
    expect(b.stage).toBe("ce");
    expect(isPending(b)).toBe(true);
    expect(b.breakUntil).toBe(at(T0 + PENDING_S * 1000));
    // a pending test skipped: closed now as time
    const p = skip(b, T0 + 2000);
    expect(p.stage).toBe("break2");
    expect(p.closes[0]).toMatchObject({ stage: "ce", how: "time" });
    const b3 = skip({ stage: "break3", stageStartedAt: null, breakUntil: at(T0 + min(60)) }, T0);
    expect(b3.stage).toBe("break3");
    expect(b3.breakUntil).toBe(at(T0));
    expect(skip({ stage: "marking", stageStartedAt: at(T0), breakUntil: null }, T0).stage).toBe("marking");
  });
});
