/**
 * Every call to Google Gemini goes through here (text, hearing a recording, the live session token). The key is
 * always the person's OWN (worker/sim/ctx.ts: decrypted for the request), so every refusal is theirs to fix in
 * « Profil ». Nothing is counted or stored: a free-tier key pays nothing and there is no ledger.
 */
import { aiCtx } from "./context.ts";
import { MODELS, TTS_VOICE, type ModelTier } from "./models.ts";
import { cooldownFor, cooldowns, filterChain, retryAfterMs, setCooldown } from "./cooldown.ts";

/** the person's own key, from the request context */
const keyOf = () => aiCtx().key;

const BASE = "https://generativelanguage.googleapis.com";

export class AiError extends Error {
  status: number;
  code: string;
  /** when Google refused or stayed silent: how long the browser should wait before trying again (seconds) */
  retryInS?: number;
  constructor(message: string, status = 500, code = "ai_error", retryInS?: number) {
    super(message);
    this.message = message;
    this.status = status;
    this.code = code;
    if (retryInS) this.retryInS = retryInS;
  }
}

type Part = { text?: string; inlineData?: { mimeType: string; data: string } };
type GenerateResponse = { candidates?: { content?: { parts?: Part[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };

function describe(status: number, text: string): AiError {
  let msg = text;
  try {
    msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
  } catch {
    /* keep raw */
  }
  if (status === 400 && /API key/i.test(msg)) return new AiError("Google refuse votre clé Gemini : elle a été supprimée ou mal copiée. Ouvrez « Profil » pour la remplacer. / Google refuses your Gemini key: open « Profil » to replace it.", 422, "unauthorized");
  if (status === 401 || status === 403) return new AiError("Google refuse votre clé Gemini (accès interdit). Créez-en une nouvelle sur aistudio.google.com et collez-la dans « Profil ».", 422, "unauthorized");
  if (status === 429) {
    const wait = retryAfterMs(text);
    const daily = /per day|daily|PerDay/i.test(text);
    return new AiError(`Google limite votre clé pour l'instant (quota gratuit atteint). Attendez une minute, ou demain si le quota du jour est épuisé. ${msg.slice(0, 160)}`, 429, "rate_limited", wait ? Math.min(daily ? 6 * 3600 : 600, Math.max(60, Math.round(wait / 1000))) : daily ? 3600 : 120);
  }
  if (status === 404) return new AiError(`Modèle introuvable chez Google : ${msg.slice(0, 200)}`, 502, "model_missing");
  if (status === 503) return new AiError(`Google est surchargé pour l'instant (503) : ${msg.slice(0, 200)}`, 503, "overloaded", 180);
  return new AiError(`Google ${status} : ${msg.slice(0, 300)}`, status >= 500 ? 502 : status, "gemini_error");
}

/**
 * Google answers 503 « high demand » now and then, and a free-tier key hits its per-minute cap (429) when several
 * calls land together: the call is repeated after a wait before giving up (longer for 429: the cap resets by the minute).
 */
const RETRY_MS: Record<number, number[]> = { 503: [800, 2500], 500: [800, 2500], 429: [4000, 12000] };

/** how long a model that did not answer in time is left alone */
const SILENT_COOLDOWN_MS = 3 * 60_000;

/** a request is dropped when another model of the chain already answered (hedged): never a cooldown for that */
class Cancelled extends AiError { constructor() { super("cancelled: another model answered first", 499, "cancelled"); } }

async function post<T>(path: string, body: unknown, key: string, opts: { /** repeat on 503: only for the last model of a chain (an overloaded model is slow to answer at all: ~13 s seen) */ retry503?: boolean; timeoutMs?: number; /** the model called (read from the path when absent), to set it aside after a quota or overload answer */ model?: string; /** the chain no longer needs this answer (another model answered first): the request is dropped at once */ cancel?: AbortSignal } = {}): Promise<T> {
  const payload = JSON.stringify(body);
  const model = opts.model ?? /\/models\/([^:/]+):/.exec(path)?.[1] ?? null;
  for (let attempt = 0; ; attempt++) {
    if (opts.cancel?.aborted) throw new Cancelled();
    let res: Response;
    // bounded in time, and dropped as soon as the chain has its answer (each dropped request is quota kept)
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 60_000);
    const drop = () => ctl.abort();
    opts.cancel?.addEventListener("abort", drop);
    try {
      // an overloaded model sometimes never answers (a 5-minute hang seen on 2026-10-06): bounded, then the next model
      res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: payload, signal: ctl.signal });
    } catch (e) {
      clearTimeout(timer); opts.cancel?.removeEventListener("abort", drop);
      if (opts.cancel?.aborted) throw new Cancelled();
      // a model that stays silent is set aside too, so the next calls do not wait on it again
      if (model) setCooldown(model, Date.now() + SILENT_COOLDOWN_MS, "no answer in time");
      throw new AiError(`Google n'a pas répondu à temps (${e instanceof Error ? e.name : "erreur réseau"}) : modèle surchargé ou réseau coupé.`, 503, "overloaded", 180);
    }
    clearTimeout(timer); opts.cancel?.removeEventListener("abort", drop);
    if (res.ok) return (await res.json()) as T;
    const text = await res.text();
    // a model out of quota or overloaded is set aside for the person's next calls (ai/cooldown.ts)
    if (model) {
      const until = cooldownFor(res.status, text);
      if (until) setCooldown(model, until, `${res.status} ${text.slice(0, 100)}`);
    }
    // the other models of a chain are tried first: no waiting on an overloaded (503) or exhausted (429: Google's
    // free quotas are per model) model unless it is the last one
    const waits = (res.status === 503 || res.status === 429) && opts.retry503 === false ? undefined : RETRY_MS[res.status];
    // a daily cap is not worth waiting for; a per-minute one is
    if (waits && attempt < waits.length && !(res.status === 429 && /per day|daily|PerDay/i.test(text))) {
      await new Promise((r) => setTimeout(r, waits[attempt]));
      continue;
    }
    throw describe(res.status, text);
  }
}

