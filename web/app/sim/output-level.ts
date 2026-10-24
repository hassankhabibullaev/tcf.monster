/**
 * How loud the examiner's voice is right now (0…1), so her mouth follows what is actually heard instead of looping.
 * The source is the live examiner's output stream. Everything is best effort: if the browser refuses, get() returns
 * null and the portrait falls back to a procedural mouth.
 */
export class OutputLevel {
  private ctx: AudioContext | null = null;
  private analysers: AnalyserNode[] = [];
  private buf = new Float32Array(512);
  private attached = new WeakSet<object>();

  private context(): AudioContext | null {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private analyser(ctx: AudioContext): AnalyserNode {
    const a = ctx.createAnalyser();
    a.fftSize = 512;
    this.analysers.push(a);
    return a;
  }

  /** An <audio> element. Once routed through the context it only sounds through it, so this is done only when the context really runs. */
  attachElement(el: HTMLAudioElement | null) {
    if (!el || this.attached.has(el)) return;
    const ctx = this.context();
    if (!ctx || ctx.state !== "running") return;
    try {
      const src = ctx.createMediaElementSource(el);
      const a = this.analyser(ctx);
      src.connect(a);
      a.connect(ctx.destination);
      this.attached.add(el);
    } catch {}
  }

  /** Live examiner: listen in on her stream (it keeps playing through its own output). */
  attachStream(stream: MediaStream | null) {
    if (!stream || this.attached.has(stream)) return;
    const ctx = this.context();
    if (!ctx) return;
    try {
      ctx.createMediaStreamSource(stream).connect(this.analyser(ctx));
      this.attached.add(stream);
    } catch {}
  }

  get(): number | null {
    if (!this.analysers.length || this.ctx?.state !== "running") return null;
    let peak = 0;
    for (const a of this.analysers) {
      a.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      peak = Math.max(peak, Math.sqrt(sum / this.buf.length));
    }
    return Math.min(1, peak * 5.5);
  }

  close() {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analysers = [];
  }
}
