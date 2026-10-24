// The one door. It asks the e-mail first and nothing else; the server says whether the address has an account:
//   has one  → the password, with one way out under the button: « Forgot your password? » (a code, then a new one)
//   none yet → choose a password (and the terms), then the 6-digit code from the e-mail creates the account
//   forgot   → the code, then a new password
// Every error is kept as a rule, not a sentence, so a language switch rewrites it.
import { useEffect, useState, type FormEvent } from "react";
import { Button, Icon } from "../../ui/ui.tsx";
import { useT, DICTS, type Lang } from "../i18n.ts";
import { humanToken } from "../turnstile.ts";
import { api, stretch, strength, ApiError } from "../api.ts";
import { useMe } from "../main.tsx";
import { AuthShell, Field } from "./AuthShell.tsx";
import { PasswordInput, CodeBoxes } from "./AuthInputs.tsx";

/** an error line written at render time in the current language */
type ErrorText = (t: typeof DICTS.fr, lang: Lang) => string;
type Step = "email" | "password" | "newPassword" | "code" | "resetPassword";
/** what the code step is for: signing in by code, creating the account, or a forgotten password */
type Purpose = "signin" | "signup" | "reset";

/** the bot check's public key, learned from the server's first « bot » answer (then sent with every guarded request) */
let sitekey: string | null = null;