function textOf(r: GenerateResponse): string {
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("").trim();
}

/** Gemini sometimes wraps JSON in a code fence; and a truncated answer is not JSON at all. */
function parseJson<T>(text: string): T {
  const t = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    const i = t.indexOf("{");
    const j = t.lastIndexOf("}");
    if (i >= 0 && j > i) return JSON.parse(t.slice(i, j + 1)) as T;
    throw new AiError("Réponse JSON invalide du modèle.", 502, "bad_json");
  }
}

/** The OpenAPI-style schema Gemini's older field accepts: no additionalProperties, keys in a fixed order. */
function openApiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(openApiSchema);
  if (!s || typeof s !== "object") return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    if (k === "additionalProperties") continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, openApiSchema(pv)])) : openApiSchema(v);
  }
  if (out.properties && !out.propertyOrdering) out.propertyOrdering = Object.keys(out.properties as object);
  return out;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatOptions = {
  feature: string;
  tier?: ModelTier;
  system?: string;
  messages: ChatMessage[];
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** how much the model may think before answering; « none » for speed */
  reasoning?: "none" | "low" | "medium" | "high";
  maxTokens?: number;
  temperature?: number;
};
export type ChatResult<T = unknown> = { text: string; json: T | null; model: string };

const THINKING: Record<NonNullable<ChatOptions["reasoning"]>, Record<string, unknown> | null> = { none: { thinkingBudget: 0 }, low: { thinkingLevel: "low" }, medium: { thinkingLevel: "medium" }, high: { thinkingLevel: "high" } };

