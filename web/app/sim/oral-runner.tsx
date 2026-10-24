import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, Icon, TacheTag } from "../../ui/ui";
import { SPEAKING, BLINK_S, WARN_S, canAsk, introCut, questionDeservesAnswer, safeJson, timeIsUp, type Clock, type MicMode, type SessionSummary, type StartedSession, type TaskNo, type Timing, type Turn } from "./types";
import { useRecorder, type StopResult } from "./use-recorder";
import { Station, useLeaveGuard } from "./station";
import { SessionResults, type TaskView } from "./session-results";
import { Interviewer, type Mood } from "./interviewer";
import { LiveExaminer } from "./live-examiner";
import { OutputLevel } from "./output-level";
import { finishTask } from "./analysis";
import { BusyOverlay } from "./busy-overlay";
import { LISTENING_TIMEOUT_MS, explainFailure, type Failure } from "./scoring-error";
import { keepClip, newClipId } from "./clips";
import { applyLog, loadSession, type LogItem } from "./work";
import { askedHere } from "./browser-score";
import { StopDialog } from "./stop-dialog";
import { Hallway } from "./hallway";
import { Trouble } from "./trouble";
import { useSimWords } from "./words";
import type { Lang } from "../i18n";
import type { MockHooks } from "../mock/shell.tsx";

/** a line of the script, said by the live examiner */
type Line = { text: string };
/** what she says at the end of the task and of the session (worker/sim/oral-lines.ts) */
type Closing = { done: Line; cut: Line[]; lateQuestion: Line | null; farewell: Line | null };
type Plan = { taskNo: TaskNo; intro: Line[]; subject: string[]; opening: Line; relance: Line; stop: Line; closing?: Closing; timing: Timing };
type Phase = "preparing" | "intro" | "prep" | "connecting" | "listening" | "examiner" | "reconnecting" | "stopping" | "done" | "idle";
type Pending = Record<number, { durationS: number; failed?: boolean }>;
/** what this browser keeps of the session's marks (a refresh shows them again; whatever was running is retried) */
type Progress = { results: Record<number, TaskView>; summary: SessionSummary | null; pending?: Pending | null };

/** the stored turns of a task, as the results page shows them */
const safeTurns = (json: string) => safeJson<Turn[]>(json, []).map((u) => ({ role: u.role, text: u.text, clipId: u.clipId }));

