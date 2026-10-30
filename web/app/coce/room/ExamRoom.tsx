// The exam room (UX §2.6): the server's deadline on the clock, a bar of what is answered, no help. `attempt.mode` decides the rest.
// Real exam mode (`exam`): CO plays each recording once, Suivant stays shut until it has ended, then the question keeps
// 2100 s / 39 minus the recording's length (6 s at least) — the grace line drains over that span — and the next
// question comes by itself, no going back; CE moves freely between the questions, as at the real test. Free mode
// (`training`): everything moves freely, CO may replay and scrub. The clock runs the same in both.
// Answers are kept in this browser at once (localStorage, under the attempt's id) and reach the server only when they
// must (the free plan counts every request): with the finish itself, and when the tab hides or the room is left (a
// keepalive PATCH, so another device can take over). Choosing an option or playing a recording sends nothing. The
// footer is
// the one every room shares: Terminer (red) at the left, Précédent · Suivant at the right. Terminer ends the exam now
// (unanswered questions count wrong) after a sheet that lists them; Quitter (Escape, the browser's back) asks too; time
// up freezes the room one second at 00:00, then the result.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, Sheet } from "../../../ui/ui.tsx";
import type { Lang } from "../../i18n.ts";
import type { Key, Question, Section } from "../bank.ts";
import { DURATION_MIN, EXAM_QUESTIONS, placementOf, type Attempt } from "./attempt.ts";
import { Shell, type Progress } from "./Shell.tsx";
import { Player, type PlayerHandle } from "./Player.tsx";
import { Passage } from "./Passage.tsx";
import { Options } from "./Options.tsx";
import { Picker, type PickTone } from "./Picker.tsx";
import { Rail, type RailHandle } from "./Rail.tsx";
import { call, serverNow, useKeys, useOnline, usePhone } from "./hooks.ts";
import { keep } from "../../api-cache.ts";
import { useRoomWords } from "./words.ts";
import type { MockHooks } from "../../mock/shell.tsx";

export type ExamRoomProps = {
  /** the attempt was created a moment ago on this device: the server holds nothing this browser lacks, no request */
  fresh?: boolean;
  section: Section;
  exam: number;
  attempt: Attempt;
  questions: Question[];
  lang: Lang;
  onFinished: (attempt: Attempt) => void;
  onLeave: () => void;
  /** a stage of the mock exam (docs/MOCK-EXAM.md §2.3): the mock's top line and clock, its store, its end */
  mock?: MockHooks;
};


const RETRY_MS = 10_000;
/** answers wait this long after the last change before they are sent (a few requests an exam, not one per click) */
const SEND_AFTER_MS = 20_000;
/** the real CO exam: the time a question keeps after its recording = the exam's seconds a question − the recording */
const SECONDS_A_QUESTION = (DURATION_MIN.co * 60) / EXAM_QUESTIONS;
const MIN_AFTER_RECORDING_S = 6;
type Phase = "run" | "frozen" | "finishing" | "failed";