/** One text request. With `jsonSchema`, the answer is parsed JSON. */
export async function chat<T = unknown>(opts: ChatOptions): Promise<ChatResult<T>> {
  const key = keyOf();
  const full = opts.tier === "mid" ? [MODELS.mid, ...MODELS.midFallbacks] : [MODELS.cheap, ...MODELS.cheapFallbacks];
  // the models Google has refused lately for this key (daily cap, overload) are skipped: no failed call, no wait
  const chain = filterChain(full, cooldowns());
  return rounds(() => hedged(chain, (model, last, cancel) => chatOn(model, opts, key, last, cancel), opts.feature), opts.feature);
}

const isOverloaded = (e: unknown) => e instanceof AiError && (e.code === "overloaded" || e.code === "rate_limited" || ((e.status === 502 || e.status === 503) && /demand|overloaded|unavailable|503|répondu/i.test(e.message)));
/** the pauses before the whole chain is tried again, and the time after which it is not (the candidate is waiting) */
const ROUND_WAITS_MS = [1500, 4000];
const ROUNDS_WITHIN_MS = 25_000;

/**
 * A whole chain that fails is tried again: which model answers changes from one minute to the next (2026-10-07:
 * four models refused at once, and a minute later one of them answered in a second). A malformed answer gets one
 * more try; refusals get two, as long as they came fast (a chain of silent models has already cost its timeouts).
 */
async function rounds<T>(run: () => Promise<T>, feature: string): Promise<T> {
  const t0 = Date.now();
  let badJson = 0;
  for (let round = 0; ; round++) {
    try {
      return await run();
    } catch (e) {
      const again = e instanceof AiError && e.code === "bad_json" ? badJson++ < 1 : isOverloaded(e) && round < ROUND_WAITS_MS.length && Date.now() - t0 < ROUNDS_WITHIN_MS;
      if (!again) throw e;
      console.warn(`${feature}: every model failed (${e instanceof Error ? e.message.slice(0, 80) : e}), trying the chain again`);
      if (isOverloaded(e)) await new Promise((r) => setTimeout(r, ROUND_WAITS_MS[round]));
    }
  }
}

/** how long the first model gets before the next one is started as well (a hedge against a hanging model) */
const HEDGE_MS = 7000;
/** the same for the listening of a recording, which normally takes ten to twenty seconds */
const AUDIO_HEDGE_MS = 15_000;

/**
 * The models of a chain are started one after another, every HEDGE_MS, and the first good answer wins: an
 * overloaded or hanging model (seen for minutes on 2026-10-06) costs at most a few seconds instead of a timeout.
 * A model that answers 503 at once lets the next one start immediately.
 */
async function hedged<T>(models: string[], run: (model: string, last: boolean, cancel: AbortSignal) => Promise<T>, feature: string, hedgeMs = HEDGE_MS): Promise<T> {
  const t0 = Date.now();
  // once one model answers, the others still running are dropped (their answers would only use the person's quota)
  const done = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let started = 0;
    let failed = 0;
    let lastError: unknown = null;
    const startNext = () => {
      if (settled || started >= models.length) return;
      const i = started++;
      const model = models[i];
      run(model, i === models.length - 1, done.signal)
        .then((r) => {
          if (settled) return;
          settled = true;
          done.abort();
          if (i > 0) console.log(`${feature}: answered by ${model} (model ${i + 1} of the chain) after ${Date.now() - t0} ms`);
          resolve(r);
        })
        .catch((e) => {
          if (e instanceof Cancelled) return;
          lastError = e;
          failed += 1;
          console.warn(`${feature}: ${model} failed after ${Date.now() - t0} ms: ${e instanceof Error ? e.message.slice(0, 160) : e}`);
          if (settled) return;
          if (failed >= models.length) {
            settled = true;
            done.abort();
            reject(lastError);
          } else startNext();
        });
      if (started < models.length) setTimeout(startNext, hedgeMs);
    };
    startNext();
  });
}

