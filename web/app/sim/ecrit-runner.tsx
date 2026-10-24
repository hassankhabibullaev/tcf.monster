import { markWriting, within } from "./browser-score";
import { putWork } from "./work";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Button, TacheTag } from "../../ui/ui";
import { WRITING, wordCount, type PromptView, type SessionSummary, type StartedSession, type TaskNo } from "./types";
import { Station, useLeaveGuard } from "./station";
import { SessionResults, type TaskView } from "./session-results";
import { FinishDialog } from "./finish-dialog";
import { FrenchKeys } from "./french-keys";
import { Hallway } from "./hallway";
import { SCORING_TIMEOUT_MS, explainFailure, failureOf, type Failure } from "./scoring-error";
import { useSimWords } from "./words";
import type { Lang } from "../i18n";
import type { MockHooks } from "../mock/shell.tsx";
import { serverNow } from "../coce/room/hooks.ts";

type SubmitResult = { evaluation: unknown | null; detail?: unknown | null; score20: number; level: string; nclc: number; summary: SessionSummary | null };
type Pending = Record<number, "running" | "failed">;
type Progress = { idx: number; results: Record<number, TaskView>; summary: SessionSummary | null; pending?: Pending };

export type EcritRunnerProps = { session: StartedSession; startedAtMs: number; kind: "practice" | "exam"; lang: Lang; onExit: () => void; /** a stage of the mock exam (docs/MOCK-EXAM.md §2.3): the mock's top line and clock, no hallway, the stage ends instead of the results */ mock?: MockHooks };

/**
 * The writing room: one page per task, free movement between them, one clock counting down from the whole test, the
 * subject (and its documents) on the left — it scrolls inside its own panel, the French keys stay pinned under it —,
 * the sheet on the right as tall as the room, the text kept on this device at every keystroke and on the server every
 * 10 s. The footer is the one every room shares: Terminer (red) at the left, the word count in the middle (« 12 mots
 * (60–120) »), Précédent · Suivant at the right; Terminer hands every text in together (the clock at zero does the
 * same); the marks appear together on the results page.
 */
