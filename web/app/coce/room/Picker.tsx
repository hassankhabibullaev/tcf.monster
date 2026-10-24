// The question picker on phones: 1…N as small squares in the question's colour, a sheet from the bottom opened from the
// counter in the header (on laptop the room's Rail does this job). Read-only when `onPick` is missing (the CO exam: no
// going back).
import { useEffect, useRef } from "react";
import type { Lang } from "../../i18n.ts";
import { useRoomWords } from "./words.ts";

export type PickTone = "grey" | "green" | "red" | "amber" | "done" | "todo";

export type PickerProps = {
  open: boolean;
  onClose: () => void;
  /** 1-based */
  current: number;
  total: number;
  tone: (n: number) => PickTone;
  onPick?: (n: number) => void;
  lang: Lang;
  /** the four-colour legend under the grid (practice) */
  legend?: boolean;
};

export function Picker({ open, onClose, current, total, tone, onPick, lang, legend = false }: PickerProps) {
  const w = useRoomWords(lang);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); d.querySelector<HTMLElement>(`[aria-current="true"]`)?.focus(); }
    if (!open && d.open) d.close();
  }, [open]);
  const name = (t: PickTone) => (t === "done" ? w.done : t === "todo" ? w.todo : w.legend[t]);
  return (
    <dialog ref={ref} className="sheet cr-picker" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label={w.pickerTitle}>
      <div className="cr-picker-body">
        <div className="cr-picker-grid" role="list">
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
            const t = tone(n);
            const label = `${w.questionOf(n, total)} · ${name(t)}`;
            return onPick ? (
              <button key={n} type="button" role="listitem" className="cr-pick" data-tone={t} aria-current={n === current ? "true" : undefined} aria-label={label} onClick={() => { onPick(n); onClose(); }}>{n}</button>
            ) : (
              <span key={n} role="listitem" className="cr-pick" data-tone={t} aria-current={n === current ? "true" : undefined} aria-label={label}>{n}</span>
            );
          })}
        </div>
        {legend && <Legend lang={lang} />}
      </div>
    </dialog>
  );
}

/** the four practice colours, named: the one caption the interface allows */
export function Legend({ lang }: { lang: Lang }) {
  const w = useRoomWords(lang);
  return (
    <ul className="cr-legend">
      {(["grey", "green", "red", "amber"] as const).map((t) => (
        <li key={t}><i className="cr-pick cr-pick-dot" data-tone={t} aria-hidden="true" />{w.legend[t]}</li>
      ))}
    </ul>
  );
}