function MicGlyph({ off = false }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="icon mic-glyph" aria-hidden="true">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4M8 21h8" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

export type OralRunnerProps = { session: StartedSession; startedAtMs: number; kind: "practice" | "exam"; micMode: MicMode; lang: Lang; onExit: () => void; /** a stage of the mock exam (docs/MOCK-EXAM.md §2.3): the mock's top line, no hallway, the stage ends instead of the results */ mock?: MockHooks };

/**
 * The speaking room. One examiner from the greeting to the goodbye (one live connection per task, the next one
 * opened during the last seconds of the previous); the clock never cuts the candidate, she does, by voice; a lost
 * connection freezes the task and reopens it; every answer is kept in this browser until the server has it; the
 * marks of every task are revealed together on the results page.
 */
export function OralRunner({ session: s, startedAtMs, kind, micMode, lang, onExit, mock }: OralRunnerProps) {
  const w = useSimWords(lang);
  const pKey = `tcfm-progress-${s.sessionId}`;
  const [hall, setHall] = useState(kind === "exam" && !mock);
  // the mock: the station is on screen: the stage may start (its own clocks are per task)
  useEffect(() => { mock?.onReady(); }, [mock]); // eslint-disable-line react-hooks/exhaustive-deps
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("preparing");
  const [left, setLeft] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [results, setResults] = useState<Record<number, TaskView>>({});
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [notes, setNotes] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  /** the one calm card for everything that goes wrong (sim/trouble.tsx); the station retries by itself three times */
  const [trouble, setTrouble] = useState<{ message: string; final: boolean; retryAt: number | null; retry: () => void; quit: () => void; link?: { label: string; href: string } } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const troubleRef = useRef<{ attempts: number; timer: ReturnType<typeof setTimeout> | null }>({ attempts: 0, timer: null });
  /** the stop sheet is open: the clock is frozen since this time */
  const [asking, setAsking] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [pondering, setPondering] = useState(false);
  const [mood, setMood] = useState<Mood>("neutral");
  const [pending, setPending] = useState<Pending>({});
  const [failures, setFailures] = useState<Record<number, Failure>>({});
  /** what was said in a task handed in but not marked yet: on the results page while the mark is pending */
  const [drafts, setDrafts] = useState<Record<number, TaskView>>({});
  const [pressing, setPressing] = useState(false);
  const [rtRecording, setRtRecording] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  // the phone: the situation card of Tâche 2 folds to one line
  const [sitOpen, setSitOpen] = useState(false);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const voice = useRef<OutputLevel | null>(null);
  const moodTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setMoodFor = (m: Mood, ms?: number) => {
    if (moodTimer.current) clearTimeout(moodTimer.current);
    moodTimer.current = null;
    setMood(m);
    if (ms) moodTimer.current = setTimeout(() => setMood("neutral"), ms);
  };

  const R = useRef({
    taskIdx: 0,
    plan: null as Plan | null,
    phase: "idle" as Phase,
    /** the official time: from the candidate's first floor; frozen (never counted) while the connection is reopened */
    clockStart: 0,
    frozenMs: 0,
    frozenStart: 0,
    prepEnd: 0,
    segStart: 0,
    segCount: 0,
    seq: 0,
    pending: [] as Promise<unknown>[],
    uploads: new Map<number, Promise<unknown>>(),
    /** the clip id of each answer, by its sequence number: Google's text of the answer is filed under it */
    clipIds: new Map<number, string>(),
    lastUploadP: null as Promise<unknown> | null,
    stopRequested: false,
    stopRequestedByUser: false,
    closing: false,
    introDone: false,
    asked: 0,
    questionEndAt: 0,
    turnStartAt: 0,
    lastSpeechAt: 0,
    spoke: false,
    busy: false,
    busySince: 0,
    speechEndAt: 0,
    latencyMs: null as number | null,
    lastExaminerLine: "",
    lastCandidateText: "",
    /** the next line of hers is a line of the script: logged as written, not as Google transcribed it */
    replaceNextLog: null as string | null,
    openingScript: "",
    openingSpoken: true,
    recOn: false,
    micMode,
    rt: null as LiveExaminer | null,
    rtP: null as Promise<LiveExaminer | null> | null,
    rtFail: null as string | null,
    nextTaskIdx: -1,
    nextPlanP: null as Promise<Plan> | null,
    rtNextP: null as Promise<LiveExaminer | null> | null,
  });

  const done = s.tasks.every((t) => results[t.taskNo] || pending[t.taskNo]) && (phase === "done" || phase === "idle" || !!summary);
  useLeaveGuard(started && !done);

  /* ---------- trouble: raised once, retried by itself at 4 · 8 · 12 s, then the final sentence with Retry and Quit ---------- */
  const TROUBLE_WAITS = [4, 8, 12];
  function clearTrouble(reset = true) {
    const t = troubleRef.current;
    if (t.timer) clearTimeout(t.timer);
    t.timer = null;
    if (reset) t.attempts = 0;
    setTrouble(null);
  }
  /** `retry` must clear the trouble itself when it succeeds (clearTrouble()); when it fails it raises again */
  function raiseTrouble(message: string, retry: () => void, quit: () => void, opts: { link?: { label: string; href: string }; auto?: boolean } = {}) {
    const t = troubleRef.current;
    if (t.timer) clearTimeout(t.timer);
    t.timer = null;
    const auto = opts.auto !== false && t.attempts < TROUBLE_WAITS.length;
    if (!auto && opts.auto !== false) {
      setTrouble({ message, final: true, retryAt: null, retry, quit, link: opts.link });
      return;
    }
    const wait = auto ? TROUBLE_WAITS[t.attempts] : null;
    setTrouble({ message, final: false, retryAt: wait ? Date.now() + wait * 1000 : null, retry, quit, link: opts.link });
    if (wait) t.timer = setTimeout(() => { t.attempts += 1; t.timer = null; retry(); }, wait * 1000);
  }
  useEffect(() => {
    if (!trouble?.retryAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [trouble?.retryAt]);
  useEffect(() => () => { if (troubleRef.current.timer) clearTimeout(troubleRef.current.timer); }, []);

  useEffect(() => {
    R.current.micMode = micMode;
    R.current.rt?.setMode(micMode);
  }, [micMode]);
  // what this browser kept of the session, and what the server already marked (a room rebuilt elsewhere): read before
  // anything starts, so a finished task is never run again
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(pKey) ?? "null") as Progress | null;
      const res: Record<number, TaskView> = { ...(p?.results ?? {}) };
      for (const task of s.tasks) {
        const st = task.stored;
        if (st && st.status === "done" && st.score20 != null && !res[task.taskNo]) {
          const turns = safeTurns(st.turnsJson);
          res[task.taskNo] = { taskNo: task.taskNo, sessionId: s.sessionId, prompt: task.prompt, turns, score20: st.score20, level: st.level, nclc: st.nclc, feedbackJson: st.feedbackJson, detailJson: st.detailJson, elsewhere: st.elsewhere };
        }
      }
      setResults(res);
      if (p) {
        setSummary(p.summary ?? null);
        setPending(Object.fromEntries(Object.entries(p.pending ?? {}).filter(([k]) => !res[Number(k)]).map(([k, v]) => [k, { ...v, failed: true }])));
      }
    } catch {}
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pKey]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(pKey, JSON.stringify({ results, summary, pending } satisfies Progress));
    } catch {}
  }, [results, summary, pending, pKey, hydrated]);

  const elapsed = () => {
    const st = R.current;
    if (!st.clockStart) return 0;
    const now = Date.now();
    return (now - st.clockStart - st.frozenMs - (st.frozenStart ? now - st.frozenStart : 0)) / 1000;
  };
  const freeze = () => {
    if (!R.current.frozenStart) R.current.frozenStart = Date.now();
  };
  const unfreeze = () => {
    const st = R.current;
    if (st.frozenStart) st.frozenMs += Date.now() - st.frozenStart;
    st.frozenStart = 0;
  };
  const setPhaseBoth = (p: Phase) => {
    R.current.phase = p;
    setPhase(p);
  };
  const curTaskNo = () => s.tasks[R.current.taskIdx].taskNo;
  /** the phase as the handlers may have changed it while we awaited (TS narrows the ref otherwise) */
  const phaseNow = () => R.current.phase as Phase;
  const clock = (): Clock => ({ elapsed: elapsed(), introDone: R.current.introDone, asked: R.current.asked, questionEndAt: R.current.questionEndAt, turnStartAt: R.current.turnStartAt });

  const rec = useRecorder({
    onLevel: (rms) => {
      if (rms > 0.015) R.current.lastSpeechAt = Date.now();
    },
  });
  // live conversation: the last voice levels (newest first, one sample every 60 ms) for the bars of the strip
  const [lvlHist, setLvlHist] = useState<number[]>([0, 0, 0, 0, 0]);
  const lvlAt = useRef(0);
  useEffect(() => {
    if (phase !== "listening") {
      setLvlHist((h) => (h.some((v) => v > 0) ? [0, 0, 0, 0, 0] : h));
      return;
    }
    const now = performance.now();
    if (now - lvlAt.current < 60) return;
    lvlAt.current = now;
    const v = Math.min(1, Math.max(0, (rec.level - 0.006) * 7));
    setLvlHist((h) => [v, h[0], h[1], h[2], h[3]]);
  }, [rec.level, phase]);

  const post = (path: string, body: unknown) => fetch(`/api/expr${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  // the speaking log (Google's text of each answer, her lines) is kept on this device only (work.ts), never on the
  // server: written every few seconds, before a task is marked, and when the tab goes away
  const logQueue = useRef<LogItem[]>([]);
  const logTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushLog = useCallback((): Promise<void> => {
    if (logTimer.current) { clearTimeout(logTimer.current); logTimer.current = null; }
    const items = logQueue.current.splice(0);
    if (!items.length) return Promise.resolve();
    return applyLog(s.sessionId, items).catch(() => { logQueue.current.unshift(...items); });
  }, [s.sessionId]);
  const logLater = (item: LogItem) => {
    logQueue.current.push(item);
    if (!logTimer.current) logTimer.current = setTimeout(() => void flushLog(), 5_000);
  };
  useEffect(() => {
    const away = () => { if (document.visibilityState === "hidden") void flushLog(); };
    const gone = () => void flushLog();
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", gone);
    return () => { document.removeEventListener("visibilitychange", away); window.removeEventListener("pagehide", gone); void flushLog(); };
  }, [flushLog]);

  async function fetchPlan(taskNo: TaskNo): Promise<Plan> {
    const r = await post("/oral/prepare", { sessionId: s.sessionId, taskNo, asked: askedHere() });
    const plan = (await r.json()) as Plan & { error?: string };
    if (!r.ok) throw new Error(plan.error ?? "préparation impossible");
    return plan;
  }

  /** She says a line; when she is not connected within a few seconds, the text is shown instead. */
  async function say(line: Line | null, log = false) {
    if (!line) return;
    const st = R.current;
    if (log) logLine(line.text);
    const rt = st.rt && !st.rt.isClosed ? st.rt : st.rtP ? await Promise.race([st.rtP, new Promise<null>((r) => setTimeout(() => r(null), 3000))]) : null;
    if (rt && !rt.isClosed && !st.stopRequested) {
      st.rt = rt;
      (voice.current ??= new OutputLevel()).attachStream(rt.stream);
      await rt.say(line.text);
    } else {
      setCaption(line.text);
      await new Promise((r) => setTimeout(r, Math.min(6000, 1200 + line.text.length * 55)));
      setCaption(null);
    }
  }

  // the clock and the timing rules, five times a second
  useEffect(() => {
    const id = setInterval(() => {
      const st = R.current;
      const p = st.phase;
      if (p === "prep") {
        const l = Math.max(0, (st.prepEnd - Date.now()) / 1000);
        setLeft(l);
        if (l <= 0) void beginLive();
        return;
      }
      if (p !== "listening" && p !== "examiner" && p !== "stopping") return;
      if (st.frozenStart) return; // the connection is being reopened: nothing moves
      const t = st.plan?.timing;
      if (!t) return;
      const e = elapsed();
      setLeft(t.speakS - e);
      // the next task's plan and live connection are opened during the last seconds of this one: no gap, one voice
      if (st.taskIdx < s.tasks.length - 1 && st.nextTaskIdx < 0 && t.speakS - e <= 25) {
        const ni = st.taskIdx + 1;
        st.nextTaskIdx = ni;
        st.nextPlanP = fetchPlan(s.tasks[ni].taskNo);
        st.nextPlanP.catch(() => null);
        st.rtNextP = rtConnect({}, s.tasks[ni].taskNo);
      }
      // time is up: a candidate who is mid-answer gets the grace, then she interrupts by voice; the floor given and
      // nothing said: a few seconds; Tâche 1: never before her two follow-ups; the ceiling ends the task whatever happens
      if (!st.stopRequested) {
        const mid = p === "listening" && st.spoke && !st.busy;
        const idle = p === "listening" && !st.spoke && !st.busy;
        if ((mid || idle || e >= t.speakS + t.overrunS) && timeIsUp(t, { ...clock(), midAnswer: mid, idle })) {
          st.stopRequested = true;
          void hardStop(mid ? "cut" : "close");
          return;
        }
      }
      if (!st.rt) return;
      const segS = (Date.now() - st.segStart) / 1000;
      const silenceS = (Date.now() - st.lastSpeechAt) / 1000;
      // a reply that never came must not freeze the exchange
      if (st.busy && !st.rt.talking && Date.now() - st.busySince > 12000) void rtListen();
      else if (p === "listening" && !st.busy && !st.spoke && segS >= t.idleRelanceS + 2) void rtRelance();
      // Tâche 1: the presentation is cut at 1 min 30 (a little earlier at a pause); closing the turn makes her go on
      else if (st.plan!.taskNo === 1 && p === "listening" && !st.introDone && st.spoke && introCut(t, segS, silenceS)) st.rt.setMic(false);
      else if (st.plan!.taskNo === 3 && p === "listening" && !st.introDone && st.spoke && t.firstInterjectS != null && e >= t.firstInterjectS) st.rt.setMic(false);
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // leaving the page hangs up
  useEffect(
    () => () => {
      const st = R.current;
      st.rt?.close();
      void st.rtP?.then((x) => x?.close());
      voice.current?.close();
    },
    [],
  );

  // the start: after the hallway (exam) or at once (practice)
  useEffect(() => {
    if (hall || started || !hydrated) return;
    setStarted(true);
    void (async () => {
      try {
        // answers already on the server for a task whose mark never came (an error, a closed tab): scored in the
        // background instead of making the candidate do the task again; a task the server has marked is done
        const left: Record<number, { durationS: number }> = { ...pendingRef.current };
        const done: Record<number, TaskView> = { ...resultsRef.current };
        try {
          const d = await loadSession(s.sessionId);
          for (const t of d.tasks ?? []) {
            if (done[t.taskNo] || left[t.taskNo]) continue;
            if (t.status === "done" && t.score20 != null) {
              const task = s.tasks.find((x) => x.taskNo === t.taskNo);
              if (task) done[t.taskNo] = { taskNo: t.taskNo, sessionId: s.sessionId, prompt: task.prompt, turns: safeTurns(t.turnsJson ?? "[]"), score20: t.score20, level: t.level, nclc: t.nclc, feedbackJson: t.feedbackJson ?? null, detailJson: t.detailJson ?? null, elsewhere: t.elsewhere };
            } else if (t.status === "grading" || /"role":"candidate"/.test(t.turnsJson ?? "")) left[t.taskNo] = { durationS: t.durationS ?? SPEAKING.tasks[t.taskNo as TaskNo].speakSeconds };
          }
        } catch {}
        if (Object.keys(done).length !== Object.keys(resultsRef.current).length) setResults(done);
        for (const [k, v] of Object.entries(left)) void finishAndScore(Number(k) as TaskNo, v.durationS);
        const next = s.tasks.findIndex((t) => !done[t.taskNo] && !left[t.taskNo]);
        if (next < 0) {
          setPhaseBoth("done");
          return;
        }
        await startFrom(next);
      } catch {
        setPhaseBoth("idle");
        raiseTrouble(w.troublePrep, () => void startFrom(R.current.taskIdx), () => void abandon());
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hall, hydrated]);

  /** Asks for the microphone — the browser's permission prompt, the first time — while her connection opens, then runs the task. */
  async function startFrom(first: number) {
    R.current.taskIdx = first; // a refused microphone's Retry starts the same task again
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicError(w.noRecorder);
      setPhaseBoth("idle"); // the loader goes: the message and its buttons must be seen
      return;
    }
    const planP = fetchPlan(s.tasks[first].taskNo);
    void planP.catch(() => null);
    const rtP = rtConnect({}, s.tasks[first].taskNo);
    try {
      await rec.start();
      await rec.stop();
    } catch {
      setMicError(w.micMissing);
      setPhaseBoth("idle");
      void rtP.then((x) => x?.close());
      return;
    }
    await runTask(first, planP, rtP);
  }

  async function runTask(i: number, planP?: Promise<Plan>, rtP?: Promise<LiveExaminer | null>, /** the opening is already being said in one breath with the previous close */ openingP?: Promise<void>) {
    const t = s.tasks[i];
    const st = R.current;
    const prepared = st.nextTaskIdx === i;
    const preparedPlan = prepared ? st.nextPlanP : null;
    const preparedRt = prepared ? st.rtNextP : rtP ?? null;
    Object.assign(st, { taskIdx: i, seq: 0, segCount: 0, pending: [], stopRequested: false, stopRequestedByUser: false, introDone: false, asked: 0, questionEndAt: 0, turnStartAt: 0, closing: false, lastUploadP: null, nextTaskIdx: -1, nextPlanP: null, rtNextP: null, clockStart: 0, frozenMs: 0, frozenStart: 0, lastCandidateText: "", lastExaminerLine: "" });
    setIdx(i);
    setNotes("");
    setQuestionOpen(false);
    // no card between two tasks: she goes on from one to the next; the first task opens the room under the loader
    const interP = Promise.resolve();
    setPhaseBoth(prepared || i > 0 ? "intro" : "preparing");
    let plan: Plan;
    try {
      plan = await (preparedPlan ?? planP ?? fetchPlan(t.taskNo));
    } catch {
      await interP;
      setPhaseBoth("idle");
      raiseTrouble(w.troublePrep, () => void runTask(i), () => void abandon());
      return;
    }
    st.plan = plan;
    st.rt = null;
    st.rtFail = null;
    st.rtP = preparedRt ?? rtConnect({}, t.taskNo);
    // the room opens when she is there (bounded): she speaks at once instead of a silent wait
    if (!openingP) await Promise.race([st.rtP, new Promise((r) => setTimeout(r, 9000))]);
    await interP;
    if (st.stopRequested) return;
    setPhaseBoth("intro");
    setMoodFor("neutral");
    // the whole opening (the rules, the situation or the question, the cue) is ONE line of hers; when she is not
    // connected within a few seconds, the text is shown instead and the task goes on
    const script = [...plan.intro.map((l) => l.text), ...plan.subject].filter(Boolean).join(" ");
    if (openingP) {
      const rt = await st.rtP;
      if (rt && !rt.isClosed) st.rt = rt;
      await openingP;
      setSpeaking(false);
    } else if (script && !st.stopRequested) {
      st.replaceNextLog = script; // logged as written (Google's transcription of her own long line drops spaces)
      await say({ text: script });
      st.replaceNextLog = null;
    }
    st.openingScript = script;
    st.openingSpoken = !!st.rt;
    if (plan.timing.prepS > 0) {
      setPhaseBoth("prep");
      st.prepEnd = Date.now() + plan.timing.prepS * 1000;
      setLeft(plan.timing.prepS);
    } else await beginLive();
  }

  /* ---------- the live examiner ---------- */

  function rtConnect(opts: { lastModel?: string | null; resumeHandle?: string | null; avoid?: string[] } = {}, taskNo: TaskNo = curTaskNo()): Promise<LiveExaminer | null> {
    return LiveExaminer.connect(s.sessionId, rtHandlers, { mode: R.current.micMode, taskNo, ...opts }).catch((e) => {
      R.current.rtFail = e instanceof Error ? e.message : String(e);
      return null;
    });
  }

  /**
   * The connection was cut mid-task. Nothing is lost: the clock is frozen, the answer being recorded is kept, and
   * the session is reopened by itself (Google's resumption handle first, then the next model with what was said so
   * far). After three failed attempts the candidate decides: retry, or stop here and have what was said marked.
   */
  const recover = useRef<{ model: string; handle: string | null; internal: boolean }>({ model: "", handle: null, internal: false });
  async function rtRecover(info: { model: string; resumeHandle: string | null }, reason: string) {
    recover.current = { model: info.model, handle: info.resumeHandle, internal: /internal error|code 10(08|11)|quota|exhausted/i.test(reason) };
    await new Promise((r) => setTimeout(r, 600));
    await tryRecover();
  }
  /** one attempt to reopen a cut connection; a failure raises the trouble card, which tries again by itself */
  async function tryRecover() {
    const st = R.current;
    if (st.stopRequested || st.rt) return;
    const { model, handle, internal } = recover.current;
    const rt = await rtConnect({ lastModel: model, resumeHandle: handle, avoid: internal ? [model] : [] });
    recover.current.handle = null; // a stale handle must not block the next attempts
    if (st.stopRequested) {
      rt?.close();
      return;
    }
    if (!rt) {
      raiseTrouble(w.troubleCut, () => void tryRecover(), () => (R.current.spoke || R.current.seq > 0 ? stopHere() : void abandon()));
      return;
    }
    st.rt = rt;
    rt.setMode(st.micMode);
    (voice.current ??= new OutputLevel()).attachStream(rt.stream);
    clearTrouble();
    unfreeze();
    await rtResume(rt);
  }

  /** After a reconnection she picks up where it stopped, then the floor is the candidate's. */
  async function rtResume(rt: LiveExaminer) {
    const st = R.current;
    const plan = st.plan;
    if (!plan) return;
    if (!st.clockStart) {
      // cut during the instructions or the preparation: nothing to pick up
      if (st.phase === "reconnecting") setPhaseBoth(plan.timing.prepS > 0 && Date.now() < st.prepEnd ? "prep" : "connecting");
      if (st.phase === "connecting") void beginLive();
      return;
    }
    setPhaseBoth("examiner");
    st.busy = true;
    st.busySince = Date.now();
    const last = st.lastCandidateText.trim();
    const line = rt.resumed
      ? last
        ? `la connexion a été coupée un instant. Le candidat venait de dire : « ${last.slice(0, 400)} ». Réponds-lui maintenant, naturellement, sans commenter la coupure.`
        : "la connexion a été coupée un instant. Demande simplement au candidat de répéter, en quelques mots, sans commenter la coupure."
      : last
        ? `le candidat venait de dire : « ${last.slice(0, 400)} ». Réponds-lui maintenant, naturellement, dans ton rôle, sans te représenter.`
        : "demande simplement au candidat de répéter sa dernière phrase, en quelques mots, dans ton rôle, sans te représenter.";
    st.lastCandidateText = "";
    await rt.prompt(line);
    if (phaseNow() !== "listening" && !st.stopRequested && st.rt === rt) void rtListen();
  }

  /** The exchange: she says the cue with her own voice, then the candidate has the floor. No connection: a band and Retry. */
  async function beginLive() {
    const st = R.current;
    const plan = st.plan;
    if (!plan || st.phase === "listening" || st.phase === "examiner" || st.phase === "connecting") return;
    setPhaseBoth("connecting");
    setLeft(plan.timing.speakS);
    const rt = await (st.rtP ?? rtConnect());
    st.rtP = null;
    if (st.stopRequested) {
      rt?.close();
      return;
    }
    if (!rt) {
      raiseTrouble(w.troubleLive, retryLive, () => void abandon());
      return;
    }
    clearTrouble();
    st.rt = rt;
    (voice.current ??= new OutputLevel()).attachStream(rt.stream);
    setPhaseBoth("examiner");
    setLeft(plan.timing.speakS);
    if (!plan.opening.text) {
      // connected only now (a retry): she says the opening she could not say, then the floor is the candidate's
      if (!st.openingSpoken && st.openingScript && plan.timing.prepS === 0) {
        st.openingSpoken = true;
        st.replaceNextLog = st.openingScript;
        await rt.say(st.openingScript);
        if (phaseNow() !== "listening" && !st.stopRequested && st.rt) void rtListen();
        return;
      }
      void rtListen();
      return;
    }
    st.replaceNextLog = plan.opening.text;
    await say(plan.opening);
    if (phaseNow() !== "listening" && !st.stopRequested && st.rt) void rtListen();
  }

  function retryLive() {
    const st = R.current;
    if (st.rt || st.rtP || st.phase !== "connecting") return;
    st.rtP = rtConnect();
    st.phase = "intro"; // so beginLive runs again
    void beginLive();
  }

  /** Her turn is over (or never came): the candidate's next answer is recorded from here. */
  async function rtListen() {
    const st = R.current;
    st.busy = false;
    setSpeaking(false);
    setPondering(false);
    if (st.stopRequested || !st.rt || st.phase === "intro" || st.phase === "prep" || st.phase === "preparing") return;
    // Tâche 2: her answer is over and too little time remains for another question: she closes
    if (st.clockStart && st.plan?.taskNo === 2 && !canAsk(st.plan.timing, clock())) {
      st.stopRequested = true;
      void hardStop("close");
      return;
    }
    if (!st.clockStart) st.clockStart = Date.now(); // the official time starts when the candidate first has the floor
    const taskNo = st.plan?.taskNo ?? 2;
    // a presentation or a development may pause longer than an answer before she takes her turn
    st.rt.setSilence(taskNo === 2 ? 800 : !st.introDone ? (taskNo === 1 ? 2000 : 5000) : 1500);
    st.rt.setMic(true);
    if (!st.rt.speaking) {
      setPressing(false);
      st.segStart = Date.now();
      st.lastSpeechAt = Date.now();
      st.spoke = false;
      st.segCount += 1;
    }
    setPhaseBoth("listening");
    if (!st.recOn) {
      st.recOn = true;
      await rec.start().catch(() => (st.recOn = false));
    }
  }

  /** Long silence: the fixed exam line, said by her; her audio stop gives the floor back. */
  async function rtRelance() {
    const st = R.current;
    if (!st.rt || !st.plan || st.busy) return;
    st.busy = true;
    st.busySince = Date.now();
    st.recOn = false;
    await rec.stop();
    setPhaseBoth("examiner");
    void st.rt.say(st.plan.relance.text);
  }

  const rtHandlers = {
    onSpeechStarted: () => {
      const st = R.current;
      if (!st.rt || st.stopRequested) return;
      st.spoke = true;
      st.turnStartAt = Math.max(0.01, elapsed());
      setRtRecording(true);
      setMoodFor("neutral");
      if (!st.recOn) {
        // cutting in while she speaks: the recorder was off
        st.recOn = true;
        st.segStart = Date.now();
        void rec.start().catch(() => (st.recOn = false));
      }
    },
    onSpeechStopped: () => {
      const st = R.current;
      if (st.closing) {
        // the task is being closed: the recorder is stopped by hardStop, after her first words (the tail)
        setRtRecording(false);
        setPressing(false);
        return;
      }
      if (!st.rt || !st.spoke) return;
      st.spoke = false;
      st.busy = true;
      st.busySince = Date.now();
      if (st.plan?.taskNo !== 2 && st.segCount === 1) st.introDone = true;
      st.speechEndAt = st.lastSpeechAt || Date.now();
      st.latencyMs = null;
      setRtRecording(false);
      setMoodFor("warm", 2500); // she has heard you
      setPondering(true);
      setPressing(false);
      st.recOn = false;
      st.lastUploadP = rec.stop().then((res) => {
        if (res.durationS >= 0.5 && res.blob.size > 1500) void upload(res);
      });
      // Tâches 1 and 3: too little time for another question: her closing line replaces the question
      if (st.plan && st.plan.taskNo !== 2 && st.clockStart && !st.stopRequested && !canAsk(st.plan.timing, clock())) {
        st.stopRequested = true;
        void hardStop("close");
      }
    },
    onCandidateText: (text: string) => {
      // Google's own transcription of the turn, attached to the answer just uploaded
      const st = R.current;
      st.lastCandidateText = text;
      const seq = st.seq;
      const up = st.uploads.get(seq);
      const clipId = st.clipIds.get(seq);
      if (!seq || !up || !clipId) return;
      const tn = curTaskNo();
      st.pending.push(up.then(() => logLater({ taskNo: tn, clipId, candidateText: text })).catch(() => null));
    },
    onAudioStart: () => {
      const st = R.current;
      if (!st.rt) return;
      if (st.speechEndAt) st.latencyMs = Date.now() - st.speechEndAt;
      st.speechEndAt = 0;
      st.busy = true;
      st.busySince = Date.now();
      setPondering(false);
      setSpeaking(true);
      if (st.phase === "listening") setPhaseBoth("examiner");
    },
    onAudioStop: () => {
      const st = R.current;
      // her question has just ended: the answer keeps its time from here (Tâches 1 and 3)
      if (st.rt && st.plan?.taskNo !== 2 && /\?\s*$/.test(st.lastExaminerLine) && st.phase !== "stopping") st.questionEndAt = elapsed();
      if (st.rt && st.phase !== "stopping") void rtListen();
    },
    onExaminerText: (heard: string) => {
      const st = R.current;
      if (!st.rt) return;
      if (st.closing && /…$/.test(heard)) return; // a line of hers cut by the closing line
      const text = st.replaceNextLog ?? heard;
      const scripted = st.replaceNextLog != null;
      st.replaceNextLog = null;
      if (scripted && !text) return;
      st.lastCandidateText = "";
      logLine(text, st.latencyMs);
      st.latencyMs = null;
      st.lastExaminerLine = text;
      // what she just said sets her face while she waits
      if (/pardon|r[ée]p[ée]t|vous parlez de|tu parles de|c'est bien (ça|de ça)|vous voulez dire|tu veux dire|pas (bien )?compris/i.test(text)) setMoodFor("puzzled");
      else if (/arrêter là|merci/i.test(text) && st.phase === "stopping") setMoodFor("warm");
      else if (/\?\s*$/.test(text)) setMoodFor("curious");
      else setMoodFor("neutral");
      if (st.plan?.taskNo === 1 && st.introDone && st.phase !== "stopping") st.asked += 1;
    },
    onClosed: (reason: string, info: { self: LiveExaminer; model: string; resumeHandle: string | null }) => {
      // connection lost: the task is FROZEN (clock stopped, answers kept) and the session reopened; it never ends here
      const st = R.current;
      if (st.rt && st.rt !== info.self) return; // an older session closing late
      const partial = info.self.heardSoFar;
      st.rt = null;
      st.busy = false;
      setSpeaking(false);
      setPondering(false);
      setPressing(false);
      if (st.stopRequested || st.phase === "stopping" || st.phase === "done") return;
      if (st.phase === "listening" || st.phase === "examiner") {
        freeze();
        if (st.recOn) {
          st.recOn = false;
          const spoke = st.spoke;
          st.spoke = false;
          void rec.stop().then((res) => {
            if (spoke && res.durationS >= 0.5 && res.blob.size > 1500) upload(res);
          });
          if (spoke && partial) st.lastCandidateText = partial;
        }
        setPhaseBoth("reconnecting");
        void rtRecover(info, reason);
      } else if (st.phase === "prep" || st.phase === "intro" || st.phase === "preparing") {
        // before the exchange: reopened quietly in the background
        st.rtP = rtConnect({ lastModel: info.model, avoid: /internal error|code 10(08|11)/i.test(reason) ? [info.model] : [] });
      }
    },
  };

  function rtClose() {
    const st = R.current;
    st.rt?.close();
    st.rt = null;
    st.rtP = null;
  }

  /** An answer ended: the clip stays in this browser (clips.ts); the server learns its id and timing with the next
   *  speaking-log request (about once a minute, and before the task is marked). A log that fails is kept and sent again
   *  with the next one; the clip itself travels in the finish form in any case. */
  function upload(res: StopResult): Promise<unknown> {
    const st = R.current;
    const taskNo = curTaskNo();
    const seq = ++st.seq;
    const clipId = newClipId();
    st.clipIds.set(seq, clipId);
    const item = { taskNo, clipId, register: true, durationS: res.durationS, elapsedS: elapsed() };
    const p = keepClip({ clipId, sessionId: s.sessionId, taskNo, blob: res.blob, durationS: res.durationS })
      .catch(() => null)
      .then(() => logLater(item));
    st.pending.push(p);
    st.uploads.set(seq, p);
    return p;
  }

  function logLine(text: string, latencyMs?: number | null) {
    logLater({ taskNo: curTaskNo(), examinerText: text, elapsedS: elapsed(), ...(latencyMs != null ? { latencyMs } : {}) });
  }

  /**
   * The end of a task, by her voice, never by the clock alone: « cut » (she speaks up over a candidate still talking
   * past the grace; Tâche 2, a question started too late: she says why), « close » (nobody is speaking: the plain
   * closing line), « user » (the candidate stopped). The recording goes on `tailS` after her first word. Then ONE
   * breath to the next task: its examiner (connected ahead) says the close, the transition and the next opening as
   * a single line; after the last task, the close and the goodbye, while the marking already runs.
   */
  async function hardStop(reason: "cut" | "close" | "user") {
    const st = R.current;
    const plan = st.plan;
    if (!plan) return;
    const closing = plan.closing;
    const user = reason === "user" || st.stopRequestedByUser;
    const cut = reason === "cut" && !user;
    const late = cut && plan.taskNo === 2 && !questionDeservesAnswer(plan.timing, clock());
    const line = late && closing?.lateQuestion ? closing.lateQuestion : cut && closing?.cut.length ? closing.cut[Math.floor(Math.random() * closing.cut.length)] : plan.stop;
    const wasRecording = st.recOn;
    const spoke = st.spoke;
    st.closing = true;
    unfreeze();
    clearTrouble();
    setPondering(false);
    setPhaseBoth("stopping");
    setMoodFor("neutral");
    const task = s.tasks[st.taskIdx];
    const hasNext = st.taskIdx < s.tasks.length - 1;
    const endedAt = elapsed();
    const nextRt = hasNext && !user && st.nextTaskIdx === st.taskIdx + 1 && st.rtNextP ? await Promise.race([st.rtNextP, new Promise<null>((r) => setTimeout(() => r(null), 2500))]) : null;
    const nextPlan = nextRt && st.nextPlanP ? await Promise.race([st.nextPlanP.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 1500))]) : null;
    const nextScript = nextPlan ? [...nextPlan.intro.map((l) => l.text), ...nextPlan.subject].filter(Boolean).join(" ") : "";
    const handoff = !!(nextRt && !nextRt.isClosed && nextPlan);
    let stopP: Promise<void>;
    if (handoff) {
      // the old connection goes; the new one speaks at once. The close is filed with the task that ends.
      rtClose();
      st.rt = nextRt;
      (voice.current ??= new OutputLevel()).attachStream(nextRt!.stream);
      logLater({ taskNo: task.taskNo, examinerText: line.text, elapsedS: endedAt });
      st.replaceNextLog = nextScript;
      stopP = nextRt!.say(`${line.text} ${nextScript}`);
    } else if (st.rt) {
      const farewell = !hasNext && !user && closing?.farewell ? ` ${closing.farewell.text}` : "";
      st.replaceNextLog = line.text;
      stopP = st.rt.sayNow(`${line.text}${farewell}`, true); // her line replaces the reply she was preparing
    } else stopP = say(line, true);
    if (wasRecording) {
      // the recording goes on a moment after she starts: the candidate's last words are kept
      await new Promise((r) => setTimeout(r, plan.timing.tailS * 1000));
      const res = await rec.stop();
      st.recOn = false;
      if (res.durationS >= 1 && spoke) void upload(res);
    }
    st.spoke = false;
    await st.lastUploadP?.catch(() => null);
    const uploads = [...st.pending];
    // the answers are on the server (or kept here): the task is marked in the background once its last answer is in
    setPending((p) => ({ ...p, [task.taskNo]: { durationS: endedAt } }));
    void Promise.all(uploads).then(() => finishAndScore(task.taskNo, endedAt));
    if (hasNext && handoff) {
      // she speaks first; the next room opens when she reaches the next task's opening
      const rt = nextRt!;
      const until = Date.now() + 5000;
      while (!rt.talking && !rt.isClosed && Date.now() < until) await new Promise((r) => setTimeout(r, 80));
      const lead = `${line.text} ${nextPlan!.intro.map((l) => l.text).join(" ")}`;
      await Promise.race([stopP, new Promise((r) => setTimeout(r, Math.max(1500, lead.length * 58)))]);
      st.rt = null;
      void runTask(st.taskIdx + 1, Promise.resolve(nextPlan!), Promise.resolve(rt), stopP);
      return;
    }
    await stopP;
    setSpeaking(false);
    rtClose();
    if (hasNext) await runTask(st.taskIdx + 1);
    else setPhaseBoth("done");
  }

  /** Marks a task: its clips travel once in the finish form. A failure stays pending: Retry, and a later visit tries again. */
  async function finishAndScore(taskNo: TaskNo, durationS: number): Promise<void> {
    const task = s.tasks.find((t) => t.taskNo === taskNo)!;
    setPending((p) => ({ ...p, [taskNo]: { durationS } }));
    // Google's text of the last answer can still be on its way (it is posted after the upload): a short breath, then
    // everything pending is awaited, so the transcript scored is the whole one
    await new Promise((r) => setTimeout(r, 800));
    await Promise.all([...R.current.pending]).catch(() => null);
    await flushLog();
    try {
      const d = await finishTask(s.sessionId, taskNo, durationS, LISTENING_TIMEOUT_MS);
      const view: TaskView = { taskNo, sessionId: s.sessionId, prompt: task.prompt, turns: d.transcript.map((u) => ({ role: u.role, text: u.text, clipId: u.clipId })), score20: d.score20, level: d.level, nclc: d.nclc, feedbackJson: d.evaluation ? JSON.stringify(d.evaluation) : null, detailJson: d.detail ? JSON.stringify(d.detail) : null };
      setResults((x) => ({ ...x, [taskNo]: view }));
      if (d.summary) setSummary(d.summary);
      setPending((p) => {
        const { [taskNo]: _gone, ...rest } = p;
        void _gone;
        return rest;
      });
    } catch (e) {
      setFailures((x) => ({ ...x, [taskNo]: explainFailure(e, lang) }));
      setPending((p) => ({ ...p, [taskNo]: { durationS, failed: true } }));
    }
  }

  function retryPending(taskNo: TaskNo) {
    const p = pendingRef.current[taskNo];
    if (p) void finishAndScore(taskNo, p.durationS);
  }

  /* ---------- the stop sheet ---------- */

  function askStop() {
    if (R.current.stopRequested) return;
    freeze();
    setAsking(Date.now());
  }
  function resumeFromSheet() {
    const st = R.current;
    if (asking && st.phase === "prep") st.prepEnd += Date.now() - asking;
    setAsking(null);
    unfreeze();
  }
  function stopHere() {
    setAsking(null);
    if (R.current.stopRequested) return;
    R.current.stopRequestedByUser = true;
    R.current.stopRequested = true;
    void hardStop("user");
  }
  /** The current task is dropped: hang up, drop the recording, back to the page. A session with nothing handed in yet
   *  is erased; one with a task already marked or being marked is closed as abandoned and keeps those marks. */
  async function abandon() {
    const st = R.current;
    setAsking(null);
    setLeaving(true);
    st.stopRequested = true;
    st.stopRequestedByUser = true;
    try {
      rtClose();
      voice.current?.close();
      if (st.recOn) await rec.stop();
    } catch {}
    // the mock: the stage ends as abandoned; the mock's own routes close the session
    if (mock) { mock.onStageEnd("abandon"); return; }
    const keep = Object.keys(resultsRef.current).length > 0 || Object.keys(pendingRef.current).length > 0;
    try {
      if (keep) await fetch(`/api/expr/session/${s.sessionId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "abandoned" }) });
      else await fetch(`/api/expr/session/${s.sessionId}`, { method: "DELETE" });
    } catch {}
    try {
      localStorage.removeItem(pKey);
    } catch {}
    onExit();
  }

  /** Push to talk: press to speak, press again when done. */
  function togglePress() {
    const st = R.current;
    if (!st.rt || st.phase !== "listening" || st.busy) return;
    if (pressing) st.rt.pressEnd();
    else st.rt.pressStart();
    setPressing(!pressing);
  }

  /* ---------- the keyboard: Space = push to talk / end my answer, Escape = the stop sheet ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (document.querySelector("dialog[open]")) return;
      const st = R.current;
      if (e.key === " " || e.code === "Space") {
        if (t && t.tagName === "BUTTON") return;
        e.preventDefault();
        if (st.micMode === "ptt") togglePress();
        else if (st.phase === "listening" && st.rt?.speaking) st.rt.endTurn();
      } else if (e.key === "Escape") {
        e.preventDefault();
        askStop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressing]);

  /* ---------- the screens ---------- */

  if (hall) return <Hallway title={w.eo} sub={w.about12} ai onDone={() => setHall(false)} lang={lang} />;

  const cur = s.tasks[idx];
  const cfg = SPEAKING.tasks[cur.taskNo];
  const live = phase === "listening" || phase === "examiner" || phase === "reconnecting" || phase === "stopping" || phase === "connecting";

  // the mock: every task handed in (marked or being marked) ends the stage; the sitting's marking screen takes over
  if (done && mock) return <MockStageDone onDone={() => mock.onStageEnd("done")} />;
  if (done) {
    const views = s.tasks.map((t) => results[t.taskNo] ?? drafts[t.taskNo]).filter(Boolean);
    return (
      <SessionResults
        skill="speaking"
        sessionId={s.sessionId}
        views={views}
        summary={summary}
        selected={s.tasks.map((t) => t.taskNo)}
        pending={Object.fromEntries(Object.entries(pending).map(([k, v]) => [k, v.failed ? "failed" : "running"]))}
        failures={failures}
        onRetry={retryPending}
        onExit={onExit}
        lang={lang}
      />
    );
  }

  // the left column holds what is written: Tâche 2's situation and notes, Tâche 3's question (said at the exam; its
  // text waits hidden). Tâche 1 has none: she sits alone in the middle. The examiner keeps the same frame in every phase.
  const showQuestion = cur.taskNo === 3 && (phase === "intro" || live);
  const side = (cur.taskNo === 2 && (phase === "intro" || phase === "prep" || live)) || showQuestion;
  const retryIn = trouble?.retryAt ? Math.max(0, Math.ceil((trouble.retryAt - now) / 1000)) : null;
  const onRetryNow = () => {
    if (!trouble) return;
    const t = troubleRef.current;
    if (t.timer) clearTimeout(t.timer);
    t.timer = null;
    if (trouble.final) t.attempts = 0;
    setTrouble(null);
    trouble.retry();
  };
  return (
    <>
      <StopDialog open={asking != null} canScore={R.current.spoke || R.current.seq > 0} onResume={resumeFromSheet} onStop={stopHere} onAbandon={() => void abandon()} lang={lang} />
      <BusyOverlay message={leaving ? w.leaving : phase === "preparing" ? w.prepMessage : null} lang={lang} />
      <Station
        skill="speaking"
        steps={s.tasks.map((t, i) => ({ taskNo: t.taskNo, done: !!results[t.taskNo] || !!pending[t.taskNo], active: i === idx }))}
        secondsLeft={phase === "prep" || live ? left : cfg.speakSeconds}
        running={(phase === "prep" || live) && phase !== "stopping"}
        warnUnder={WARN_S}
        blinkUnder={BLINK_S}
        lang={lang}
        sub={mock?.sub}
        foot={
          <div className="eo-controls">
            <Button kind="quiet" className="room-finish" onClick={askStop} disabled={phase === "stopping" || leaving} aria-label={w.finish}><Icon name="stop" size={18} className="mob-only icon-fill" /><span className="desk-only">{w.finish}</span></Button>
            <div className="eo-mic" style={{ "--lvl": phase === "listening" ? Math.min(1, rec.level * 6) : 0 } as CSSProperties}>
              {micMode === "ptt" ? (
                <button type="button" className="btn-mic" data-rec={pressing} onClick={togglePress} disabled={phase !== "listening" || pondering} aria-pressed={pressing} aria-label={pressing ? w.endAnswer : w.speak}>
                  <span className="mic-ring" aria-hidden="true" />
                  <MicGlyph off={pressing} />
                  <span>{pressing ? w.stopAnswer : w.speak}</span>
                </button>
              ) : (
                <div className="voice-bars" data-idle={phase !== "listening"} data-heard={rtRecording} role="status" aria-label={phase === "listening" ? w.voiceHeard : undefined}>
                  {[4, 3, 2, 1, 0, 1, 2, 3, 4].map((age, i) => <span key={i} style={{ "--lvl": lvlHist[age] } as CSSProperties} />)}
                </div>
              )}
            </div>
            <span />
          </div>
        }
      >
        <div className="room-body eo-room" data-side={side}>
          <aside className="eo-side" aria-hidden={!side}>
            {side && (cur.taskNo === 2 ? (
                <>
                  <div className="card pad eo-card" data-unfolded={sitOpen || undefined}>
                    <div className="eo-question-head"><span className="sim-caps">{w.situation}</span><TacheTag n={cur.taskNo} /><button type="button" className="ee-fold mob-only" aria-expanded={sitOpen} onClick={() => setSitOpen((x) => !x)}><Icon name="chevronDown" size={14} className={sitOpen ? "flipy" : ""} /></button></div>
                    <p className="eo-consigne">{cur.prompt.consigne}</p>
                  </div>
                  <label className="eo-notes">
                    <span className="sim-caps">{phase === "prep" || phase === "intro" ? w.notesPrep : w.notes}</span>
                    <textarea className="sim-paper" value={notes} onChange={(e) => setNotes(e.target.value)} readOnly={phase !== "prep" && phase !== "intro"} spellCheck={false} autoCorrect="off" autoCapitalize="off" />
                  </label>
                </>
              ) : (
                <div className="card pad eo-card eo-question" data-open={questionOpen}>
                  <div className="eo-question-head">
                    <span className="sim-caps">{w.question}</span>
                    <Button kind="quiet" size="sm" aria-expanded={questionOpen} onClick={() => setQuestionOpen((x) => !x)}>{questionOpen ? w.hideText : w.showText}</Button>
                  </div>
                  <p className="eo-question-text eo-consigne" aria-hidden={!questionOpen}>{cur.prompt.consigne}</p>
                </div>
              ))}
          </aside>
          <section className="eo-stage">
            <Interviewer speaking={speaking} listening={phase === "listening" && !pondering} pondering={!speaking && (pondering || phase === "examiner" || phase === "intro" || phase === "stopping")} thinking={phase === "prep" || phase === "connecting" || phase === "preparing"} mood={mood} level={() => voice.current?.get() ?? null} lang={lang} />
            <span className="eo-status mob-only" data-on={phase === "listening" || speaking || undefined}><i aria-hidden="true" />{speaking ? w.statusSpeaking : phase === "listening" ? w.statusListening : phase === "prep" ? w.statusPrep : w.statusThinking}</span>
            <p className="eo-caption">{caption ?? ""}</p>
            {micError ? (
              <Trouble message={micError === w.noRecorder ? micError : w.troubleMic} onQuit={() => void abandon()} onRetry={micError === w.noRecorder ? undefined : () => { setMicError(null); void startFrom(R.current.taskIdx); }} lang={lang} />
            ) : trouble ? (
              <Trouble message={trouble.message} final={trouble.final} retryIn={retryIn} onRetry={onRetryNow} onQuit={trouble.quit} link={trouble.link} lang={lang} />
            ) : null}
          </section>
        </div>
      </Station>
    </>
  );
}

/** the mock: calls `onDone` once when the speaking stage is over (a plain element, so the hooks above stay in order) */
function MockStageDone({ onDone }: { onDone: () => void }) {
  const once = useRef(false);
  useEffect(() => { if (!once.current) { once.current = true; onDone(); } }, [onDone]);
  return <div className="boot" aria-busy="true" />;
}
