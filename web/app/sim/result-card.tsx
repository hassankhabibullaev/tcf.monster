import { useState, type ReactNode } from "react";
import { CEFR_LEVELS, cefrOf, type Tip } from "./types";
import { useSimWords } from "./words";
import type { Lang } from "../i18n";

export type ResultRow = { name: string; /** null: not scored yet (waiting for the recording) */ score: number | null };

const centre = (id: string) => {
  let before = 0;
  for (const l of CEFR_LEVELS) {
    if (l.id === id) return ((before + l.span / 2) / 20) * 100;
    before += l.span;
  }
  return 0;
};

/**
 * The result of one task (writing or speaking): the mark out of 20 as the hero, NCLC, level; one bar per criterion
 * with an indicator on the level reached (levels only, no mark per criterion); at most three short tips.
 */
export function ResultCard({ score20, nclc, rows, tips, notes, onReplay, pending, compact = false, lang }: { score20: number; nclc: number | null; rows: ResultRow[]; tips: Tip[]; /** short lines under the banner (cap applied…) */ notes?: string[]; onReplay?: (answer: number, atS: number) => Promise<void>; /** shown instead of the tips while rows are still locked */ pending?: ReactNode; /** a task inside a session: a smaller banner, six equal level cells */ compact?: boolean; lang: Lang }) {
  const w = useSimWords(lang);
  const whole = Math.round(score20);
  const level = cefrOf(whole);
  // compact: the six levels get the same width (a criterion has a level, not a mark); the dot sits in the middle of its cell
  const span = (l: (typeof CEFR_LEVELS)[number]) => (compact ? 1 : l.span);
  const centreOf = (id: string) => (compact ? ((CEFR_LEVELS.findIndex((l) => l.id === id) + 0.5) / CEFR_LEVELS.length) * 100 : centre(id));
  const [playing, setPlaying] = useState<number | null>(null);
  async function replay(i: number, answer: number, atS: number) {
    if (!onReplay || playing != null) return;
    setPlaying(i);
    try {
      await onReplay(answer, atS);
    } catch {
      /* the recording may be gone: the tip stays readable */
    } finally {
      setPlaying(null);
    }
  }
  return (
    <div className="rc" data-compact={compact}>
      <div className="rc-hero">
        <div className="rc-score">
          <span className="n">{whole}</span>
          <span className="d"> / 20</span>
        </div>
        <div className="rc-side">
          <div className="rc-nclc" data-level={level.id}>{w.nclc(nclc)}</div>
          <div className="rc-level">{w.level(level.id)}</div>
        </div>
      </div>
      {(rows.length > 0 || tips.length > 0 || !!notes?.length || !!pending) && <div className="rc-body">
        {notes?.map((n, i) => (
          <div key={i} className="rc-note">{n}</div>
        ))}
        <div className="rc-row rc-legend" aria-hidden="true">
          <span />
          <div className="rc-levels">
            {CEFR_LEVELS.map((l) => (
              <span key={l.id} style={{ flexGrow: l.span }}>
                {l.id}
                <br />
                {l.id === "A1" ? "1" : l.min}–{l.max}
              </span>
            ))}
          </div>
          <span />
        </div>
        {rows.map((r) => {
          const lv = r.score == null ? null : cefrOf(r.score);
          return (
            <div key={r.name} className="rc-row">
              <span className="rc-name">{w.criterion[r.name] ?? r.name}</span>
              <div className="rc-bar" role="img" aria-label={lv ? `${w.criterion[r.name] ?? r.name}: ${lv.id}, ${w.levelStatus[lv.id]}` : `${w.criterion[r.name] ?? r.name}: ${w.waiting}`}>
                <div className="rc-levels">
                  {CEFR_LEVELS.map((l) => (
                    <span key={l.id} data-level={l.id} style={{ flexGrow: span(l) }} />
                  ))}
                </div>
                {lv && <i className="rc-dot" style={{ left: `${centreOf(lv.id)}%` }} />}
              </div>
              {lv ? <span className="rc-pill" data-level={lv.id}>{lv.id} · {w.levelStatus[lv.id]}</span> : <span className="rc-pill" data-level="none">{w.waiting}</span>}
            </div>
          );
        })}
        {pending}
        {tips.length > 0 && (
          <>
            <div className="rc-tips-title">{w.tipsTitle}</div>
            {tips.map((t, i) => (
              <div key={i} className="rc-tip">
                <span className="rc-tag" data-kind={t.kind}>{w.tipLabel[t.label] ?? t.label}</span>
                <span>
                  {t.kind !== "next" && (
                    <>
                      <span className="rc-no">{t.said}</span> →{" "}
                    </>
                  )}
                  <span className="rc-ok">{t.say}</span>
                  {t.note && <span className="rc-why"> · {t.note}</span>}
                </span>
                {t.kind === "sound" && t.answer != null && t.atS != null && onReplay ? (
                  <button type="button" className="rc-play" onClick={() => void replay(i, t.answer!, t.atS!)} disabled={playing != null} aria-label={w.replay}>
                    {playing === i ? <span className="spin" aria-hidden="true" /> : <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg>}
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </>
        )}
      </div>}
    </div>
  );
}
