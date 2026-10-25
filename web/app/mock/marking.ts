// The marking of the writing and speaking stages, driven from the browser (the simulator marks a task when the
// browser hands it in; the server keeps the result): every task of a mock's session that is not marked yet is handed
// in again — the writing texts from this browser's copies, the speaking answers from the clips
// this browser kept — with automatic retries (4 · 8 · 12 s, then one a minute). One run per session at a time.
import { markWriting, within } from "../sim/browser-score";
import { loadSession, workOfSession } from "../sim/work.ts";
import { clipsOf } from "../sim/clips.ts";
import { rebuildStarted, type StoredSession } from "../expr.ts";
import { finishTask } from "../sim/analysis.ts";
import { LISTENING_TIMEOUT_MS, SCORING_TIMEOUT_MS, explainFailure, failureOf, type Failure } from "../sim/scoring-error.ts";
import type { Lang } from "../i18n.ts";

export type TaskState = { taskNo: number; status: "done" | "running" | "waiting" | "failed"; score20: number | null; failure?: Failure; retryAt?: number };
export type MarkState = { sessionId: string; skill: "writing" | "speaking"; tasks: TaskState[]; done: boolean; score20: number | null; nclc: number | null; level: string | null };
type Listener = (s: MarkState) => void;

const RETRY_S = [4, 8, 12];
/** a task the server says is being marked is left alone this long before it is handed in again */
const GRADING_PATIENCE_MS = 3 * 60_000;
const runs = new Map<string, { state: MarkState; listeners: Set<Listener>; running: boolean; tries: number; timer: ReturnType<typeof setTimeout> | null }>();

const draftOf = (sessionId: string, taskNo: number, mine: Record<string, string>): string => {
  let kept = "";
  try { kept = localStorage.getItem(`tcfm-draft-${sessionId}-${taskNo}`) ?? ""; } catch { /* none */ }
  const m = mine[String(taskNo)] ?? "";
  return m.length > kept.length ? m : kept;
};

/** the texts or recordings sit on another device: this one has no trace of the session (no kept work, no draft, no
 *  clip). Marking here would score the tasks 0/20 for good, so it waits for the device that has them. */
const AWAY: Record<Lang, string> = {
  fr: "Vos textes et vos enregistrements sont sur l'appareil où vous avez passé l'examen blanc : ouvrez-le là-bas pour terminer la correction.",
  en: "Your texts and recordings are on the device you sat the mock exam on: open it there to finish the marking.",
};
async function hasTrace(sessionId: string, skill: "writing" | "speaking", drafts: Record<string, string>): Promise<boolean> {
  if ((await workOfSession(sessionId).catch(() => [])).length) return true;
  if (skill === "speaking") return (await clipsOf(sessionId).catch(() => [])).length > 0;
  if (Object.values(drafts).some((t) => t.trim())) return true;
  try { for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith(`tcfm-draft-${sessionId}-`)) return true; } catch { /* storage blocked */ }
  return false;
}

async function load(sessionId: string): Promise<{ d: StoredSession; state: MarkState }> {
  const d = await loadSession(sessionId);
  const s = rebuildStarted(d);
  const tasks: TaskState[] = d.tasks.map((t) => ({ taskNo: t.taskNo, status: t.status === "done" && t.score20 != null ? "done" : "waiting", score20: t.score20 }));
  return { d, state: { sessionId, skill: s.skill, tasks, done: d.session.status === "done", score20: null, nclc: null, level: null } };
}

/** subscribe to a session's marking; the run starts (or goes on) by itself */
export function watchMarking(sessionId: string, drafts: Record<string, string>, lang: Lang, f: Listener): () => void {
  let run = runs.get(sessionId);
  if (!run) {
    run = { state: { sessionId, skill: "writing", tasks: [], done: false, score20: null, nclc: null, level: null }, listeners: new Set(), running: false, tries: 0, timer: null };
    runs.set(sessionId, run);
  }
  run.listeners.add(f);
  f(run.state);
  if (!run.running) void mark(sessionId, drafts, lang);
  return () => { run!.listeners.delete(f); };
}

const tell = (sessionId: string) => { const r = runs.get(sessionId); if (r) r.listeners.forEach((f) => f({ ...r.state, tasks: r.state.tasks.map((t) => ({ ...t })) })); };
const setTask = (sessionId: string, taskNo: number, patch: Partial<TaskState>) => { const r = runs.get(sessionId); if (!r) return; r.state.tasks = r.state.tasks.map((t) => (t.taskNo === taskNo ? { ...t, ...patch } : t)); tell(sessionId); };

