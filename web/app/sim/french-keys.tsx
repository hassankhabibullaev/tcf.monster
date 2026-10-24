import { useState, type RefObject } from "react";
import { useSimWords } from "./words";
import type { Lang } from "../i18n";

const LOWER = ["é", "è", "ê", "ë", "à", "â", "æ", "ç", "î", "ï", "ô", "œ", "ù", "û", "ü", "«", "»", "’"];
const UPPER = ["É", "È", "Ê", "Ë", "À", "Â", "Æ", "Ç", "Î", "Ï", "Ô", "Œ", "Ù", "Û", "Ü", "«", "»", "’"];

/**
 * The French characters a foreign keyboard lacks, as a strip above the editor. A key inserts its character at the
 * caret (the selection is replaced), keeps the focus and the caret after it; « Maj » switches the strip to capitals.
 */
export function FrenchKeys({ target, lang }: { target: RefObject<HTMLTextAreaElement | null>; lang: Lang }) {
  const w = useSimWords(lang);
  const [upper, setUpper] = useState(false);
  const insert = (ch: string) => {
    const el = target.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    // setRangeText leaves React's value tracker on the old value, so the input event below reaches onChange
    el.setRangeText(ch, start, end, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  };
  const keep = (e: React.PointerEvent) => e.preventDefault(); // the textarea keeps the focus and the caret
  return (
    <div className="fr-keys" role="toolbar" aria-label="Caractères français">
      <button type="button" className="fr-key fr-key-shift" aria-pressed={upper} onPointerDown={keep} onClick={() => setUpper((u) => !u)}>{w.shift}</button>
      {(upper ? UPPER : LOWER).map((ch, i) => (
        <button key={i} type="button" className="fr-key" onPointerDown={keep} onClick={() => insert(ch)}>{ch}</button>
      ))}
    </div>
  );
}
