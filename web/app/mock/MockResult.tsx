// The results of a mock (docs/MOCK-EXAM.md §1.12), the same page for one just finished and for one reopened, laid
// out to fit the screen: the overall level as the hero with the date and the certificate, then the four tests as four
// cards with the same three cells — score, NCLC, level — each opening its detail page. A mock still being marked
// shows the marking hall here.
import { useEffect, useState } from "react";
import { BackLink, Button, Empty, Icon, Mark } from "../../ui/ui.tsx";
import { go, linkProps } from "../../ui/router.ts";
import { useT, longDate } from "../i18n.ts";
import { useMe, useToast } from "../main.tsx";
import { cefrOf } from "../coce/pages/shared.ts";
import { getMock, listMocks, TESTS, type Mock, type TestStage } from "./api.ts";
import { Marking } from "./Marking.tsx";
import { useMockWords } from "./words.ts";
import "./mock.css";

export const nclcShown = (n: number | null | undefined) => (n == null ? 3 : Math.max(3, n));
/** one level for a mark out of 20 (the simulator's bands, A1 under 4) */
export const levelOf20 = (score20: number | null | undefined) => (score20 == null ? "—" : score20 < 4 ? "A1" : score20 < 6 ? "A2" : score20 < 10 ? "B1" : score20 < 14 ? "B2" : score20 < 16 ? "C1" : "C2");
/** the level of a test's result, the same rule on the results page, the detail page and the certificate */
export function levelOfTest(mock: Mock, t: TestStage): string {
  const c = mock.result?.[t];
  if (!c) return "—";
  return t === "co" || t === "ce" ? cefrOf((c as { score: number }).score) : levelOf20((c as { score20: number | null }).score20);
}
export type Cell = { label: string; n: string; of?: string };
/** the three cells every test shows: score · NCLC · level */
export function cellsOf(mock: Mock, t: TestStage, w: ReturnType<typeof useMockWords>): Cell[] {
  const c = mock.result?.[t];
  if (!c) return [];
  const score = t === "co" || t === "ce" ? { n: String((c as { score: number }).score), of: "/ 699" } : { n: (c as { score20: number | null }).score20 == null ? "—" : String(Math.round((c as { score20: number | null }).score20!)), of: "/ 20" };
  return [{ label: w.score, ...score }, { label: w.nclcWord, n: String(nclcShown(c.nclc)) }, { label: w.cefr, n: levelOfTest(mock, t) }];
}
/** one quiet line under the cells: the right answers, or the tasks */
export function sublineOf(mock: Mock, t: TestStage, w: ReturnType<typeof useMockWords>): string {
  const c = mock.result?.[t];
  if (!c) return "";
  return t === "co" || t === "ce" ? w.rightOf((c as { right: number }).right) : w.tasksOf((c as { marked: number }).marked);
}

