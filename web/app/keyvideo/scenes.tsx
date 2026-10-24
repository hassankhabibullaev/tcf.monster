// The two stages of the key video and their scripts: a laptop browser (1280 × 800) and a phone browser (390 × 844).
// Each page is redrawn from the live one (docs/KEY-VIDEO.md); the times below are the script: when a page shows, when
// the pointer clicks, when the camera moves. Spans are written "from-to" in ms, an open end runs to the end.
import type { ReactNode } from "react";
import { Icon, MonsterAI } from "../../ui/ui.tsx";
import type { useT } from "../i18n.ts";
import type { Script } from "./engine.ts";
import { EMAIL, KEY, OLD_KEY_END, PROJECT_ID, PROJECT_NO, type Words } from "./words.ts";

type T = ReturnType<typeof useT>["t"];
const on = (...p: (number | string)[]) => p.join("");

/* ---------- the laptop script ---------- */
// One rule for both films: nothing happens by itself. The pointer glides to the control (900 ms), clicks, and the
// change follows 250 ms later; every new page gets a pause of one to two seconds first, with the pointer at rest or
// wandering. The laptop clicks the address bar's suggestion rather than pressing Enter, and pastes through the
// right-click menu rather than a shortcut, so each step is something the viewer can see.

const D = {
  plus: 2900, newTab: 3150, urlClick: 4000, typeAt: 4400, typeDur: 2600, suggest: 8200, go: 8450, signIn: 9300,
  email: 11700, emailAt: 12200, emailDur: 2400, next1: 16000, pw: 17000,
  pwClick: 18600, pwAt: 19100, pwDur: 1200, next2: 21600, studio: 22700,
  create: 26700, dlg: 26950, createKey: 29800, loading: 30050, details: 31600, copy: 34400,
  back: 37650, field: 40100, menuClick: 40900, menu: 41150, pasteItem: 42600, paste: 42850, check: 44300, done: 45700, len: 50500,
};
export const LAPTOP: Script = {
  w: 1280, h: 800, len: D.len, start: { x: 900, y: 640 },
  path: [
    { at: 2600, to: "tabPlus", click: D.plus }, { at: 3700, to: "url", click: D.urlClick }, { at: 7900, to: "suggest", click: D.suggest },
    { at: 11400, to: "email", click: D.email }, { at: 15700, to: "next1", click: D.next1 },
    { at: 18300, to: "pw", click: D.pwClick }, { at: 21300, to: "next2", click: D.next2 },
    { at: 24300, to: "keysNav", move: 1400 }, { at: 26300, to: "create", click: D.create, move: 1200 },
    { at: 29400, to: "createKey", click: D.createKey }, { at: 34000, to: "copyKey", click: D.copy },
    { at: 37000, to: "tabTcf", click: 37400 }, { at: 39800, to: "field", click: D.field }, { at: D.menuClick, to: "field", click: D.menuClick },
    { at: 42300, to: "pasteItem", click: D.pasteItem }, { at: 43900, to: "check", click: D.check },
  ],
  camera: [
    { at: 0, d: 0, s: 1.124, to: "page" }, { at: 900, d: 900, s: 1 },
    { at: 3500, d: 800, s: 1.9, to: "url" }, { at: 8500, d: 700, s: 1 },
    { at: 10000, d: 800, s: 1.45, to: "gcard" }, { at: 21700, d: 600, s: 1 },
    { at: 25000, d: 900, s: 1.7, to: "create" }, { at: 27100, d: 600, s: 1.55, to: "dlg" }, { at: 31700, d: 500, s: 1.4, to: "details" },
    { at: 35600, d: 700, s: 1 }, { at: 38600, d: 800, s: 1.7, to: "keyRow" }, { at: D.done + 100, d: 500, s: 1.7, to: "keyHead" }, { at: 48300, d: 900, s: 1.124, to: "page" },
  ],
  sounds: [{ at: D.paste, kind: "paste" }, { at: D.done, kind: "chime" }],
};

/* ---------- the phone script ---------- */

