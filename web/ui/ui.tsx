// The design system's components, shared by the admin now and the app in stage 3.
import { useEffect, useId, useRef, type ReactNode, type ButtonHTMLAttributes } from "react";
import { linkProps } from "./router.ts";

const ICONS: Record<string, ReactNode> = {
  co: <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />,
  ce: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
  ee: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  eo: <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></>,
  home: <path d="M3 10.5 12 3l9 7.5V21H3z" />,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  library: <><path d="m16 6 4 14" /><path d="M12 6v14" /><path d="M8 8v12" /><path d="M4 4v16" /></>,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  arrowLeft: <><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>,
  external: <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  play: <path d="M6 3l14 9-14 9z" />,
  key: <><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  refresh: <><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></>,
  eye: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  eyeOff: <><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><path d="m2 2 20 20" /></>,
  phone: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>,
  laptop: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M2 20h20" /></>,
  send: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  topic: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  trendUp: <><path d="m3 17 6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
  trendDown: <><path d="m3 7 6 6 4-4 8 8" /><path d="M21 10v7h-7" /></>,
  flame: <path d="M12 22c4.4 0 7-2.8 7-6.5 0-3-2-5-3-6.5-.5 2-1.5 3-2.5 3 .5-3-1-6.5-4-9 0 3-1 4.5-2.5 6.5S5 13 5 15.5C5 19.2 7.6 22 12 22z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  sun: <><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></>,
  // comprehension rooms
  pause: <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>,
  volume: <><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a9 9 0 0 1 0 14" /></>,
  flag: <path d="M4 22V4a1 1 0 0 1 1-1h12l-2 5 2 5H5" />,
  more: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  mute: <><path d="M11 5 6 9H2v6h4l5 4z" /><path d="m22 9-6 6M16 9l6 6" /></>,
  arrowRight: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  mock: <><path d="M6 2h9l5 5v8" /><path d="M14 2v6h6" /><path d="M6 2v20h7" /><circle cx="17" cy="18" r="3" /><path d="m15.5 20.5-1 3 2.5-1 2.5 1-1-3" /></>,
  spark: <path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" />,
  shuffle: <><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="m4 4 5 5" /></>,
  stop: <rect x="5" y="5" width="14" height="14" rx="3" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  wifiOff: <><path d="m2 2 20 20" /><path d="M8.5 16.4a5 5 0 0 1 7 0" /><path d="M5 12.9a10 10 0 0 1 5.2-2.7" /><path d="M12.5 10.1A10 10 0 0 1 19 12.9" /><path d="M1.5 9.4A15 15 0 0 1 6 6.6" /><path d="M9.8 5.2A15 15 0 0 1 22.5 9.4" /><path d="M12 20h.01" /></>,
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className ?? ""}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export type Section = "co" | "ce" | "ee" | "eo";
export const SECTION_NAME: Record<Section, string> = {
  co: "Compréhension orale", ce: "Compréhension écrite", ee: "Expression écrite", eo: "Expression orale",
};

/** a section written as its mark: icon + two letters, one small logo */
export function Mark({ s, big, iconOnly = false }: { s: Section; big?: boolean; /** next to the full name the two letters would repeat it */ iconOnly?: boolean }) {
  return (
    <span className={`mark${big ? " big" : ""}`} aria-label={SECTION_NAME[s]}>
      <Icon name={s} size={big ? 22 : 16} />
      {!iconOnly && s.toUpperCase()}
    </span>
  );
}

/** a small ⓘ: the explanation shows on hover or focus, never as a caption on the page */
export function Info({ text }: { text: string }) {
  const id = useId();
  return (
    <span className="info">
      <button type="button" className="info-btn" aria-label={text} aria-describedby={id}><Icon name="info" size={14} /></button>
      <span role="tooltip" id={id} className="info-tip">{text}</span>
    </span>
  );
}

/** a section page's first line: the mark and the full name together, one line, with room for something on the right */
export function SectionHead({ s, name, right }: { s: Section; name: string; right?: ReactNode }) {
  return (
    <header className="shead">
      <h1 className="shead-title"><Mark s={s} big iconOnly />{name}</h1>
      {right && <div className="shead-right">{right}</div>}
    </header>
  );
}

/** the one tab strip of the app: full width, underlined; links or buttons */
export type TabItem = { label: ReactNode; current: boolean; href?: string; onClick?: () => void; props?: Record<string, unknown> };
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav className="tabs" aria-label={label}>
      {items.map((it, i) => it.href !== undefined || it.props
        ? <a key={i} href={it.href} {...(it.props ?? {})} aria-current={it.current ? "page" : undefined}>{it.label}</a>
        : <button key={i} type="button" onClick={it.onClick} aria-current={it.current ? "page" : undefined}>{it.label}</button>)}
    </nav>
  );
}

/** the one way back, top left of every page and room: a round button with the arrow and the word of where it goes */
export function BackLink({ to, href, onClick, label, word = true }: { to?: string; /** a page outside this app (the public site): a plain link */ href?: string; onClick?: () => void; label: string; /** false: the arrow alone (tight headers) */ word?: boolean }) {
  const inner = <><span className="back-circle"><Icon name="arrowLeft" size={18} /></span>{word && <span className="back-word">{label}</span>}</>;
  if (href !== undefined) return <a className="back" href={href} aria-label={label} title={word ? undefined : label}>{inner}</a>;
  return to !== undefined
    ? <a className="back" {...linkProps(to)} aria-label={label} title={word ? undefined : label}>{inner}</a>
    : <button type="button" className="back" onClick={onClick} aria-label={label} title={word ? undefined : label}>{inner}</button>;
}

