import { Component, StrictMode, useCallback, useEffect, useMemo, useState, createContext, useContext, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "../ui/tokens.css";
import "../ui/base.css";
import "./app.css";
import { Toast } from "../ui/ui.tsx";
import { useLocation, replace } from "../ui/router.ts";
import { api, ApiError, type Me } from "./api.ts";
import { watchRequests, setCacheOwner, staleBundle, keepBundle } from "./api-cache.ts";
import { installGuardFetch } from "./guard-fetch.ts";
import { setScoringPerson, keyStatusHere, onKeyChange } from "./sim/browser-score.ts";
import { setWorkOwner } from "./sim/work.ts";
import { DICTS, LangContext, guessLang, rememberLang, type Lang } from "./i18n.ts";
import { SignIn } from "./pages/SignIn.tsx";
import { Welcome } from "./pages/Welcome.tsx";
import { TermsAgain } from "./pages/TermsAgain.tsx";
import { Home } from "./pages/Home.tsx";
import { SectionPage, ExamCard, ResultPage, RunningBand, Redirect, EXAMS, seedRunning } from "./coce/pages/index.ts";
import { PracticeRoute, ExamSalle, ReviewRoute } from "./pages/CoceRooms.tsx";
import { Profile } from "./pages/Profile.tsx";
import { NotFound } from "./pages/NotFound.tsx";
import { Expression } from "./pages/Expression.tsx";
import { Room } from "./pages/Room.tsx";
import { Result } from "./pages/Result.tsx";
import { MockPage } from "./mock/MockPage.tsx";
import { Initiation } from "./mock/Initiation.tsx";
import { Sitting } from "./mock/Sitting.tsx";
import { MockResult } from "./mock/MockResult.tsx";
import { MockDetail } from "./mock/MockDetail.tsx";
import { MockBand } from "./mock/MockBand.tsx";
import { sweepClips } from "./sim/index.ts";
import { Frame } from "./Frame.tsx";
import { flush, pendingCount, setOwner } from "./coce/store.ts";

// recordings live only in this browser; the ones older than 30 days go when the app opens
sweepClips();

// ---- light or dark: light unless chosen otherwise; remembered on the device at once, on the account after ----
export type Theme = "light" | "dark";
const readTheme = (): Theme => { try { return localStorage.getItem("tcfm-theme") === "dark" ? "dark" : "light"; } catch { return "light"; } };
const paintTheme = (th: Theme) => { document.documentElement.dataset.theme = th; try { localStorage.setItem("tcfm-theme", th); } catch { /* private window */ } };
paintTheme(readTheme());
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: "light", setTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

// ---- the signed-in person, shared by every screen ----
type MeState = { me: Me | null | undefined; refresh: () => Promise<void>; /** true when the server took the change; false when it did not (the screen shows the old value again) */ update: (patch: Partial<Me> & { settings?: Record<string, unknown> }) => Promise<boolean>; signedOut: () => void };
const MeContext = createContext<MeState>({ me: undefined, refresh: async () => {}, update: async () => false, signedOut: () => {} });
export const useMe = () => useContext(MeContext);

const ToastContext = createContext<(text: string, tone?: "ok" | "bad") => void>(() => {});
export const useToast = () => useContext(ToastContext);

/** pages a signed-out person may see; everything else sends them to the door and back afterwards */
const PUBLIC = ["/sign-in"];

/**
 * The addresses used to be French (/connexion, /co/examen/3/salle…). Links in old e-mails and bookmarks still arrive:
 * each segment is translated and the person lands on the English address, nothing else changes.
 */
/** away this long, the app opens on the dashboard again */
const AWAY_MS = 20 * 60_000;
const OLD_SEGMENTS: Record<string, string> = { connexion: "sign-in", inscription: "sign-in", "mot-de-passe": "sign-in", bienvenue: "welcome", profil: "profile", examen: "exam", entrainement: "practice", salle: "room", resultat: "result", revoir: "review", sujets: "topics" };
const OLD_PARAMS: Record<string, string> = { mois: "month", partie: "part", vue: "view" };
/** segments that simply go: /ee/sujets (and the short-lived /ee/topics) are /ee now, where the topics live */
const GONE_SEGMENTS = new Set(["sujets", "topics"]);
export function modernize(path: string, search: string, hash = ""): string | null {
  const parts = path.split("/");
  let changed = false;
  const newPath = parts.filter((seg, i) => { if (i === 2 && GONE_SEGMENTS.has(seg) && /^(ee|eo)$/.test(parts[1])) { changed = true; return false; } return true; }).map((seg) => { const n = OLD_SEGMENTS[seg]; if (n) changed = true; return n ?? seg; }).join("/");
  const q = new URLSearchParams(search);
  for (const [old, now] of Object.entries(OLD_PARAMS)) {
    if (!q.has(old)) continue;
    const v = q.get(old)!;
    q.delete(old); q.set(now, v === "tache" ? "task" : v); changed = true;
  }
  if (q.has("next")) {
    const [np, ns] = q.get("next")!.split("?");
    const inner = modernize(np, ns ? `?${ns}` : "");
    if (inner) { q.set("next", inner); changed = true; }
  }
  let h = hash;
  if (h === "#cle") { h = "#key"; changed = true; }
  if (!changed) return null;
  const qs = q.toString();
  return `${newPath}${qs ? `?${qs}` : ""}${h}`;
}

watchRequests();
// the abuse guard's human check and block, for every call to our own server (web/app/guard-fetch.ts)
installGuardFetch();
// two traps no person can see or reach (off the screen, out of the tab order, hidden from screen readers): a link and a
// button. A program that follows every link or presses every button touches one, and the server blocks it
// (worker/guard.ts TRAPS)
(() => {
  const a = document.createElement("a");
  a.href = "/data/bank-full.json"; a.rel = "nofollow"; a.textContent = "Banque complète";
  const b = document.createElement("button");
  b.type = "button"; b.textContent = "Exporter";
  b.addEventListener("click", () => { void fetch("/api/me/archive", { method: "POST", credentials: "same-origin" }).catch(() => {}); });
  for (const el of [a, b]) { el.className = "hp"; el.tabIndex = -1; el.setAttribute("aria-hidden", "true"); document.body.appendChild(el); }
})();
// a file of this app that is gone (a deploy happened while the tab was open): the page reloads once to the new app
// (work in progress is kept by the rooms; a second failure within a minute is left to show)
window.addEventListener("vite:preloadError", (e) => {
  try {
    const last = Number(sessionStorage.getItem("tcfm-reloaded") ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem("tcfm-reloaded", String(Date.now()));
    e.preventDefault();
    location.reload();
  } catch { /* storage blocked: the error shows */ }
});

function App() {
  const { path } = useLocation();
  // moving to another screen sends the practice answers waiting here (the dashboard then counts them)
  useEffect(() => { if (pendingCount()) void flush(); }, [path]);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  // the marking in this browser needs to know who it marks for, and in which language it explains; the key and the
  // work it keeps are the person's own (sim/browser-score.ts, sim/work.ts)
  if (me) { setScoringPerson(me.id, me.lang === "en" ? "en" : "fr"); setWorkOwner(me.id); }
  const keyStatus = useSyncExternalStore(onKeyChange, keyStatusHere);
  const [localLang, setLocalLang] = useState<Lang>(guessLang);
  const [toast, setToast] = useState<{ text: string; tone?: "ok" | "bad" } | null>(null);
  const say = useCallback((text: string, tone?: "ok" | "bad") => setToast({ text, tone }), []);

  const refresh = useCallback(async () => {
    try {
      // the profile, and along with it every read the screens need that this browser does not hold (one request)
      const want = staleBundle();
      // the lists ride along; if that larger answer fails for any reason other than being signed out, the profile
      // alone is asked (the lists then come when a screen needs them): the door never stays shut on a working sign-in
      const who = await api<Me & { extra?: Record<string, unknown> }>(want.length ? `/me?with=${encodeURIComponent(want.join(","))}` : "/me")
        .catch((e) => { if (want.length && !(e instanceof ApiError && e.status === 401)) return api<Me & { extra?: Record<string, unknown> }>("/me"); throw e; });
      setOwner(who.id); // before any screen renders for them: the progress store must know whose answers it holds
      setScoringPerson(who.id, who.lang === "en" ? "en" : "fr"); // …and this device's key and work theirs
      setWorkOwner(who.id);
      setCacheOwner(who.id);
      keepBundle(who.extra);
      seedRunning((who as Me & { running?: Parameters<typeof seedRunning>[0] }).running);
      setMe(who);
      // the browser's time zone, so the exam mails come on the person's own « day before » and « day after »
      const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } })();
      if (tz && who.settings?.tz !== tz) void api("/me", { settings: { tz } }).catch(() => {});
      if (pendingCount()) void flush(); // answers kept while signed out go now
    }
    catch (e) { if (e instanceof ApiError && e.status === 401) { setOwner(null); setCacheOwner(null); setWorkOwner(null); setMe(null); } else setMe((m) => (m === undefined ? null : m)); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  // a tab that comes back into view after a while asks for the account again (one request): a key saved on the phone
  // unlocks the laptop's open tab, a goal changed elsewhere shows here
  useEffect(() => {
    let last = Date.now();
    const back = () => { if (document.visibilityState === "visible" && Date.now() - last > 60_000) { last = Date.now(); void refresh(); } };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [refresh]);
  // the session ended elsewhere (sign-out on another device, expiry): the door shows, the address is kept as `next`
  useEffect(() => {
    const gone = () => { setOwner(null); setMe((m) => (m ? null : m)); };
    window.addEventListener("tcfm:unauthorized", gone);
    return () => window.removeEventListener("tcfm:unauthorized", gone);
  }, []);

  /** a change shows at once and is saved in the background; when the server does not take it, the old value comes back */
  const update = useCallback(async (patch: Partial<Me> & { settings?: Record<string, unknown> }) => {
    let before: Me | null | undefined;
    setMe((m) => { before = m; return m ? { ...m, ...patch, settings: patch.settings ? { ...m.settings, ...patch.settings } : m.settings } : m; });
    try { setMe(await api<Me>("/me", patch)); return true; }
    catch (e) {
      setMe((m) => (m && before ? before : m));
      if (!(e instanceof ApiError && e.status === 401)) say(DICTS[localLang].networkError, "bad");
      return false;
    }
  }, [localLang, say]);

  const [theme, setThemeState] = useState<Theme>(readTheme);
  useEffect(() => { const th = me?.settings?.theme; if ((th === "dark" || th === "light") && th !== theme) { setThemeState(th); paintTheme(th); } }, [me?.settings?.theme]); // eslint-disable-line react-hooks/exhaustive-deps
  const setTheme = useCallback((th: Theme) => { setThemeState(th); paintTheme(th); if (me) update({ settings: { theme: th } }); }, [me, update]);
  const themeValue = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  const lang: Lang = me?.lang ?? localLang;
  const setLang = useCallback((l: Lang) => { rememberLang(l); setLocalLang(l); if (me) update({ lang: l }); }, [me, update]);
  const langValue = useMemo(() => ({ lang, t: DICTS[lang], setLang }), [lang, setLang]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  // an old French address: straight to its English twin, before anything else looks at it
  const modern = modernize(path, location.search, location.hash);
  useEffect(() => { if (modern) replace(modern); }, [modern]);

  // the door: signed out → /sign-in?next=…; signed in on the door → where they were going
  const isPublic = PUBLIC.includes(path);
  const next = new URLSearchParams(location.search).get("next");
  const safeNext = next && /^\/(?![\/\\])/.test(next) ? next : "/";
  useEffect(() => {
    if (me === undefined || modern) return;
    if (me === null && !isPublic) replace(`/sign-in${path === "/" ? "" : `?next=${encodeURIComponent(path + location.search)}`}`);
    else if (me && isPublic) replace(safeNext);
    else if (me && !me.name && path !== "/welcome") replace(`/welcome${path === "/" ? "" : `?next=${encodeURIComponent(path + location.search)}`}`);
    else if (me && me.name && path === "/welcome") replace(safeNext); // the sentence was written once; a return to it goes on
    // the terms changed since they were accepted: the three ticks once more, then on
    else if (me && me.name && me.terms_ok === false && path !== "/terms-again") replace(`/terms-again${path === "/" ? "" : `?next=${encodeURIComponent(path + location.search)}`}`);
    else if (me && me.terms_ok !== false && path === "/terms-again") replace(safeNext);
  }, [me, isPublic, path, safeNext, modern]);

  // the first page is the dashboard: a return after 20 minutes away (a refresh, a reopened tab) starts there, whatever the address was
  const homed = useRef(false);
  useEffect(() => {
    if (!me || !me.name || isPublic || modern) return;
    const now = Date.now();
    if (!homed.current) {
      homed.current = true;
      let seen = 0; try { seen = Number(localStorage.getItem("tcfm.seen")) || 0; } catch { /* none */ }
      if (path !== "/" && now - seen > AWAY_MS) { replace("/"); }
    }
    const mark = () => { try { localStorage.setItem("tcfm.seen", String(Date.now())); } catch { /* fine */ } };
    mark();
    const id = setInterval(mark, 60_000);
    document.addEventListener("visibilitychange", mark);
    window.addEventListener("pagehide", mark);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", mark); window.removeEventListener("pagehide", mark); };
  }, [me, isPublic, modern, path]);

  const signedOut = useCallback(() => { setOwner(null); setMe(null); }, []);
  // the screens read the key's state from `me`: the key on this device, never the account's
  const meHere = useMemo(() => (me ? { ...me, gemini_status: keyStatus } : me), [me, keyStatus]);
  const meValue = useMemo(() => ({ me: meHere, refresh, update, signedOut }), [meHere, refresh, update, signedOut]);

  let page;
  let m: RegExpMatchArray | null;
  /** the exam routes exist for n° 1 … 40 only (`/co/examen/41` is not a page) */
  const examNo = (s: string) => { const n = Number(s); return n >= 1 && n <= EXAMS ? n : null; };
  if (modern || me === undefined || (me === null && !isPublic) || (me && isPublic) || (me && me.name && path === "/welcome")) page = <Stuck lang={lang} />;
  else if (path === "/sign-in") page = <SignIn />;
  else if (path === "/welcome") page = <Welcome />;
  else if (path === "/terms-again") page = <TermsAgain />;
  // rooms bring their own frame (rail narrowed or hidden)
  else if ((m = path.match(/^\/(ee|eo)\/room\/([\w-]+)$/))) page = <Room s={m[1] as "ee" | "eo"} id={m[2]} />;
  else if ((m = path.match(/^\/(co|ce)\/practice\/(A1|A2|B1|B2|C1|C2)$/))) page = <PracticeRoute section={m[1] as "co" | "ce"} level={m[2] as "A1"} />;
  else if ((m = path.match(/^\/(co|ce)\/exam\/(\d{1,2})\/room$/)) && examNo(m[2])) page = <ExamSalle section={m[1] as "co" | "ce"} exam={Number(m[2])} />;
  else if ((m = path.match(/^\/(co|ce)\/exam\/(\d{1,2})\/result\/(\d+)\/review$/)) && examNo(m[2])) page = <ReviewRoute section={m[1] as "co" | "ce"} exam={Number(m[2])} attemptId={m[3]} />;
  // the mock exam (docs/MOCK-EXAM.md): the initiation page and the sitting fill the screen
  else if (path === "/mock/new") page = <Initiation />;
  else if ((m = path.match(/^\/mock\/(\d{1,12})$/))) page = <Sitting id={Number(m[1])} />;
  else {
    let inner;
    const saveSettings = (p: Record<string, unknown>) => { void update({ settings: p }); };
    if (path === "/") inner = <Home />;
    else if ((m = path.match(/^\/(ee|eo)(\/practice)?$/))) inner = <Expression s={m[1] as "ee" | "eo"} tab={m[2] ? "practice" : "topics"} />;
    else if ((m = path.match(/^\/(ee|eo)\/result\/([\w-]+)$/))) inner = <Result s={m[1] as "ee" | "eo"} id={m[2]} />;
    // the section opens on practice (the owner, 2026-10-23); the 40 exams are the second tab, /co/exam
    else if ((m = path.match(/^\/(co|ce)(\/exam)?$/))) inner = <SectionPage section={m[1] as "co" | "ce"} mode={m[2] ? "examen" : "entrainement"} lang={lang} settings={me?.settings} onSettings={saveSettings} />;
    else if ((m = path.match(/^\/(co|ce)\/practice$/))) inner = <Redirect to={`/${m[1]}`} />;
    else if ((m = path.match(/^\/(co|ce)\/exam\/(\d{1,2})$/)) && examNo(m[2])) inner = <ExamCard section={m[1] as "co" | "ce"} exam={Number(m[2])} lang={lang} settings={me?.settings} onSettings={saveSettings} />;
    else if ((m = path.match(/^\/(co|ce)\/exam\/(\d{1,2})\/result\/(\d+)$/)) && examNo(m[2])) inner = <ResultPage section={m[1] as "co" | "ce"} exam={Number(m[2])} attemptId={m[3]} lang={lang} />;
    else if (path === "/profile") inner = <Profile />;
    else if (path === "/mock") inner = <MockPage />;
    else if ((m = path.match(/^\/mock\/(\d{1,12})\/result$/))) inner = <MockResult id={Number(m[1])} />;
    else if ((m = path.match(/^\/mock\/(\d{1,12})\/result\/(co|ce|ee|eo)$/))) inner = <MockDetail id={Number(m[1])} test={m[2] as "co"} />;
    else inner = <NotFound />;
    page = <Frame band={<><RunningBand lang={lang} path={path} /><MockBand lang={lang} path={path} /></>}>{inner}</Frame>;
  }

  return (
    <LangContext.Provider value={langValue}>
      <ThemeContext.Provider value={themeValue}>
      <MeContext.Provider value={meValue}>
        <ToastContext.Provider value={say}>
          {page}
          {toast && <Toast text={toast.text} tone={toast.tone} onDone={() => setToast(null)} />}
        </ToastContext.Provider>
      </MeContext.Provider>
      </ThemeContext.Provider>
    </LangContext.Provider>
  );
}

/** what shows instead of an empty page: the start that takes too long, or a page that could not be drawn */
function Stuck({ lang, crashed }: { lang: Lang; crashed?: boolean }) {
  const t = DICTS[lang];
  return (
    <div className="boot boot-stuck" role="status" data-now={crashed || undefined}>
      <p><b>{crashed ? t.crashed : t.bootSlow}</b></p>
      <button type="button" className="btn primary" onClick={() => location.reload()}>{t.reload}</button>
      <p className="muted small">{t.stillStuck} <a href="https://t.me/tcfmonsteradmin" target="_blank" rel="noreferrer">@tcfmonsteradmin</a></p>
    </div>
  );
}

/** a screen that throws while drawing: the message and « Recharger », never a blank page */
class Catch extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Stuck lang={guessLang()} crashed /> : this.props.children; }
}

createRoot(document.getElementById("root")!).render(<StrictMode><Catch><App /></Catch></StrictMode>);
