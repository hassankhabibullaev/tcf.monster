// An attempt's result, one scrollable page. At the top, two columns: at the left four cells — the score out of 699,
// the right answers out of 39, the NCLC, the level (A1 … C2 on the TCF scale) —, at the right the level card
// (A1 … C2, right out of asked); then the date and, when the exam ended early, one quiet line; « S'entraîner au B2 »
// when one level stands out; then one card per question in exam order — « Question 12 · B1 », its worth (« 3 points »,
// green when earned), the given answer and the right one, the four options with the chosen one marked and the right
// one ticked, the feedback as in practice; CO cards carry a small player and the transcript folded under
// « Transcription »; CE cards show the passage's text folded under « Texte » (the text alone, never the picture of
// the original page), once per group of questions that share it, open on the first. An app page in the frame: no
// room chrome, no question rail.
import { peek, keep } from "../../api-cache.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import { BackLink, Button, Chip, ColourBar, Empty } from "../../../ui/ui.tsx";
import { go, linkProps } from "../../../ui/router.ts";
import { longDate, type Lang } from "../../i18n.ts";
import { api } from "../../api.ts";
import { LEVELS, POINTS, loadExam, type Key, type Level, type Question } from "./deps.ts";
import { WORDS } from "./words.ts";
import { Nclc } from "./SectionPage.tsx";
import { cefrOf, dayOf, isRunning, sallePath, EXAM_QUESTIONS, type Attempt, type CoceSection } from "./shared.ts";
import { Feedback, Options, Passage, Player, Transcript, placementOf, useRoomWords, type PlayerHandle } from "../room/index.ts";

export type ResultPageProps = { section: CoceSection; exam: number; attemptId: string; lang: Lang };

/** the level to practise: under half right, the one with the most questions missed; null when none stands out */
export function weakLevel(byLevel: Attempt["byLevel"]): Level | null {
  let best: { level: Level; missed: number } | null = null;
  for (const level of LEVELS) {
    const b = byLevel?.[level];
    if (!b || !b.of || b.right * 2 >= b.of) continue;
    const missed = b.of - b.right;
    if (!best || missed > best.missed) best = { level, missed };
  }
  return best?.level ?? null;
}