export function MockResult({ id }: { id: number }) {
  const { lang } = useT();
  const w = useMockWords(lang);
  const { me } = useMe();
  const say = useToast();
  const [mock, setMock] = useState<Mock | null | undefined>(undefined);
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; setMock(undefined); getMock(id).then((m) => live && setMock(m)).catch(() => live && setMock(null)); return () => { live = false; }; }, [id, tries]);

  if (mock === undefined) return <div className="section-page mk-page" aria-busy="true"><div className="skeleton tall" /></div>;
  if (mock === null) return <div className="section-page mk-page"><BackLink to="/mock" label={w.titles} /><Empty icon="co" title={w.failed}><Button size="sm" icon="refresh" onClick={() => setTries((n) => n + 1)}>{w.retry}</Button></Empty></div>;
  if (mock.status === "running") { go(`/mock/${id}`); return null; }
  if (mock.status === "marking") return <div className="section-page mk-page"><BackLink to="/mock" label={w.titles} /><Marking mock={mock} lang={lang} drafts={{}} onDone={setMock} /></div>;

  const r = mock.result;
  const took = mock.finishedAt ? Math.round((Date.parse(mock.finishedAt) - Date.parse(mock.startedAt)) / 60000) : null;
  const abandonedIn = mock.status === "abandoned" ? (TESTS.find((t) => mock.ended[t] === "abandon" || mock.ended[t] === "stale") ?? null) : null;
  const noCert = mock.certificate ? null : mock.status === "abandoned" ? (TESTS.some((t) => mock.ended[t] === "stale") ? w.noCertStale : w.noCertAbandon) : (mock.ended.eoLateS ?? 0) > 300 ? w.noCertLate : TESTS.some((t) => mock.ended[t] === "stale") ? w.noCertStale : w.noCertBlank;

  // the certificate: the PDF is built here and opens in the tab opened at the click (a blocker would refuse it later)
  async function certificate() {
    if (!mock) return;
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const [{ buildCertificate }, list] = await Promise.all([import("./certificate-pdf.ts"), listMocks().catch(() => [])]);
      const done = list.filter((m) => m.status === "done").sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
      const i = done.findIndex((m) => m.id === mock.id);
      const url = await buildCertificate({
        mock, number: i >= 0 ? i + 1 : null, name: me?.name ?? me?.email ?? "", date: longDate((mock.finishedAt ?? mock.startedAt).slice(0, 10), lang), levelOf: (t) => levelOfTest(mock, t), lang,
        words: { title: w.certTitle, no: w.certNo, name: w.certName, date: w.certDate, test: w.certTest, score: w.certScore, level: w.certLevel, overall: w.certOverall, lowest: w.certLowest, line: w.certLine, tests: { co: w.co, ce: w.ce, ee: w.ee, eo: w.eo }, site: "tcf.monster" },
      });
      if (tab) { tab.opener = null; tab.location.href = url; } else window.open(url, "_blank");
    } catch { tab?.close(); say(w.failed, "bad"); }
    finally { setBusy(false); }
  }

  return (
    <div className="section-page mk-page mk-result">
      <div className="mk-h1-row"><BackLink to="/mock" label={w.titles} /><span className="mk-back-where mob-only">{w.title} · {longDate(mock.startedAt.slice(0, 10), lang)}{took != null && took > 0 ? ` · ${w.took(took)}` : ""}</span></div>
      <section className="card mk-overall" data-none={r?.overall == null || undefined}>
        <div className="mk-overall-main">
          <span className="mk-overall-label sim-caps">{w.overallNone}</span>
          <span className="mk-overall-n">{r?.overall != null ? w.overall(r.overall) : "—"}</span>
          <span className="mk-overall-sub">{r?.overall != null ? w.overallSub : abandonedIn ? w.endedAbandon(w[abandonedIn]) : ""}</span>
        </div>
        <ul className="mk-overall-tiles mob-only num" aria-hidden="true">
          {TESTS.map((t) => { const c = mock.result?.[t]; const sc = !c ? "—" : t === "co" || t === "ce" ? String((c as { score: number }).score) : `${(c as { score20: number | null }).score20 == null ? "—" : Math.round((c as { score20: number | null }).score20!)} /20`; return <li key={t} data-low={c && r?.overall != null && nclcShown(c.nclc) === r.overall || undefined}><span>{t.toUpperCase()}</span><b>{c ? nclcShown(c.nclc) : "—"}</b><small>{sc}</small></li>; })}
        </ul>
        <div className="mk-overall-side">
          <p className="mk-result-meta">
            <span className="desk-only">{longDate(mock.startedAt.slice(0, 10), lang)}</span>
            {took != null && took > 0 && <span className="desk-only">{w.took(took)}</span>}
            {noCert && <span className="muted">{noCert}</span>}
          </p>
          {mock.certificate && <Button kind="primary" busy={busy} onClick={() => void certificate()} className="mk-cert"><span className="desk-only">{w.certificate}</span><span className="mob-only">{w.certificatePdf}</span></Button>}
          {mock.certificate && <span className="mk-novalue mob-only">{w.noValue}</span>}
        </div>
      </section>
      <ul className="mk-tests">
        {TESTS.map((t) => {
          const cells = cellsOf(mock, t, w);
          const taken = cells.length > 0;
          const inner = (
            <>
              <header className="mk-test-head"><Mark s={t} big iconOnly /><span className="mk-test-code mob-only num">{t.toUpperCase()}</span><span className="mk-test-name">{w[t]}</span>{taken && <span className="mk-test-more">{w.details}</span>}</header>
              {taken ? (
                <>
                  <ul className="mk-cells">
                    {cells.map((c) => <li key={c.label}><span className="cp-cell-label">{c.label}</span><span className="cp-cell-n"><span className="num">{c.n}</span>{c.of && <span className="cp-cell-of num">{c.of}</span>}</span></li>)}
                  </ul>
                  <p className="mk-test-sub muted small">{sublineOf(mock, t, w)}</p>
                  <p className="mk-test-line mob-only num"><b>{cells[0].n} <small>{cells[0].of} · {sublineOf(mock, t, w)}</small></b><span>NCLC {cells[1].n} · {cells[2].n}</span></p>
                  <Icon name="chevronRight" size={18} className="mk-test-chev mob-only" />
                </>
              ) : <p className="mk-test-sub muted">{w.notTaken}</p>}
            </>
          );
          return (
            <li key={t} className="mk-test" data-taken={taken || undefined}>
              {taken ? <a className="card mk-test-card" {...linkProps(`/mock/${mock.id}/result/${t}`)}>{inner}</a> : <div className="card mk-test-card">{inner}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
