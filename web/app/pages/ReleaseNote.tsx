// The release note: once a release, at the top of the dashboard, for the people who had an account before it — what
// changed in three groups (technical bugs, content mistakes, new features; docs/BUG-REPORTS.md keeps the same three),
// then where to report what is left: « Signaler un problème » under a question, Telegram for the rest. Closed with
// « Compris »; this browser remembers it (nothing on the server). The next release: a new RELEASE id and new lists.
import { useState } from "react";
import { Button, Icon } from "../../ui/ui.tsx";
import { useT } from "../i18n.ts";
import { useMe } from "../main.tsx";
import "./release.css";

const RELEASE = "2026-10-30";
const SEEN_KEY = "tcfm.release";
export const ADMIN_TG = "https://t.me/tcfmonsteradmin";

const WORDS = {
  fr: {
    tag: "Nouvelle version",
    title: "Vous nous avez écrit, nous avons corrigé.",
    lead: "Merci pour vos signalements. Voici ce qui change :",
    groups: [
      { title: "Bugs techniques", items: [
        "Les codes par e-mail arrivent mieux : « Renvoyer » après une minute, et un rappel de regarder dans les spams.",
        "La page de connexion ne reste plus blanche : un message et « Recharger » s'affichent si elle tarde.",
        "Écoute : une question ne saute plus toute seule quand l'audio tarde, et les réponses se touchent à nouveau (écrans tactiles compris).",
        "Lecture sur téléphone : le texte ne passe plus sous la question et les réponses.",
      ] },
      { title: "Erreurs de contenu", items: [
        "Trois corrigés rectifiés en écoute (examen 3 question 2, A1 questions 7 et 9), avec leurs explications.",
        "Les transcriptions manquantes reviennent sur 92 questions d'écoute.",
        "« cul » devient « pull » (A2 question 11), et une explication confuse est réécrite (A2 question 9).",
      ] },
      { title: "Nouveautés demandées", items: [
        "« Lecture auto » en entraînement d'écoute : l'audio démarre seul à chaque question.",
        "« Recommencer » un niveau entier d'un coup, sur la liste des niveaux.",
      ] },
    ],
    report1: "Vous voyez une erreur dans une question ? Appuyez sur « Signaler un problème » sous la question.",
    report2: "Un souci technique ? Écrivez-nous sur Telegram :",
    ok: "Compris",
  },
  en: {
    tag: "New release",
    title: "You wrote to us, we fixed it.",
    lead: "Thank you for your reports. Here is what changed:",
    groups: [
      { title: "Technical bugs", items: [
        "E-mail codes arrive better: « Resend » after a minute, and a reminder to look in the spam folder.",
        "The sign-in page no longer stays blank: a message and « Reload » show if it takes too long.",
        "Listening: a question no longer skips by itself when the audio is slow, and the answers can be tapped again (touch screens included).",
        "Reading on a phone: the text no longer slides under the question and the answers.",
      ] },
      { title: "Content mistakes", items: [
        "Three answer keys corrected in listening (exam 3 question 2, A1 questions 7 and 9), with their explanations.",
        "The missing transcripts are back on 92 listening questions.",
        "« cul » is now « pull » (A2 question 11), and a confusing explanation is rewritten (A2 question 9).",
      ] },
      { title: "New features you asked for", items: [
        "« Autoplay » in listening practice: the recording starts by itself at each question.",
        "« Start over » a whole level at once, on the list of levels.",
      ] },
    ],
    report1: "See a mistake in a question? Press « Report a problem » under the question.",
    report2: "A technical issue? Write to us on Telegram:",
    ok: "Got it",
  },
};

const seenHere = () => { try { return localStorage.getItem(SEEN_KEY) === RELEASE; } catch { return false; } };

export function ReleaseNote() {
  const { lang } = useT();
  const { me } = useMe();
  const [open, setOpen] = useState(() => !seenHere());
  // only the people who were here before the release (a new account has nothing to compare with)
  if (!open || !me || me.created_at.slice(0, 10) > RELEASE) return null;
  const w = WORDS[lang];
  const close = () => { try { localStorage.setItem(SEEN_KEY, RELEASE); } catch { /* shown again next time */ } setOpen(false); };
  return (
    <section className="card release" aria-labelledby="release-title">
      <span className="release-tag"><Icon name="check" size={14} />{w.tag}</span>
      <h2 id="release-title">{w.title}</h2>
      <p className="muted">{w.lead}</p>
      <div className="release-groups">
        {w.groups.map((g) => (
          <div key={g.title} className="release-group">
            <h3>{g.title}</h3>
            <ul>{g.items.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="release-foot">
        <p>{w.report1}<br />{w.report2} <a href={ADMIN_TG} target="_blank" rel="noopener">t.me/tcfmonsteradmin</a></p>
        <Button kind="primary" onClick={close}>{w.ok}</Button>
      </div>
    </section>
  );
}
