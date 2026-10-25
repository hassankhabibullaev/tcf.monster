// One exam's page, a hero: the exam's name, « 39 questions · 35 min », the status, the choice between the two modes
// (real exam: the real conditions; free: the same questions and clock, free movement), each pick saying in its own
// lines what will happen — the same number of lines, matched pair by pair —, one big Commencer that opens the hallway
// and then the room. While any attempt runs — this exam's or another's — the hero shows it instead, with Reprendre and
// Abandonner, and nothing can be started. Below, the past attempts when there are any, each with its Revoir and a
// small delete control that asks first.
import { cached } from "../../api-cache.ts";
import { useEffect, useMemo, useState } from "react";
import { BackLink, Button, Chip, Empty, Icon, Mark, Sheet } from "../../../ui/ui.tsx";
import { go, linkProps } from "../../../ui/router.ts";
import { longDate, type Lang } from "../../i18n.ts";
import { api } from "../../api.ts";
import { WORDS } from "./words.ts";
import { Nclc } from "./SectionPage.tsx";
import { armStart, countdown, dayOf, deleteAttempt, finishAttempt, isRunning, noteRunning, resultPath, sallePath, serverNow, toMs, useRunning, DURATION_MIN, EXAM_QUESTIONS, type AttemptMode, type AttemptRow, type CoceSection } from "./shared.ts";

export type ExamCardProps = {
  section: CoceSection; exam: number; lang: Lang;
  /** `me.settings` and its saver: accepted from the integrator, read by nothing here any more */
  settings?: Record<string, unknown> | null;
  onSettings?: (patch: Record<string, unknown>) => void | Promise<void>;
};