/** retry now (the card's button): the count of tries starts again */
export function retryMarking(sessionId: string, drafts: Record<string, string>, lang: Lang) {
  const r = runs.get(sessionId);
  if (!r || r.running) return;
  if (r.timer) clearTimeout(r.timer);
  r.timer = null;
  r.tries = 0;
  void mark(sessionId, drafts, lang);
}

async function mark(sessionId: string, drafts: Record<string, string>, lang: Lang) {
  const r = runs.get(sessionId);
  if (!r || r.running) return;
  r.running = true;
  if (r.timer) { clearTimeout(r.timer); r.timer = null; }
  let failure: Failure | null = null;
  try {
    const { d, state } = await load(sessionId);
    r.state = { ...state, score20: d.session.status === "done" ? null : null };
    tell(sessionId);
    if (state.done) { r.running = false; return; }
    // nothing of this session on this device: the tasks wait for the device that has the work (no 0/20 stored here)
    if (d.tasks.some((t) => !(t.status === "done" && t.score20 != null)) && !(await hasTrace(sessionId, state.skill, drafts))) {
      failure = { message: AWAY[lang], retryInS: 0, google: false, away: true };
      for (const t of d.tasks) if (!(t.status === "done" && t.score20 != null)) setTask(sessionId, t.taskNo, { status: "failed", failure });
      r.running = false;
      return;
    }
    for (const task of d.tasks) {
      if (task.status === "done" && task.score20 != null) continue;
      // being marked by a request still on its way (the stage's own hand-in): patience, then once more
      if (task.status === "grading" && task.submittedAt && Date.now() - Date.parse(task.submittedAt) < GRADING_PATIENCE_MS) { setTask(sessionId, task.taskNo, { status: "running" }); continue; }
      setTask(sessionId, task.taskNo, { status: "running" });
      try {
        if (state.skill === "writing") {
          const text = task.responseText || draftOf(sessionId, task.taskNo, drafts);
          // marked in this browser with the person's own key; the Worker only stores the result
          let out: { score20: number };
          try { out = await within(markWriting(sessionId, task.taskNo as 1 | 2 | 3, text, 0), SCORING_TIMEOUT_MS); }
          catch (e) { if ((e as { code?: string }).code === "done") { setTask(sessionId, task.taskNo, { status: "done" }); continue; } throw e; }
          setTask(sessionId, task.taskNo, { status: "done", score20: out.score20 });
        } else {
          const out = await finishTask(sessionId, task.taskNo, task.durationS ?? 0, LISTENING_TIMEOUT_MS);
          setTask(sessionId, task.taskNo, { status: "done", score20: out.score20 });
        }
      } catch (e) {
        const res = (e as { response?: Response }).response;
        failure = res ? await failureOf(res, undefined, lang) : explainFailure(e, lang);
        setTask(sessionId, task.taskNo, { status: "failed", failure });
        break;
      }
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    // the session's own status, once every task went through
    const after = await load(sessionId).catch(() => null);
    if (after) { r.state = { ...after.state, tasks: after.state.tasks.map((t) => r.state.tasks.find((x) => x.taskNo === t.taskNo && x.status === "failed") ?? t) }; }
    if (after?.d.session.status === "done") { r.state.done = true; r.state.score20 = after.d.session.summaryJson ? (JSON.parse(after.d.session.summaryJson) as { score20: number | null }).score20 : null; }
    tell(sessionId);
  } catch (e) {
    failure = explainFailure(e, lang);
    for (const t of r.state.tasks) if (t.status !== "done") t.status = "failed";
    tell(sessionId);
  }
  r.running = false;
  // one of the tasks failed: by itself three times (4 · 8 · 12 s), then one a minute; never when the key is refused or
  // the work is on another device
  const stuck = r.state.tasks.some((t) => t.status === "failed" || t.status === "running");
  if (stuck && !r.state.done && !failure?.key && !failure?.away) {
    const wait = r.tries < RETRY_S.length ? RETRY_S[r.tries] : Math.min(60, failure?.retryInS ?? 60);
    r.tries++;
    const at = Date.now() + wait * 1000;
    r.state.tasks = r.state.tasks.map((t) => (t.status === "failed" || t.status === "running" ? { ...t, retryAt: at } : t));
    tell(sessionId);
    r.timer = setTimeout(() => void mark(sessionId, drafts, lang), wait * 1000);
  }
}