export function EcritRunner({ session: s, startedAtMs, kind, lang, onExit, mock }: EcritRunnerProps) {
  const w = useSimWords(lang);
  const pKey = `tcfm-progress-${s.sessionId}`;
  const draftKey = (n: number) => `tcfm-draft-${s.sessionId}-${n}`;
  const [hall, setHall] = useState(kind === "exam" && !mock);
  const [idx, setIdx] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, TaskView>>({});
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [pending, setPending] = useState<Pending>({});
  const [failures, setFailures] = useState<Record<number, Failure>>({});
  const [left, setLeft] = useState(s.totalSeconds);
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState(false);
  // the phone: the subject folds to its task line (« ⌃ replier » / « ⌄ déplier »), so the sheet has the screen
  const [folded, setFolded] = useState(false);
  const endAt = useRef(mock ? (mock.endsAt ?? Infinity) : startedAtMs + s.totalSeconds * 1000);
  const now = mock ? serverNow : Date.now;
  /** the mock: the stage is entered but its clock has not started (the room is being rendered) */
  const waiting = !!mock && mock.endsAt == null;
  useEffect(() => { if (mock) endAt.current = mock.endsAt ?? Infinity; }, [mock]);
  useEffect(() => { if (mock && hydrated) mock.onReady(); }, [mock, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastSave = useRef(0);
  const submitting = useRef(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const cur = s.tasks[idx];
  const cfg = WRITING.tasks[cur.taskNo];
  const text = texts[cur.taskNo] ?? "";
  const wc = wordCount(text);
  // every text has been sent (scored, being scored, or to be scored again): the exam is over for the candidate
  const done = s.tasks.every((t) => results[t.taskNo] || pending[t.taskNo]);
  useLeaveGuard(hydrated && !done);

  // restore the drafts and the progress (a refresh loses nothing): this browser's copies, and the server's mark of a
  // task already handed in (another device, a cleared browser: then the mark alone)
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(pKey) ?? "null") as Progress | null;
      const res: Record<number, TaskView> = { ...(p?.results ?? {}) };
      for (const task of s.tasks) {
        const st = task.stored;
        if (st && st.status === "done" && st.score20 != null && !res[task.taskNo]) {
          res[task.taskNo] = { taskNo: task.taskNo, sessionId: s.sessionId, prompt: task.prompt, responseText: st.responseText, wordCount: st.wordCount, score20: st.score20, level: st.level, nclc: st.nclc, feedbackJson: st.feedbackJson, detailJson: st.detailJson, versionsJson: st.versionsJson, elsewhere: st.elsewhere };
        }
      }
      setResults(res);
      if (p) {
        setIdx(Math.min(p.idx, s.tasks.length - 1));
        setSummary(p.summary ?? null);
        setPending(Object.fromEntries(Object.keys(p.pending ?? {}).filter((k) => !res[Number(k)]).map((k) => [k, "failed"])));
      }
      const t: Record<number, string> = {};
      // the mock's store keeps a third copy of every draft; the longest copy is the one to trust
      for (const task of s.tasks) { const mine = mock?.store.state.drafts[String(task.taskNo)] ?? ""; const kept = localStorage.getItem(draftKey(task.taskNo)) || task.stored?.responseText || ""; t[task.taskNo] = mine.length > kept.length ? mine : kept; }
      setTexts(t);
    } catch {}
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pKey]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(pKey, JSON.stringify({ idx, results, summary, pending } satisfies Progress));
    } catch {}
  }, [idx, results, summary, pending, pKey, hydrated]);

  const saveNow = useCallback(
    (taskNo: number, body: string) => {
      if (!body.trim()) return;
      lastSave.current = Date.now();
      // the draft is kept on this device only (work.ts): the server never sees the text
      void putWork(s.sessionId, taskNo, { text: body })
        .then(() => {
          setSaved(true);
          setTimeout(() => setSaved(false), 1800);
        })
        .catch(() => {});
    },
    [s.sessionId],
  );
  // autosave: localStorage on every change; the device's work store (work.ts) every 3 minutes, when the task changes
  // and when the tab goes away
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(draftKey(cur.taskNo), text);
    } catch {}
    mock?.store.setDraft(cur.taskNo, text);
    if (Date.now() - lastSave.current > 180_000) saveNow(cur.taskNo, text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, cur.taskNo, hydrated]);
  const shown = useRef<{ taskNo: number; text: string } | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    const before = shown.current;
    if (before && before.taskNo !== cur.taskNo) saveNow(before.taskNo, before.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur.taskNo, hydrated]);
  useEffect(() => { shown.current = { taskNo: cur.taskNo, text }; }, [cur.taskNo, text]);
  // the tab goes away (closed, switched, the phone locked): the text of the moment reaches the server now
  const latest = useRef({ taskNo: cur.taskNo, text });
  latest.current = { taskNo: cur.taskNo, text };
  useEffect(() => {
    const away = () => { if (document.visibilityState === "hidden") saveNow(latest.current.taskNo, latest.current.text); };
    const gone = () => saveNow(latest.current.taskNo, latest.current.text);
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", gone);
    return () => { document.removeEventListener("visibilitychange", away); window.removeEventListener("pagehide", gone); };
  }, [saveNow]);

  /** Marks a text in this browser (the text reaches the server first, as a draft). A failure stays pending (retry). */
  const score = useCallback(
    async (taskNo: TaskNo, prompt: PromptView, body: string) => {
      setPending((p) => ({ ...p, [taskNo]: "running" }));
      try {
        // marked in this browser with the person's own key; the Worker only stores the result (browser-score.ts)
        const d = await within(markWriting(s.sessionId, taskNo, body, (Date.now() - startedAtMs) / 1000), SCORING_TIMEOUT_MS);
        const view: TaskView = { taskNo, sessionId: s.sessionId, prompt, responseText: body, wordCount: wordCount(body), score20: d.score20, level: d.level, nclc: d.nclc, feedbackJson: d.evaluation ? JSON.stringify(d.evaluation) : null, detailJson: d.detail ? JSON.stringify(d.detail) : null };
        setResults((x) => ({ ...x, [taskNo]: view }));
        if (d.summary) setSummary(d.summary);
        setPending((p) => {
          const { [taskNo]: _gone, ...rest } = p;
          void _gone;
          return rest;
        });
      } catch (e) {
        const f = explainFailure(e, lang);
        setFailures((x) => ({ ...x, [taskNo]: f }));
        setPending((p) => ({ ...p, [taskNo]: "failed" }));
      }
    },
    [s.sessionId, startedAtMs, lang],
  );

  /** As at the real test, the candidate moves freely between the tasks: every text stays where it was left. */
  const go = useCallback(
    (to: number) => {
      if (to === idx || to < 0 || to >= s.tasks.length) return;
      saveNow(cur.taskNo, texts[cur.taskNo] ?? "");
      setIdx(to);
    },
    [idx, s.tasks.length, cur.taskNo, texts, saveNow],
  );
  /** The end: every text is handed in together, marked a moment apart in the background. In the mock the texts are
   *  kept on this device as drafts and the stage ends; the sitting's marking screen hands them in (docs/MOCK-EXAM.md §1.11). */
  const finish = useCallback(() => {
    if (submitting.current) return;
    submitting.current = true;
    setConfirm(false);
    if (mock) {
      const saves = s.tasks.map((t) => { const body = texts[t.taskNo] ?? ""; if (!body.trim()) return Promise.resolve(); return putWork(s.sessionId, t.taskNo, { text: body }).then(() => undefined, () => undefined); });
      void Promise.all(saves).then(() => mock.onStageEnd("done"));
      return;
    }
    const todo = s.tasks.filter((t) => !results[t.taskNo] && !pending[t.taskNo]);
    setPending((p) => ({ ...p, ...Object.fromEntries(todo.map((t) => [t.taskNo, "running" as const])) }));
    todo.forEach((t, i) => setTimeout(() => void score(t.taskNo, t.prompt, texts[t.taskNo] ?? ""), i * 1500));
  }, [s.tasks, results, pending, texts, score, mock]);
  const retry = useCallback(
    (taskNo: TaskNo) => {
      const t = s.tasks.find((x) => x.taskNo === taskNo);
      if (t) void score(taskNo, t.prompt, texts[taskNo] ?? "");
    },
    [s.tasks, texts, score],
  );

  // one clock for the whole session; at zero every text goes
  useEffect(() => {
    if (done || hall) return;
    if (waiting) { setLeft(s.totalSeconds); return; }
    const id = setInterval(() => {
      const l = Math.max(0, (endAt.current - now()) / 1000);
      setLeft(l);
      if (l <= 0 && !submitting.current) finish();
    }, 250);
    return () => clearInterval(id);
  }, [done, hall, finish, now, waiting, s.totalSeconds]);

  if (hall) return <Hallway title={w.ee} sub={w.minutes(Math.round(s.totalSeconds / 60))} ai onDone={() => setHall(false)} lang={lang} />;
  if (!hydrated) return null;

  if (done) {
    const views = s.tasks.map((t) => results[t.taskNo] ?? ({ taskNo: t.taskNo, sessionId: s.sessionId, prompt: t.prompt, responseText: texts[t.taskNo] ?? "", wordCount: wordCount(texts[t.taskNo] ?? ""), score20: null, level: null, nclc: null, feedbackJson: null } satisfies TaskView));
    return <SessionResults skill="writing" sessionId={s.sessionId} views={views} summary={summary} selected={s.tasks.map((t) => t.taskNo)} pending={pending} failures={failures} onRetry={retry} onExit={onExit} lang={lang} />;
  }

  const state = wc < cfg.wordsMin ? "under" : wc > cfg.wordsMax ? "over" : "ok";
  const many = s.tasks.length > 1;
  const last = idx === s.tasks.length - 1;
  return (
    <>
      <Station
        skill="writing"
        steps={s.tasks.map((t, i) => ({ taskNo: t.taskNo, done: false, active: i === idx, words: wordCount(texts[t.taskNo] ?? "") }))}
        onSelect={many ? go : undefined}
        secondsLeft={left}
        running={!waiting}
        warnUnder={120}
        blinkUnder={30}
        lang={lang}
        sub={mock?.sub}
        foot={
          <>
            <div className="ee-nav ee-nav-left">
              <Button kind="quiet" className="room-finish" onClick={() => setConfirm(true)} disabled={waiting} aria-label={w.finish}><Icon name="stop" size={18} className="mob-only icon-fill" /><span className="desk-only">{w.finish}</span></Button>
            </div>
            <div className="wc" data-state={state}>
              <span className="wc-n num">{w.words(wc)}</span>
              <span className="wc-range num muted">({cfg.wordsMin}–{cfg.wordsMax})</span>

            </div>
            <div className="ee-nav ee-nav-right">
              {many && <Button kind="quiet" disabled={idx === 0} onClick={() => go(idx - 1)} aria-label={w.prev} className="ee-prev"><Icon name="chevronLeft" size={20} className="mob-only" /><span className="desk-only">{w.prev}</span></Button>}
              {many && <Button kind="primary" disabled={last} onClick={() => go(idx + 1)} aria-label={w.next} className="ee-next"><span className="desk-only">{w.next}</span><Icon name="chevronRight" size={20} className="mob-only" /></Button>}
            </div>
          </>
        }
      >
        <div key={cur.taskNo} className="room-body ee-room ee-turn" data-docs={!!cur.prompt.sourceDocuments?.length}>
          <aside className="ee-consigne" data-folded={folded || undefined}>
            <div className="ee-text">
              <div className="ee-task"><TacheTag n={cur.taskNo} /><span className="sim-caps">{w.taskName[cur.taskNo as TaskNo]}</span><button type="button" className="ee-fold mob-only" aria-expanded={!folded} onClick={() => setFolded((f) => !f)}><Icon name="chevronDown" size={14} className={folded ? "" : "flipy"} />{folded ? w.unfold : w.fold}</button></div>
              {cur.prompt.title && <p className="strong">{cur.prompt.title}</p>}
              <p>{cur.prompt.consigne}</p>
              {!!cur.prompt.sourceDocuments?.length && (
                <div className="ee-docs">
                  {cur.prompt.sourceDocuments.map((d, i) => (
                    <div key={i} className="card pad ee-doc">
                      <div className="sim-caps">{w.document(i + 1)}{d.author ? ` — ${d.author}` : ""}</div>
                      <p>{d.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <FrenchKeys target={area} lang={lang} />
          </aside>
          <section className="ee-editor">
            <textarea
              ref={(el) => {
                area.current = el;
                // back on a task already started: the caret waits at the end of the text
                if (el && !el.dataset.placed) {
                  el.dataset.placed = "1";
                  el.focus();
                  el.setSelectionRange(el.value.length, el.value.length);
                  el.scrollTop = el.scrollHeight;
                }
              }}
              className="sim-paper ee-area"
              value={text}
              onChange={(e) => setTexts((x) => ({ ...x, [cur.taskNo]: e.target.value }))}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="off"
              lang="fr"
              aria-label={w.taskN(cur.taskNo)}
            />
          </section>
        </div>
      </Station>
      <FinishDialog open={confirm} tasks={s.tasks.map((t) => ({ taskNo: t.taskNo, words: wordCount(texts[t.taskNo] ?? ""), min: WRITING.tasks[t.taskNo].wordsMin, max: WRITING.tasks[t.taskNo].wordsMax }))} secondsLeft={left} onBack={() => setConfirm(false)} onFinish={finish} lang={lang} />
    </>
  );
}
