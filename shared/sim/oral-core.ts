/**
 * Speaking, the part that needs no server: the order of turns, the cleaning of transcriptions, the timing facts, and
 * the scoring of a finished task (scoreSpeaking). It runs in the person's browser with their own Gemini key (the clips
 * never leave the device except to Google) and, until every browser has switched, in the Worker too (worker/sim/oral.ts
 * wraps it with the database). It reads nothing and writes nothing: the caller stores what it returns.
 */
import { AiError, transcribeMany } from "./ai/gemini.ts";
import { EXAMINER_LINES, SPEAKING, nclcFor, type TaskNo } from "./config.ts";
import { evaluateProduction, type Evaluation } from "./eval/evaluate.ts";
import { boundsOfClips, completeWithAudio, hearRecording, type Heard } from "./eval/audio.ts";
import type { Bound } from "./eval/audio-core.ts";
import { feedbackLanguage } from "./eval/language.ts";
import type { GeneratedPrompt, Turn } from "./types.ts";
import { cardPoints } from "./roleplay.ts";
import { CLOSE, FAREWELL, FIXED, isScriptLine } from "./oral-lines.ts";

/** the script's lines and the older fixed lines: never counted as her own questions */
export const FIXED_LINES: string[] = [...Object.values(FIXED), ...Object.values(EXAMINER_LINES), ...Object.values(CLOSE.done), ...Object.values(CLOSE.cut).flat(), CLOSE.lateQuestion2, FAREWELL].filter(Boolean);
export const isFixedLine = (text: string) => FIXED_LINES.includes(text) || isScriptLine(text);

/** Turns in the order they were said: by task time; at the same instant her line comes before the candidate's, and two lines of the same speaker keep the order they were logged in (the sort is stable). */
export const byTime = (a: Turn, b: Turn) => a.t - b.t || (a.role === b.role ? 0 : a.role === "examiner" ? -1 : 1);

