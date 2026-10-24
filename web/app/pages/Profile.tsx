// Settings (the structure the owner chose): three sections under a side nav — Profile, Account (the e-mail, the
// password, then « Se déconnecter » and « Supprimer le compte » side by side), Gemini key (what it is for, said even
// while it works, then its state) —, every line is « label · value · one button ». Every change is saved the moment it is confirmed; « Saved » only once
// the server has it; a refused change comes back to the old value by itself (main.tsx `update`). The password changes
// only with a code sent by e-mail.
import { forgetKeyHere, forgetAskedHere } from "../sim/browser-score.ts";
import { forgetMocksHere } from "../mock/store.ts";
import { dropAllWork } from "../sim/work.ts";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BackLink, Button, Sheet, Chip, Icon, MonsterAI } from "../../ui/ui.tsx";
import { replace } from "../../ui/router.ts";
import { useT, longDate } from "../i18n.ts";
import { useMe, useToast } from "../main.tsx";
import { api, ApiError, stretch, strength } from "../api.ts";
import { KeyPanel } from "./KeySheet.tsx";
import { CodeBoxes, PasswordInput, Strength } from "./AuthInputs.tsx";
import { Field } from "./AuthShell.tsx";
import { Calendar, CalendarPop } from "../Calendar.tsx";
import { flush, forgetDevice } from "../coce/store.ts";
import "./profile.css";

const TARGETS = [4, 5, 6, 7, 8, 9, 10, 11, 12];
type SheetName = null | "delete" | "code" | "removeKey" | "password" | "signOut";

/** the settings page's own words (FR / EN), kept here so the shared dictionary stays untouched */
const SW = {
  fr: {
    title: "Réglages", profile: "Profil", account: "Compte", key: "Clé Gemini",
    name: "Prénom", target: "Objectif", targetHelp: "le niveau NCLC que vous visez", date: "Date de l'examen", notRegistered: "pas encore inscrit·e",
    email: "E-mail", password: "Mot de passe", passwordHelp: "changé avec un code envoyé par e-mail", passwordSet: "••••••••",
    keyStatus: "État",
    change: "Modifier", save: "Enregistrer", cancel: "Annuler", remove: "Retirer", signOut: "Se déconnecter", signOutKeep: "Garder mon travail ici", signOutErase: "Tout effacer de cet appareil", delete: "Supprimer le compte", deleteShort: "Supprimer",
    keyWhyShort1: "", keyWhyShort2: " tourne sur Gemini avec votre clé gratuite, gardée dans ce navigateur.",
    keyWhy1: "L'examinatrice de l'expression orale et la correction de vos textes, c'est ", keyWhy2: ", propulsé par Gemini, l'IA de Google. Votre propre clé gratuite le fait tourner : elle reste dans ce navigateur et ne va qu'à Google, pour vos séances. Sans elle, l'expression écrite et orale se verrouillent.",
    pwTitle: "Nouveau mot de passe", pwLead: (e: string) => `Un code a été envoyé à ${e}.`, pwGet: "Recevoir un code", newPw: "Nouveau mot de passe · 8 caractères ou plus", pwSaved: "Mot de passe changé",
  },
  en: {
    title: "Settings", profile: "Profile", account: "Account", key: "Gemini key",
    name: "First name", target: "Goal", targetHelp: "the NCLC level you aim for", date: "Exam date", notRegistered: "not registered yet",
    email: "E-mail", password: "Password", passwordHelp: "changed with a code sent by e-mail", passwordSet: "••••••••",
    keyStatus: "Status",
    change: "Change", save: "Save", cancel: "Cancel", remove: "Remove", signOut: "Sign out", signOutKeep: "Keep my work here", signOutErase: "Erase everything from this device", delete: "Delete account", deleteShort: "Delete",
    keyWhyShort1: "", keyWhyShort2: " runs on Gemini with your free key, kept in this browser.",
    keyWhy1: "The speaking examiner and the marking of your texts are ", keyWhy2: ", powered by Gemini, Google's AI. Your own free key runs it: it stays in this browser and goes only to Google, for your sessions. Without it, writing and speaking lock.",
    pwTitle: "New password", pwLead: (e: string) => `A code was sent to ${e}.`, pwGet: "Get a code", newPw: "New password · 8 characters or more", pwSaved: "Password changed",
  },
};

