import { useCallback, useEffect, useRef, useState } from "react";

export type StopResult = { blob: Blob; durationS: number; mime: string };

export function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

/**
 * One continuous recording per answer (for playback and the marking), and the microphone's level while it runs.
 * Generation token: every start() and stop() bumps it; anything belonging to an older generation (a microphone
 * that finished opening after stop() was called, a level loop, a stream) shuts itself down. Without it, a stop()
 * arriving while getUserMedia was still pending did nothing and the microphone stayed on after the session.
 */
export function useRecorder(opts: { onLevel?: (rms: number) => void } = {}) {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const startedAt = useRef(0);
  const genRef = useRef(0);
  const disposed = useRef(false);
  const streams = useRef<Set<MediaStream>>(new Set());
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const releaseStream = (st: MediaStream | null) => {
    if (!st) return;
    st.getTracks().forEach((t) => t.stop());
    streams.current.delete(st);
  };

  const stop = useCallback((): Promise<StopResult> => {
    genRef.current += 1; // invalidates a pending start() and the running level loop
    return new Promise((resolve) => {
      const rec = mediaRef.current;
      cancelAnimationFrame(rafRef.current);
      const finish = () => {
        const mime = rec?.mimeType || pickMime() || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        const durationS = (Date.now() - startedAt.current) / 1000;
        releaseStream(streamRef.current);
        streamRef.current = null;
        ctxRef.current?.close().catch(() => {});
        ctxRef.current = null;
        mediaRef.current = null;
        setRecording(false);
        setLevel(0);
        resolve({ blob, durationS, mime });
      };
      if (!rec || rec.state === "inactive") return finish();
      rec.onstop = finish;
      rec.stop();
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const gen = ++genRef.current;
    try {
      // never two recordings at once: drop whatever an earlier start() left behind
      if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
      mediaRef.current = null;
      releaseStream(streamRef.current);
      streamRef.current = null;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (gen !== genRef.current || disposed.current) {
        // stop() (or unmount) happened while the microphone was opening: close it again, record nothing
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streams.current.add(stream);
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.start(500);
      mediaRef.current = rec;
      startedAt.current = Date.now();
      setRecording(true);

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        if (gen !== genRef.current || disposed.current) return; // stale loop: do not reschedule
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        setLevel(rms);
        optsRef.current.onLevel?.(rms);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError("mic");
      setRecording(false);
      throw e;
    }
  }, []);

  useEffect(() => {
    disposed.current = false;
    const all = streams.current;
    return () => {
      disposed.current = true;
      genRef.current += 1;
      cancelAnimationFrame(rafRef.current);
      try {
        if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
      } catch {}
      mediaRef.current = null;
      all.forEach((st) => st.getTracks().forEach((t) => t.stop()));
      all.clear();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  return { recording, level, error, start, stop };
}