const M = {
  tabs: 2900, grid: 3150, plus: 4600, newTab: 4850, urlClick: 5600, typeAt: 5900, typeDur: 2600, go: 9650, signIn: 10500,
  email: 12800, emailAt: 13300, emailDur: 2400, next1: 17100, pw: 18100,
  pwClick: 19700, pwAt: 20200, pwDur: 1200, next2: 22700, studio: 23800,
  create: 27700, dlg: 27950, createKey: 30800, loading: 31050, details: 32600, copy: 35400,
  tabs2: 38400, grid2: 38650, card: 40200, back: 40450, field: 42900, pasteTap: 44300, paste: 44550, check: 46000, done: 47400, len: 52200,
};
export const PHONE: Script = {
  w: 390, h: 844, len: M.len, start: { x: 300, y: 700 },
  path: [
    { at: 2600, to: "mTabs", click: M.tabs }, { at: 4300, to: "mPlus", click: M.plus }, { at: 5300, to: "url", click: M.urlClick }, { at: 9100, to: "kbGo", click: 9400 },
    { at: 12500, to: "email", click: M.email }, { at: 16800, to: "next1", click: M.next1 }, { at: 19400, to: "pw", click: M.pwClick },
    { at: 22400, to: "next2", click: M.next2 }, { at: 25400, to: "mSelect", move: 1400 }, { at: 27300, to: "create", click: M.create, move: 1200 },
    { at: 30400, to: "createKey", click: M.createKey }, { at: 35000, to: "copyKey", click: M.copy },
    { at: 38000, to: "mTabs", click: M.tabs2 }, { at: 39800, to: "mCardTcf", click: M.card },
    { at: 42600, to: "field", click: M.field }, { at: 44000, to: "pasteBtn", click: M.pasteTap }, { at: 45600, to: "check", click: M.check },
  ],
  // no camera on the phone: the frame is small, a zoom only shakes the picture (the owner, 2026-10-23)
  camera: [{ at: 0, d: 0, s: 1 }],
  sounds: [{ at: M.paste, kind: "paste" }, { at: M.done, kind: "chime" }],
};

/* ---------- shared pieces ---------- */

