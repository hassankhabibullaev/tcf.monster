// The terms changed since the person accepted them (worker/me.ts terms_ok): the same three ticks as at sign-up, once,
// then on to where they were going. Nothing else on the page.
import { useState } from "react";
import { Button, BetaTag, Wordmark } from "../../ui/ui.tsx";
import { replace } from "../../ui/router.ts";
import { useT } from "../i18n.ts";
import { useMe } from "../main.tsx";
import { LangPill } from "./AuthShell.tsx";

export function TermsAgain() {
  const { t, lang } = useT();
  const { update } = useMe();
  const [ticks, setTicks] = useState([false, false, false]);
  const [busy, setBusy] = useState(false);
  const next = new URLSearchParams(location.search).get("next");
  const safeNext = next && /^\/(?![\/\\])/.test(next) ? next : "/";
  const all = ticks.every(Boolean);
  const go = async () => {
    if (!all) return;
    setBusy(true);
    const ok = await update({ terms: true } as never);
    setBusy(false);
    if (ok) replace(safeNext);
  };
  return (
    <div className="welcome">
      <div className="welcome-top"><span className="brand"><img className="logo" src="/app-icon.svg" alt="" width="32" height="32" /><Wordmark /><BetaTag lang={lang} /></span><span className="spacer" /><LangPill /></div>
      <form className="terms-again" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <h1>{t.termsAgain}</h1>
        <div className="terms">
          {[...t.terms, null].map((line, i) => (
            <label className="term" key={i}>
              <input type="checkbox" checked={ticks[i]} onChange={(e) => setTicks((x) => x.map((v, j) => (j === i ? e.target.checked : v)))} />
              <span>{line ?? <>{t.termsRead} <a href="/terms" target="_blank" rel="noopener">{t.termsLink}</a> {t.termsEnd}</>}</span>
            </label>
          ))}
        </div>
        <Button type="submit" kind="primary" className="full" busy={busy} disabled={!all}>{t.continue}</Button>
      </form>
    </div>
  );
}
