// The detail of one test of a mock (docs/MOCK-EXAM.md §1.12): its cells, then the review — the listening and reading
// tests as the exam result's cards, the writing and speaking tests as the simulator's results.
import { useEffect, useState } from "react";
import { BackLink, Button, Empty, Mark } from "../../ui/ui.tsx";
import { useT, longDate } from "../i18n.ts";
import { loadSession } from "../sim/work.ts";
import { ReviewCards } from "../coce/pages/ResultPage.tsx";
import { SessionResults } from "../sim/index.ts";
import { publicPrompt, safeJson, tachesOf, type StoredSession } from "../expr.ts";
import type { Question } from "../coce/bank.ts";
import { getMock, type Mock, type TestStage } from "./api.ts";
import { loadPaper } from "./Sitting.tsx";
import { cellsOf, sublineOf } from "./MockResult.tsx";
import { useMockWords } from "./words.ts";
import "./mock.css";

export function MockDetail({ id, test }: { id: number; test: TestStage }) {
  const { lang } = useT();
  const w = useMockWords(lang);
  const [mock, setMock] = useState<Mock | null | undefined>(undefined);
  const [tries, setTries] = useState(0);
  useEffect(() => { let live = true; setMock(undefined); getMock(id).then((m) => live && setMock(m)).catch(() => live && setMock(null)); return () => { live = false; }; }, [id, tries]);
  const back = `/mock/${id}/result`;
  if (mock === undefined) return <div className="section-page mk-page" aria-busy="true"><div className="skeleton tall" /></div>;
  if (mock === null || !mock.result?.[test]) return <div className="section-page mk-page"><BackLink to={back} label={w.results} /><Empty icon={test} title={w.failed}><Button size="sm" icon="refresh" onClick={() => setTries((n) => n + 1)}>{w.retry}</Button></Empty></div>;
  const cells = cellsOf(mock, test, w);
  return (
    <div className="section-page mk-page mk-detail">
      <BackLink to={back} label={w.results} />
      <header className="card mk-detail-head">
        <div className="mk-detail-title"><Mark s={test} big iconOnly /><h1>{w[test]}</h1><span className="muted small">{longDate(mock.startedAt.slice(0, 10), lang)}</span></div>
        <ul className="mk-cells">
          {cells.map((c) => <li key={c.label}><span className="cp-cell-label">{c.label}</span><span className="cp-cell-n"><span className="num">{c.n}</span>{c.of && <span className="cp-cell-of num">{c.of}</span>}</span></li>)}
        </ul>
        <p className="muted small">{sublineOf(mock, test, w)}</p>
      </header>
      {test === "co" || test === "ce" ? <CoceDetail t={test} mock={mock} lang={lang} /> : <ExprDetail t={test} mock={mock} lang={lang} />}
    </div>
  );
}

function CoceDetail({ t, mock, lang }: { t: "co" | "ce"; mock: Mock; lang: "fr" | "en" }) {
  const w = useMockWords(lang);
  const [qs, setQs] = useState<Question[] | null | undefined>(undefined);
  useEffect(() => { let live = true; loadPaper(t, mock.paper[t]).then((q) => live && setQs(q)).catch(() => live && setQs(null)); return () => { live = false; }; }, [t, mock.paper]);
  if (qs === undefined) return <div className="skeleton tall" />;
  if (qs === null) return <Empty icon={t} title={w.failed} />;
  return <ReviewCards section={t} questions={qs} answers={mock.answers[t]} attemptId={`mock-${mock.id}-${t}`} lang={lang} />;
}

function ExprDetail({ t, mock, lang }: { t: "ee" | "eo"; mock: Mock; lang: "fr" | "en" }) {
  const w = useMockWords(lang);
  const sid = t === "ee" ? mock.eeSessionId : mock.eoSessionId;
  const [d, setD] = useState<StoredSession | null | undefined>(undefined);
  useEffect(() => { if (!sid) { setD(null); return; } let live = true; loadSession(sid).then((x) => live && setD(x)).catch(() => live && setD(null)); return () => { live = false; }; }, [sid]);
  if (d === undefined) return <div className="skeleton tall" />;
  if (d === null) return <Empty icon={t} title={w.failed} />;
  const taches = tachesOf(d.session.taches);
  const views = d.tasks.map((x) => ({ taskNo: x.taskNo, sessionId: d.session.id, prompt: publicPrompt(JSON.parse(x.promptJson)), responseText: x.responseText, wordCount: x.wordCount, turns: safeJson<{ role: string; text: string; clipId?: string }[]>(x.turnsJson, []), score20: x.score20, level: x.level, nclc: x.nclc, feedbackJson: x.feedbackJson ?? null, detailJson: x.detailJson, versionsJson: x.versionsJson, elsewhere: x.elsewhere }));
  return (
    <div className="mk-detail-expr">
      <SessionResults skill={t === "ee" ? "writing" : "speaking"} sessionId={d.session.id} views={views} summary={safeJson(d.session.summaryJson, null)} mode="full" selected={taches} lang={lang} onExit={() => {}} dateLabel={longDate(d.session.startedAt.slice(0, 10), lang)} />
    </div>
  );
}
