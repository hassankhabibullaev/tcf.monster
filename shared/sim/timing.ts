/**
 * Timing rules of the live exchange (seconds) and the decisions taken from them. Pure module: the browser runs these
 * rules (components/sim/oral-runner.tsx), the server sends the figures with the plan, the tests check the decisions.
 *
 * The principles (set with the owner on 2026-10-07):
 * - the clock never cuts the candidate: the examiner does, by voice, and the recording goes on `tailS` after she
 *   starts, so the last words are kept and marked;
 * - a question she asks is always listened to: a candidate who is answering at zero gets `graceS` more (five
 *   seconds), then she speaks up — at once, no thinking — and that is the candidate's cue to stop;
 * - a question the candidate asks (Tâche 2) is always answered when it was started with `minAskS` or more left;
 * - Tâche 1: her two follow-up questions are owed whatever the clock says; after them she goes on asking while at
 *   least `minAskS` remains; the answer to a question asked late keeps `graceS` from the end of the question;
 * - Tâche 3 (one rule, set with the owner on 2026-10-10): the goal is 4 min 30 of speech. She never interrupts a
 *   candidate who is speaking before the official time, and stops them there exactly (`graceS` = 0). Whenever the
 *   candidate stops (the button in push mode, the pause in live mode) she asks a follow-up question if `minAskS`
 *   (30 s) or more remain, and closes otherwise — after the development and after every answer alike;
 * - a hard ceiling (`overrunS`) ends a task whatever happens.
 */
import { SPEAKING, type TaskNo } from "./config.ts";

export type Timing = {
  prepS: number;
  speakS: number;
  /** a pause this long ends an answer (auto mode; in push mode the candidate's button ends it) */
  silenceS: number;
  /** T1: the self-presentation gets a longer tolerance (people think while they present) */
  introSilenceS?: number;
  /** after a pause was taken for the end of an answer: if the candidate speaks again within this many seconds of
   * her next line, her line is cancelled and the answer goes on */
  resumeS: number;
  minSpeechS: number;
  /** T3: the development is ended in any case at this point (null: never while the candidate speaks; the official time stops them) */
  firstInterjectS: number | null;
  /** T3: before this point a pause never ends the development (the candidate presses « J'ai terminé »); after it, it does */
  minDevelopS: number;
  idleRelanceS: number;
  /** when the examiner cuts in (or closes the task), the recording goes on this long so the last words are kept */
  tailS: number;
  /** after the official time (or after her late question), a candidate who is mid-answer gets this long before she interrupts */
  graceS: number;
  /** her turn: no new question (T1, T3) / no more questions listened to (T2) when less than this remains; she closes instead */
  minAskS: number;
  /** T1: the self-presentation is interrupted at this point (a few seconds earlier if the candidate pauses) */
  introMaxS: number | null;
  /** T1: follow-up questions asked after the presentation whatever the clock says */
  minFollowUps: number;
  /** the hard ceiling: the task ends this long after the official time whatever happens */
  overrunS: number;
  /** T3: a blank this long in the middle of the development makes the examiner step in */
  stallS: number | null;
  /** T3: before this point she only asks to go on; after it she moves to her questions */
  stallAskS: number;
  /** push mode: the candidate has the floor at zero and has not started: she closes after this long */
  idleAtZeroS: number;
};

const base = { tailS: 2, resumeS: 3.5, introMaxS: null, minFollowUps: 0, stallS: null, stallAskS: 0, idleAtZeroS: 4 };
export const TIMING: Record<TaskNo, Timing> = {
  1: { ...base, prepS: SPEAKING.tasks[1].prepSeconds, speakS: SPEAKING.tasks[1].speakSeconds, silenceS: 2.4, introSilenceS: 3.2, minSpeechS: 2, firstInterjectS: null, minDevelopS: 0, idleRelanceS: 7, graceS: 5, minAskS: 10, introMaxS: 90, minFollowUps: 2, overrunS: 30 },
  2: { ...base, prepS: SPEAKING.tasks[2].prepSeconds, speakS: SPEAKING.tasks[2].speakSeconds, silenceS: 1.0, minSpeechS: 1.2, firstInterjectS: null, minDevelopS: 0, idleRelanceS: 6, graceS: 5, minAskS: 10, overrunS: 30 },
  3: { ...base, prepS: SPEAKING.tasks[3].prepSeconds, speakS: SPEAKING.tasks[3].speakSeconds, silenceS: 3.2, minSpeechS: 4, firstInterjectS: null, minDevelopS: 0, idleRelanceS: 8, graceS: 0, minAskS: 30, stallS: null, stallAskS: 0, overrunS: 15 },
};

/**
 * Where the task stands: task time elapsed, and (Tâche 1) the presentation, the questions asked, the task time at
 * which her last question ended (the answer to a late question keeps its grace from there), (Tâche 2) the task time
 * at which the candidate's current question started.
 */
export type Clock = { elapsed: number; introDone: boolean; asked: number; /** task time at which her last question ended (0: none) */ questionEndAt: number; /** T2: task time at which the candidate's current turn started (0: none) */ turnStartAt: number };

/** Tâche 1: the presentation is over and fewer than `minFollowUps` questions have been asked (until the ceiling). */
export function followUpsOwed(t: Timing, c: Clock): boolean {
  return t.minFollowUps > 0 && c.introDone && c.asked < t.minFollowUps && c.elapsed < t.speakS + t.overrunS;
}

/** Her turn, after an answer: may she ask another question (T1, T3), or listen to another one (T2)? */
export function canAsk(t: Timing, c: Clock): boolean {
  return followUpsOwed(t, c) || t.speakS - c.elapsed >= t.minAskS;
}

/** T2: a question the candidate started with enough time left is answered, even past the official time. */
export function questionDeservesAnswer(t: Timing, c: Clock): boolean {
  return c.turnStartAt > 0 && t.speakS - c.turnStartAt >= t.minAskS;
}

/** The task time at which she interrupts a candidate who is still speaking: the official time, or her late question's end, plus the grace. */
export function cutAt(t: Timing, c: Clock): number {
  return Math.min(t.speakS + t.overrunS, Math.max(t.speakS, c.questionEndAt) + t.graceS);
}

/**
 * The official time is over: does the task close now? Not while a question is owed (T1), not before the grace of a
 * candidate who is mid-answer; a candidate who has the floor at zero and has not started gets `idleAtZeroS`.
 */
export function timeIsUp(t: Timing, c: Clock & { midAnswer: boolean; /** the floor is the candidate's and nothing has been said yet */ idle?: boolean }): boolean {
  if (c.elapsed >= t.speakS + t.overrunS) return true;
  if (c.elapsed < t.speakS) return false;
  // still speaking: she interrupts at the end of the grace (from zero, or from the end of her late question)
  if (c.midAnswer) return c.elapsed >= cutAt(t, c);
  // the floor is the candidate's and nothing comes: a few seconds after zero (or after her late question), she closes
  if (c.idle) return c.elapsed >= Math.max(t.speakS, c.questionEndAt) + t.idleAtZeroS;
  return !followUpsOwed(t, c);
}

/** Tâche 1: the presentation has lasted long enough; she cuts in at the limit, or a little before at a pause. */
export function introCut(t: Timing, segS: number, silenceS: number): boolean {
  if (t.introMaxS == null) return false;
  return segS >= t.introMaxS || (segS >= t.introMaxS - 6 && silenceS >= 0.5);
}

/** The last seconds: the clock turns amber, then blinks; past zero it shows « temps écoulé » */
export const WARN_S = 20;
export const BLINK_S = 10;
