/**
 * The recording of a speaking task, heard once, at the end of the task (oral.ts finishOralTask): fluency and
 * pronunciation, the two criteria a transcript cannot show. The browser sends back either the clips of the answers
 * (webm/opus, the usual case: the model hears them one after another; the pauses cannot be measured in code on a
 * compressed clip, so the model's impression stands alone) or one assembled WAV (then the pauses and rate are
 * measured too and frame the score). The bytes are never stored. Two steps, so the listening runs WHILE the
 * transcript is scored.
 */
import { chatAudio } from "../ai/gemini.ts";
import { SPEAKING, type TaskNo } from "../config.ts";
import { buildEvaluation, type Evaluation } from "./evaluate.ts";
import { AUDIO_SYSTEM, audioUserText, boundFluency, checkedJudgement, energyMetrics, explainChange, locateAt, parseAudioJudgement, wavSamples, type AudioJudgement, type Bound, type FluencyMetrics } from "./audio-core.ts";
import { languageRule, type FeedbackLang } from "./language.ts";

export type Heard = { judgement: AudioJudgement; metrics: FluencyMetrics | null };

/** what the listening must answer: two marks with their reasons, then optional details */
const MARK = { type: "object", properties: { score: { type: "number" }, reason: { type: "string" } }, required: ["score", "reason"] };
const HEARD_SCHEMA = {
  type: "object",
  properties: {
    aisance: MARK,
    prononciation: MARK,
    issues: { type: "array", items: { type: "string" } },
    sound: { type: "object", properties: { word: { type: "string" }, heard: { type: "string" }, tip: { type: "string" }, at: { type: "string" } } },
  },
  required: ["aisance", "prononciation"],
};

/** the answers' clips in recording order, each with its duration (bounds follow: clip i starts where clip i-1 ended) */
export type HeardClip = { data: ArrayBuffer; mime: string; durationS: number };
/** where each clip sits when they are played one after another */
export const boundsOfClips = (clips: { durationS: number }[]): Bound[] => {
  let at = 0;
  return clips.map((c) => { const b = { start: at, end: at + Math.max(0, c.durationS) }; at = b.end; return b; });
};

/** Step 1: measure (WAV only), then listen. `transcript` = the candidate's lines as known when the task ended. */
export async function hearRecording(opts: { taskNo: TaskNo; transcript: string; lang: FeedbackLang; wav?: ArrayBuffer | null; bounds?: Bound[]; clips?: HeardClip[] }): Promise<Heard> {
  let metrics: FluencyMetrics | null = null;
  let audios: { data: ArrayBuffer; mime: string }[];
  if (opts.wav) {
    // pauses and rate are measured on the recording itself (no model call): the model's impression stays within them
    try {
      const { pcm, rate } = wavSamples(opts.wav);
      metrics = energyMetrics(pcm, rate, opts.bounds ?? [], opts.transcript);
    } catch (e) {
      console.error("energy metrics failed", e);
    }
    audios = [{ data: opts.wav, mime: "audio/wav" }];
  } else {
    audios = (opts.clips ?? []).map((c) => ({ data: c.data, mime: c.mime }));
    if (!audios.length) throw new Error("rien à écouter");
  }
  const ask = () => chatAudio({ feature: "sim_oral_audio", system: AUDIO_SYSTEM, text: audioUserText({ taskNo: opts.taskNo, taskName: SPEAKING.tasks[opts.taskNo].name, transcript: opts.transcript, metrics, languageRule: languageRule(opts.lang) }), audios, jsonSchema: HEARD_SCHEMA });
  // the answer is JSON of a fixed shape; one that still cannot be read is asked once more (it used to drop the
  // listening silently: fluency and pronunciation stayed « waiting », seen 2026-10-22)
  let heard = await ask();
  let parsed = parseAudioJudgement(heard.text);
  if (!parsed) {
    console.warn("listening answer unreadable, asked again:", heard.text.slice(0, 300));
    heard = await ask();
    parsed = parseAudioJudgement(heard.text);
  }
  if (!parsed) { console.warn("listening answer unreadable twice:", heard.text.slice(0, 300)); throw new Error("L'analyse de l'enregistrement n'a pas abouti."); }
  const judgement = checkedJudgement(parsed);
  // hesitation is measured: the model's impression may not stray far from the measures
  judgement.aisance.score = boundFluency(judgement.aisance.score, metrics);
  return { judgement, metrics };
}

/** Step 2: the transcript's evaluation completed with the two audio criteria; the ceiling is recomputed and the change explained. */
export function completeWithAudio(ev: Evaluation, heard: Heard, bounds: Bound[], lang: FeedbackLang): Evaluation {
  const { judgement, metrics } = heard;
  const before = ev.transcriptScore20 ?? ev.score20;
  const given = [
    ...ev.criteria.filter((c) => c.source === "transcript").map((c) => ({ name: c.name, score: c.cappedFrom ?? c.score, reason: c.reason })),
    { name: "Fluency", score: judgement.aisance.score, reason: judgement.aisance.reason },
    { name: "Pronunciation", score: judgement.prononciation.score, reason: judgement.prononciation.reason },
  ];
  // the sound to fix, with the place where it was said (for the replay button, on the browser's own copy)
  const sound = judgement.sound ? { word: judgement.sound.word, heard: judgement.sound.heard, tip: judgement.sound.tip, ...(judgement.sound.at != null ? locateAt(bounds, judgement.sound.at) ?? {} : {}) } : null;
  const full = buildEvaluation({ taskId: ev.taskId, skill: "speaking", task: ev.task, fulfilment: ev.fulfilment, facts: ev.facts, empty: false }, given, { holistic: ev.holistic, evidence: ev.evidence, fixes: ev.fixes, next: ev.next, sound });
  return { ...full, transcriptScore20: before, audio: { judgement, metrics, explanation: explainChange(before, full.score20, judgement, lang) } };
}
