import { getClip } from "./clips";

export type AudioTurn = { role: string; text: string; clipId?: string };

const RATE = 16000;
const GAP_S = 0.35;

/** only the candidate's answers are recordings, and only on the device that made them */
export const hasClipId = (t: AudioTurn) => t.role !== "examiner" && !!t.clipId;

/** one turn's recording, from this browser's store */
export async function loadClip(t: AudioTurn): Promise<{ data: ArrayBuffer; type: string } | null> {
  if (!hasClipId(t)) return null;
  const c = await getClip(t.clipId!);
  return c ? { data: await c.blob.arrayBuffer(), type: c.blob.type || "audio/webm" } : null;
}

function toMono(buf: AudioBuffer): Float32Array {
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / buf.numberOfChannels;
  }
  return out;
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (o: number, s: string) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

/** For the download button only: one WAV of the candidate's answers, decoded here, joined with short gaps. Never uploaded. */
export async function buildInterviewWav(turns: AudioTurn[], onProgress: (done: number, total: number) => void): Promise<{ blob: Blob; skipped: number }> {
  const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const decoder = new Ctx(1, 1, RATE);
  const clips: Float32Array[] = [];
  let skipped = 0;
  const playable = turns.filter(hasClipId);
  for (let i = 0; i < playable.length; i++) {
    onProgress(i + 1, playable.length);
    const clip = await loadClip(playable[i]);
    try {
      if (!clip) throw new Error("missing");
      clips.push(toMono(await decoder.decodeAudioData(clip.data)));
    } catch {
      skipped++;
    }
  }
  if (!clips.length) throw new Error("no recording");
  const gap = Math.round(GAP_S * RATE);
  const all = new Float32Array(clips.reduce((n, c) => n + c.length + gap, 0));
  let pos = 0;
  for (const c of clips) {
    all.set(c, pos);
    pos += c.length + gap;
  }
  return { blob: encodeWav(all, RATE), skipped };
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