export function ExamRoom({ section, exam, attempt, questions, lang, onFinished, onLeave, mock, fresh }: ExamRoomProps) {
  const w = useRoomWords(lang);
  const online = useOnline();
  const phone = usePhone();
  const total = questions.length;
  const mockStage = mock ? mock.stage as "co" | "ce" : null;
  // this browser keeps a copy of the answers under the attempt's id: a PATCH that never arrived (the network dropped,
  // the tab was closed within the two seconds, the session expired) is not lost on the next opening — the copy is
  // laid over the server's and sent again. Gone when the attempt is over.
  const localKey = `tcfm-exam-${attempt.id}`;
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (mock && mockStage) return { ...mock.store.answers(mockStage) };
    let kept: Record<string, string> = {};
    try { const v = JSON.parse(localStorage.getItem(localKey) ?? "null"); if (v && typeof v === "object" && !Array.isArray(v)) kept = v; } catch { /* none */ }
    return { ...(attempt.answers ?? {}), ...kept };
  });
  const [idx, setIdx] = useState(() => {
    const i = questions.findIndex((q) => !answers[placementOf(q)]);
    const first = i < 0 ? Math.max(0, total - 1) : i;
    // the mock: back where the person was (never before the first unanswered question in the strict listening stage)
    const kept = mock && mockStage ? mock.store.state.cursor[mockStage] : null;
    if (kept != null && kept >= 0 && kept < total) return section === "co" && attempt.mode !== "training" ? Math.max(kept, first) : kept;
    return first;
  });
  /** the mock: the current question's recording was already heard before a reload (it does not play again) */
  const heardBefore = useRef(mock && mockStage ? mock.store.state.heard[mockStage] : null);
  const [phase, setPhase] = useState<Phase>("run");
  const [left, setLeft] = useState(() => (mock ? (mock.endsAt == null ? DURATION_MIN[section] * 60 : (mock.endsAt - serverNow()) / 1000) : (Date.parse(attempt.deadlineAt) - serverNow()) / 1000));
  const [picker, setPicker] = useState(false);
  const [sheet, setSheet] = useState<"finish" | "leave" | null>(null);
  const [grace, setGrace] = useState<number | null>(null);
  /** the question whose recording has ended (or failed): only then may the real CO exam move on */
  const [heardId, setHeardId] = useState<string | null>(heardBefore.current);
  const [netDown, setNetDown] = useState(false);
  const player = useRef<PlayerHandle | null>(null);
  const rail = useRef<RailHandle>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const dirty = useRef(false);
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  /** the mock: the stage is entered but its clock has not started (the room is being rendered): nothing plays, the clock stands */
  const pending = !!mock && mock.endsAt == null;
  const deadline = mock ? (mock.endsAt ?? Date.now() + DURATION_MIN[section] * 60_000) : Date.parse(attempt.deadlineAt);
  const q = questions[idx];
  const n = idx + 1;
  const co = section === "co";
  const training = attempt.mode === "training";
  /** the real CO exam's rule: no going back (the reading exam moves freely in both modes, as at the real test) */
  const strictOrder = co && !training;
  /** the real CO exam's rule: one play, wait for its end, the next question by itself */
  const strict = co && !training;
  /** the recording has ended for this question (always true outside the real CO exam) */
  const heard = !strict || heardId === q?.id;

  // ---- the server's answers and clock, once at the door (the mock's store did this already) ----
  useEffect(() => {
    if (mock || fresh) return;
    let alive = true;
    call<{ attempt?: Attempt }>(`/attempts/${attempt.id}`).then(({ status, data }) => {
      if (!alive || status !== 200 || !data.attempt?.answers) return;
      setAnswers((a) => ({ ...data.attempt!.answers, ...a }));
      if (data.attempt.ended) { forget(); onFinished(data.attempt); }
      // whatever this browser holds that the server does not goes out now
      else if (Object.entries(answersRef.current).some(([k, v]) => data.attempt!.answers?.[k] !== v)) schedulePatch();
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.id]);
  useEffect(() => {
    if (mock) return;
    try { if (Object.keys(answers).length) localStorage.setItem(localKey, JSON.stringify(answers)); } catch { /* full or blocked: the server copy stands */ }
  }, [answers, localKey, mock]);
  const forget = useCallback(() => { if (mock) return; try { localStorage.removeItem(localKey); } catch { /* fine */ } }, [localKey, mock]);
  // the mock: the store keeps the three copies and sends by itself; the room only shows its network state
  useEffect(() => { if (!mock) return; setNetDown(mock.store.isNetDown); return mock.store.subscribe(setNetDown); }, [mock]);
  useEffect(() => { if (mock && mockStage) mock.store.setCursor(mockStage, idx); }, [mock, mockStage, idx]);
  useEffect(() => { if (mock && mockStage && q && heardBefore.current === q.id) setGrace(Date.now() + MIN_AFTER_RECORDING_S * 1000); }, [mock, mockStage, q]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the clock (idle at the full time while the mock's stage is pending) ----
  useEffect(() => {
    if (pending) { setLeft(DURATION_MIN[section] * 60); return; }
    const id = setInterval(() => setLeft((deadline - serverNow()) / 1000), 250);
    return () => clearInterval(id);
  }, [deadline, pending, section]);
  // the mock: the room is on screen with its questions: the stage may start
  useEffect(() => { mock?.onReady(); }, [mock]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- sending answers ----
  const unsent = useRef(0);
  const sendPatch = useCallback(async (keepalive = false) => {
    if (mock) { await mock.store.send(keepalive); return; }
    if (patchTimer.current) { clearTimeout(patchTimer.current); patchTimer.current = null; }
    if (!dirty.current) return;
    dirty.current = false;
    unsent.current = 0;
    try {
      const { status } = await call(`/attempts/${attempt.id}`, { method: "PATCH", keepalive, json: { answers: answersRef.current, at: new Date(serverNow()).toISOString() } });
      // 401 (signed out elsewhere) is not a network failure, but the answers did not land: they stay dirty, kept in
      // this browser, and go out when the room reopens after the sign-in
      if (status >= 500 || status === 0 || status === 401) throw new Error(String(status));
      setNetDown(false);
    } catch {
      dirty.current = true;
      setNetDown(true);
      patchTimer.current = setTimeout(() => void sendPatch(), RETRY_MS);
    }
  }, [attempt.id, mock]);
  const schedulePatch = useCallback(() => {
    if (mock) return;
    // marked, and sent SEND_AFTER_MS after the last change (a dead phone or a crash loses at most that much on the
    // server); also with the finish, when the tab hides or the room is left
    dirty.current = true;
    unsent.current++;
    if (patchTimer.current) clearTimeout(patchTimer.current);
    patchTimer.current = setTimeout(() => void sendPatch(), SEND_AFTER_MS);
  }, [sendPatch, mock]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") void sendPatch(true); };
    const unload = (e: BeforeUnloadEvent) => { if (phaseRef.current === "run") e.preventDefault(); };
    const gone = () => void sendPatch(true);
    const back = () => void sendPatch();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", gone);
    window.addEventListener("beforeunload", unload);
    window.addEventListener("online", back);
    return () => {
      document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", gone);
      window.removeEventListener("beforeunload", unload); window.removeEventListener("online", back);
      void sendPatch(true);
    };
  }, [sendPatch]);

  const setAnswer = useCallback((key: Key | "-") => {
    if (!q || phase !== "run" || pending) return;
    setAnswers((a) => ({ ...a, [placementOf(q)]: key }));
    if (mock && mockStage) mock.store.setAnswer(mockStage, placementOf(q), key);
    schedulePatch();
  }, [q, phase, schedulePatch, mock, mockStage, pending]);

  // ---- moving ----
  const go = useCallback((i: number) => { if (i >= 0 && i < total) { setGrace(null); setIdx(i); } }, [total]);
  const next = useCallback(() => { if (!heard) return; if (idx >= total - 1) setSheet("finish"); else go(idx + 1); }, [heard, idx, total, go]);
  useEffect(() => {
    if (grace === null) return;
    const id = setTimeout(() => { setGrace(null); if (phaseRef.current === "run") next(); }, Math.max(0, grace - Date.now()));
    return () => clearTimeout(id);
  }, [grace, next]);
  // a recording that still fails after the player's quiet second try: the strict exam skips the question (it cannot be
  // heard again); in Free mode it stays, « Réessayer » in the player and the four options open
  const onAudioError = useCallback(() => {
    if (!q || !strict) return;
    setAnswer("-");
    setHeardId(q.id);
    setGrace(Date.now() + 1200);
  }, [q, setAnswer, strict]);
  // the real CO exam: the recording has ended; what is left of the question's share of the 35 minutes starts now
  const onRecordingEnded = useCallback(() => {
    if (!q) return;
    const d = player.current?.audio?.duration;
    const allowed = Math.max(MIN_AFTER_RECORDING_S, SECONDS_A_QUESTION - (Number.isFinite(d) ? (d as number) : 0));
    setHeardId(q.id);
    if (mock && mockStage) mock.store.setHeard(mockStage, q.id);
    setGrace(Date.now() + Math.round(allowed * 1000));
  }, [q, mock, mockStage]);

  // ---- ending ----
  // the way the last finish was asked: a failed one is tried again the same way
  const lastEnded = useRef<"done" | "abandon">("done");
  const finish = useCallback(async (ended: "done" | "abandon") => {
    lastEnded.current = ended;
    setSheet(null);
    setPhase("finishing");
    // the mock: its store sends, the stage ends; the sitting goes on to the break (the mock's own routes score it)
    if (mock) {
      // the answers first: a stage closed on the server refuses them afterwards, so a failed send is tried again a few
      // times (two seconds apart) before the stage ends
      for (let i = 0; i < 5; i++) { await sendPatch(); if (!mock.store.unsent) break; await new Promise((r) => setTimeout(r, 2000)); }
      mock.onStageEnd(ended);
      return;
    }
    // the answers not sent yet ride with the finish (one request instead of two)
    if (patchTimer.current) { clearTimeout(patchTimer.current); patchTimer.current = null; }
    const answers = dirty.current ? answersRef.current : undefined;
    dirty.current = false; unsent.current = 0;
    try {
      const { status, data } = await call<{ attempt?: Attempt }>(`/attempts/${attempt.id}/finish`, { json: { ended, answers, at: new Date(serverNow()).toISOString() } });
      if (status < 300 && data.attempt) { forget(); keep(`/attempts/${attempt.id}`, { attempt: data.attempt }); onFinished(data.attempt); return; }
      if (status === 409 || status === 404) {
        const r = await call<{ attempt?: Attempt }>(`/attempts/${attempt.id}`);
        if (r.data.attempt?.ended) { forget(); onFinished(r.data.attempt); return; }
      }
      if (answers) dirty.current = true;
      setPhase("failed");
    } catch { if (answers) dirty.current = true; setPhase("failed"); }
  }, [attempt.id, onFinished, sendPatch, forget, mock]);
  // time up: freeze at 00:00; the one-second wait lives in its own effect keyed on the phase alone (the clock changes
  // `left` four times a second: an effect that owned both would cancel its own timer at every tick and never finish)
  useEffect(() => {
    if (phase !== "run" || left > 0) return;
    setSheet(null);
    setPhase("frozen");
    player.current?.pause();
  }, [left, phase]);
  useEffect(() => {
    if (phase !== "frozen") return;
    const id = setTimeout(() => void finish("done"), 1000);
    return () => clearTimeout(id);
  }, [phase, finish]);
  const leave = async () => { setSheet(null); await sendPatch(true); onLeave(); };

  // the browser's back button (or the phone's back gesture) is a way out like any other: it opens the leave sheet
  // instead of dropping the room at once. One spare history entry sits under the room so the press has something to pop.
  const armed = useRef(false);
  useEffect(() => {
    const arm = () => { history.pushState({ examGuard: true }, "", location.href); armed.current = true; };
    arm();
    const onPop = () => {
      if (!armed.current) return;
      armed.current = false;
      if (phaseRef.current === "run") { arm(); setSheet("leave"); }
    };
    window.addEventListener("popstate", onPop);
    return () => { window.removeEventListener("popstate", onPop); armed.current = false; };
  }, []);

  useKeys(phase === "run" && !!q, {
    digit: (d) => { const o = q?.options[d - 1]; if (o) setAnswer(o.key); },
    enter: next,
    esc: () => setSheet("leave"),
    space: co ? (strict ? () => player.current?.play() : () => player.current?.toggle()) : undefined,
    left: strictOrder ? undefined : () => go(idx - 1),
    right: strictOrder ? undefined : () => go(idx + 1),
  });

  const unanswered = useMemo(() => questions.map((x, i) => (answers[placementOf(x)] ? null : i + 1)).filter((v): v is number => v !== null), [questions, answers]);
  const tone = useCallback((k: number): PickTone => (answers[placementOf(questions[k - 1])] ? "done" : "todo"), [answers, questions]);
  const title = useMemo(() => <span className="cr-title-text">{w[section]}{training ? ` · ${w.training}` : ""}</span>, [section, training, w]);
  const done = total - unanswered.length;
  if (!q) return null;
  const given = answers[placementOf(q)];
  const chosen: Key | null = given === "A" || given === "B" || given === "C" || given === "D" ? given : null;
  const band = !online || netDown ? <><Icon name="wifiOff" size={16} /><span>{w.offlineExam}</span></>
    : phase === "failed" ? <><span>{w.finishFailed}</span><Button size="sm" icon="refresh" onClick={() => void finish(lastEnded.current)}>{w.retry}</Button></> : undefined;

  const leftCol = co ? (
    <>
      <Player ref={player} src={q.audio ?? ""} resetKey={`${attempt.id}/${q.id}/${pending ? "wait" : "live"}`} maxPlays={strict ? (heardBefore.current === q.id ? 0 : 1) : null} scrubber={!strict} autoplay={!pending && !(strict && heardBefore.current === q.id)} locked={strict} lang={lang}
        onEnded={strict ? onRecordingEnded : undefined} onError={onAudioError} />
      {strict && <div className="cr-grace" aria-hidden="true">{grace !== null && <i key={grace} style={{ animationDuration: `${Math.max(0, grace - Date.now())}ms` }} />}</div>}
      <div className="cr-text">{q.image && <img className="cr-picture" src={q.image} alt="" />}</div>
    </>
  ) : (
    <div className="cr-text"><Passage text={q.passage} textEn={null} english={false} /></div>
  );
  const right = (
    <>
      <div className="cr-stem"><p lang="fr">{q.stem}</p></div>
      <Options options={q.options} chosen={chosen} answer={q.answer} reveal={false} disabled={phase !== "run" || (strict && given === "-")} english={false} lang={lang} onPick={setAnswer} />
    </>
  );
  const progress: Progress = { n, total, parts: { done }, onOpen: () => (phone ? setPicker(true) : rail.current?.focus()), label: `${w.questionOf(n, total)} · ${w.done} ${done} · ${w.todo} ${total - done}`, popup: phone };
  // the footer every room shares: Terminer (red) at the left, Précédent · Suivant at the right; Suivant shuts on the
  // last question (Terminer is the way out), and in the real CO exam until the recording has ended
  const last = idx === total - 1;
  // the real listening exam ends by its clock alone (each recording once, the next question by itself): Complete is shut
  // there until the last recording has been heard (then it is the way out, should the sheet that opened by itself be closed)
  // on phones the same buttons, shorter: the red stop, « ‹ », the grid button « 1 / 39 » (the picker), « Suivant › »
  const foot = (
    <>
      <Button kind="quiet" onClick={() => setSheet("finish")} disabled={phase !== "run" || (strict && !(last && heard)) || pending} busy={phase === "finishing"} className="room-finish" aria-label={w.finish}><Icon name="stop" size={18} className="mob-only icon-fill" /><span className="desk-only">{w.finish}</span></Button>
      <span className="cr-foot-mid" />
      {!strictOrder && <Button kind="quiet" onClick={() => go(idx - 1)} disabled={idx === 0} className="cr-prev" aria-label={w.prev}><Icon name="chevronLeft" size={20} className="mob-only" /><span className="desk-only">{w.prev}</span></Button>}
      <Button className="cr-grid mob-only num" aria-haspopup="dialog" onClick={() => setPicker(true)} aria-label={progress.label}><Icon name="grid" size={16} />{n} / {total}</Button>
      <Button kind="primary" onClick={next} className="cr-main" disabled={phase !== "run" || !heard || last || pending}>{w.next}<Icon name="chevronRight" size={20} className="mob-only" /></Button>
    </>
  );
  // the finish sheet: unanswered questions, if any, count wrong; done when every question has its answer
  const whole = unanswered.length === 0;

  return (
    <div data-frozen={phase === "frozen" || undefined} className="cr-exam-wrap">
      <Shell mode="exam" section={section} title={title} sub={mock?.sub} lang={lang}
        code={<b><Icon name={section} size={16} />{section.toUpperCase()}</b>} mid={w.examNo(exam)}
        progress={progress}
        rail={<Rail ref={rail} current={n} total={total} tone={tone} onPick={strictOrder ? undefined : (k) => go(k - 1)} lang={lang} />}
        clock={{ secondsLeft: left, idle: pending, label: left > 0 ? w.timeLeft : w.timeUp }} band={band} left={leftCol} right={right} foot={foot}>
        <Picker open={picker} onClose={() => setPicker(false)} current={n} total={total} tone={tone} onPick={strictOrder ? undefined : (k) => go(k - 1)} lang={lang} />
        {/* the stop sheet: every question as a disc (answered filled in ink, unanswered neutral), the two buttons side by side;
            « Abandonner le test » ends the exam now and scores it (unanswered questions count wrong) */}
        <Sheet open={sheet === "finish"} title={w.finishTitle} onClose={() => setSheet(null)} className="cr-finish"
          actions={<><Button onClick={() => setSheet(null)}>{w.continueExam}</Button>{whole ? <Button kind="primary" onClick={() => void finish("done")}>{w.finish}</Button> : <Button kind="danger" onClick={() => void finish("abandon")}>{w.abandonTest}</Button>}</>}>
          <ul className="cr-cells" aria-label={progress.label}>
            {questions.map((x, i) => <li key={x.id} className="cr-disc" data-tone={answers[placementOf(x)] ? "done" : "todo"} aria-current={i === idx ? "true" : undefined}>{i + 1}</li>)}
          </ul>
          <p>{whole ? w.finishAll : <>{w.unanswered(unanswered.length)} {w.unansweredWrong}</>}</p>
        </Sheet>
        <Sheet open={sheet === "leave"} title={w.leaveTitle} onClose={() => setSheet(null)}
          actions={<><Button onClick={() => setSheet(null)}>{w.stay}</Button><Button kind="primary" onClick={() => void leave()}>{w.leave}</Button></>}>
          <p>{w.leaveBody}</p>
        </Sheet>
      </Shell>
    </div>
  );
}