export function Wordmark({ small }: { small?: boolean }) {
  return <span className={`wordmark${small ? " small" : ""}`}>tcf<span className="dot">.</span>monster</span>;
}

/** « Bêta » / « Beta »: the small label beside the wordmark while the app is in its first public version */
export function BetaTag({ lang = "fr" }: { lang?: "fr" | "en" }) {
  return <span className="beta-tag">{lang === "en" ? "Beta" : "Bêta"}</span>;
}

/**
 * The brand of the simulators: « Monster AI », one wordmark in the font and size of the text it sits in (one text with
 * a small light on it: the accent and the sun sweep across both words and they glow a little). With `powered` the
 * line « propulsé par Gemini » follows in small muted type, wherever Monster AI stands on its own (Google asks that
 * the model be named).
 */
export function MonsterAI({ powered, lang = "en" }: { powered?: boolean; lang?: "fr" | "en" }) {
  return (
    <span className="mai">
      <span className="mai-name">Monster AI</span>
      {powered && <span className="mai-powered">{lang === "fr" ? "propulsé par Gemini" : "powered by Gemini"}</span>}
    </span>
  );
}

/** the one clock of every room: mm:ss in mono, amber under `warnUnder` seconds, blinking under `blinkUnder`, red at zero; `idle` before the time runs */
export function Clock({ secondsLeft, idle = false, warnUnder = 300, blinkUnder = 60, label }: { secondsLeft: number; idle?: boolean; warnUnder?: number; blinkUnder?: number; label: string }) {
  const s = Math.max(0, Math.ceil(secondsLeft));
  const live = !idle;
  return (
    <span className="clock num" role="timer" aria-label={label} data-idle={idle || undefined} data-warn={live && s <= warnUnder && s > 0} data-blink={live && s <= blinkUnder && s > 0} data-over={live && s <= 0}>
      {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

/** « Tâche 2 » as one small yellow label, the same wherever a task is named (topics, setup, picker, results) */
export function TacheTag({ n, children }: { n: number; children?: ReactNode }) {
  return <span className="tache-tag num">{children ?? `Tâche ${n}`}</span>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "danger" | "quiet" | "plain"; size?: "sm" | "md"; busy?: boolean; icon?: IconName };
export function Button({ kind = "plain", size = "md", busy, icon, children, className, ...rest }: BtnProps) {
  return (
    <button type="button" className={`btn ${kind} ${size} ${className ?? ""}`} aria-busy={busy || undefined} disabled={busy || rest.disabled} {...rest}>
      {busy ? <span className="spin" aria-hidden="true" /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

export type Tone = "ok" | "bad" | "amber" | "new" | "sun" | "accent" | "muted";
export function Chip({ tone = "muted", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return <span className={`chip ${tone}`}>{dot && <i className="chip-dot" />}{children}</span>;
}

/** a segmented control: one of a few, all visible */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

/** the four practice colours as one bar; `total` greys out what was never answered */
export function ColourBar({ ok, amber, bad, total }: { ok: number; amber: number; bad: number; total?: number }) {
  const t = Math.max(total ?? 0, ok + amber + bad, 1);
  const w = (n: number) => `${(n / t) * 100}%`;
  return (
    <span className="cbar" role="img" aria-label={`${ok} right, ${amber} corrected, ${bad} wrong${total ? `, ${t - ok - amber - bad} new` : ""}`}>
      <i className="ok" style={{ width: w(ok) }} /><i className="amber" style={{ width: w(amber) }} /><i className="bad" style={{ width: w(bad) }} />
    </span>
  );
}

/** a confirmation sheet: what happens in one sentence, the safe button left, the acting one right */
export function Sheet({ open, title, children, onClose, actions, className }: { open: boolean; title: string; children?: ReactNode; onClose: () => void; actions: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // closing the dialog because `open` turned false fires the native `close` event too: that one is not the person's
  // doing and must not call onClose (it would cancel whatever the owner opened in its place, e.g. the next sheet)
  const quiet = useRef(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // the same in every sheet: the first action (the safe one, left) holds the focus; Enter does nothing drastic
      const first = d.querySelector<HTMLElement>(".sheet-actions button, .sheet-actions a");
      const field = d.querySelector<HTMLElement>("input, textarea, select");
      (field ?? first)?.focus();
    }
    if (!open && d.open) { quiet.current = true; d.close(); }
  }, [open]);
  const closed = () => { if (quiet.current) { quiet.current = false; return; } onClose(); };
  return (
    <dialog ref={ref} className={`sheet${className ? ` ${className}` : ""}`} onClose={closed} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-labelledby={titleId}>
      <div className="sheet-body">
        <h2 id={titleId}>{title}</h2>
        {children}
        <div className="sheet-actions">{actions}</div>
      </div>
    </dialog>
  );
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={22} /></span>
      <strong>{title}</strong>
      {children && <span className="muted">{children}</span>}
    </div>
  );
}

export function Toast({ text, tone, onDone }: { text: string; tone?: "ok" | "bad"; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 4000); return () => clearTimeout(t); }, [text, onDone]);
  return <div className={`toast ${tone ?? ""}`} role="status">{tone === "bad" ? <Icon name="alert" size={16} /> : <Icon name="check" size={16} />}{text}</div>;
}