export function GoogleG({ size = 16 }: { size?: number }) {
  return (
    <svg className="kv-g" viewBox="0 0 48 48" width={size} height={size}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
const svg = (d: string) => <svg viewBox="0 0 24 24"><path d={d} /></svg>;
const I = {
  key: "M8 11a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM10.8 12.2 20 3M16.5 6.5l2.5 2.5M14 9l2 2",
  folder: "M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z",
  chart: "M6 19V11M12 19V5M18 19v-6", speed: "M12 14l4-4M4.6 18a9 9 0 1 1 14.8 0",
  paid: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm2.5 6.5c-.4-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.2 0-2.2-.6-2.6-1.6M12 6.5v11",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  db: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  back: "M15 18l-6-6 6-6", copy: "M9 9h10v12H9zM5 15V3h10", doc: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4", menu: "M4 6h16M4 12h10M4 18h16M18 9l3 3-3 3", burger: "M4 7h16M4 12h16M4 17h16",
  out: "M7 17L17 7M9 7h8v8", info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01", more: "M12 5h.01M12 12h.01M12 19h.01",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z", left: "M19 12H5M12 19l-7-7 7-7", right: "M5 12h14M12 5l7 7-7 7", reload: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  x: "M18 6 6 18M6 6l12 12", chev: "m6 9 6 6 6-6", globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18",
};
const Avatar = () => <i className="kv-av">M</i>;

/** the address bar's text through the film: our page, the typed address, Google, AI Studio, our page again */
function Url({ w, s }: { w: Words; s: typeof D | typeof M }) {
  const type = s.typeAt, back = s.back;
  return (
    <span className="kv-urltext" data-target="url">
      <span className="kv-show kv-over" data-on={on(0, "-", s.newTab, ",", back)}>tcf.monster/profile#key</span>
      <span className="kv-show kv-over kv-ntp" data-on={on(s.newTab, "-", s.urlClick)}>{w.ntp}</span>
      <span className="kv-show kv-over" data-on={on(s.urlClick, "-", s.signIn)}><span data-type="aistudio.google.com/api-keys" data-at={type} data-dur={s.typeDur} /><b className="kv-caret kv-show" data-on={on(s.urlClick, "-", s.go)} /></span>
      <span className="kv-show kv-over" data-on={on(s.signIn, "-", s.pw)}>accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Faistudio.google.com%2Fapi-keys</span>
      <span className="kv-show kv-over" data-on={on(s.pw, "-", s.studio)}>accounts.google.com/v3/signin/challenge/pwd?continue=https%3A%2F%2Faistudio.google.com%2Fapi-keys</span>
      <span className="kv-show kv-over" data-on={on(s.studio, "-", back)}>aistudio.google.com/api-keys</span>
    </span>
  );
}

/* ---------- tcf.monster's settings page: where the viewer is ---------- */

function TcfKey({ t, w, s, bubble }: { t: T; w: Words; s: typeof D | typeof M; bubble?: ReactNode }) {
  return (
    <div className="kv-tkey">
      <h3 data-target="keyHead">{w.keySection}</h3>
      <div className="kv-tkey-panel kv-show kv-over" data-on={on(0, "-", s.done)}>
        <p><MonsterAI />{t.keyPanelLead2}</p>
        <div className="kv-tkey-row" data-target="keyRow">
          <span className="kv-tkey-field" data-target="field" data-act={on(s.field, "-", s.check)}>
            <span className="kv-show kv-over kv-ph" data-on={on(0, "-", s.paste)}>AQ.Ab…</span>
            <span className="kv-show kv-over kv-pasted" data-on={s.paste}>{KEY}</span>
            {bubble}
          </span>
          <span className="kv-tkey-ready" data-act={s.paste}><span className="kv-tkey-btn" data-target="check" data-act={on(s.check, "-", s.check + 300)}>
            <span className="kv-show kv-over" data-on={on(0, "-", s.check + 100, ",", s.done)}>{t.keyCheck}</span>
            <span className="kv-show kv-over kv-spin" data-on={on(s.check + 100, "-", s.done)} />
          </span></span>
        </div>
      </div>
      <div className="kv-tkey-ok kv-show kv-over" data-on={s.done}>
        <span className="kv-tkey-label">{w.status}</span>
        <span className="kv-tkey-chip"><i />{t.keyOk}</span>
        <span className="kv-tkey-remove">{t.keyRemove}</span>
      </div>
    </div>
  );
}

function TcfLaptop({ t, w }: { t: T; w: Words }) {
  return (
    <section className="kv-scene kv-tcf kv-show" data-on={on(0, "-", D.newTab, ",", D.back)}>
      <aside className="kv-trail">
        <img src="/app-icon.svg" alt="" />
        {(["home", "co", "ce", "ee", "eo", "mock"] as const).map((n) => <span key={n}><Icon name={n} size={20} /></span>)}
      </aside>
      <nav className="kv-tnav"><span>{w.profile}</span><span>{w.account}</span><span className="kv-tnav-on">{w.keySection}</span><span className="kv-tnav-bad">{w.deleteAccount}</span></nav>
      <main className="kv-tmain"><h2>{w.settings}</h2><TcfKey t={t} w={w} s={D} bubble={
        <span className="kv-ctx kv-show" data-on={on(D.menu, "-", D.paste)}>
          {w.menu.map((m, i) => <span key={m} className={i === 4 ? "kv-ctx-paste" : i < 2 ? "kv-ctx-dim" : ""} {...(i === 4 ? { "data-target": "pasteItem" } : {})}>{m}</span>)}
        </span>} /></main>
      <span className="kv-ttoast kv-show" data-on={on(D.done, "-", D.done + 2400)}><Icon name="check" size={16} />{t.keyOk}</span>
    </section>
  );
}

function TcfPhone({ t, w }: { t: T; w: Words }) {
  return (
    <section className="kv-scene kv-tcf kv-tcf-m kv-show" data-on={on(0, "-", M.grid, ",", M.back)}>
      <div className="kv-tbar"><img src="/app-icon.svg" alt="" /><b>tcf<i>.</i>monster</b><span className="kv-tbar-r"><span className="kv-tpill">FR</span><Icon name="moon" size={18} /><Avatar /></span></div>
      <div className="kv-tmain"><h2>{w.settings}</h2>
        <div className="kv-tchips"><span>{w.profile}</span><span>{w.account}</span><span className="kv-tnav-on">{w.keySection}</span></div>
        <TcfKey t={t} w={w} s={M} bubble={<span className="kv-pastebubble kv-show" data-on={on(M.field + 250, "-", M.paste)} data-target="pasteBtn">{w.paste}</span>} />
      </div>
      <div className="kv-ttabs">{(["co", "ce", "home", "ee", "eo"] as const).map((n) => <span key={n} className={n === "home" ? "kv-ttabs-home" : ""}><Icon name={n} size={18} /></span>)}</div>
      <span className="kv-ttoast kv-show" data-on={on(M.done, "-", M.done + 2400)}><Icon name="check" size={16} />{t.keyOk}</span>
    </section>
  );
}

/* ---------- Google's sign-in ---------- */

function GoogleSignIn({ w, s, phone }: { w: Words; s: typeof D | typeof M; phone?: boolean }) {
  const foot = <div className="kv-gfoot"><span>{w.lang} ▾</span><span className="kv-gfoot-r"><span>{w.help}</span><span>{w.privacy}</span><span>{w.terms}</span></span></div>;
  const card = (left: ReactNode, right: ReactNode) => (
    <div className={`kv-gpage${phone ? " kv-gpage-m" : ""}`}>
      <div className="kv-gcard" data-target="gcard">{left}{right}</div>
      {foot}
    </div>
  );
  return (
    <>
      <section className="kv-scene kv-show" data-on={on(s.signIn, "-", s.pw)}>
        {card(
          <div className="kv-gleft"><GoogleG size={48} /><h3>{w.signIn}</h3><p>{w.useAccount}</p></div>,
          <div className="kv-gright">
            <span className="kv-gfield" data-target="email" data-act={s.email}>
              <span className="kv-glabel">{w.emailLabel}</span>
              <span className="kv-gvalue" data-type={EMAIL} data-at={s.emailAt} data-dur={s.emailDur} />
            </span>
            <span className="kv-glink">{w.forgotEmail}</span>
            <p className="kv-gguest">{w.guest} <span className="kv-glink">{w.guestLink}</span></p>
            <div className="kv-gbtns"><span className="kv-gtext">{w.create}</span><span className="kv-gnext" data-target="next1" data-act={on(s.next1, "-", s.pw)}>{w.next}</span></div>
          </div>,
        )}
      </section>
      <section className="kv-scene kv-show" data-on={on(s.pw, "-", s.studio)}>
        {card(
          <div className="kv-gleft"><GoogleG size={48} /><h3>{w.welcome}</h3><span className="kv-gchip"><Avatar />{EMAIL} ▾</span></div>,
          <div className="kv-gright">
            <span className="kv-gfield" data-target="pw" data-act={s.pwClick}>
              <span className="kv-glabel">{w.pwLabel}</span>
              <span className="kv-gvalue kv-dots" data-type="••••••••••••" data-at={s.pwAt} data-dur={s.pwDur} />
            </span>
            <span className="kv-gcheck"><i />{w.showPw}</span>
            <div className="kv-gbtns kv-gbtns-pw"><span className="kv-gtext">{w.forgotPw}</span><span className="kv-gnext" data-target="next2" data-act={on(s.next2, "-", s.studio)}>{w.next}</span></div>
          </div>,
        )}
      </section>
    </>
  );
}

/* ---------- AI Studio: the API keys page, the dialog, the key's details ---------- */

function Dialogs({ w, s }: { w: Words; s: typeof D | typeof M }) {
  return (
    <div className="kv-veil kv-show" data-on={on(s.dlg, "-", s.back)}>
      <div className="kv-dlg kv-show" data-target="dlg" data-on={on(s.dlg, "-", s.loading)}>
        <h4>{w.dlgTitle}<span className="kv-x">{svg(I.x)}</span></h4>
        <span className="kv-dlabel">{w.nameKey}</span>
        <span className="kv-dinput">Gemini API Key</span>
        <span className="kv-dlabel">{w.chooseProject}</span>
        <span className="kv-dinput kv-dselect">Default Gemini Project{svg(I.chev)}</span>
        <div className="kv-dbtns"><span className="kv-dtext">{w.cancel}</span><span className="kv-sbtn" data-target="createKey" data-act={on(s.createKey, "-", s.loading)}>{w.createBtn}</span></div>
      </div>
      <div className="kv-dlg kv-dlg-load kv-show" data-on={on(s.loading, "-", s.details)}>
        <h4>{w.dlgTitle}<span className="kv-x">{svg(I.x)}</span></h4>
        <span className="kv-dspin" />
      </div>
      <div className="kv-dlg kv-details kv-show" data-target="details" data-on={on(s.details, "-", s.back)}>
        <h4>{w.detailsTitle}<span className="kv-x">{svg(I.x)}</span></h4>
        <p className="kv-dnote">{svg(I.info)}<span>{w.detailsNote} <u>{w.detailsLink}</u>.</span></p>
        <span className="kv-dlabel">{w.apiKey}</span><span className="kv-dval kv-dkey"><span>{KEY}</span>{svg(I.copy)}</span>
        <span className="kv-dlabel">{w.name}</span><span className="kv-dval"><span>Gemini API Key</span>{svg(I.copy)}</span>
        <span className="kv-dlabel">{w.projectName}</span><span className="kv-dval"><span>projects/{PROJECT_NO}</span>{svg(I.copy)}</span>
        <span className="kv-dlabel">{w.projectNumber}</span><span className="kv-dval"><span>{PROJECT_NO}</span>{svg(I.copy)}</span>
        <div className="kv-dbtns kv-dbtns-d"><span className="kv-dtext kv-dleft">{w.deleteKey}</span><span className="kv-dtext">{w.copyCurl}</span><span className="kv-sbtn" data-target="copyKey" data-act={on(s.copy, "-", s.copy + 400)}>{w.copyKey}</span></div>
      </div>
    </div>
  );
}

function StudioLaptop({ w }: { w: Words }) {
  const row = (end: string, name: string, attrs = {}) => (
    <div className="kv-tr" {...attrs}>
      <span><u>…{end}</u><small>{name}</small></span>
      <span><u>Default Gemini Project</u><small>{PROJECT_ID}</small></span>
      <span>{w.created}</span>
      <span><u>{w.setBilling}</u><small>{w.freeTier}</small></span>
      <span className="kv-ticons">{svg(I.copy)}{svg(I.paid)}{svg(I.chart)}{svg(I.db)}{svg(I.more)}</span>
    </div>
  );
  return (
    <section className="kv-scene kv-studio kv-show" data-on={on(D.studio, "-", D.back)}>
      <aside className="kv-side">
        <div className="kv-logo"><span>Google AI Studio</span>{svg(I.menu)}</div>
        <span className="kv-nav kv-dash">{svg(I.back)}Dashboard</span>
        <span className="kv-sec">{w.project}</span>
        <span className="kv-nav kv-cur" data-target="keysNav">{svg(I.key)}{w.keys}</span>
        <span className="kv-nav">{svg(I.folder)}{w.projects}</span>
        <span className="kv-sec">{w.usageBilling}</span>
        <span className="kv-nav">{svg(I.chart)}{w.usage}</span>
        <span className="kv-nav">{svg(I.speed)}{w.rate}</span>
        <span className="kv-nav">{svg(I.paid)}{w.spend}</span>
        <span className="kv-nav">{svg(I.receipt)}{w.billing}</span>
        <span className="kv-sec">{w.observe}</span>
        <span className="kv-nav">{svg(I.db)}{w.logs}</span>
        <span className="kv-nav kv-log">{w.changelog}{svg(I.out)}</span>
        <span className="kv-side-foot">
          <span className="kv-icons">{svg(I.bell)}{svg(I.gear)}{svg(I.search)}{svg(I.key)}</span>
          <span className="kv-acct"><Avatar />{EMAIL}</span>
        </span>
      </aside>
      <main className="kv-main">
        <div className="kv-head">
          <h3>{w.keys}</h3>
          <span className="kv-quick">{svg(I.doc)}{w.quick}</span>
          <span className="kv-sbtn kv-sbtn-line" data-target="create" data-act={on(D.create, "-", D.dlg)}>{svg(I.key)}{w.createKey}</span>
        </div>
        <div className="kv-group">
          <span className="kv-muted-s">{w.groupBy}</span><span className="kv-pill kv-pill-on"><i />{w.byKey}</span><span className="kv-pill">{w.byProject}</span>
          <span className="kv-filter"><span className="kv-muted-s">{w.filterBy}</span><span className="kv-select">{w.allProjects}{svg(I.chev)}</span></span>
        </div>
        <div className="kv-table">
          <div className="kv-tr kv-th"><span>{w.colKey}</span><span>{w.colProject}</span><span>{w.colCreated}</span><span>{w.colBilling}</span><span /></div>
          {row(KEY.slice(-4), "Gemini API Key", { className: "kv-tr kv-show kv-over", "data-on": String(D.details) })}
          {row(OLD_KEY_END, "Default Gemini API Key")}
        </div>
      </main>
      <Dialogs w={w} s={D} />
    </section>
  );
}

function StudioPhone({ w }: { w: Words }) {
  const card = (end: string, name: string, attrs = {}) => (
    <div className="kv-mcard" {...attrs}>
      <div className="kv-mcard-top"><span><u>…{end}</u><small>{name}</small></span><span className="kv-ticons">{svg(I.copy)}{svg(I.paid)}{svg(I.chart)}{svg(I.db)}{svg(I.more)}</span></div>
      <div className="kv-mcard-row"><span>{w.colProject}</span><u>Default Gemini Project</u></div>
      <div className="kv-mcard-row"><span>{w.projectId}</span><span>{PROJECT_ID}</span></div>
      <div className="kv-mcard-row"><span>{w.colCreated}</span><span>{w.created}</span></div>
      <div className="kv-mcard-row"><span>{w.colBilling}</span><span className="kv-mcard-bill"><u>{w.setBilling}</u><small>{w.freeTier}</small></span></div>
    </div>
  );
  return (
    <section className="kv-scene kv-studio kv-studio-m kv-show" data-on={on(M.studio, "-", M.grid2)}>
      <main className="kv-main">
        <span className="kv-burger">{svg(I.burger)}</span>
        <div className="kv-head"><h3>{w.keys}</h3><span className="kv-quick">{svg(I.doc)}</span><span className="kv-sbtn kv-sbtn-line" data-target="create" data-act={on(M.create, "-", M.dlg)}>{w.createKey}</span></div>
        <span className="kv-select kv-select-m" data-target="mSelect">{w.allProjects}{svg(I.chev)}</span>
        <div className="kv-group"><span className="kv-muted-s">{w.groupBy}</span><span className="kv-pill kv-pill-on"><i />{w.byKey}</span><span className="kv-pill">{w.byProject}</span></div>
        <div className="kv-mlist">
          {card(KEY.slice(-4), "Gemini API Key", { className: "kv-mcard kv-show kv-over", "data-on": String(M.details) })}
          {card(OLD_KEY_END, "Default Gemini API Key")}
        </div>
      </main>
      <Dialogs w={w} s={M} />
    </section>
  );
}

/* ---------- the two browsers ---------- */

export function Laptop({ t, w }: { t: T; w: Words }) {
  return (
    <>
      <div className="kv-chrome">
        <div className="kv-tabs">
          <span className="kv-tab" data-target="tabTcf" data-act={on(0, "-", D.newTab, ",", D.back)}><img src="/app-icon.svg" alt="" /><span>tcf.monster</span><i>{svg(I.x)}</i></span>
          <span className="kv-tab kv-show" data-on={D.newTab} data-act={on(D.newTab, "-", D.back)}>
            <span className="kv-show kv-over kv-tab-t" data-on={on(D.newTab, "-", D.signIn)}>{w.newTab}</span>
            <span className="kv-show kv-over kv-tab-t" data-on={on(D.signIn, "-", D.studio)}><GoogleG />{w.tabGoogle}</span>
            <span className="kv-show kv-over kv-tab-t" data-on={D.studio}><GoogleG />{w.tabStudio}</span>
            <i>{svg(I.x)}</i>
          </span>
          <span className="kv-plus" data-target="tabPlus" data-act={on(D.plus, "-", D.plus + 300)}>+</span>
        </div>
        <div className="kv-bar">
          {svg(I.left)}{svg(I.right)}{svg(I.reload)}
          <span className="kv-url">{svg(I.lock)}<Url w={w} s={D} /></span>
        </div>
        <span className="kv-drop kv-show" data-on={on(D.typeAt + 900, "-", D.go)}>
          <span className="kv-drop-row" data-act={on(D.suggest, "-", D.go)}>{svg(I.globe)}<span data-target="suggest">aistudio.google.com/api-keys</span></span>
        </span>
        <span className="kv-load kv-show" data-on={on(D.go, "-", D.signIn, ",", D.next1 + 250, "-", D.pw, ",", D.next2 + 250, "-", D.studio)} />
      </div>
      <div className="kv-page" data-target="page">
        <TcfLaptop t={t} w={w} />
        <section className="kv-scene kv-blank kv-show" data-on={on(D.newTab, "-", D.signIn)} />
        <GoogleSignIn w={w} s={D} />
        <StudioLaptop w={w} />
      </div>
    </>
  );
}

function Keyboard({ w, spans, go }: { w: Words; spans: string; go?: boolean }) {
  const rows = w.go === "Aller" ? ["azertyuiop", "qsdfghjklm", "wxcvbn"] : ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  return (
    <div className="kv-kb kv-show" data-on={spans}>
      {rows.map((r) => <div key={r} className="kv-kb-row">{[...r].map((c) => <span key={c}>{c}</span>)}</div>)}
      <div className="kv-kb-row kv-kb-last"><span className="kv-kb-wide">123</span><span className="kv-kb-space" /><span className="kv-kb-go" {...(go ? { "data-target": "kbGo" } : {})}>{w.go}</span></div>
    </div>
  );
}

function TabGrid({ w, spans, two }: { w: Words; spans: string; two?: boolean }) {
  return (
    <div className="kv-grid kv-show" data-on={spans}>
      <div className="kv-grid-cards">
        <span className="kv-gridcard" {...(two ? { "data-target": "mCardTcf" } : {})}><b><img src="/app-icon.svg" alt="" />tcf.monster</b><i className="kv-gridthumb kv-gridthumb-tcf" /></span>
        {two && <span className="kv-gridcard kv-gridcard-on"><b><GoogleG />{w.tabStudio}</b><i className="kv-gridthumb kv-gridthumb-studio" /></span>}
      </div>
      {!two && <span className="kv-grid-plus" data-target="mPlus">+</span>}
    </div>
  );
}

export function Phone({ t, w }: { t: T; w: Words }) {
  return (
    <>
      <div className="kv-mchrome">
        <span className="kv-url">{svg(I.lock)}<Url w={w} s={M} /></span>
        <span className="kv-mtabs" data-target="mTabs" data-act={on(M.tabs, "-", M.tabs + 300, ",", M.tabs2, "-", M.tabs2 + 300)}>
          <span className="kv-show kv-over" data-on={on(0, "-", M.newTab)}>1</span><span className="kv-show kv-over" data-on={M.newTab}>2</span>
        </span>
        {svg(I.more)}
        <span className="kv-load kv-show" data-on={on(M.go, "-", M.signIn, ",", M.next1 + 250, "-", M.pw, ",", M.next2 + 250, "-", M.studio)} />
      </div>
      <div className="kv-page" data-target="page">
        <TcfPhone t={t} w={w} />
        <section className="kv-scene kv-blank kv-show" data-on={on(M.newTab, "-", M.signIn)} />
        <GoogleSignIn w={w} s={M} phone />
        <StudioPhone w={w} />
        <TabGrid w={w} spans={on(M.grid, "-", M.newTab)} />
        <TabGrid w={w} spans={on(M.grid2, "-", M.back)} two />
        <Keyboard w={w} spans={on(M.newTab, "-", M.go)} go />
        <Keyboard w={w} spans={on(M.email + 250, "-", M.emailAt + M.emailDur + 300, ",", M.pwClick + 250, "-", M.pwAt + M.pwDur + 300)} />
      </div>
    </>
  );
}