export function ExamCard({ section, exam, lang }: ExamCardProps) {
  const w = WORDS[lang];
  const [rows, setRows] = useState<AttemptRow[] | null | undefined>(undefined);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    setRows(undefined);
    cached<{ attempts: AttemptRow[] }>(`/attempts?section=${section}`).then((d) => live && setRows((d.attempts ?? []).filter((a) => a.section === section && a.exam === exam))).catch(() => live && setRows(null));
    return () => { live = false; };
  }, [section, exam, tries]);
  const { attempt: running, loaded, set } = useRunning();
  // free mode is chosen when the page opens (the owner, 2026-10-22); the real exam is one press away
  const [mode, setMode] = useState<AttemptMode>("training");
  // the delete sheet: which row, whether the call is on its way, whether it failed
  const [del, setDel] = useState<AttemptRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const sorted = useMemo(() => [...(rows ?? [])].sort((a, b) => toMs(b.startedAt) - toMs(a.startedAt)), [rows]);
  const finished = sorted.filter((a) => !isRunning(a));
  const here = !!running && running.section === section && running.exam === exam;

  async function remove() {
    if (!del) return;
    setBusy(true); setFailed(false);
    try {
      await deleteAttempt(del.id);
      setRows((r) => (r ?? []).filter((a) => a.id !== del.id));
      setDel(null);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  return (
    <div className="section-page cp-page">
      <div className="cp-back-row"><BackLink to={`/${section}/exam`} label={w.allExams} /><span className="cp-back-where mob-only">{w.examsOf(section)}</span></div>

      <section className="card cp-hero" aria-labelledby="cp-hero-title">
        <header className="cp-hero-head">
          <Mark s={section} big iconOnly />
          <b className="cp-hero-no mob-only num" aria-hidden="true">{exam}</b>
          <div className="cp-hero-text">
            <h1 id="cp-hero-title" className="display"><span className="desk-only">{w.examTitle(section, exam)}</span><span className="mob-only">{w.examShort(section)}</span></h1>
            <p className="cp-meta">
              <span>{w.questions(EXAM_QUESTIONS)} · {w.minutes(DURATION_MIN[section])}</span>
              {rows === undefined ? <span className="skeleton cp-skel-chip" /> : (
                <Chip tone={here ? "amber" : finished.length ? "ok" : "new"} dot={here}>{here ? w.running : finished.length ? w.done : w.newExam}</Chip>
              )}
            </p>
          </div>
        </header>

        {running ? (
          <Running attempt={running} lang={lang} onGone={() => set(null)} />
        ) : (
          <>
            {/* the two modes, free first: two picks with their lines on the laptop; one segmented pill on phones, the
                chosen mode's lines listed under it as a checklist */}
            <div className="picks cp-picks" role="group" aria-label={w.modeChoice}>
              {(["training", "exam"] as const).map((m) => (
                <button key={m} type="button" className="pick" aria-pressed={mode === m} onClick={() => setMode(m)}>
                  <b><span className="desk-only">{m === "exam" ? w.modeExam : w.modeTraining}</span><span className="mob-only">{m === "exam" ? w.modeExamShort : w.modeTrainingShort}</span></b>
                  {w.modeLines[m][section].map((l) => <span key={l} className="desk-only">{l}</span>)}
                </button>
              ))}
            </div>
            <ul className="cp-mode-lines mob-only">
              {w.modeLines[mode][section].map((l) => <li key={l}><Icon name="check" size={14} />{l}</li>)}
              <li className="cp-mode-clock"><Icon name="clock" size={14} />{w.lineClock}</li>
            </ul>
            <p className="cp-hero-line desk-only">{w.lineClock}</p>
            <Button kind="primary" className="cp-hero-start" disabled={!loaded} onClick={() => { armStart(section, exam); go(sallePath({ section, exam, mode })); }}>{w.start}</Button>
          </>
        )}
      </section>

      {rows === undefined ? (
        <div className="cp-attempts" aria-busy="true">{[0, 1].map((i) => <div key={i} className="skeleton cp-skel-row" />)}</div>
      ) : rows === null ? (
        <Empty icon={section} title={w.failed}><Button size="sm" icon="refresh" onClick={() => setTries((n) => n + 1)}>{w.retry}</Button></Empty>
      ) : sorted.length > 0 && (
        <section className="cp-past">
          <h2>{w.pastAttempts}</h2>
          <ul className="cp-attempts">
            {sorted.map((a) => (
              <li key={a.id} className="card cp-attempt">
                <span className="cp-attempt-date">{longDate(dayOf(a.startedAt), lang)}</span>
                <span className="cp-attempt-mode"><Chip tone={a.mode === "training" ? "sun" : "muted"}>{w.modeShort[a.mode === "training" ? "training" : "exam"]}</Chip></span>
                {isRunning(a) ? (
                  <>
                    <span className="cp-attempt-score"><Chip tone="amber" dot>{w.running}</Chip></span>
                    <span />
                    <Button size="sm" className="cp-attempt-open" onClick={() => go(sallePath(a))}>{w.resume}</Button>
                    <span className="cp-attempt-del" />
                  </>
                ) : (
                  <>
                    <span className="cp-attempt-score num">{a.score ?? "—"}<span className="muted small"> / 699</span></span>
                    <span className="cp-attempt-nclc"><Nclc n={a.nclc} lang={lang} />{a.ended && a.ended !== "done" && <Chip tone={a.ended === "abandon" ? "bad" : "amber"}>{a.ended === "abandon" ? w.abandoned : w.timedOut}</Chip>}</span>
                    <a className="btn sm cp-attempt-open" aria-label={w.review} {...linkProps(resultPath(a))}><span className="desk-only">{w.review}</span><Icon name="eye" size={16} className="mob-only" /></a>
                    <button type="button" className="hist-del cp-attempt-del" aria-label={w.deleteAttempt} title={w.deleteAttempt} onClick={() => { setFailed(false); setDel(a); }}><Icon name="x" size={16} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Sheet open={del !== null} title={w.deleteTitle} onClose={() => !busy && setDel(null)} actions={<>
        <Button onClick={() => setDel(null)} disabled={busy}>{w.cancel}</Button>
        <Button kind="danger" busy={busy} onClick={remove}>{w.deleteAttempt}</Button>
      </>}>
        <p>{w.deleteBody}</p>
        {failed && <p className="bad-text">{w.failed}</p>}
      </Sheet>
    </div>
  );
}

/** the hero while an attempt runs (this exam's or another's): its name, the time left, Reprendre, Abandonner */
function Running({ attempt, lang, onGone }: { attempt: AttemptRow; lang: Lang; onGone: () => void }) {
  const w = WORDS[lang];
  const [now, setNow] = useState(serverNow);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setNow(serverNow());
    const id = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(id);
  }, [attempt.id]);
  const left = toMs(attempt.deadlineAt) - now;

  async function abandon() {
    setBusy(true); setFailed(false);
    try {
      const done = await finishAttempt(attempt.id, "abandon");
      setOpen(false); onGone(); noteRunning(null);
      go(resultPath(done ?? attempt));
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  return (
    <div className="cp-hero-running" role="status">
      <p className="cp-hero-running-text">
        <strong>{w.bandText(attempt.section, attempt.exam)}</strong>
        <span className="num">{isNaN(left) ? "" : countdown(left)}</span>
      </p>
      <div className="cp-hero-actions">
        <Button kind="primary" onClick={() => go(sallePath(attempt))}>{w.resume}</Button>
        <Button kind="quiet" onClick={() => setOpen(true)}>{w.abandon}</Button>
      </div>
      <Sheet open={open} title={w.abandonTitle} onClose={() => !busy && setOpen(false)} actions={<>
        <Button onClick={() => setOpen(false)} disabled={busy}>{w.keepGoing}</Button>
        <Button kind="danger" busy={busy} onClick={abandon}>{w.abandon}</Button>
      </>}>
        <p>{w.abandonBody}</p>
        {failed && <p className="bad-text">{w.failed}</p>}
      </Sheet>
    </div>
  );
}
