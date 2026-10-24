import type { SessionSummary, Turn } from "./types";
import { getClip } from "./clips";
import { markSpeaking, within } from "./browser-score";
import type { AudioTurn } from "./interview-audio";

export type FinishResult = { evaluation: unknown | null; detail?: unknown | null; score20: number; level: string; nclc: number; transcript: Turn[]; summary: SessionSummary | null };

/**
 * The end of a speaking task, marked in this browser (browser-score.ts): the clips kept on this device are
 * re-transcribed where needed and heard by Google with the person's own key, the transcript is scored, and the
 * Worker only stores the result. No audio ever reaches our server.
 */
export async function finishTask(sessionId: string, taskNo: number, durationS: number, timeoutMs: number): Promise<FinishResult> {
  const r = await within(markSpeaking(sessionId, taskNo as 1 | 2 | 3, durationS), timeoutMs);
  return { evaluation: r.evaluation ?? null, detail: null, score20: r.score20, level: r.level, nclc: r.nclc, transcript: r.transcript, summary: r.summary };
}

/** Plays a few seconds of one of the candidate's answers (the moment a pronunciation tip points at), from this device. */
export async function replayMoment(turns: AudioTurn[], answer: number, atS: number): Promise<void> {
  const mine = turns.filter((u) => u.role !== "examiner" && u.clipId);
  const clip = mine[answer]?.clipId ? await getClip(mine[answer].clipId!) : null;
  if (!clip) throw new Error("no recording");
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await clip.blob.arrayBuffer());
    const from = Math.max(0, Math.min(buf.duration - 0.5, atS - 0.7));
    const len = Math.min(3.2, buf.duration - from);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    await new Promise<void>((done) => {
      src.onended = () => done();
      src.start(0, from, len);
    });
  } finally {
    void ctx.close().catch(() => {});
  }
}
