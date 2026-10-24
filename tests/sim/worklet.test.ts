// The live examiner's microphone capture is a static file (public/worklets/capture.js), not a blob: the page's
// Content-Security-Policy allows scripts from this site only. The file is run here as the AudioWorklet would run it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const file = resolve(ROOT, "public/worklets/capture.js");

type Msg = { pcm: ArrayBuffer; rms: number };
function load() {
  const registered: Record<string, new () => { process: (inputs: Float32Array[][]) => boolean; port: { postMessage: (m: Msg) => void } }> = {};
  const posted: Msg[] = [];
  class AudioWorkletProcessor { port = { postMessage: (m: Msg) => posted.push(m) }; }
  runInNewContext(readFileSync(file, "utf8"), { AudioWorkletProcessor, registerProcessor: (name: string, cls: typeof registered[string]) => { registered[name] = cls; }, Math });
  return { registered, posted };
}

describe("the capture worklet", () => {
  it("is loaded from a same-origin file, never from a blob URL", () => {
    const src = readFileSync(resolve(ROOT, "web/app/sim/live-examiner.ts"), "utf8");
    expect(src).toContain('"/worklets/capture.js"');
    expect(src).not.toMatch(/createObjectURL|new Blob\(/);
    const csp = readFileSync(resolve(ROOT, "worker/index.ts"), "utf8").match(/content-security-policy": "([^"]+)"/)?.[1] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*blob:/);
  });

  it("registers « capture » and posts one 20 ms block of 16-bit PCM with its loudness", () => {
    const { registered, posted } = load();
    expect(Object.keys(registered)).toEqual(["capture"]);
    const node = new registered.capture();
    // 128-sample render quanta, a steady half-amplitude tone: the third quantum completes the 320-sample block
    const quantum = Float32Array.from({ length: 128 }, (_, i) => 0.5 * Math.sign(Math.sin(i / 3 + 0.1) || 1));
    expect(node.process([[quantum]])).toBe(true);
    node.process([[quantum]]);
    expect(posted).toHaveLength(0);
    node.process([[quantum]]);
    expect(posted).toHaveLength(1);
    expect(posted[0].pcm.byteLength).toBe(640);
    expect(posted[0].rms).toBeCloseTo(0.5, 3);
    const i16 = new Int16Array(posted[0].pcm);
    expect(Math.max(...i16)).toBe(Math.trunc(0.5 * 0x7fff));
    expect(Math.min(...i16)).toBe(-0x4000);
  });

  it("clips what is louder than full scale and keeps running on an empty input", () => {
    const { registered, posted } = load();
    const node = new registered.capture();
    expect(node.process([[]])).toBe(true);
    expect(node.process([])).toBe(true);
    node.process([[new Float32Array(320).fill(4)]]);
    expect(posted).toHaveLength(1);
    expect(new Int16Array(posted[0].pcm).every((v) => v === 0x7fff)).toBe(true);
    expect(posted[0].rms).toBe(1);
  });
});
