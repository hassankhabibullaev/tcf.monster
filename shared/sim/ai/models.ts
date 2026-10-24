/**
 * Single place for Google Gemini model names. Model ids read on 2026-10-06 at
 * https://ai.google.dev/gemini-api/docs/models. Swap a model here and the whole simulator follows.
 */
export const MODELS = {
  /** high-volume, cheap: examiner follow-ups, subject material, transcription */
  cheap: "gemini-3.5-flash-lite",
  /** scoring nuance: evaluation of written/oral productions, detailed feedback */
  mid: "gemini-3.8-flash",
  /** when a model answers « high demand » (503) after its retries: the next one takes the call (2026-10-06: 3.8 and 3.7 both overloaded, 3.5 answered in 3 s) */
  midFallbacks: ["gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"],
  /** 2026-10-07: which model answers changed from one minute to the next (503 on three, a hang on another): every chain ends on a model of the other family */
  cheapFallbacks: ["gemini-3.1-flash-lite", "gemini-3.5-flash"],
  /** speech-to-text: the cheap model HEARS the recording and writes what was said (a prompt tells it how) */
  stt: "gemini-3.5-flash-lite",
  /** live speech-to-speech for the speaking tasks (Gemini Live, one WebSocket from the browser) */
  live: "gemini-3.8-live",
  /**
   * when a live model closes every session with « Internal error encountered » the moment it has to speak (seen
   * all evening on 2026-10-06 with gemini-3.8-live, while these two answered in three seconds): the next one takes
   * the session, and the failing one is left alone for a while (ai/cooldown.ts)
   */
  liveFallbacks: ["gemini-3.1-flash-live-preview", "gemini-2.5-flash-native-audio-latest"],
  /** hears the candidate's whole recording for the fluency and pronunciation analysis */
  audio: "gemini-3.8-flash",
} as const;

export type ModelTier = "cheap" | "mid";

/** The examiner's voice (one of Gemini's prebuilt voices). */
export const TTS_VOICE = "Kore";

/** Token usage of a live session, summed over its turns (`usageMetadata` messages); the browser reports it, the Worker only logs it. */
export type RealtimeUsage = { textIn: number; audioIn: number; cachedTextIn: number; cachedAudioIn: number; textOut: number; audioOut: number };