async function chatOn<T>(model: string, opts: ChatOptions, key: string, last = true, cancel?: AbortSignal): Promise<ChatResult<T>> {
  // a hanging model is bounded; the others of the chain have been started meanwhile (hedged)
  const retry = { retry503: last, timeoutMs: 45_000, cancel };
  const sys = [opts.system, ...opts.messages.filter((m) => m.role === "system").map((m) => m.content)].filter(Boolean).join("\n\n");
  const contents = opts.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const generationConfig: Record<string, unknown> = {};
  if (opts.temperature != null) generationConfig.temperature = opts.temperature;
  if (opts.maxTokens) generationConfig.maxOutputTokens = opts.maxTokens;
  if (opts.jsonSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseJsonSchema = opts.jsonSchema.schema;
  }
  // the lite models take no thinking setting at all (400 « invalid argument », seen 2026-10-06)
  if (opts.reasoning && THINKING[opts.reasoning] && !/lite/.test(model)) generationConfig.thinkingConfig = THINKING[opts.reasoning];
  const body: Record<string, unknown> = { contents, generationConfig, ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}) };
  const path = `/v1beta/models/${model}:generateContent`;

  let data: GenerateResponse;
  try {
    data = await post<GenerateResponse>(path, body, key, retry);
  } catch (e) {
    // a setting this model does not take: drop the one the error names and try once more
    if (!(e instanceof AiError && e.status === 400)) throw e;
    const gc = body.generationConfig as Record<string, unknown>;
    if (/responseJsonSchema|json_schema/i.test(e.message) && gc.responseJsonSchema) {
      gc.responseSchema = openApiSchema(gc.responseJsonSchema);
      delete gc.responseJsonSchema;
    } else if (/thinking/i.test(e.message) && gc.thinkingConfig) delete gc.thinkingConfig;
    else if (/temperature/i.test(e.message) && gc.temperature != null) delete gc.temperature;
    else {
      delete gc.thinkingConfig;
      delete gc.temperature;
    }
    data = await post<GenerateResponse>(path, body, key, retry);
  }
  if (data.promptFeedback?.blockReason) throw new AiError(`Réponse bloquée par Google (${data.promptFeedback.blockReason}).`, 502, "blocked");
  const text = textOf(data);
  const json = opts.jsonSchema ? parseJson<T>(text) : null;
  return { text, json, model };
}

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(s);
}

const mimeOf = (blob: Blob, fallback = "audio/webm") => (blob.type || fallback).split(";")[0].trim();

/** What the recording says. The model hears it; the prompt tells it how to write (oral.ts STT_PROMPT). */
export async function transcribe(opts: { feature: string; audio: Blob; prompt?: string }): Promise<{ text: string }> {
  const r = await transcribeMany({ ...opts, audios: [opts.audio] });
  return { text: r.texts[0] ?? "" };
}

/**
 * Several recordings in ONE request (the answers of a task), each transcribed separately: one request instead of
 * one per answer, which matters on the free tier's daily request cap.
 */
