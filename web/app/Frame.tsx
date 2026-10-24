// The app's frame. Laptop and tablet: a rail on the left — the logo (it leads to the public site, like the wordmark),
// then three groups set apart: Home; the four section marks (icon above its two letters); the mock exam — then the
// language, the light/dark switch and the avatar at the bottom. Phone: a top bar with the logo and the wordmark (the
// site), and a bottom bar with CO · CE at the left, Home in the middle (its own colour), EE · EO at the right. The rail has no button: it narrows by
// itself to icons when a room opens (practice questions, a practice simulator) and widens again when the room closes;
// an exam hides it entirely. The language switch sits in the top right corner. No footer.
// Phone: a thin top bar and a bottom bar; rooms hide the bottom bar.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BetaTag, Icon, Wordmark, type Section } from "../ui/ui.tsx";
import { linkProps, useLocation } from "../ui/router.ts";
import { useT, type Lang } from "./i18n.ts";
import { useMe, useTheme } from "./main.tsx";

const SECTIONS: Section[] = ["co", "ce", "ee", "eo"];
/** the two languages, in the order the open pill shows them (EN at the top / left, FR under / right of it) */
const LANGS: Lang[] = ["en", "fr"];
/** the open pill closes this long after the pointer leaves it (or after a pick on a phone) */
const CLOSE_AFTER_MS = 2000;

/** how much room the page takes: `app` pages, a `room` (rail narrowed to icons) or an `exam` (no rail, no bars) */
export type FrameMode = "app" | "room" | "exam";

function Avatar({ name }: { name: string | null }) {
  return <span className="avatar-sm" aria-hidden="true">{(name ?? "?")[0].toUpperCase()}</span>;
}

/**
 * The phone's avatar menu (the top bar holds the logo, the name and the avatar alone): a tap on the avatar opens a
 * small menu under it with three rows — the language (EN | FR), the theme (sun | moon), Réglages. The same settings
 * the rail carries on a laptop. It closes on a tap outside, on Escape, and when a row leads somewhere.
 */
