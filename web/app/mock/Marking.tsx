// The marking (docs/MOCK-EXAM.md §1.11) on the one hall screen: four lines, one per test, filling in — CO and CE at
// once, EE and EO as their marks arrive; a line that fails shows the Trouble card and retries by itself. The results
// open by themselves once the four are in. The same screen runs for a mock reopened while it is still being marked.
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../ui/ui.tsx";
import type { Lang } from "../i18n.ts";
import { Trouble } from "../sim/trouble.tsx";
import { Hall } from "../sim/hallway.tsx";
import { finalizeMock, TESTS, type Mock, type TestStage } from "./api.ts";
import { retryMarking, watchMarking, type MarkState } from "./marking.ts";
import { useMockWords } from "./words.ts";

const POLL_MS = 15_000; // the free plan counts every request; marking takes about a minute

export function Marking({ mock, lang, drafts, onDone }: { mock: Mock; lang: Lang; /** the writing drafts this browser kept (the store's copy) */ drafts: Record<string, string>; onDone: (m: Mock) => void }) {
  const w = useMockWords(lang);
  const [ee, setEe] = useState<MarkState | null>(null);
  const [eo, setEo] = useState<MarkState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef(mock);
  latest.current = mock;

  useEffect(() => { if (mock.eeSessionId) return watchMarking(mock.eeSessionId, drafts, lang, setEe); }, [mock.eeSessionId, drafts, lang]);
  useEffect(() => { if (mock.eoSessionId) return watchMarking(mock.eoSessionId, drafts, lang, setEo); }, [mock.eoSessionId, drafts, lang]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  // the server closes the sitting once the four results exist: asked every few seconds, and at once when a stage is marked
  const eeDone = ee?.done, eoDone = eo?.done;
  useEffect(() => {
    let live = true;
    const ask = () => finalizeMock(latest.current.id).then((m) => { if (!live) return; if (m.status === "done" || m.status === "abandoned") onDone(m); }).catch(() => {});
    ask();
    const id = setInterval(ask, POLL_MS);
    return () => { live = false; clearInterval(id); };
  }, [eeDone, eoDone, onDone]);

  const rows = TESTS.map((t) => {
    const coce = t === "co" ? mock.coResult : t === "ce" ? mock.ceResult : null;
    const st = t === "ee" ? ee : t === "eo" ? eo : null;
    const sid = t === "ee" ? mock.eeSessionId : t === "eo" ? mock.eoSessionId : null;
    const taken = t === "co" || t === "ce" ? !!coce : !!sid;
    const failed = st?.tasks.find((x) => x.status === "failed");
    const done = t === "co" || t === "ce" ? !!coce : !!st?.done;
    const nclc = t === "co" || t === "ce" ? coce?.nclc ?? (coce ? 3 : null) : null;
    return (
      <div key={t} className="hall-row" data-done={done || undefined}>
        <span className="hall-row-name">{w[t as TestStage]}</span>
        <span className="hall-row-state">
          {!taken ? <span className="muted">{w.notTaken}</span>
            : done ? <><Icon name="check" size={16} />{nclc != null ? `NCLC ${nclc}` : st?.score20 != null ? `${Math.round(st.score20)} / 20` : w.marked}</>
            : <span className="hall-row-wait"><span className="num">{st ? `${st.tasks.filter((x) => x.status === "done").length} / ${st.tasks.length || 3}` : ""}</span><i className="hall-dot" /></span>}
        </span>
        {failed && sid && (
          <div className="hall-row-trouble">
            <Trouble message={failed.failure?.message ?? w.troubleMark} final={false} retryIn={failed.retryAt ? Math.max(0, Math.ceil((failed.retryAt - now) / 1000)) : null}
              onRetry={() => retryMarking(sid, drafts, lang)} link={failed.failure?.key ? { label: w.openProfile, href: "/profile#key" } : undefined} lang={lang} />
          </div>
        )}
      </div>
    );
  });
  return <Hall title={w.markingTitle} ai lang={lang} rows={rows} />;
}
