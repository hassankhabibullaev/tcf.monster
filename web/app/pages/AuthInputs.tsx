// The fields every code-and-password form shares, so the door and the profile look and behave the same: the password
// with its eye, the six code boxes, the strength bar.
import { useEffect, useRef, useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { Icon } from "../../ui/ui.tsx";
import { useT } from "../i18n.ts";
import { strength } from "../api.ts";

export function PasswordInput({ id, value, onChange, autoComplete, invalid, autoFocus }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean; autoFocus?: boolean }) {
  const { t } = useT();
  const [shown, setShown] = useState(false);
  return (
    <div className="pw">
      <input id={id} type={shown ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} aria-invalid={invalid || undefined} aria-describedby={`${id}-error`} autoFocus={autoFocus} />
      <button type="button" className="pw-toggle" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-label={shown ? t.hide : t.show} title={shown ? t.hide : t.show}><Icon name={shown ? "eyeOff" : "eye"} size={20} /></button>
    </div>
  );
}

/** the six boxes for an e-mailed code: one look wherever a code is asked (the door, the profile's sheets) */
export function CodeBoxes({ value, onChange, shake, disabled }: { value: string; onChange: (v: string) => void; shake: number; disabled?: boolean }) {
  const { t } = useT();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");
  // the next empty box takes the focus on mount and again when the boxes wake up after a check
  useEffect(() => { if (!disabled) refs.current[Math.min(value.length, 5)]?.focus(); }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps
  /** one digit typed, or several at once (fast typing, the phone filling the code from the e-mail) */
  const set = (i: number, typed: string) => {
    let d = typed.replace(/\D/g, "");
    if (d.length === 2 && d[0] === digits[i]) d = d[1];
    if (d.length > 1) {
      const next = (value.slice(0, i) + d).slice(0, 6);
      onChange(next);
      refs.current[Math.min(next.length, 5)]?.focus();
      return;
    }
    const next = (value.slice(0, i) + d + value.slice(i + 1)).slice(0, 6);
    onChange(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) { refs.current[i - 1]?.focus(); onChange(value.slice(0, i - 1)); e.preventDefault(); }
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const d = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!d) return;
    e.preventDefault();
    onChange(d);
    refs.current[Math.min(d.length, 5)]?.focus();
  };
  return (
    <div className={`code-boxes${shake ? " shake" : ""}`} key={shake} role="group" aria-label={t.codeLabel}>
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} disabled={disabled}
          aria-label={`${t.codeLabel} ${i + 1}`} onChange={(e) => set(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} onPaste={onPaste} onFocus={(e) => e.target.select()} />
      ))}
    </div>
  );
}

/** three bars and a word under a new password */
export function Strength({ password }: { password: string }) {
  const { t } = useT();
  const s = strength(password);
  return (
    <div className={`strength s${s}`} aria-live="polite">
      <span /><span /><span /><em>{password ? t.strength[s] : ""}</em>
    </div>
  );
}