function AvatarMenu({ name, here }: { name: string | null; here: string }) {
  const { t, lang, setLang } = useT();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  const seg = (on: boolean) => (on ? "true" : "false");
  return (
    <div ref={box} className="avmenu-box">
      <button type="button" className="avmenu-btn" aria-label={t.menu} aria-haspopup="menu" aria-expanded={open} data-here={here === "/profile" || undefined} onClick={() => setOpen((o) => !o)}>
        <Avatar name={name} />
      </button>
      {open && (
        <div className="avmenu" role="menu">
          <div className="avmenu-row">
            <span>{t.langWord}</span>
            <span className="avmenu-seg" role="radiogroup" aria-label={t.langWord}>
              {LANGS.map((l) => <button key={l} type="button" role="radio" aria-checked={seg(l === lang)} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
            </span>
          </div>
          <div className="avmenu-row">
            <span>{t.themeWord}</span>
            <span className="avmenu-seg" role="radiogroup" aria-label={t.themeWord}>
              <button type="button" role="radio" aria-checked={seg(theme === "light")} aria-label={t.lightMode} onClick={() => setTheme("light")}><Icon name="sun" size={15} /></button>
              <button type="button" role="radio" aria-checked={seg(theme === "dark")} aria-label={t.darkMode} onClick={() => setTheme("dark")}><Icon name="moon" size={15} /></button>
            </span>
          </div>
          <a className="avmenu-row avmenu-link" role="menuitem" {...linkProps("/profile")} onClick={(e) => { setOpen(false); linkProps("/profile").onClick?.(e); }}>
            <span>{t.settings}</span><Icon name="chevronRight" size={18} />
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * The language: one pill. Closed, it is one round button showing the language in use. A click opens it: the pill grows
 * (upward on the rail, leftward on the phone's top bar) to show both languages in a fixed order — EN then FR — with a
 * dark thumb under the one in use. A click on the other slides the thumb there and changes the language; the pill
 * stays open. It closes two seconds after the pointer leaves it (coming back in time cancels), on Escape, when the
 * focus leaves, and on a phone two seconds after a pick or at a tap elsewhere; it closes onto the language in use.
 * One track holds both languages: the pill's size and the track's offset move together, so nothing jumps.
 */
export function LangSwitch({ tabIndex, dir }: { tabIndex?: number; /** "left": the pill grows to the left (a top bar) */ dir?: "left" }) {
  const { lang, setLang } = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovering = useRef(false);
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const closeSoon = () => { cancel(); timer.current = setTimeout(() => setOpen(false), CLOSE_AFTER_MS); };
  useEffect(() => cancel, []);
  // a tap elsewhere (phones have no pointer to leave with)
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const enter = (e: React.PointerEvent) => { if (e.pointerType === "touch") return; hovering.current = true; cancel(); };
  const leave = (e: React.PointerEvent) => { if (e.pointerType === "touch") return; hovering.current = false; if (open) closeSoon(); };
  const press = (l: Lang) => {
    if (!open) { cancel(); setOpen(true); return; }
    if (l !== lang) setLang(l);
    if (!hovering.current) closeSoon();
  };
  return (
    <div ref={box} className="lang" data-dir={dir} data-open={open || undefined} data-lang={lang} onPointerEnter={enter} onPointerLeave={leave}
      onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <div className="lang-pill">
        <div className="lang-track">
          <i className="lang-thumb" aria-hidden="true" />
          {LANGS.map((l) => {
            const now = l === lang;
            return (
              <button key={l} type="button" className="lang-opt" data-now={now || undefined} aria-current={now ? "true" : undefined}
                aria-label={l === "fr" ? (now ? "Français" : "Passer en français") : now ? "English" : "Switch to English"}
                aria-expanded={now ? open : undefined}
                onClick={() => press(l)} tabIndex={open || now ? tabIndex : -1}>
                {l.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ThemeSwitch({ tabIndex }: { tabIndex?: number }) {
  const { theme, setTheme } = useTheme();
  const { t } = useT();
  const dark = theme === "dark";
  return (
    <button type="button" className="theme-switch" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? t.lightMode : t.darkMode} title={dark ? t.lightMode : t.darkMode} tabIndex={tabIndex}>
      <Icon name={dark ? "sun" : "moon"} size={20} />
    </button>
  );
}

function TabLink({ s, here, label }: { s: Section; here: string; label: string }) {
  return (
    <a {...linkProps(`/${s}`)} aria-current={here === `/${s}` ? "page" : undefined} aria-label={label}>
      <Icon name={s} size={22} /><span className="code">{s.toUpperCase()}</span>
    </a>
  );
}

export function Frame({ children, mode = "app", band }: { children: ReactNode; mode?: FrameMode; band?: ReactNode }) {
  const { path } = useLocation();
  const { me } = useMe();
  const { t, lang } = useT();
  const here = "/" + (path.split("/")[1] ?? "");
  const tab = mode === "exam" ? -1 : undefined;

  return (
    <div className={`frame mode-${mode}`}>
      <a className="skip" href="#main">{t.skip}</a>

      <nav className="rail" aria-label="Sections" aria-hidden={mode === "exam" || undefined}>
        <a className="rail-logo" href="/about" aria-label={t.aboutSite} title={t.aboutSite} tabIndex={tab}>
          <img src="/app-icon.svg" alt="" width="44" height="44" />
        </a>
        <div className="rail-group">
          <a className="rail-item" {...linkProps("/")} aria-current={here === "/" ? "page" : undefined} title={t.home} aria-label={t.home} tabIndex={tab}>
            <Icon name="home" size={22} />
          </a>
        </div>
        <div className="rail-group">
          {SECTIONS.map((s) => (
            <a key={s} className="rail-item" {...linkProps(`/${s}`)} aria-current={here === `/${s}` ? "page" : undefined} title={t.sectionNames[s]} aria-label={t.sectionNames[s]} tabIndex={tab}>
              <Icon name={s} size={22} />
              <span className="rail-code">{s.toUpperCase()}</span>
            </a>
          ))}
        </div>
        <div className="rail-group">
          <a className="rail-item" {...linkProps("/mock")} aria-current={here === "/mock" ? "page" : undefined} title={t.mockExam} aria-label={t.mockExam} tabIndex={tab}>
            <Icon name="mock" size={22} />
            <span className="rail-code rail-code-sm">{t.mockCode}</span>
          </a>
        </div>
        <span className="spacer" />
        <LangSwitch tabIndex={tab} />
        <ThemeSwitch tabIndex={tab} />
        <a className="rail-item rail-me" {...linkProps("/profile")} aria-current={here === "/profile" ? "page" : undefined} title={t.profile} aria-label={t.profile} tabIndex={tab}>
          <Avatar name={me?.name ?? null} />
        </a>
      </nav>

      <header className="topbar">
        <a className="brand" href="/about" aria-label={t.aboutSite}><img className="logo" src="/app-icon.svg" alt="" width="30" height="30" /><Wordmark /><BetaTag lang={lang} /></a>
        <span className="spacer" />
        <AvatarMenu name={me?.name ?? null} here={here} />
      </header>

      <div className="frame-main">
        {/* the name leads to the public site (tcf.monster/about), like the rail's logo; Home is the dashboard */}
        {mode === "app" && <div className="frame-top"><a className="frame-mark" href="/about" aria-label={t.aboutSite} title={t.aboutSite}><Wordmark /><BetaTag lang={lang} /></a></div>}
        {band}
        <main id="main" className={`page-app mode-${mode}`}>{children}</main>
      </div>

      <nav className="tabbar" aria-label="Sections">
        {SECTIONS.slice(0, 2).map((s) => <TabLink key={s} s={s} here={here} label={t.sectionNames[s]} />)}
        <a className="tab-home" {...linkProps("/")} aria-current={here === "/" ? "page" : undefined} aria-label={t.home}><span className="tab-home-dot"><img src="/app-icon.svg" alt="" width="44" height="44" /></span></a>
        {SECTIONS.slice(2).map((s) => <TabLink key={s} s={s} here={here} label={t.sectionNames[s]} />)}
      </nav>
    </div>
  );
}