export function SignIn() {
  const { t, lang } = useT();
  const { refresh } = useMe();
  const [step, setStep] = useState<Step>("email");
  const [purpose, setPurpose] = useState<Purpose>("signin");
  const [email, setEmail] = useState(() => { try { return sessionStorage.getItem("door-email") ?? ""; } catch { return ""; } });
  const [password, setPassword] = useState("");
  const [ticks, setTicks] = useState([false, false, false]);
  const terms = ticks.every(Boolean);
  const tick = (i: number, on: boolean) => setTicks((t) => t.map((v, j) => (j === i ? on : v)));
  const [code, setCode] = useState("");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  // an account the bank's guard blocked arrives here with ?blocked (web/app/coce/bank.ts)
  const [error, setError] = useState<ErrorText | null>(() => (new URLSearchParams(location.search).has("blocked") ? (w: typeof DICTS.fr) => w.blocked : null));
  const [shake, setShake] = useState(0);
  const [wait, setWait] = useState(0);
  const errorLine = error?.(t, lang) ?? null;
  const addr = email.trim();

  useEffect(() => { if (wait <= 0) return; const id = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(id); }, [wait]);

  const message = (err: unknown): ErrorText => {
    const d = err instanceof ApiError ? err.data : {};
    const until = String(d.until ?? "");
    const known: Record<string, ErrorText> = {
      closed: (w) => w.closed, too_many: (w) => w.tooMany, busy: (w) => w.tooMany, bot: (w) => w.networkError, mail: (w) => w.mailFailed, network: (w) => w.networkError,
      expired: (w) => w.codeExpired, wrong: (w) => w.codeWrong, email: (w) => w.badEmail, blocked: (w) => w.blocked,
      locked: (w, l) => w.locked(new Date(until).toLocaleTimeString(l === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" })),
    };
    if (known[d.error]) return known[d.error];
    // never a vague « something went wrong »: the server's own failure (with its code), or this page's
    if (err instanceof ApiError) return err.status === 0 ? (w) => w.networkError : (w) => w.serverDown(err.status);
    console.error("sign-in page", err);
    const what = err instanceof Error ? err.name : "error";
    return (w) => w.pageError(what);
  };
  const fail = (err: unknown) => setError(() => message(err));
  /** a request the server guards with Cloudflare's bot check: a fresh token goes with it (each is good once); without a
   *  known key the server answers « bot » with its key, and the request goes once more with a token */
  async function guarded<T>(path: string, body: Record<string, unknown>, action: string): Promise<T> {
    const once = async () => api<T>(path, { ...body, turnstile: sitekey ? await humanToken(sitekey, action, lang, document.getElementById("ts-slot")).catch(() => "") : undefined });
    try { return await once(); } catch (err) {
      const d = err instanceof ApiError ? err.data : {};
      if (d.error !== "bot" || !d.turnstile || sitekey === d.turnstile) throw err;
      sitekey = String(d.turnstile);
      return once();
    }
  }
  const remember = () => { try { sessionStorage.setItem("door-email", addr); } catch { /* fine */ } };
  const goTo = (s: Step) => { setError(null); setStep(s); };

  /** step 1: the address decides the next step */
  async function continueWithEmail(e: FormEvent) {
    e.preventDefault();
    if (!addr) return;
    setBusy(true); setError(null);
    try {
      const r = await guarded<{ exists: boolean }>("/auth/exists", { email: addr }, "door");
      remember();
      setPassword("");
      if (r.exists) { setPurpose("signin"); goTo("password"); }
      else { setPurpose("signup"); goTo("newPassword"); }
    } catch (err) { fail(err); }
    setBusy(false);
  }

  /** the password of an existing account */
  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true); setError(null);
    try {
      await guarded("/auth/login", { email: addr, password: await stretch(addr, password) }, "login");
      await refresh();
    } catch (err) {
      const d = err instanceof ApiError ? err.data : {};
      if (d.error === "wrong") setError(() => (w: typeof DICTS.fr) => w.wrongLogin); else fail(err);
      setBusy(false);
    }
  }

  /** a code by e-mail, for the three reasons; the step shows the boxes even when the last code is still fresh */
  async function sendCode(why: Purpose) {
    setBusy(true); setError(null);
    try {
      await guarded("/auth/code", { email: addr, lang, why }, "code");
      remember();
      setPurpose(why); setCode(""); setWait(30); goTo("code");
    } catch (err) {
      const d = err instanceof ApiError ? err.data : {};
      if (d.error === "wait") { setPurpose(why); setCode(""); setWait(Number(d.wait) || 30); goTo("code"); }
      else fail(err);
    }
    setBusy(false);
  }

  /** six digits typed or pasted: checked at once, for whatever the code was asked for */
  async function verify(c = code) {
    if (c.length !== 6) return;
    setBusy(true); setError(null);
    try {
      if (purpose === "signin") {
        await api("/auth/signin-code", { email: addr, code: c });
        await refresh();
        return;
      }
      const r = await api<{ proof: string; exists: boolean }>("/auth/verify", { email: addr, code: c });
      if (purpose === "signup") {
        // the password was chosen before the code: the account is created now and the door opens
        await api("/auth/password", { email: addr, proof: r.proof, password: await stretch(addr, password), terms: r.exists ? undefined : true, lang });
        try { sessionStorage.removeItem("door-email"); } catch { /* fine */ }
        await refresh();
        return;
      }
      setProof(r.proof); setPassword(""); goTo("resetPassword");
    } catch (err) {
      const d = err instanceof ApiError ? err.data : {};
      if (d.error === "expired" && purpose === "signup") { setCode(""); fail(err); }
      else { fail(err); setShake((n) => n + 1); setCode(""); }
    }
    setBusy(false);
  }
  useEffect(() => { if (step === "code" && code.length === 6 && !busy) void verify(code); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  /** the new password after a forgotten one */
  async function saveNewPassword(e: FormEvent) {
    e.preventDefault();
    if (strength(password) < 1) return;
    setBusy(true); setError(null);
    try {
      await api("/auth/password", { email: addr, proof, password: await stretch(addr, password), lang });
      try { sessionStorage.removeItem("door-email"); } catch { /* fine */ }
      await refresh();
    } catch (err) {
      const d = err instanceof ApiError ? err.data : {};
      if (d.error === "expired") { goTo("email"); setError(() => (w: typeof DICTS.fr) => w.codeExpired); } else fail(err);
      setBusy(false);
    }
  }

  const s = strength(password);
  const stepText = purpose === "signup" ? (step === "email" ? t.step(1) : step === "newPassword" ? t.step(2) : step === "code" ? t.step(3) : undefined) : undefined;
  const title = step === "email" ? t.signInTitle : step === "password" ? t.welcomeBack : step === "newPassword" ? t.createAccount : step === "code" ? t.checkInbox : t.newPassword;
  /** the address in use, as one chip; its pencil goes back to the first step */
  const addressLine = (
    <div className="auth-chip">
      <span className="auth-chip-mail"><Icon name="mail" size={16} /><span>{addr}</span></span>
      <button type="button" className="auth-chip-edit" onClick={() => goTo("email")} aria-label={t.changeAddress} title={t.changeAddress}><Icon name="pencil" size={15} /></button>
    </div>
  );

  return (
    <AuthShell step={stepText} hero={step === "email" ? "full" : "small"}>
      <h1 className="auth-title">{title}</h1>

      {step === "email" && (
        <form onSubmit={continueWithEmail} className="auth-form" noValidate>
          <Field id="email" label={t.yourEmail} error={errorLine}>
            <input id="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus aria-invalid={!!error || undefined} aria-describedby="email-error" />
          </Field>
          <Button type="submit" kind="primary" className="full" busy={busy} disabled={!addr}>{t.continue}</Button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={signIn} className="auth-form" noValidate>
          {addressLine}
          <input type="email" autoComplete="username" value={addr} readOnly hidden />
          <Field id="password" label={t.password} error={errorLine}>
            <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" invalid={!!error} autoFocus />
          </Field>
          <Button type="submit" kind="primary" className="full" busy={busy} disabled={!password}>{t.signIn}</Button>
          <div className="auth-links center">
            <button type="button" className="linklike" disabled={busy} onClick={() => void sendCode("reset")}>{t.forgot}</button>
          </div>
        </form>
      )}

      {step === "newPassword" && (
        <form onSubmit={(e) => { e.preventDefault(); if (s >= 1 && terms) void sendCode("signup"); }} className="auth-form" noValidate>
          {addressLine}
          <input type="email" autoComplete="username" value={addr} readOnly hidden />
          <Field id="password" label={`${t.password} · ${t.passwordHint}`} error={errorLine}>
            <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
          </Field>
          <div className="terms">
            {[...t.terms, null].map((line, i) => (
              <label className="term" key={i}>
                <input type="checkbox" checked={ticks[i]} onChange={(e) => tick(i, e.target.checked)} />
                <span>{line ?? <>{t.termsRead} <a href="/terms" target="_blank" rel="noopener">{t.termsLink}</a> {t.termsEnd}</>}</span>
              </label>
            ))}
          </div>
          <Button type="submit" kind="primary" className="full" busy={busy} disabled={s < 1 || !terms}>{t.getCode}</Button>
        </form>
      )}

      {step === "code" && (
        <div className="auth-form">
          {addressLine}
          <CodeBoxes value={code} onChange={setCode} shake={shake} disabled={busy} />
          <span className="afield-error" role={error ? "alert" : undefined}>{errorLine ?? ""}</span>
          <Button kind="primary" className="full" busy={busy} disabled={code.length !== 6} onClick={() => void verify()}>{purpose === "signup" ? t.createMine : t.continue}</Button>
          <div className="auth-links center">
            <button type="button" className="linklike" disabled={wait > 0 || busy} onClick={() => void sendCode(purpose)}>{wait > 0 ? t.resendIn(wait) : t.resend}</button>
          </div>
        </div>
      )}

      {step === "resetPassword" && (
        <form onSubmit={saveNewPassword} className="auth-form" noValidate>
          {addressLine}
          <input type="email" autoComplete="username" value={addr} readOnly hidden />
          <Field id="password" label={`${t.password} · ${t.passwordHint}`} error={errorLine}>
            <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
          </Field>
          <Button type="submit" kind="primary" className="full" busy={busy} disabled={s < 1}>{t.savePassword}</Button>
        </form>
      )}
      <div className="ts-slot" id="ts-slot" />
    </AuthShell>
  );
}
