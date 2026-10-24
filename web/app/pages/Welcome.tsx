// The first time in the account: one sentence, three blanks filled one after the other.
// « Je m'appelle [prénom], je vise le NCLC [7 ▾] et je passe l'examen le [date ▾]. » — or « …et [je ne suis pas encore
// inscrit·e]. », chosen with the button inside the calendar.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, BetaTag, Wordmark } from "../../ui/ui.tsx";
import { replace } from "../../ui/router.ts";
import { useT, longDate } from "../i18n.ts";
import { useMe } from "../main.tsx";
import { LangPill } from "./AuthShell.tsx";
import { Calendar, CalendarPop } from "../Calendar.tsx";

const TARGETS = [4, 5, 6, 7, 8, 9, 10, 11, 12];

export function Welcome() {
  const { t, lang } = useT();
  const { me, update } = useMe();
  const [name, setName] = useState(me?.name ?? "");
  const [target, setTarget] = useState<number | null>(me?.target_nclc ?? null);
  const [date, setDate] = useState<string>(me?.exam_date ?? "");
  const [noDate, setNoDate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cal, setCal] = useState(false);
  const closeCal = useCallback(() => setCal(false), []);
  const nameRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const step = !name.trim() ? 1 : !target ? 2 : 3;
  const done = !!name.trim() && !!target && (noDate || !!date);

  async function finish() {
    if (!done) return;
    setBusy(true);
    // the sentence goes to the account first; if the server did not take it, the page stays (the toast said why)
    const ok = await update({ name: name.trim(), target_nclc: target, exam_date: noDate ? null : date });
    if (!ok) { setBusy(false); return; }
    const next = new URLSearchParams(location.search).get("next");
    replace(next && /^\/(?![\/\\])/.test(next) ? next : "/");
  }

  return (
    <div className="welcome">
      <div className="welcome-top"><span className="brand"><img className="logo" src="/app-icon.svg" alt="" width="32" height="32" /><Wordmark /><BetaTag lang={lang} /></span><span className="spacer" /><span className="muted">{t.stepOf(step)}</span><LangPill /></div>
      <form className="sentence" onSubmit={(e) => { e.preventDefault(); finish(); }}>
        <span>{t.welcome1} </span>
        <span className={`blank${step === 1 ? " now" : ""}`}>
          <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.firstName} aria-label={t.firstName} autoComplete="given-name" maxLength={40} size={Math.max(t.firstName.length, name.length + 1)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { e.preventDefault(); targetRef.current?.focus(); } }} />
        </span>
        <span>{t.welcome2} </span>
        <span className={`blank${step === 2 ? " now" : ""}`}>
          <select ref={targetRef} value={target ?? ""} onChange={(e) => { setTarget(Number(e.target.value)); if (!date && !noDate) setCal(true); }} aria-label="NCLC">
            <option value="" disabled>NCLC ▾</option>
            {TARGETS.map((n) => <option key={n} value={n}>NCLC {n}</option>)}
          </select>
        </span>
        <span> {noDate ? t.welcome3and : t.welcome3} </span>
        <span className="cal-anchor">
          <button type="button" className={`blank date${step === 3 ? " now" : ""}`} aria-expanded={cal} aria-haspopup="dialog" onClick={() => setCal((o) => !o)}>
            <span className="date-shown">{noDate ? t.welcome3none : date ? longDate(date, lang) : t.pickDate}</span>
          </button>
          <span>.</span>
          <CalendarPop open={cal} onClose={closeCal}>
            <Calendar value={noDate ? null : date} none={noDate} onPick={(d) => { setDate(d); setNoDate(false); setCal(false); }} onNone={() => { setNoDate(true); setCal(false); }} />
          </CalendarPop>
        </span>
      </form>
      <div className="welcome-actions">
        <span className="spacer" />
        <Button kind="primary" busy={busy} disabled={!done} onClick={finish}>{t.letsGo}</Button>
      </div>
      <div className="welcome-progress" aria-hidden="true">
        <i className={name.trim() ? "on" : ""} /><i className={target ? "on" : ""} /><i className={noDate || date ? "on" : ""} />
      </div>
    </div>
  );
}
