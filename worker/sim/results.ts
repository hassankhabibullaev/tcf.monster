/**
 * Results computed in the person's browser (shared/sim/writing-core.ts, oral-core.ts, with their own Gemini key):
 * the Worker only checks and stores the MARKS. What was written or said, and its corrections, never come here: the
 * browser keeps them (web/app/sim/work.ts). A browser can lie about its own mark; what it cannot do is store
 * something impossible or personal: the task must be theirs and not marked yet, a mark is a whole number from 0 to
 * 20, the level and the NCLC are worked out here from the mark, the marks keep only the grid's own rows and numbers
 * (shared/sim/marks.ts), an empty text scores 0, and a task is not marked within seconds of its session starting.
 */
import { updateTask } from "./db.ts";
import { nowIso } from "./util.ts";
import { nclcFor, type TaskNo } from "./config.ts";
import { AiError } from "./ai/gemini.ts";
import { finalizeIfDone, getSession, getTask } from "./session.ts";
import { marksOf } from "../../shared/sim/marks.ts";

const MIN_SECONDS = 20;
/** far beyond the longest task (~180 words asked) */
const MAX_WORDS = 3000;

const bad = (msg: string) => new AiError(msg, 400, "bad_request");
const isMark = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 20;

async function openTask(sessionId: string, taskNo: TaskNo) {
  const data = await getSession(sessionId);
  if (!data) throw new AiError("session introuvable", 404, "not_found");
  const task = await getTask(sessionId, taskNo);
  if (task.status === "done" && task.score20 != null) throw new AiError("Cette tâche est déjà notée.", 409, "done");
  if (Date.now() - Date.parse(data.session.startedAt) < MIN_SECONDS * 1000) throw bad("trop tôt");
  return { session: data.session, task };
}

/** the marks of an evaluation whose own mark is the one given (null: none sent) */
function marksJson(skill: "writing" | "speaking", taskNo: TaskNo, v: unknown, score20: number): string | null {
  if (v == null) return null;
  const m = marksOf(skill, taskNo, v);
  if (!m) throw bad("évaluation invalide");
  if (m.score20 !== score20) throw bad("la note ne correspond pas à l'évaluation");
  return JSON.stringify(m);
}

/** a writing task handed in and marked in the browser: its length, its time, its marks */
export async function storeWritingResult(b: { sessionId: string; taskNo: TaskNo; wordCount: unknown; elapsedS: unknown; score20: unknown; marks: unknown }) {
  const { session, task } = await openTask(b.sessionId, b.taskNo);
  if (session.section !== "ee") throw bad("pas une session d'écrit");
  const wc = Number(b.wordCount);
  if (!Number.isInteger(wc) || wc < 0 || wc > MAX_WORDS) throw bad("nombre de mots invalide");
  const score20 = wc === 0 ? 0 : b.score20;
  if (!isMark(score20)) throw bad("note invalide");
  const marks = wc === 0 ? null : marksJson("writing", b.taskNo, b.marks, score20);
  const m = wc === 0 ? { cecrl: "A1", nclc: 0 } : nclcFor(score20, "writing");
  const elapsed = Math.max(0, Math.min(6 * 3600, Number(b.elapsedS) || 0));
  await updateTask(task.id, { wordCount: wc, durationS: elapsed, submittedAt: nowIso(), marksJson: marks, score20, level: m.cecrl, nclc: m.nclc, status: "done" });
  const summary = await finalizeIfDone(b.sessionId);
  return { score20, level: m.cecrl, nclc: m.nclc, finished: !!summary, summary };
}

/** a speaking task scored in the browser: its length and its marks (the turns stay in the browser) */
export async function storeSpeakingResult(b: { sessionId: string; taskNo: TaskNo; durationS: unknown; score20: unknown; marks: unknown }) {
  const { session, task } = await openTask(b.sessionId, b.taskNo);
  if (session.section !== "eo") throw bad("pas une session d'oral");
  if (!isMark(b.score20)) throw bad("note invalide");
  const score20 = b.score20;
  const marks = marksJson("speaking", b.taskNo, b.marks, score20);
  const m = nclcFor(score20, "speaking");
  const durationS = Math.max(0, Math.min(3600, Number(b.durationS) || 0));
  await updateTask(task.id, { durationS, submittedAt: nowIso(), marksJson: marks, score20, level: m.cecrl, nclc: m.nclc, status: "done" });
  const summary = await finalizeIfDone(b.sessionId);
  return { score20, level: m.cecrl, nclc: m.nclc, finished: !!summary, summary };
}
