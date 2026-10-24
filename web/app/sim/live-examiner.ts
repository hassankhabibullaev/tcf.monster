/**
 * The live examiner (Google Gemini Live): one WebSocket from the browser, the microphone streamed as 16 kHz PCM, her
 * voice received as 24 kHz PCM and played as it arrives, and the END OF THE CANDIDATE'S TURN decided here, not by
 * Google: by a small voice detector (RMS over the signal; live mode) or by the microphone button (push to talk:
 * audio is kept back until the voice threshold is crossed, then streamed; the second press closes the turn). The
 * whole scenario (role, facts, rules, voice) is locked into the session token, minted in this browser with the
 * person's own key from the script the Worker gives and what this device kept of the exchange; nothing is sent per turn. Every line of the script is said by her through `say`: nothing is pre-recorded.
 */
import type { MicMode, Turn } from "./types";
import { AiError, liveToken } from "../../../shared/sim/ai/gemini.ts";
import { askedHere, keyTrouble, liveKey } from "./browser-score";
import { getWork, workOfSession } from "./work";

/** what the examiner of this connection is told of the exchange so far, from what this device kept (work.ts) */
async function liveNotes(sessionId: string, taskNo: number, reconnect: boolean): Promise<string[]> {
  const { continuityNote, resumeNote } = await import("../../../shared/sim/live-notes.ts");
  const all = await workOfSession(sessionId);
  const earlier = continuityNote(all.map((w) => ({ taskNo: w.taskNo, turns: (w.turns ?? []) as Turn[] })), taskNo);
  const here = reconnect ? resumeNote([...(((await getWork(sessionId, taskNo))?.turns ?? []) as Turn[])]) : "";
  return [earlier, here].filter(Boolean);
}

export type LiveHandlers = {
  /** the candidate started / stopped speaking (detector or button) */
  onSpeechStarted?: () => void;
  onSpeechStopped?: () => void;
  /** her voice actually starts / stops in the speakers */
  onAudioStart?: () => void;
  onAudioStop?: () => void;
  /** what she said, once per answer (partial if the candidate cut in) */
  onExaminerText?: (text: string) => void;
  /** what the candidate said, once per turn, as Google heard it */
  onCandidateText?: (text: string) => void;
  /** the connection dropped: the runner reopens it (with the handle, the exchange goes on where it stopped) */
  onClosed?: (reason: string, info: { self: LiveExaminer; model: string; resumeHandle: string | null }) => void;
};

export type ConnectOptions = { mode: MicMode; taskNo: 1 | 2 | 3; /** reconnection after a cut: the model and handle of the lost session, and the models not to use */ lastModel?: string | null; resumeHandle?: string | null; avoid?: string[] };

const IN_RATE = 16_000;
const OUT_RATE = 24_000;
/** RMS level above which the microphone counts as speech */
const THRESHOLD = 0.012;
/** live mode: silence after speech before the turn is handed to the examiner (the runner sets a longer one for a monologue) */
const SILENCE_MS = 800;

/**
 * The microphone capture runs inside an AudioWorklet, shipped as a static file (public/worklets/capture.js): the
 * page's Content-Security-Policy allows scripts from this site only, so a blob: URL would be refused (2026-10-18).
 */
