// The one date picker of the app, in place of the browser's: a month, its days, and the « Pas encore inscrit·e » button
// for someone without an exam date. Past days are off, today has a ring, the chosen day is filled. It opens under the
// control that asked for it (on a phone, at the bottom of the screen) and closes on Escape or a click outside.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, Icon } from "../ui/ui.tsx";
import { useT, MONTHS } from "./i18n.ts";
import "./calendar.css";

const DAYS = { fr: ["L", "M", "M", "J", "V", "S", "D"], en: ["M", "T", "W", "T", "F", "S", "S"] };
/** how far ahead a date can be chosen */
const AHEAD_MONTHS = 24;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
/** today in the person's own time zone (not UTC: near midnight they differ) */
export const todayIso = () => iso(new Date());

export function Calendar({ value, onPick, none, onNone }: { value: string | null; onPick: (date: string) => void; none?: boolean; onNone?: () => void }) {
  const { t, lang } = useT();
  const today = todayIso();
  const first = parse(today); first.setDate(1);
  const last = new Date(first.getFullYear(), first.getMonth() + AHEAD_MONTHS, 1);
  const start = value && value >= today ? parse(value) : parse(today);
  const [month, setMonth] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));
  const [focus, setFocus] = useState(() => iso(start));
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => { if (moved.current) grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus(); }, [focus, month]);

  const lead = (month.getDay() + 6) % 7; // Monday first
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  const canPrev = month > first;
  const canNext = new Date(month.getFullYear(), month.getMonth() + 1, 1) < last;
  const go = (step: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + step, 1));

  /** arrows move by a day or a week, the month follows; Enter and Space pick (the button's own click) */
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const d = parse(focus); d.setDate(d.getDate() + step);
    const next = iso(d);
    if (next < today || d >= last) return;
    moved.current = true;
    setFocus(next);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={() => go(-1)} disabled={!canPrev} aria-label={t.prevMonth}><Icon name="chevronLeft" size={18} /></button>
        <span className="cal-title" aria-live="polite">{MONTHS[lang][month.getMonth()]} {month.getFullYear()}</span>
        <button type="button" className="cal-nav" onClick={() => go(1)} disabled={!canNext} aria-label={t.nextMonth}><Icon name="chevronRight" size={18} /></button>
      </div>
      <div className="cal-days" aria-hidden="true">{DAYS[lang].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="cal-grid" ref={grid} onKeyDown={onKey} role="group">
        {cells.map((d, i) => d === null ? <span key={i} /> : (
          <button key={d} type="button" data-day={d} className="cal-day" disabled={d < today}
            aria-current={d === today ? "date" : undefined} aria-pressed={d === value}
            tabIndex={d === focus ? 0 : -1} onClick={() => onPick(d)}>{Number(d.slice(8))}</button>
        ))}
      </div>
      {onNone && <div className="cal-foot"><Button size="sm" aria-pressed={!!none} onClick={onNone}>{t.notRegistered}</Button></div>}
    </div>
  );
}

/** the calendar floating under its control: `align` says which edge it lines up with */
export function CalendarPop({ open, onClose, align = "start", children }: { open: boolean; onClose: () => void; align?: "start" | "end"; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { const anchor = box.current?.parentElement; if (anchor && !anchor.contains(e.target as Node)) onClose(); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    // the chosen day (or today) takes the focus, so the keyboard can start at once
    box.current?.querySelector<HTMLButtonElement>(".cal-day[tabindex='0']")?.focus();
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="cal-pop" data-align={align} ref={box} role="dialog">{children}</div>;
}
