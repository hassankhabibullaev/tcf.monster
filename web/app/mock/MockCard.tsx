// The dashboard's card (docs/MOCK-EXAM.md §5), right above the donation card: how many mocks, the best overall level,
// the last one's four NCLC with its date, and Ouvrir.
import { Chip, Icon } from "../../ui/ui.tsx";
import { linkProps } from "../../ui/router.ts";
import { useT, longDate } from "../i18n.ts";
import type { Stats } from "../../../worker/stats.ts";
import { useMockWords } from "./words.ts";
import "./mock.css";

export function MockCard({ mocks }: { mocks: Stats["mocks"] }) {
  const { lang } = useT();
  const w = useMockWords(lang);
  const last = mocks.last;
  return (
    <section className="card mk-card" aria-labelledby="mk-card-title">
      <div className="mk-card-text">
        <h2 id="mk-card-title"><span className="mk-card-tile"><Icon name="mock" size={18} /></span>{w.title}</h2>
        {mocks.count ? (
          <>
            <p className="mk-card-line"><b>{w.cardCount(mocks.count)}</b>{mocks.best != null && <> · {w.cardBest} <b>NCLC {mocks.best}</b></>}</p>
            {last && <p className="mk-card-line-m mob-only">{w.cardCount(mocks.count)} · {w.cardLast} NCLC {Math.max(3, Math.min(...(["co", "ce", "ee", "eo"] as const).map((t) => last.nclc[t] ?? 3)))}</p>}
            {last && (
              <p className="mk-card-last">
                <span className="muted small">{w.cardLast} · {longDate(last.at.slice(0, 10), lang)}</span>
                <span className="mk-row-chips">{(["co", "ce", "ee", "eo"] as const).map((t) => <Chip key={t} tone={last.nclc[t] == null ? "new" : "muted"}>{t.toUpperCase()} {last.nclc[t] == null ? "—" : Math.max(3, last.nclc[t]!)}</Chip>)}</span>
              </p>
            )}
          </>
        ) : <p className="mk-card-line muted">{w.none}</p>}
      </div>
      <a className="btn primary md mk-card-open" {...linkProps("/mock")}>{w.open}</a>
      <Icon name="chevronRight" size={18} className="mk-card-chev mob-only" />
    </section>
  );
}
