// Writing and speaking are marked HERE, in the person's browser, with their own Gemini key (shared/sim). The key, the
// texts, the turns and the corrections stay on this device (localStorage, work.ts); the Worker gets the marks alone
// (POST /api/expr/result: numbers and the grid's rows, shared/sim/marks.ts) and never calls Google. The recordings go
// from this device straight to Google. The scoring code is loaded only when something is marked (a separate file).
import { setAiContext } from "../../../shared/sim/ai/context.ts";
import { AiError, listModels } from "../../../shared/sim/ai/gemini.ts";
import type { GeneratedPrompt, Turn } from "../../../shared/sim/types.ts";
import type { TaskNo } from "../../../shared/sim/config.ts";
import type { Detail, Revision } from "../../../shared/sim/writing-core.ts";
import type { Evaluation } from "../../../shared/sim/eval/evaluate.ts";
import { looksLikeKey } from "../../../shared/sim/key-shape.ts";
import { mergeAsked } from "../../../shared/sim/asked-core.ts";
import { MAX_REVISIONS, type SessionSummary } from "./types";
import { UPLOAD_BUDGET, clipsOf } from "./clips";
import { getWork, loadSession, putWork } from "./work";

/* ---------- who is marking: the person, their language, their key ---------- */
let person = { id: "", lang: "fr" as "fr" | "en" };
/** set by the app once GET /me answered (main.tsx) */
export const setScoringPerson = (id: string, lang: "fr" | "en") => {
  const changed = person.id !== id;
  person = { id, lang };
  if (changed) tell();
};

/**
 * The key lives on this device only (it never reaches our server): pasted once per device, checked with Google from
 * here. What the account learns is how it went (POST /api/me/key {status}), so the admin knows who is set up.
 * Status: ok · none · error (Google refused it) · quota (its daily limit reached).
 */
export type KeyStatus = "ok" | "none" | "error" | "quota";
const KEY_STORE = (id: string) => `tcfm-gk:${id}`;
const STATUS_STORE = (id: string) => `tcfm-gks:${id}`;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((f) => f());
export const onKeyChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

/** the key on this device (an older copy, saved with a tag, is read too) */
export function keyHere(): string | null {
  if (!person.id) return null;
  try {
    const raw = localStorage.getItem(KEY_STORE(person.id));
    if (!raw) return null;
    const v = JSON.parse(raw) as { k?: unknown };
    return typeof v?.k === "string" && v.k ? v.k : null;
  } catch { return null; }
}
export function keyStatusHere(): KeyStatus {
  if (!keyHere()) return "none";
  try { const s = localStorage.getItem(STATUS_STORE(person.id)); return s === "error" || s === "quota" ? s : "ok"; } catch { return "ok"; }
}
/** tells the account how the key fares (never the key) */
const report = (status: KeyStatus, error?: string) =>
  void fetch("/api/me/key", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, ...(error ? { error: error.slice(0, 300) } : {}) }) }).catch(() => null);
function setStatus(status: "ok" | "error" | "quota", error?: string) {
  const before = keyStatusHere();
  try { if (status === "ok") localStorage.removeItem(STATUS_STORE(person.id)); else localStorage.setItem(STATUS_STORE(person.id), status); } catch { /* fine */ }
  if (before !== status) { tell(); report(status, error); }
}

