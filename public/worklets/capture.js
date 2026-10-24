// The live examiner's microphone capture (web/app/sim/live-examiner.ts loads this file with
// `audioWorklet.addModule("/worklets/capture.js")`). A static file, not a blob: the page's Content-Security-Policy
// allows scripts from this site only. Runs inside the AudioWorklet thread: every 20 ms (320 samples at 16 kHz) it
// posts one block of 16-bit PCM with its loudness (RMS), from which the page decides when the candidate speaks.
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(320);
    this.n = 0;
    this.sum = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.sum += s * s;
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) {
        this.port.postMessage({ pcm: this.buf.buffer.slice(0), rms: Math.sqrt(this.sum / this.n) });
        this.n = 0;
        this.sum = 0;
      }
    }
    return true;
  }
}
registerProcessor("capture", Capture);