export const WORKLET_URL = "/worklets/capture.js";

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): ArrayBuffer {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

type ServerContent = { interrupted?: boolean; turnComplete?: boolean; generationComplete?: boolean; inputTranscription?: { text?: string }; outputTranscription?: { text?: string }; modelTurn?: { parts?: { inlineData?: { data: string; mimeType: string }; text?: string }[] } };

export class BusyError extends Error {
  retryInS: number;
  constructor(message: string, retryInS: number) {
    super(message);
    this.retryInS = retryInS;
  }
}

export class LiveExaminer {
  /** her voice, for the portrait's mouth */
  stream: MediaStream | null = null;
  /** the live model of this session (the server picks the first one not set aside) */
  model = "";
  /** the session went on from a cut one (Google replayed the exchange) */
  resumed = false;
  /** Google's latest resumption handle: with it, a new connection goes on with the same exchange */
  resumeHandle: string | null = null;
  private ws: WebSocket | null = null;
  private mic: MediaStream | null = null;
  private inCtx: AudioContext | null = null;
  private outCtx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private playing: AudioBufferSourceNode[] = [];
  private nextAt = 0;
  private closed = false;
  private micOn = false;
  private mode: MicMode;
  private silenceMs = SILENCE_MS;
  /** push-to-talk: the button is down */
  private pressed = false;
  /** a turn is open at Google (activityStart sent) */
  private streaming = false;
  private loudSince = 0;
  private quietSince = 0;
  private preRoll: ArrayBuffer[] = [];
  private examinerOn = false;
  /** a response is still being generated: a gap between two audio chunks is not the end of her line */
  private turnOpen = false;
  /** the next response is swallowed (not played, not logged): the question she would ask after the final answer */
  private muteNext = false;
  private said = "";
  private heard = "";
  private sayWaiters = new Set<() => void>();
  private lastPrompt = 0;
  private lastSay = 0;

  private h: LiveHandlers;

  private constructor(h: LiveHandlers, mode: MicMode) {
    this.h = h;
    this.mode = mode;
  }

  /** Opens the session with the microphone muted. Rejects if anything fails (BusyError when the examiner is taken). */
  static async connect(sessionId: string, handlers: LiveHandlers, opts: ConnectOptions, timeoutMs = 12000): Promise<LiveExaminer> {
    // her script from the Worker; what was already said, from this device; the session opened with the person's own
    // key, from here (the key never reaches our server)
    const r = await fetch("/api/expr/oral/realtime", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, taskNo: opts.taskNo, asked: askedHere() }) });
    const script = (await r.json().catch(() => ({}))) as { instructions?: string; sessionSeconds?: number; error?: string };
    if (!r.ok || !script.instructions) throw new Error(script.error ?? "session en direct indisponible");
    const notes = await liveNotes(sessionId, opts.taskNo, !!(opts.lastModel || opts.resumeHandle));
    let d: { token: string; apiVersion: string; model: string; resumed: boolean };
    try {
      await liveKey();
      d = await liveToken({ instructions: [script.instructions, ...notes].join("\n\n"), sessionSeconds: script.sessionSeconds ?? 600, lastModel: opts.lastModel, resumeHandle: opts.resumeHandle, avoid: opts.avoid ?? [] }).catch(keyTrouble);
    } catch (e) {
      if (e instanceof AiError && (e.code === "busy" || e.status === 503)) throw new BusyError(e.message || "examinatrice occupée", e.retryInS ?? 120);
      throw e;
    }
    const self = new LiveExaminer(handlers, opts.mode);
    self.model = d.model;
    self.resumed = !!d.resumed;
    if (self.resumed) self.resumeHandle = opts.resumeHandle ?? null;
    try {
      self.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      self.inCtx = new AudioContext({ sampleRate: IN_RATE });
      self.outCtx = new AudioContext({ sampleRate: OUT_RATE });
      self.dest = self.outCtx.createMediaStreamDestination();
      self.stream = self.dest.stream;
      await self.inCtx.audioWorklet.addModule(WORKLET_URL);
      await self.open(d.token, d.apiVersion ?? "v1alpha", d.model, timeoutMs);
      const src = self.inCtx.createMediaStreamSource(self.mic);
      const node = new AudioWorkletNode(self.inCtx, "capture");
      node.port.onmessage = (ev: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => self.onChunk(ev.data.pcm, ev.data.rms);
      src.connect(node);
      const mute = self.inCtx.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(self.inCtx.destination);
      return self;
    } catch (e) {
      self.close();
      throw e;
    }
  }

  private open(token: string, apiVersion: string, model: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      let ready = false;
      const timer = setTimeout(() => {
        if (!ready) reject(new Error("connexion trop lente"));
      }, timeoutMs);
      ws.onopen = () => {
        // everything else (role, voice, detection off, transcriptions) is locked inside the token
        ws.send(JSON.stringify({ setup: { model: `models/${model}` } }));
      };
      ws.onmessage = (ev) => {
        const text = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(text);
        } catch {
          return;
        }
        if (!ready && "setupComplete" in msg) {
          ready = true;
          clearTimeout(timer);
          resolve();
          return;
        }
        this.onMessage(msg);
      };
      ws.onerror = () => {
        if (!ready) reject(new Error("la connexion avec Google n'a pas pu s'ouvrir"));
      };
      ws.onclose = (ev) => {
        const reason = ev.reason || (ev.code === 1000 ? "fermée" : `code ${ev.code}`);
        if (!ready) reject(new Error(`Google a fermé la connexion : ${reason}`));
        else this.fail(reason);
      };
    });
  }

  private send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  /** The candidate is only heard while it is their turn (not during her instructions or the closing line). */
  setMic(on: boolean) {
    this.micOn = on;
    if (!on) {
      this.pressed = false;
      this.endTurnIfOpen();
    }
  }
  setMode(mode: MicMode) {
    this.mode = mode;
  }
  /** live mode: how long a pause ends the candidate's turn (a presentation or a development gets more than a question) */
  setSilence(ms: number) {
    this.silenceMs = ms;
  }
  /** push-to-talk: the microphone button */
  pressStart() {
    if (!this.micOn || this.closed) return;
    this.pressed = true;
    this.preRoll = [];
  }
  pressEnd() {
    this.pressed = false;
    this.endTurnIfOpen();
  }
  /** closes the candidate's turn now (end of the task while they were still talking) */
  endTurn() {
    this.pressed = false;
    this.endTurnIfOpen();
  }
  /** the response to the next turn is not played nor logged (time is up: she must not ask one more question) */
  muteNextTurn() {
    this.muteNext = true;
  }
  get speaking() {
    return this.streaming;
  }
  /** her voice is in the loudspeakers right now */
  get talking() {
    return this.examinerOn;
  }
  get isClosed() {
    return this.closed;
  }
  /** what Google has heard of the candidate's current turn (kept for a reconnection) */
  get heardSoFar() {
    return this.heard.trim();
  }

  /**
   * A free instruction to her (not a line to repeat word for word): after a cut, what to do next. Resolves when
   * her answer has been played, like `say`.
   */
  prompt(text: string, timeoutMs = 15000): Promise<void> {
    if (this.closed || this.ws?.readyState !== WebSocket.OPEN) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.sayWaiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      this.sayWaiters.add(done);
      this.lastPrompt = performance.now();
      this.send({ clientContent: { turns: [{ role: "user", parts: [{ text: `Consigne de régie : ${text}` }] }], turnComplete: true } });
    });
  }

  private endTurnIfOpen() {
    if (!this.streaming) return;
    this.streaming = false;
    this.loudSince = 0;
    this.quietSince = 0;
    this.send({ realtimeInput: { activityEnd: {} } });
    this.lastPrompt = performance.now();
    this.h.onSpeechStopped?.();
  }

  private startTurn() {
    this.streaming = true;
    this.quietSince = 0;
    this.send({ realtimeInput: { activityStart: {} } });
    for (const p of this.preRoll) this.sendAudio(p);
    this.preRoll = [];
    this.h.onSpeechStarted?.();
  }

  /** every 20 ms block from the microphone */
  private onChunk(pcm: ArrayBuffer, rms: number) {
    if (this.closed) return;
    const gate = this.mode === "ptt" ? this.pressed : this.micOn;
    if (!gate) {
      if (this.streaming) this.endTurnIfOpen();
      return;
    }
    const now = performance.now();
    // her voice can leak into the microphone on loudspeakers: ask for a louder, longer signal before cutting her
    const loud = rms > (this.examinerOn ? THRESHOLD * 2.5 : THRESHOLD);
    const attackMs = this.examinerOn ? 250 : 60;
    if (!this.streaming) {
      this.preRoll.push(pcm);
      if (this.preRoll.length > 15) this.preRoll.shift(); // 300 ms kept so the first syllable is not lost
      if (loud) {
        if (!this.loudSince) this.loudSince = now;
        if (now - this.loudSince >= attackMs) this.startTurn();
      } else this.loudSince = 0;
      return;
    }
    this.sendAudio(pcm);
    if (this.mode === "ptt") return; // the second press ends the turn
    if (loud) this.quietSince = 0;
    else {
      if (!this.quietSince) this.quietSince = now;
      if (now - this.quietSince >= this.silenceMs) this.endTurnIfOpen();
    }
  }

  private sendAudio(pcm: ArrayBuffer) {
    this.send({ realtimeInput: { audio: { data: b64(pcm), mimeType: `audio/pcm;rate=${IN_RATE}` } } });
  }

  /**
   * Makes her say a fixed line, word for word, with her own voice. Resolves when the line has been played (or when
   * nothing came, after `timeoutMs`). Never called while she is answering.
   */
  say(text: string, timeoutMs?: number): Promise<void> {
    if (this.closed || this.ws?.readyState !== WebSocket.OPEN) return Promise.resolve();
    // a long line (the opening of a task is fifteen seconds of speech and more) must not be taken for over while she
    // is still saying it: the floor was given to the candidate over her last words (2026-10-08)
    timeoutMs ??= Math.max(15000, 6000 + text.length * 110);
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.sayWaiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      this.sayWaiters.add(done);
      this.lastPrompt = performance.now();
      this.lastSay = performance.now();
      this.send({ clientContent: { turns: [{ role: "user", parts: [{ text: `Consigne de régie : dis exactement ce texte, en français, d'une seule traite, sans pause entre les phrases, sans rien ajouter ni changer, sur le ton neutre de l'examinatrice : « ${text} »` }] }], turnComplete: true } });
    });
  }

  /**
   * Ends the candidate's turn (if open) and sends her line in the same breath: her response is the line, not the
   * question she would have asked. If she had already started that question, Google interrupts it for the line.
   */
  sayNow(text: string, endTurn: boolean, timeoutMs?: number): Promise<void> {
    if (endTurn) {
      this.pressed = false;
      this.micOn = false;
      this.endTurnIfOpen();
    }
    this.muteNext = false;
    return this.say(text, timeoutMs);
  }

  private lineOver() {
    for (const w of [...this.sayWaiters]) w();
  }

  private onMessage(msg: Record<string, unknown>) {
    const sr = msg.sessionResumptionUpdate as { newHandle?: string; resumable?: boolean } | undefined;
    if (sr?.resumable && sr.newHandle) this.resumeHandle = sr.newHandle;
    const ga = msg.goAway as { timeLeft?: string } | undefined;
    if (ga) console.warn(`live examiner: Google will close the connection in ${ga.timeLeft ?? "?"}`);
    const sc = msg.serverContent as ServerContent | undefined;
    if (!sc) return;
    if (sc.interrupted) {
      this.turnOpen = false;
      this.stopPlayback();
      if (this.said.trim() && !this.muteNext) this.h.onExaminerText?.(`${this.said.trim()}…`);
      this.said = "";
      this.muteNext = false;
      // interrupted by our own line (sent a moment ago): that line is still to come, its waiters stay
      if (performance.now() - this.lastSay > 3000) this.lineOver();
      return;
    }
    if (sc.inputTranscription?.text) this.heard += sc.inputTranscription.text;
    if (sc.outputTranscription?.text) this.said += sc.outputTranscription.text;
    for (const part of sc.modelTurn?.parts ?? []) {
      if (!part.inlineData?.data) continue;
      this.turnOpen = true;
      if (!this.muteNext) this.play(unb64(part.inlineData.data));
    }
    if (sc.turnComplete) {
      this.turnOpen = false;
      if (this.heard.trim()) this.h.onCandidateText?.(this.heard.trim());
      this.heard = "";
      const text = this.said.trim();
      this.said = "";
      if (this.muteNext) {
        // swallowed on purpose: nothing was played, nothing is logged, and the floor is free
        this.muteNext = false;
        this.lineOver();
        this.h.onAudioStop?.();
        return;
      }
      if (text) this.h.onExaminerText?.(text);
      // her line is over when the last chunk has been played; a line that produced no sound at all is over now
      if (this.playing.length === 0) this.endOfVoice();
    }
  }

  private play(pcm: ArrayBuffer) {
    const ctx = this.outCtx;
    if (!ctx || this.closed) return;
    const i16 = new Int16Array(pcm);
    const buf = ctx.createBuffer(1, i16.length, OUT_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 0x8000;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    if (this.dest) src.connect(this.dest);
    const at = Math.max(ctx.currentTime + 0.02, this.nextAt);
    src.start(at);
    this.nextAt = at + buf.duration;
    this.playing.push(src);
    if (!this.examinerOn) {
      this.examinerOn = true;
      this.h.onAudioStart?.();
    }
    src.onended = () => {
      this.playing = this.playing.filter((s) => s !== src);
      // a gap between two chunks while the response is still coming is not the end of her line
      if (this.playing.length === 0 && !this.turnOpen) this.endOfVoice();
    };
  }

  private endOfVoice() {
    if (!this.examinerOn) {
      this.lineOver();
      return;
    }
    this.examinerOn = false;
    // the waiters of the line that has just ended are released BEFORE the handler runs: the handler may ask for
    // her next line at once (the close of a task), and that new line must not be taken for over (2026-10-08: the
    // closing line of Tâche 2 was skipped and the room closed on her answer)
    this.lineOver();
    this.h.onAudioStop?.();
  }

  private stopPlayback() {
    for (const s of this.playing) {
      try {
        s.onended = null;
        s.stop();
      } catch {}
    }
    this.playing = [];
    this.nextAt = 0;
    if (this.examinerOn) {
      this.examinerOn = false;
      this.h.onAudioStop?.();
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.lineOver();
    this.stopPlayback();
    try {
      this.ws?.close(1000, "done");
    } catch {}
    this.mic?.getTracks().forEach((t) => t.stop());
    void this.inCtx?.close().catch(() => {});
    void this.outCtx?.close().catch(() => {});
  }

  private fail(reason: string) {
    if (this.closed) return;
    this.close();
    this.h.onClosed?.(reason, { self: this, model: this.model, resumeHandle: this.resumeHandle });
  }
}