/** one line: the label (and a small help), the value, one action on the right; `editor` replaces the value while editing */
function Row({ label, help, value, action, editing, editor }: { label: string; help?: string; value: ReactNode; action?: ReactNode; editing?: boolean; editor?: ReactNode }) {
  return (
    <div className="srow">
      <span className="srow-label">{label}{help && <span className="srow-help">{help}</span>}</span>
      {editing ? <div className="srow-edit">{editor}</div> : <div className="srow-value">{value}</div>}
      {!editing && action && <span className="srow-act">{action}</span>}
    </div>
  );
}

export function Profile() {
  const { t, lang } = useT();
  const w = SW[lang];
  const { me, update, signedOut } = useMe();
  const say = useToast();
  const [edit, setEdit] = useState<null | "name" | "target" | "date">(null);
  const [name, setName] = useState(me?.name ?? "");
  const [sheet, setSheet] = useState<SheetName>(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [here, setHere] = useState<string>("profile");
  const closeCal = useCallback(() => setEdit((e) => (e === "date" ? null : e)), []);
  useEffect(() => { setName(me?.name ?? ""); }, [me?.name]);
  useEffect(() => { if (location.hash === "#key") { setHere("key"); setTimeout(() => document.getElementById("key")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); } }, []);
  if (!me) return null;

  const save = async (patch: Parameters<typeof update>[0]) => { if (await update(patch)) say(t.saved); setEdit(null); };

  /** keep: the texts, marks and Gemini key stay in this browser for the next sign-in here (they exist nowhere else);
   *  erase: a shared computer, nothing of the person stays */
  async function signOut(erase: boolean) {
    setBusy(true);
    await flush().catch(() => {});
    await api("/auth/logout", {}).catch(() => {});
    forgetDevice();
    if (erase) { forgetKeyHere(); await dropAllWork().catch(() => {}); await forgetMocksHere().catch(() => {}); forgetAskedHere(); }
    signedOut(); replace("/sign-in");
  }
  async function askDeleteCode() {
    setBusy(true); setError(null);
    try { await api("/me/delete/code", {}); setSheet("code"); setCode(""); }
    catch (e) { const d = e instanceof ApiError ? e.data : {}; if (d.error === "wait") { setSheet("code"); setCode(""); } else setError(d.error === "too_many" ? t.tooMany : d.error === "mail" ? t.mailFailed : t.networkError); }
    setBusy(false);
  }
  async function deleteNow() {
    setBusy(true); setError(null);
    // the account gone: what this device kept for the person goes too (the key, the texts and transcripts)
    try { await api("/me/delete", { code }); forgetDevice(); forgetKeyHere(); await dropAllWork(); signedOut(); replace("/sign-in"); say(t.accountDeleted); }
    catch (e) { const d = e instanceof ApiError ? e.data : {}; setError(d.error === "wrong" ? t.codeWrong : d.error === "expired" ? t.codeExpired : t.networkError); if (d.error === "wrong") { setShake((n) => n + 1); setCode(""); } setBusy(false); }
  }
  /** a new password while signed in: the same code flow as the door; every other device is signed out by the server */
  async function askPasswordCode() {
    setBusy(true); setError(null); setCode(""); setPw("");
    try { await api("/auth/code", { email: me!.email, lang, why: "password" }); setSheet("password"); }
    catch (e) { const d = e instanceof ApiError ? e.data : {}; if (d.error === "wait") setSheet("password"); else say(d.error === "too_many" ? t.tooMany : d.error === "mail" ? t.mailFailed : t.networkError, "bad"); }
    setBusy(false);
  }
  async function savePassword() {
    if (code.length !== 6 || strength(pw) < 1) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ proof: string }>("/auth/verify", { email: me!.email, code });
      await api("/auth/password", { email: me!.email, proof: r.proof, password: await stretch(me!.email, pw), lang });
      setSheet(null); say(w.pwSaved);
    } catch (e) {
      const d = e instanceof ApiError ? e.data : {};
      setError(d.error === "wrong" ? t.codeWrong : d.error === "expired" ? t.codeExpired : d.error === "network" ? t.networkError : t.serverError);
      if (d.error === "wrong") { setShake((n) => n + 1); setCode(""); }
    } finally { setBusy(false); }
  }

  const keyChip = <Chip tone={me.gemini_status === "ok" ? "ok" : me.gemini_status === "quota" ? "amber" : me.gemini_status === "none" ? "new" : "bad"} dot>{me.gemini_status === "ok" ? t.keyOk : me.gemini_status === "quota" ? t.keyQuota : me.gemini_status === "none" ? t.keyNone : t.keyError}</Chip>;

  /* ---------- the four groups, the same in both structures ---------- */
  const profile = (
    <>
      <Row label={w.name} value={me.name} editing={edit === "name"} action={<Button size="sm" kind="quiet" onClick={() => setEdit("name")}><span className="desk-only">{w.change}</span><Icon name="chevronRight" size={18} className="mob-only" /></Button>}
        editor={<>
          <input value={name} maxLength={40} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void save({ name: name.trim() }); if (e.key === "Escape") setEdit(null); }} aria-label={w.name} />
          <Button size="sm" kind="primary" disabled={!name.trim()} onClick={() => void save({ name: name.trim() })}>{w.save}</Button>
          <Button size="sm" kind="quiet" onClick={() => { setName(me.name ?? ""); setEdit(null); }}>{w.cancel}</Button>
        </>} />
      <Row label={w.target} help={w.targetHelp} value={me.target_nclc ? `NCLC ${me.target_nclc}` : "—"} editing={edit === "target"} action={<Button size="sm" kind="quiet" onClick={() => setEdit("target")}><span className="desk-only">{w.change}</span><Icon name="chevronRight" size={18} className="mob-only" /></Button>}
        editor={<>
          <select defaultValue={me.target_nclc ?? 7} autoFocus onChange={(e) => void save({ target_nclc: Number(e.target.value) })} aria-label={w.target}>
            {TARGETS.map((n) => <option key={n} value={n}>NCLC {n}</option>)}
          </select>
          <Button size="sm" kind="quiet" onClick={() => setEdit(null)}>{w.cancel}</Button>
        </>} />
      <Row label={w.date} value={me.exam_date ? longDate(me.exam_date, lang) : <span className="muted">{w.notRegistered}</span>}
        action={<span className="cal-anchor">
          <Button size="sm" kind="quiet" aria-expanded={edit === "date"} aria-haspopup="dialog" onClick={() => setEdit(edit === "date" ? null : "date")}><span className="desk-only">{w.change}</span><Icon name="chevronRight" size={18} className="mob-only" /></Button>
          <CalendarPop open={edit === "date"} onClose={closeCal} align="end">
            <Calendar value={me.exam_date} none={!me.exam_date} onPick={(d) => void save({ exam_date: d })} onNone={() => void save({ exam_date: null })} />
          </CalendarPop>
        </span>} />
    </>
  );
  const account = (
    <>
      <Row label={w.email} value={me.email} />
      <Row label={w.password} help={w.passwordHelp} value={w.passwordSet} action={<Button size="sm" kind="quiet" busy={busy && sheet === null && edit === null} onClick={askPasswordCode}><span className="desk-only">{w.change}</span><Icon name="chevronRight" size={18} className="mob-only" /></Button>} />
      <div className="sacct-actions">
        <Button busy={busy && sheet === null && edit === null} onClick={() => setSheet("signOut")}><Icon name="external" size={16} className="mob-only" />{w.signOut}</Button>
        <Button kind="danger" onClick={() => { setError(null); setSheet("delete"); }}><Icon name="x" size={16} className="mob-only" /><span className="desk-only">{w.delete}</span><span className="mob-only">{w.deleteShort}</span></Button>
      </div>
    </>
  );
  // what the key is for, said whatever its state; with no key the panel's steps follow (it says the same in its lead)
  const key = me.gemini_status === "none" ? <KeyPanel onSaved={() => say(t.keyOk)} /> : (
    <>
      <p className="skey-why"><span className="desk-only">{w.keyWhy1}<MonsterAI />{w.keyWhy2}</span><span className="mob-only">{w.keyWhyShort1}<MonsterAI />{" "}{w.keyWhyShort2.trim()}</span></p>
      <Row label={w.keyStatus} value={keyChip} action={<Button size="sm" kind="quiet" className="skey-remove" onClick={() => setSheet("removeKey")}><span className="desk-only">{t.keyRemove}</span><span className="mob-only">{w.remove}</span></Button>} />
    </>
  );

  const sheets = (
    <>
      <Sheet open={sheet === "removeKey"} title={t.keyRemoveTitle} onClose={() => setSheet(null)} actions={<>
        <Button onClick={() => setSheet(null)}>{t.cancel}</Button>
        <Button kind="danger" onClick={() => { forgetKeyHere(); setSheet(null); }}>{t.keyRemove}</Button>
      </>}><p>{t.keyRemoveBody}</p></Sheet>
      <Sheet open={sheet === "signOut"} title={w.signOut} onClose={() => setSheet(null)} actions={<>
        <Button kind="danger" busy={busy} onClick={() => void signOut(true)}>{w.signOutErase}</Button>
        <Button kind="primary" busy={busy} onClick={() => void signOut(false)}>{w.signOutKeep}</Button>
      </>} />
      <Sheet open={sheet === "delete"} title={t.deleteTitle} onClose={() => setSheet(null)} actions={<>
        <Button onClick={() => setSheet(null)}>{t.cancel}</Button>
        <Button kind="primary" busy={busy} onClick={askDeleteCode}>{t.sendDeleteCode}</Button>
      </>}><p>{t.deleteBody}</p>{error && <p className="bad-text" role="alert">{error}</p>}</Sheet>
      <Sheet open={sheet === "code"} title={t.deleteCodeTitle} onClose={() => setSheet(null)} actions={<>
        <Button onClick={() => setSheet(null)}>{t.cancel}</Button>
        <Button kind="danger" busy={busy} disabled={code.length !== 6} onClick={deleteNow}>{t.deleteNow}</Button>
      </>}>
        <p>{t.codeSentTo} <strong>{me.email}</strong></p>
        <CodeBoxes value={code} onChange={setCode} shake={shake} disabled={busy} />
        {error && <p className="bad-text" role="alert">{error}</p>}
      </Sheet>
      <Sheet open={sheet === "password"} title={w.pwTitle} onClose={() => setSheet(null)} actions={<>
        <Button onClick={() => setSheet(null)}>{t.cancel}</Button>
        <Button kind="primary" busy={busy} disabled={code.length !== 6 || strength(pw) < 1} onClick={savePassword}>{w.save}</Button>
      </>}>
        <p>{w.pwLead(me.email)}</p>
        <CodeBoxes value={code} onChange={setCode} shake={shake} disabled={busy} />
        <input type="email" autoComplete="username" value={me.email} readOnly hidden />
        <Field id="new-password" label={w.newPw}><PasswordInput id="new-password" value={pw} onChange={setPw} autoComplete="new-password" /></Field>
        <Strength password={pw} />
        {error && <p className="bad-text" role="alert">{error}</p>}
      </Sheet>
    </>
  );

  const top = <div className="settings-top"><span className="mob-only"><BackLink to="/" label={t.home} word={false} /></span><h1>{w.title}</h1></div>;

  const jump = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); setHere(id); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return (
    <div className="settings">
      {top}
      <div className="sb">
        <nav className="sb-nav" aria-label={w.title}>
          {([["profile", w.profile], ["account", w.account], ["key", w.key]] as const).map(([id, label]) => <a key={id} href={`#${id}`} aria-current={here === id || undefined} onClick={jump(id)}>{label}</a>)}
        </nav>
        <div className="sb-main">
          <section className="card" id="profile"><h2>{w.profile}</h2><div className="sg">{profile}</div></section>
          <section className="card" id="account"><h2>{w.account}</h2><div className="sg">{account}</div></section>
          <section className="card" id="key"><h2>{w.key}</h2><div className="sg">{key}</div></section>
        </div>
      </div>
      {sheets}
    </div>
  );
}
