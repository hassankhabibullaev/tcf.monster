// The release note: once a release, a window over the blurred page (any page with the rail, never a room or an exam),
// for the people who had an account before it. Only the summary — how many technical bugs, content mistakes and new
// features — then where to report what is left (« Signaler un problème » under a question, Telegram for the rest) and
// « Tout voir », the public page with every release in full (site/changes.html, tcf.monster/changes). Closed with
// « Compris », Escape or a click outside; this browser remembers it (nothing on the server). The next release: a new
// RELEASE id, new counts, and a new section at the top of site/changes.html.
import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "../../ui/ui.tsx";
import { useT } from "../i18n.ts";
import { useMe } from "../main.tsx";
import "./release.css";

const RELEASE = "2026-10-30";
const COUNTS = { bugs: 5, content: 9, features: 2 };
const SEEN_KEY = "tcfm.release";
export const ADMIN_TG = "https://t.me/tcfmonsteradmin";

const WORDS = {
  fr: {
    tag: "Nouvelle version",
    title: "Vous nous avez écrit, nous avons corrigé.",
    lead: "Merci pour vos signalements. Dans cette version :",
    bugs: "bugs techniques corrigés", content: "erreurs de contenu rectifiées", features: "nouveautés que vous avez demandées",
    report: "Une erreur dans une question ? « Signaler un problème » sous la question. Un souci technique ? Telegram :",
    all: "Tout voir", ok: "Compris",
  },
  en: {
    tag: "New release",
    title: "You wrote to us, we fixed it.",
    lead: "Thank you for your reports. In this release:",
    bugs: "technical bugs fixed", content: "content mistakes corrected", features: "new features you asked for",
    report: "A mistake in a question? « Report a problem » under the question. A technical issue? Telegram:",
    all: "See everything", ok: "Got it",
  },
};

const seenHere = () => { try { return localStorage.getItem(SEEN_KEY) === RELEASE; } catch { return false; } };

export function ReleaseNote() {
  const { lang } = useT();
  const { me } = useMe();
  const [open, setOpen] = useState(() => !seenHere());
  const ref = useRef<HTMLDialogElement>(null);
  // only the people who were here before the release (a new account has nothing to compare with)
  const show = open && !!me && me.created_at.slice(0, 10) <= RELEASE;
  useEffect(() => { const d = ref.current; if (show && d && !d.open) d.showModal(); }, [show]);
  if (!show) return null;
  const w = WORDS[lang];
  const close = () => { try { localStorage.setItem(SEEN_KEY, RELEASE); } catch { /* shown again next time */ } ref.current?.close(); setOpen(false); };
  const rows: [number, string, "alert" | "check" | "flag"][] = [[COUNTS.bugs, w.bugs, "alert"], [COUNTS.content, w.content, "check"], [COUNTS.features, w.features, "flag"]];
  return (
    <dialog ref={ref} className="release" aria-labelledby="release-title" onClose={close} onClick={(e) => { if (e.target === ref.current) close(); }}>
      <div className="release-body">
        <span className="release-tag"><Icon name="check" size={14} />{w.tag}</span>
        <h2 id="release-title">{w.title}</h2>
        <p className="muted">{w.lead}</p>
        <ul className="release-counts">
          {rows.map(([n, label, icon]) => <li key={label}><Icon name={icon} size={18} /><b className="num">{n}</b><span>{label}</span></li>)}
        </ul>
        <p className="release-report">{w.report} <a href={ADMIN_TG} target="_blank" rel="noopener">@tcfmonsteradmin</a></p>
        <div className="release-actions">
          <a className="btn" href="/changes" target="_blank" rel="noopener">{w.all}</a>
          <Button kind="primary" onClick={close}>{w.ok}</Button>
        </div>
      </div>
    </dialog>
  );
}
