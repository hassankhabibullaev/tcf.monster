// The four options: full-width rows (≥ 48 px) with the letter, the French and, when asked, the English to its right on
// the same line (smaller, italic, muted; under it on phones), so nothing moves when English is toggled. An option with no
// text (CO, spoken only) is the same row with « Proposition A » / "Option A" in place of the text: one format everywhere,
// in practice, in exams, in the mock and on the result pages. Once revealed, the right one is marked and a wrong one crossed.
import { Icon } from "../../../ui/ui.tsx";
import type { Lang } from "../../i18n.ts";
import type { Key, Option } from "../bank.ts";
import { useRoomWords } from "./words.ts";
import { usePhone } from "./hooks.ts";

export type OptionsProps = {
  options: Option[];
  chosen: Key | null;
  answer: Key;
  /** show right and wrong (after the answer; always in review) */
  reveal: boolean;
  disabled?: boolean;
  english: boolean;
  lang: Lang;
  onPick: (key: Key) => void;
};

export function Options({ options, chosen, answer, reveal, disabled = false, english, lang, onPick }: OptionsProps) {
  const w = useRoomWords(lang);
  // a spoken option's English (phones' « Options en anglais » only: on the laptop the transcript carries it)
  const phone = usePhone();
  const state = (k: Key) => {
    if (!reveal) return chosen === k ? "chosen" : undefined;
    if (k === answer) return chosen === k ? "right" : "late";
    if (k === chosen) return "wrong";
    return "dim";
  };
  return (
    <div className="cr-options" role="group" aria-label={w.optionsSpoken}>
      {options.map((o) => {
        const s = state(o.key);
        const mark = s === "right" || s === "late" ? <Icon name="check" size={18} /> : s === "wrong" ? <Icon name="x" size={18} /> : null;
        return (
          <button key={o.key} type="button" className="cr-opt" data-state={s} data-spoken={o.text === null || undefined} aria-pressed={chosen === o.key}
            aria-disabled={disabled || undefined} onClick={() => { if (!disabled) onPick(o.key); }}>
            <span className="cr-opt-key">{o.key}</span>
            <span className="cr-opt-text">
              {o.text === null ? <span>{w.statement(o.key)}</span> : <span lang="fr">{o.text}</span>}
              {english && o.textEn && o.textEn !== o.text && (o.text !== null || phone) && <span className="cr-en" lang="en">{o.textEn}</span>}
            </span>
            <span className="cr-opt-mark" aria-hidden="true">{mark}</span>
          </button>
        );
      })}
    </div>
  );
}