export function ResultPage({ section, exam, attemptId, lang }: ResultPageProps) {
  const w = WORDS[lang];
  const [a, setA] = useState<Attempt | null | undefined>(undefined);
  const [qs, setQs] = useState<Question[] | null | undefined>(undefined);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    setA(undefined);
    // a finished attempt never changes: the copy the finish brought back (or an earlier visit) is enough
    const kept = peek<{ attempt: Attempt }>(`/attempts/${attemptId}`)?.attempt;
    if (kept?.finishedAt) { setA(kept); return () => { live = false; }; }
    api<{ attempt: Attempt }>(`/attempts/${attemptId}`).then((d) => { if (d.attempt?.finishedAt) keep(`/attempts/${attemptId}`, d); if (live) setA(d.attempt ?? null); }).catch(() => live && setA(null));
    return () => { live = false; };
  }, [attemptId, tries]);
  useEffect(() => {
    let live = true;
    setQs(undefined);
    loadExam(section, exam).then((q) => live && setQs(q)).catch(() => live && setQs(null));
    return () => { live = false; };
  }, [section, exam, tries]);
  // the level to practise means something once half the exam was answered; after an early abandon it would be noise
  const weak = useMemo(() => (a && (a.right ?? 0) + (a.wrong ?? 0) >= 20 ? weakLevel(a.byLevel) : null), [a]);
  const back = `/${section}/exam/${exam}`;
  // the phone's filter chips above the cards (Toutes · Fausses · Sans réponse); the laptop lists every card
  const [filter, setFilter] = useState<"all" | "wrong" | "blank">("all");

  if (a === undefined) {
    return (
      <div className="section-page cp-page" aria-busy="true">
        <div className="skeleton cp-skel-chip" />
        <div className="skeleton cp-skel-score" />
        <div className="skeleton cp-skel-row" />
        <div className="skeleton cp-skel-card" />
      </div>
    );
  }
  if (a === null) {
    return (
      <div className="section-page cp-page">
        <BackLink to={back} label={w.back} />
        <Empty icon={section} title={w.resultMissing}><Button size="sm" icon="refresh" onClick={() => setTries((n) => n + 1)}>{w.retry}</Button></Empty>
      </div>
    );
  }
  if (isRunning(a)) {
    return (
      <div className="section-page cp-page">
        <BackLink to={back} label={w.back} />
        <Empty icon={section} title={w.stillRunning}><Button size="sm" kind="primary" onClick={() => go(sallePath(a))}>{w.resume}</Button></Empty>
      </div>
    );
  }

  const score = a.score ?? 0;
  const cells: { label: string; n: string; of?: string }[] = [
    { label: w.score, n: String(a.score ?? "—"), of: "/ 699" },
    { label: w.rightAnswers, n: String(a.right ?? "—"), of: `/ ${EXAM_QUESTIONS}` },
    { label: w.nclcWord, n: a.nclc == null ? "3" : String(a.nclc) },
    { label: w.cefr, n: cefrOf(score) },
  ];
  return (
    <div className="section-page cp-page cp-result">
      <div className="cp-back-row"><BackLink to={back} label={w.back} /><span className="cp-back-where cp-back-code mob-only num"><b>{section.toUpperCase()}</b> · {w.examNo(exam)} · <span className="muted">{longDate(dayOf(a.startedAt), lang)}</span></span></div>
      <div className="cp-result-top">
        <ul className="cp-cells">
          {cells.map((c) => (
            <li key={c.label} className="card cp-cell">
              <span className="cp-cell-label">{c.label}</span>
              <span className="cp-cell-n"><span className="num">{c.n}</span>{c.of && <span className="cp-cell-of num">{c.of}</span>}</span>
            </li>
          ))}
        </ul>
        {a.byLevel && (
          <section className="card pad cp-bylevel">
            <div className="card-head"><h2>{w.byLevel}</h2></div>
            <ul>
              {LEVELS.map((level) => {
                const b = a.byLevel?.[level];
                if (!b) return null;
                const isWeak = b.of > 0 && b.right * 2 < b.of;
                return (
                  <li key={level} className={isWeak ? "weak" : undefined} aria-label={w.perLevel(level, b.right, b.of)}>
                    <span className="cp-lv">{level}</span>
                    <ColourBar ok={b.right} amber={0} bad={b.of - b.right} total={b.of} />
                    <span className="num small cp-lv-n">{b.right} / {b.of}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
      <p className="cp-result-meta muted small">
        {longDate(dayOf(a.startedAt), lang)}
        {a.ended === "abandon" && <> · {w.endedAbandon}</>}
        {a.ended === "time" && <> · {w.endedTime}</>}
      </p>

      {weak && (
        <div className="cp-actions">
          <a className="btn quiet" {...linkProps(`/${section}/practice/${weak}`)}>{w.practiseLevel(weak)}</a>
        </div>
      )}

      {qs === undefined ? (
        <div className="cp-review" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton cp-skel-card" />)}</div>
      ) : qs === null ? (
        <Empty icon={section} title={w.failed}><Button size="sm" icon="refresh" onClick={() => setTries((n) => n + 1)}>{w.retry}</Button></Empty>
      ) : (
        <>
          <div className="cp-filters mob-only" role="group" aria-label={w.filter}>
            {(["all", "wrong", "blank"] as const).map((f) => {
              const n = f === "all" ? qs.length : qs.filter((q) => { const v = (a.answers ?? {})[placementOf(q)]; return f === "wrong" ? !!v && v !== "-" && v !== q.answer : !v || v === "-"; }).length;
              return <button key={f} type="button" className="chip-btn" aria-pressed={filter === f} data-tone={f === "wrong" ? "bad" : undefined} onClick={() => setFilter(f)}>{w.filters[f]} · {n}</button>;
            })}
          </div>
          <ReviewCards section={section} questions={qs} answers={a.answers ?? {}} attemptId={a.id} lang={lang} filter={filter} />
        </>
      )}
    </div>
  );
}

/** the review: one card per question in the paper's order (the mock exam's results page shows the same cards) */
export function ReviewCards({ section, questions, answers, attemptId, lang, filter = "all" }: { section: CoceSection; questions: Question[]; answers: Record<string, string>; attemptId: string | number; lang: Lang; /** the phone's chips: every card, the wrong ones, the unanswered ones */ filter?: "all" | "wrong" | "blank" }) {
  const given = (q: Question): Key | "-" | null => { const v = answers[placementOf(q)]; return v === "A" || v === "B" || v === "C" || v === "D" || v === "-" ? v : null; };
  const shown = (q: Question) => { const g = given(q); return filter === "all" ? true : filter === "wrong" ? g !== null && g !== "-" && g !== q.answer : g === null || g === "-"; };
  return (
    <ol className="cp-review">
      {questions.map((q, i) => shown(q) && (
        <QuestionCard key={q.id} q={q} n={q.position ?? i + 1} given={given(q)} attemptId={attemptId} lang={lang}
          textGroup={section === "ce" && (i === 0 || questions[i - 1].passage !== q.passage || !shown(questions[i - 1]))} textOpen={i === 0} />
      ))}
    </ol>
  );
}

/** one question of the review: its answers, the options, the feedback; the recording or the text folded above */
function QuestionCard({ q, n, given, attemptId, lang, textGroup, textOpen }: { q: Question; n: number; given: Key | "-" | null; attemptId: string | number; lang: Lang; /** CE: this card is the first of a group sharing one passage, so it shows the text */ textGroup: boolean; textOpen: boolean }) {
  const w = WORDS[lang];
  const rw = useRoomWords(lang);
  const player = useRef<PlayerHandle | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const chosen: Key | null = given === "A" || given === "B" || given === "C" || given === "D" ? given : null;
  const tone = given === null || given === "-" ? "none" : given === q.answer ? "ok" : "bad";
  const co = q.section === "co";
  return (
    <li className="card cp-q" data-tone={tone}>
      <header className="cp-q-head">
        <span className="cp-q-title">
          <h3>{rw.questionLevel(n, q.level)}</h3>
          <span className="cp-q-points" data-earned={tone === "ok"}>{w.points(POINTS[q.level])}</span>
        </span>
        <span className="cp-q-answers">
          {given === null ? <Chip tone="new">{rw.noAnswer}</Chip> : given === "-" ? <Chip tone="new">{rw.skipped}</Chip> : <Chip tone={tone === "ok" ? "ok" : "bad"}>{rw.yourAnswer} {given}</Chip>}
          {tone !== "ok" && <Chip tone="ok">{rw.rightAnswer} {q.answer}</Chip>}
        </span>
      </header>
      {co && q.audio && (
        <div className="cp-q-media">
          <Player ref={player} src={q.audio} resetKey={`${attemptId}/${q.id}`} maxPlays={null} scrubber autoplay={false} lang={lang} preload="none" />
          {q.transcript && (
            <details className="cp-fold" onToggle={(e) => setTranscriptOpen(e.currentTarget.open)}>
              <summary>{rw.transcript}</summary>
              <div className="cp-fold-body">
                {transcriptOpen && <Transcript text={q.transcript} textEn={q.transcriptEn} words={q.words} segments={q.segments} english={false} lang={lang} player={player} />}
              </div>
            </details>
          )}
        </div>
      )}
      {co && q.image && <img className="cr-picture" src={q.image} alt="" />}
      {!co && textGroup && q.passage && (
        <details className="cp-fold" open={textOpen}>
          <summary>{rw.text}</summary>
          <div className="cp-fold-body">
            <Passage text={q.passage} textEn={null} english={false} highlight={q.keySentence} />
          </div>
        </details>
      )}
      <div className="cr-stem"><p lang="fr">{q.stem}</p></div>
      <Options options={q.options} chosen={chosen} answer={q.answer} reveal disabled english={false} lang={lang} onPick={() => {}} />
      <Feedback q={q} chosen={given} shown english={false} lang={lang} />
    </li>
  );
}