export type KeyRefusal = "shape" | "refused" | "unreachable";
/** a pasted key: its shape, then Google's answer (the model list is free); kept on this device once it works */
export async function saveKeyHere(raw: string): Promise<{ ok: true } | { ok: false; error: KeyRefusal }> {
  const key = raw.trim().replace(/^["']|["']$/g, "");
  if (!looksLikeKey(key)) return { ok: false, error: "shape" };
  const r = await listModels(key);
  if (!r.ok) return { ok: false, error: r.status === 400 || r.status === 401 || r.status === 403 ? "refused" : "unreachable" };
  try { localStorage.setItem(KEY_STORE(person.id), JSON.stringify({ k: key })); } catch { return { ok: false, error: "unreachable" }; }
  try { localStorage.removeItem(STATUS_STORE(person.id)); } catch { /* fine */ }
  tell();
  report("ok");
  return { ok: true };
}
/** the key removed from this device */
export function forgetKeyHere() {
  const had = !!keyHere();
  try { localStorage.removeItem(KEY_STORE(person.id)); localStorage.removeItem(STATUS_STORE(person.id)); } catch { /* fine */ }
  tell();
  if (had) report("none");
}

function theKey(): string {
  const k = keyHere();
  if (!k) throw new AiError("Aucune clé Gemini sur cet appareil.", 403, "no_key");
  return k;
}
async function ready() {
  const key = theKey();
  setAiContext(() => ({ key, userId: person.id, lang: person.lang }));
}
/** Google's answer about the key, remembered here (and told to the account) so the app can say so before starting */
function onFailure(e: unknown): never {
  if (e instanceof AiError && e.code === "unauthorized") setStatus("error", e.message);
  else if (e instanceof AiError && e.code === "rate_limited") setStatus("quota", e.message);
  throw e;
}
const worked = () => { if (keyStatusHere() !== "ok") setStatus("ok"); };

/** the key for a live session (live-examiner.ts opens it from this device) */
export async function liveKey(): Promise<void> { await ready(); }
export { onFailure as keyTrouble };

/* ---------- the Tâche 1 questions already asked (shared/sim/asked-core.ts), on this device ---------- */
const ASKED_STORE = (id: string) => `tcfm-asked:${id}`;
export function askedHere(): string[] {
  try { const v = JSON.parse(localStorage.getItem(ASKED_STORE(person.id)) ?? "[]"); return Array.isArray(v) ? v.filter((q): q is string => typeof q === "string") : []; } catch { return []; }
}
function rememberAsked(questions: string[]) {
  if (!questions.length) return;
  try { localStorage.setItem(ASKED_STORE(person.id), JSON.stringify(mergeAsked(askedHere(), questions))); } catch { /* fine */ }
}

/* ---------- the task: the server's marks and this device's work ---------- */
type TaskData = { id: string; taskNo: number; promptJson: string; status: string; score20: number | null; level: string | null; nclc: number | null; responseText?: string | null; turnsJson?: string; feedbackJson?: string | null; detailJson?: string | null; versionsJson?: string | null };
async function taskOf(sessionId: string, taskNo: number): Promise<TaskData> {
  let d;
  try { d = await loadSession(sessionId); }
  catch (e) { const st = (e as { status?: number }).status ?? 500; throw new AiError("session introuvable", st, st === 404 ? "not_found" : "error"); }
  const t = d.tasks.find((x) => x.taskNo === taskNo);
  if (!t) throw new AiError("tâche introuvable", 404, "not_found");
  return t;
}
const promptOf = (t: TaskData) => JSON.parse(t.promptJson) as GeneratedPrompt;
const safe = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

/** the server's answer to stored marks, or its refusal as an error the room can explain */
async function store<T>(path: string, body: unknown, keepalive = false): Promise<T> {
  const r = await fetch(`/api/expr${path}`, { method: "POST", keepalive, credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = (await r.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!r.ok) throw new AiError(d.error ?? "storing failed", r.status, d.code ?? (r.status === 409 ? "done" : "error"));
  return d;
}

export type WritingResult = { evaluation: Evaluation | null; detail: Detail | null; score20: number; level: string; nclc: number; summary: SessionSummary | null };

/** a writing task handed in: kept here, marked here, its marks stored there (an empty hand-in marks the kept draft) */
export async function markWriting(sessionId: string, taskNo: TaskNo, text: string, elapsedS: number): Promise<WritingResult> {
  const task = await taskOf(sessionId, taskNo);
  if (task.status === "done" && task.score20 != null) {
    return { evaluation: safe<Evaluation | null>(task.feedbackJson, null), detail: safe<Detail | null>(task.detailJson, null), score20: task.score20, level: task.level ?? "", nclc: task.nclc ?? 0, summary: null };
  }
  const body = text.trim() ? text : task.responseText ?? "";
  // the text is kept on this device before anything else: a marking that fails or a tab that closes loses nothing
  if (body.trim() && body !== (task.responseText ?? "")) await putWork(sessionId, taskNo, { text: body });
  await ready();
  const { scoreWriting } = await import("../../../shared/sim/writing-core.ts");
  const { wordCount } = await import("../../../shared/sim/util.ts");
  const { marksOf } = await import("../../../shared/sim/marks.ts");
  const r = await scoreWriting({ taskId: task.id, taskNo, prompt: promptOf(task), text: body, elapsedS }).catch(onFailure);
  worked();
  await putWork(sessionId, taskNo, { text: body, evaluation: r.evaluation ? JSON.stringify(r.evaluation) : null, ...(r.detail ? { detail: JSON.stringify(r.detail) } : {}) });
  const saved = await store<{ score20: number; level: string; nclc: number; summary: SessionSummary | null }>("/result", { sessionId, taskNo, wordCount: wordCount(body), elapsedS, score20: r.score20, marks: r.evaluation ? marksOf("writing", taskNo, r.evaluation) : null });
  return { evaluation: r.evaluation, detail: r.detail, score20: saved.score20, level: saved.level, nclc: saved.nclc, summary: saved.summary };
}

export type SpeakingResult = { evaluation: Evaluation | null; detail?: unknown | null; score20: number; level: string; nclc: number; transcript: Turn[]; summary: SessionSummary | null };

/** a speaking task ended: its clips and turns (kept on this device) marked here, its marks stored there */
export async function markSpeaking(sessionId: string, taskNo: TaskNo, durationS: number): Promise<SpeakingResult> {
  const task = await taskOf(sessionId, taskNo);
  if (task.status === "done" && task.score20 != null) {
    return { evaluation: safe<Evaluation | null>(task.feedbackJson, null), score20: task.score20, level: task.level ?? "", nclc: task.nclc ?? 0, transcript: safe<Turn[]>(task.turnsJson, []), summary: null };
  }
  const clips: { clipId: string; audio: Blob; durationS: number }[] = [];
  let bytes = 0;
  for (const c of await clipsOf(sessionId, taskNo)) {
    if (bytes + c.blob.size > UPLOAD_BUDGET) break;
    bytes += c.blob.size;
    clips.push({ clipId: c.clipId, audio: c.blob, durationS: c.durationS });
  }
  await ready();
  const { scoreSpeaking } = await import("../../../shared/sim/oral-core.ts");
  const { marksOf } = await import("../../../shared/sim/marks.ts");
  const r = await scoreSpeaking({ taskId: task.id, taskNo, prompt: promptOf(task), stored: safe<Turn[]>(task.turnsJson, []), clips, durationS }).catch(onFailure);
  worked();
  await putWork(sessionId, taskNo, { turns: r.turns, evaluation: r.evaluation ? JSON.stringify(r.evaluation) : null });
  if (taskNo === 1) rememberAsked(r.asked);
  const saved = await store<{ score20: number; level: string; nclc: number; summary: SessionSummary | null }>("/result", { sessionId, taskNo, durationS, score20: r.score20, marks: r.evaluation ? marksOf("speaking", taskNo, r.evaluation) : null });
  return { evaluation: r.evaluation, score20: saved.score20, level: saved.level, nclc: saved.nclc, transcript: r.turns, summary: saved.summary };
}

/** the complete list of mistakes of a task (what was written, or what was said), made and kept here */
export async function markDetail(sessionId: string, taskNo: TaskNo): Promise<Detail> {
  const task = await taskOf(sessionId, taskNo);
  const kept = safe<Detail | null>(task.detailJson, null);
  if (kept?.version === 2) return kept;
  await ready();
  const { detailOfText, detailOfSpeech } = await import("../../../shared/sim/writing-core.ts");
  const p = promptOf(task);
  const d = await (p.skill === "speaking" ? detailOfSpeech(taskNo, p, safe<Turn[]>(task.turnsJson, [])) : detailOfText(taskNo, p, task.responseText ?? "")).catch(onFailure);
  await putWork(sessionId, taskNo, { detail: JSON.stringify(d) });
  return d;
}

/** a rewrite on the result page: checked and kept here as a new version (the task's mark does not change) */
export async function markRevision(sessionId: string, taskNo: TaskNo, raw: string): Promise<{ revisions: Revision[] }> {
  const w = await getWork(sessionId, taskNo);
  if (!w?.text) throw new AiError("Le texte de cette tâche n'est pas sur cet appareil.", 400, "bad_request");
  const revisions = safe<Revision[]>(w.versions, []);
  if (revisions.length >= MAX_REVISIONS) throw new AiError(`Vous avez déjà ${MAX_REVISIONS + 1} versions de ce texte : commencez une nouvelle session pour continuer.`, 400, "bad_request");
  const text = raw.replace(/\r\n/g, "\n").trim().slice(0, 6000);
  if (!text) throw new AiError("Le texte est vide.", 400, "bad_request");
  const last = revisions.length ? revisions[revisions.length - 1].text : w.text;
  if (text === last.trim()) throw new AiError("Le texte n'a pas changé : corrigez-le avant de le faire vérifier.", 400, "bad_request");
  const task = await taskOf(sessionId, taskNo);
  await ready();
  const { scoreRevision } = await import("../../../shared/sim/writing-core.ts");
  const revision = await scoreRevision({ taskId: task.id, taskNo, prompt: promptOf(task), text }).catch(onFailure);
  const next = [...revisions, revision];
  await putWork(sessionId, taskNo, { versions: JSON.stringify(next) });
  return { revisions: next };
}

/** a marking that takes too long ends as a time-out (the room offers to try again; nothing is lost) */
export function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(Object.assign(new Error("timeout"), { name: "TimeoutError" })), ms))]);
}