/** Speech-to-text models invent stock phrases on silence; drop them. */
const HALLUCINATION = /(sous-titres? (réalisés?|faits?)[^.]*\.?|merci d'avoir regardé[^.]*\.?|abonnez-vous[^.]*\.?|amara\.org)/gi;
/** When she cuts in, the recording goes on for a few seconds: on loudspeakers her own words can end up at the end of the candidate's answer. */
const BLEED = /\s*(très bien,? )?merci[,.]? (je vous arr[êe]te là|nous allons nous arr[êe]ter là)\b.*$/i;
export const clean = (t: string) => t.replace(HALLUCINATION, " ").replace(BLEED, "").replace(/\s+/g, " ").trim();
/**
 * The grammar and vocabulary scores rest on this text, so it must be what the candidate SAID. A mistake that was
 * clearly pronounced stays; but where two forms sound alike (silent agreements, homophones, a barely audible article
 * or « se »), the transcriber writes the correct one instead of guessing a mistake the candidate did not make.
 */
export const STT_PROMPT = (taskNo: number) => `Candidat au TCF Canada, tâche ${taskNo} : un apprenant étranger parle français à une examinatrice. Transcription fidèle de ce qu'il dit, sans rien reformuler ni embellir. Quand deux formes se prononcent de la même façon ou presque (accords, terminaisons, homophones, genre d'un article peu audible), écrire celle qui est correcte dans la phrase ; un petit mot prononcé faiblement (« ne », « se », « de », « le ») s'écrit s'il est audible. Une erreur clairement prononcée (« j'ai allé », « je prendre ») reste telle quelle, comme les répétitions et les hésitations (euh).`;

/** the browser's name for a clip: an opaque short string, nothing else is accepted */
export const CLIP_ID = /^[\w.-]{1,64}$/;
export const clipIdOf = (v: unknown): string => {
  const s = String(v ?? "");
  if (!CLIP_ID.test(s)) throw new AiError("clipId manquant ou invalide.", 400, "bad_request");
  return s;
};
/** the most the clips of one task may weigh together (they are sent to Google inline) */
export const MAX_UPLOAD_BYTES = 20_000_000;

/** a complete clip of one answer, kept by the browser */
export type Clip = { clipId: string; audio: Blob; durationS?: number };

/**
 * Answers stored without a text (a live Tâche 2 turn Google did not transcribe) or joined from pieces are
 * transcribed whole before scoring, all in one request, from the clips (the other clips are only heard: their text
 * was whole already). No clip: the stored text stays.
 */
export async function retranscribe(turns: Turn[], taskNo: TaskNo, clips: Clip[]): Promise<Turn[]> {
  const byId = new Map(clips.filter((c) => c.audio.size > 0).map((c) => [c.clipId, c.audio]));
  const todo = turns.map((t, i) => ({ t, i })).filter(({ t }) => t.role === "candidate" && t.stitched && !!t.clipId && byId.has(t.clipId));
  if (!todo.length) return turns;
  try {
    // one request for every answer of the task (the free tier counts requests, not seconds)
    const { texts } = await transcribeMany({ feature: "sim_oral_stt", audios: todo.map(({ t }) => byId.get(t.clipId!)!), prompt: STT_PROMPT(taskNo) });
    const out = [...turns];
    todo.forEach(({ t, i }, k) => {
      const { stitched: _s, ...rest } = t;
      void _s;
      out[i] = { ...rest, text: clean(texts[k] ?? "") || t.text };
    });
    return out;
  } catch (e) {
    console.error("re-transcription failed, keeping the stored text", e);
    return turns;
  }
}

/** Timing facts computed in code from the turn log (speech duration, speech ratio, words/min, silence share). */
export function speakingFacts(turns: Turn[], durationS: number, taskSeconds: number) {
  const cand = turns.filter((t) => t.role === "candidate");
  const lastEx = [...turns].reverse().find((t) => t.role === "examiner")?.text ?? "";
  const cutByTime = [...Object.values(CLOSE.cut).flat(), CLOSE.lateQuestion2].some((c) => lastEx.startsWith(c));
  const speechSeconds = cand.reduce((s, t) => s + (t.durationS ?? 0), 0);
  const words = cand.map((t) => t.text).join(" ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const examinerSeconds = turns.filter((t) => t.role === "examiner").reduce((s, t) => s + Math.min(20, 1 + t.text.length / 15), 0);
  const total = Math.max(1, durationS || taskSeconds);
  return {
    taskSeconds,
    elapsedSeconds: durationS,
    speechSeconds: Number(speechSeconds.toFixed(1)),
    speechRatio: Number(Math.min(1, speechSeconds / total).toFixed(2)),
    wordsPerMinute: speechSeconds > 5 ? Math.round(words / (speechSeconds / 60)) : 0,
    candidateTurns: cand.filter((t) => t.text && t.text !== "(inaudible)").length,
    silenceRatio: Number(Math.max(0, 1 - (speechSeconds + examinerSeconds) / total).toFixed(2)),
    wordCount: words,
    ...(cutByTime ? { cutByTime: true } : {}),
  };
}

export type SpeakingScore = {
  evaluation: Evaluation;
  score20: number; level: string; nclc: number;
  /** the turns as scored (re-transcribed where needed, a clip never registered added after the last turn) */
  turns: Turn[];
  /** the transcript as shown and stored: « Examinatrice : … / Candidat : … » */
  transcript: string;
  /** Tâche 1: her own questions (the script's lines left out), so the next sessions ask something else */
  asked: string[];
};

/**
 * The end of a speaking task: the stitched answers are transcribed whole from their clips, the whole set is heard (in
 * recording order) for fluency and pronunciation while the transcript is scored, and the two are merged into one
 * « full » evaluation. No clip: the stored texts are scored and the mark stays « transcript ». A listening that fails
 * never fails the mark.
 */
export async function scoreSpeaking(opts: { taskId: string; taskNo: TaskNo; prompt: GeneratedPrompt; stored: Turn[]; clips?: Clip[]; durationS: number; wav?: Blob | null; bounds?: Bound[] }): Promise<SpeakingScore> {
  const clips = (opts.clips ?? []).map((c) => ({ ...c, clipId: clipIdOf(c.clipId) }));
  const bytes = clips.reduce((n, c) => n + c.audio.size, 0) + (opts.wav?.size ?? 0);
  if (bytes > MAX_UPLOAD_BYTES) throw new AiError(`Enregistrement trop lourd (${Math.round(bytes / 1e6)} Mo, maximum ${MAX_UPLOAD_BYTES / 1e6}).`, 413, "too_large");
  const lang = await feedbackLanguage();
  const stored = [...opts.stored];
  // a clip whose registration never reached the server is still an answer: it takes its place after the last turn and
  // is transcribed from the clip like the others
  const known = new Set(stored.filter((t) => t.role === "candidate" && t.clipId).map((t) => t.clipId));
  let lastT = stored.reduce((m, t) => Math.max(m, t.t), 0);
  for (const c of clips) if (!known.has(c.clipId) && c.audio.size > 0) { known.add(c.clipId); lastT += 1; stored.push({ role: "candidate", text: "", t: lastT, clipId: c.clipId, durationS: c.durationS ?? 0, stitched: true }); }
  const turns = await retranscribe(stored.sort(byTime), opts.taskNo, clips);
  // a button pressed by mistake leaves a one-second « (inaudible) » turn: not part of the exchange
  const transcript = turns.filter((t) => t.text && t.text !== "(inaudible)").map((t) => `${t.role === "examiner" ? "Examinatrice" : "Candidat"} : ${t.text}`).join("\n");
  const spec = SPEAKING.tasks[opts.taskNo];
  const candidateText = turns.filter((t) => t.role === "candidate" && t.text && t.text !== "(inaudible)").map((t) => t.text).join("\n");
  const hear = async (): Promise<(Heard & { bounds: Bound[] }) | null> => {
    if (!candidateText) return null;
    if (opts.wav && opts.wav.size > 1000) {
      const bounds = (opts.bounds ?? []).filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start);
      if (!bounds.length) return null;
      const heard = await hearRecording({ taskNo: opts.taskNo, wav: await opts.wav.arrayBuffer(), bounds, transcript: candidateText, lang });
      return { ...heard, bounds };
    }
    // the clips, in the order the answers were given (the clip's own duration, else the one stored with the turn)
    const byId = new Map(clips.map((c) => [c.clipId, c]));
    const ordered = turns.filter((t) => t.role === "candidate" && t.clipId && byId.has(t.clipId)).map((t) => ({ clip: byId.get(t.clipId!)!, durationS: byId.get(t.clipId!)!.durationS ?? t.durationS ?? 0 }));
    if (!ordered.length) return null;
    const heardClips = await Promise.all(ordered.map(async (o) => ({ data: await o.clip.audio.arrayBuffer(), mime: o.clip.audio.type || "audio/webm", durationS: o.durationS })));
    const heard = await hearRecording({ taskNo: opts.taskNo, clips: heardClips, transcript: candidateText, lang });
    return { ...heard, bounds: boundsOfClips(heardClips) };
  };
  const heardP = hear().catch((e) => { console.error("listening failed", e); return null; });
  // Tâche 2: the points the card asks the candidate to cover; the evaluation checks that their questions went through them
  const points = opts.taskNo === 2 ? cardPoints(opts.prompt.consigne) : [];
  const facts = { ...speakingFacts(turns, opts.durationS, spec.speakSeconds), ...(points.length ? { cardPoints: points } : {}) };
  const scored = await evaluateProduction({ taskId: opts.taskId, skill: "speaking", task: opts.taskNo, prompt: opts.prompt, production: facts.candidateTurns ? transcript : "", facts });
  const heard = await heardP;
  const evaluation = heard ? completeWithAudio(scored, heard, heard.bounds, lang) : scored;
  const m = nclcFor(evaluation.score20, "speaking");
  const asked = opts.taskNo === 1 ? turns.filter((t) => t.role === "examiner" && !isFixedLine(t.text)).map((t) => t.text) : [];
  return { evaluation, score20: evaluation.score20, level: m.cecrl, nclc: m.nclc, turns, transcript, asked };
}
