// The room's frame, shared by practice, exam and review: one slim top line (in practice ← back and the test's name
// with the level, « Compréhension orale · B1 »; in an exam the test's name alone — no way back there, the red Terminer
// in the footer ends it —, a slim progress bar of the level in place of a counter — it focuses the rail on laptop,
// opens the picker sheet on phone —, the one clock of every room in exams); an optional band under it; a body of the
// question rail and two panels on laptop (passage or player left, question right; stacked on phone, no rail)
// separated by one vertical hairline, that never scrolls as a page. The top line and the footer float over the body
// (the room rule, docs/COCE.md §4): translucent, blurred, no hairline; the body runs under them from top to bottom.
import type { ReactNode } from "react";
import { BackLink } from "../../../ui/ui.tsx";
import type { Section } from "../bank.ts";
import { RoomBar, type RoomClock } from "../../room-bar.tsx";
import type { Lang } from "../../i18n.ts";

/** the slim bar: « 12 / 110 » in small mono before it, the coloured parts in proportion of `total`, the rest grey, and
 *  in practice the four counts as tiny dots after it (laptop only: the picker has them on phones) */
export type Progress = {
  n: number;
  total: number;
  parts: { green?: number; amber?: number; red?: number; done?: number };
  onOpen: () => void;
  label: string;
  /** `popup` when the bar opens the picker sheet (phone) rather than focusing the rail */
  popup?: boolean;
};

export type ShellProps = {
  mode: "practice" | "exam" | "review";
  section: Section;
  /** the way back (practice); an exam has none */
  onBack?: () => void;
  backLabel?: string;
  /** the test's name in small caps, then « · B1 » (practice) or « · Libre » (free exam) */
  title: ReactNode;
  progress: Progress;
  /** the question rail, before the two panels (laptop) */
  rail?: ReactNode;
  /** anything else on the top line, between the title and the bar (rarely used: the panels carry their own bar) */
  helps?: ReactNode;
  /** the one timer of every room (exams); none in practice */
  clock?: RoomClock | null;
  lang: Lang;
  band?: ReactNode;
  left: ReactNode;
  right: ReactNode;
  foot: ReactNode;
  /** sheets and the picker */
  children?: ReactNode;
  /** a stage of the mock exam: « 2 / 4 » after the title (docs/MOCK-EXAM.md §2) */
  sub?: string;
  /** the phone's title: where you are in code, « CO · B1 » (the laptop shows `title`, the full name) */
  code?: ReactNode;
  /** the phone's line under the code: « question 4 sur 172 » (practice) */
  subline?: string;
  /** the phone's ⋯ button at the right of the top line, and its sheet */
  more?: ReactNode;
  /** the phone's centre of the top line: the level opened (practice) or « n° 9 » (exam) */
  mid?: ReactNode;
  /** the page reads in English (the one FR | EN toggle): every French text with an English twin gives way to it */
  english?: boolean;
  /** the number strip, a row of its own above the footer's buttons (practice, laptop and phone alike) */
  strip?: ReactNode;
};

export function Shell({ mode, section, onBack, backLabel, title, progress, rail, helps, clock, lang, band, left, right, foot, children, sub, code, subline, more, strip, mid, english }: ShellProps) {
  const exam = mode === "exam";
  return (
    <div className="cr" data-mode={mode} data-section={section} data-band={band ? "" : undefined} data-mock={sub ? "" : undefined} data-strip={strip ? "" : undefined} data-english={english || undefined}>
      <RoomBar className="cr-head" lang={lang} time={exam} clock={clock}
        left={<>
          {onBack && <BackLink onClick={onBack} label={backLabel ?? ""} word={false} />}
          <div className="cr-title-block">
            <h1 className="cr-title sim-caps">
              {code ? <><span className="desk-only cr-title-text">{title}</span><span className="mob-only cr-title-code num">{code}</span></> : title}
              {sub && <span className="room-sub num">{sub}</span>}
            </h1>
          </div>
          {helps && <div className="cr-helps">{helps}</div>}
          {exam && <ProgressBar p={progress} />}
        </>}
        centre={<>{!exam && <ProgressBar p={progress} />}{mid && <span className="cr-title-mid mob-only num">{mid}</span>}</>}
        right={<>{subline && <span className="cr-title-sub mob-only num">{subline}</span>}{more}</>} />
      {band && <div className="cr-band" role="status">{band}</div>}
      <div className="cr-body" data-rail={rail ? "" : undefined}>
        {rail}
        <section className="cr-left">{left}</section>
        <section className="cr-right">{right}</section>
      </div>
      <footer className="cr-foot">
        {strip && <div className="cr-foot-strip">{strip}</div>}
        <div className="cr-foot-row">{foot}</div>
      </footer>
      {children}
    </div>
  );
}

function ProgressBar({ p }: { p: Progress }) {
  const t = Math.max(1, p.total);
  const w = (n: number | undefined) => `${((n ?? 0) / t) * 100}%`;
  const { green = 0, amber = 0, red = 0 } = p.parts;
  const coloured = p.parts.done === undefined; // practice: the four colours; an exam counts done · todo only
  return (
    <button type="button" className="cr-bar" onClick={p.onOpen} aria-haspopup={p.popup ? "dialog" : undefined} aria-label={p.label} title={p.label}>
      {p.total > 0 && <span className="cr-bar-n num" aria-hidden="true">{p.n} / {p.total}</span>}
      <span className="cr-bar-track" aria-hidden="true">
        {green ? <i className="cr-bar-green" style={{ width: w(green) }} /> : null}
        {amber ? <i className="cr-bar-amber" style={{ width: w(amber) }} /> : null}
        {red ? <i className="cr-bar-red" style={{ width: w(red) }} /> : null}
        {p.parts.done ? <i className="cr-bar-done" style={{ width: w(p.parts.done) }} /> : null}
      </span>
      {coloured && p.total > 0 && (
        <span className="cr-bar-dots num" aria-hidden="true">
          <span><i className="cr-bar-green" />{green}</span>
          <span><i className="cr-bar-amber" />{amber}</span>
          <span><i className="cr-bar-red" />{red}</span>
          <span><i className="cr-bar-grey" />{Math.max(0, p.total - green - amber - red)}</span>
        </span>
      )}
    </button>
  );
}

/** a labelled toggle: the label is the control, a slim pill thumb shows the state; with `offLabel` it is a two-word
 *  switch (« Texte complet ○ Indice court ») whose thumb sits by the chosen word */
export function Switch({ label, offLabel, on, onChange, disabled = false }: { label: string; offLabel?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" className="cr-switch" data-two={offLabel ? "" : undefined} aria-pressed={on} disabled={disabled} onClick={() => onChange(!on)}>
      {offLabel && <span className="cr-switch-off">{offLabel}</span>}
      <i className="cr-switch-track" aria-hidden="true"><i className="cr-switch-knob" /></i>
      <span className="cr-switch-on">{label}</span>
    </button>
  );
}