export async function transcribeMany(opts: { feature: string; audios: Blob[]; prompt?: string }): Promise<{ texts: string[] }> {
  const key = keyOf();
  const n = opts.audios.length;
  if (!n) return { texts: [] };
  const parts: Part[] = [];
  for (let i = 0; i < n; i++) {
    if (n > 1) parts.push({ text: `Enregistrement ${i + 1} :` });
    parts.push({ inlineData: { mimeType: mimeOf(opts.audios[i]), data: b64(await opts.audios[i].arrayBuffer()) } });
  }
  const instruction = `${opts.prompt ?? "Transcris fidèlement ce qui est dit en français."}
${n > 1 ? `Il y a ${n} enregistrements, numérotés. Réponds par un JSON {"transcripts": [...]} avec exactement ${n} chaînes, dans l'ordre.` : "Réponds uniquement par la transcription, sans titre ni commentaire."} Un enregistrement sans parole : chaîne vide. N'invente rien : ne transcris que ce qui est réellement dit.`;
  const generationConfig: Record<string, unknown> = { temperature: 0, ...(n > 1 ? { responseMimeType: "application/json", responseJsonSchema: { type: "object", additionalProperties: false, required: ["transcripts"], properties: { transcripts: { type: "array", items: { type: "string" } } } } } : {}) };
  const body = { contents: [{ role: "user", parts: [{ text: instruction }, ...parts] }], generationConfig };
  // hedged like a text call: a model slow on audio (49 s seen on 2026-10-06) lets the next one start after a few seconds
  const full = [MODELS.stt, ...MODELS.cheapFallbacks];
  const sttChain = filterChain(full, cooldowns());
  const data = await rounds(() => hedged(sttChain, (m, last, cancel) => post<GenerateResponse>(`/v1beta/models/${m}:generateContent`, body, key, { retry503: last, timeoutMs: 40_000, cancel }), opts.feature), opts.feature);
  const text = textOf(data);
  let texts: string[];
  if (n > 1) {
    const j = parseJson<{ transcripts?: unknown }>(text);
    texts = Array.isArray(j.transcripts) ? j.transcripts.map((t) => String(t ?? "")) : [];
    while (texts.length < n) texts.push("");
  } else texts = [text];
  texts = texts.map((t) => t.replace(/^\(?(silence|inaudible|aucune parole)[^\n]*\)?$/i, "").trim());
  return { texts };
}

/** The examiner's voice: one voice, a natural pace (no setting). */
export const VOICE_PREFS = { voice: TTS_VOICE, pace: "naturel" as const };

export type AudioPart = { data: ArrayBuffer; mime: string };
/** One question to the model that HEARS a recording: one WAV, or the clips of the answers in order (each with its own mime). Text answer; the caller parses it. */
export async function chatAudio(opts: { feature: string; system: string; text: string; audios: AudioPart[]; /** the answer's JSON shape (Google then answers in JSON only) */ jsonSchema?: Record<string, unknown> }): Promise<{ text: string }> {
  const key = keyOf();
  const n = opts.audios.length;
  const parts: Part[] = opts.audios.flatMap((a, i) => [...(n > 1 ? [{ text: `Prise de parole ${i + 1} :` }] : []), { inlineData: { mimeType: a.mime.split(";")[0].trim() || "audio/webm", data: b64(a.data) } }]);
  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.text }, ...parts] }],
    generationConfig: { temperature: 0.2, thinkingConfig: { thinkingLevel: "low" }, ...(opts.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: opts.jsonSchema } : {}) } as Record<string, unknown>,
  };
  const full = [MODELS.audio, ...MODELS.midFallbacks];
  const chain = filterChain(full, cooldowns());
  // hedged like the scoring (a listening takes longer than a text call, so the next model waits longer): a silent
  // model used to hold the result for two minutes before the next one was tried (2026-10-07)
  const on = async (m: string, last: boolean, cancel: AbortSignal) => {
    const path = `/v1beta/models/${m}:generateContent`;
    const opt = { retry503: last, timeoutMs: 60_000, cancel };
    // the lite models take no thinking setting
    const { thinkingConfig: _t, ...plain } = body.generationConfig;
    void _t;
    const first = /lite/.test(m) ? { ...body, generationConfig: plain } : body;
    try {
      return { model: m, data: await post<GenerateResponse>(path, first, key, opt) };
    } catch (e) {
      if (!(e instanceof AiError && e.status === 400) || first !== body) throw e;
      return { model: m, data: await post<GenerateResponse>(path, { ...body, generationConfig: plain }, key, opt) };
    }
  };
  const { data } = await rounds(() => hedged(chain, on, opts.feature, AUDIO_HEDGE_MS), opts.feature);
  return { text: textOf(data) };
}

/** The Live session set-up: everything the examiner is, locked into the token so the browser cannot read or change it. */
export function liveSetup(opts: { instructions: string; voice: string; model: string; /** the handle Google gave for the session that was cut: the exchange goes on where it stopped */ resumeHandle?: string | null }) {
  return {
    model: `models/${opts.model}`,
    // the server sends a resumption handle now and then; with it a cut connection is reopened on the same exchange
    sessionResumption: opts.resumeHandle ? { handle: opts.resumeHandle } : {},
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice } }, languageCode: "fr-FR" }, temperature: 0.8 },
    systemInstruction: { parts: [{ text: opts.instructions }] },
    // the browser decides when the candidate speaks (its own detector, or the push-to-talk button)
    realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}

/**
 * Short-lived token for a browser ↔ Gemini Live session (Tâche 2). The key never leaves the server; the whole
 * scenario (role, facts, rules, voice) travels inside the token, so the browser only opens the WebSocket.
 */
export async function liveToken(opts: { instructions: string; sessionSeconds: number; /** a reconnection: the model of the session that was cut, and its resumption handle (used only if that model is still taken) */ lastModel?: string | null; resumeHandle?: string | null; /** models not to use (the one that just failed) */ avoid?: string[] }): Promise<{ token: string; apiVersion: string; model: string; resumed: boolean }> {
  const key = keyOf();
  const now = Date.now();
  // the first live model not set aside for this person and not just failed takes the session
  const full = [MODELS.live, ...MODELS.liveFallbacks];
  const chain = filterChain(full, cooldowns(now), now, opts.avoid ?? []);
  const model = opts.lastModel && chain.includes(opts.lastModel) ? opts.lastModel : chain[0];
  const resumed = !!opts.resumeHandle && model === opts.lastModel;
  const body = { uses: 1, expireTime: new Date(now + (opts.sessionSeconds + 180) * 1000).toISOString(), newSessionExpireTime: new Date(now + 5 * 60_000).toISOString(), bidiGenerateContentSetup: liveSetup({ instructions: opts.instructions, voice: VOICE_PREFS.voice, model, resumeHandle: resumed ? opts.resumeHandle : null }) };
  let last: AiError | null = null;
  for (const v of ["v1alpha", "v1beta"]) {
    try {
      const d = await post<{ name?: string }>(`/${v}/auth_tokens`, body, key, { model });
      if (d.name) return { token: d.name, apiVersion: v, model, resumed };
      last = new AiError("Google n'a pas renvoyé de jeton de session.", 502, "live_unavailable");
    } catch (e) {
      last = e instanceof AiError ? e : new AiError(String(e), 502, "live_unavailable");
      if (last.status === 422 || last.status === 429) throw last;
    }
  }
  throw last ?? new AiError("Session vocale en direct indisponible.", 502, "live_unavailable");
}

/**
 * The browser lost a live session. A model that closes with « Internal error encountered », a policy close (1008)
 * or a quota message is set aside for twenty minutes: the next sessions start on the next live model at once.
 */
export async function reportLiveFailure(model: string, reason: string): Promise<void> {
  if (!model || !/internal error|code 1011|code 1008|quota|resource.?exhausted|unavailable/i.test(reason)) return;
  setCooldown(model, Date.now() + 20 * 60_000, `live: ${reason}`);
}

/** Lists the models the key may use (free; a wrong key is refused here). */
export async function listModels(key: string): Promise<{ ok: true; models: string[] } | { ok: false; status: number; message: string }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1beta/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
  } catch {
    return { ok: false, status: 502, message: "Google could not be reached just now. / Impossible de joindre Google pour l'instant." };
  }
  if (res.ok) {
    const d = (await res.json()) as { models?: { name?: string }[] };
    return { ok: true, models: (d.models ?? []).map((m) => (m.name ?? "").replace(/^models\//, "")) };
  }
  const text = await res.text();
  let msg = text;
  try {
    msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
  } catch {}
  return { ok: false, status: res.status, message: msg.slice(0, 200) };
}

export function aiErrorResponse(e: unknown): Response {
  if (e instanceof AiError) return Response.json({ error: e.message, code: e.code, ...(e.retryInS ? { retryInS: e.retryInS } : {}) }, { status: e.status });
  console.error(e);
  const msg = (e instanceof Error ? e.message : "erreur inconnue").slice(0, 400);
  return Response.json({ error: msg, code: "error" }, { status: 500 });
}
