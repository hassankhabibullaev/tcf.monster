// Every e-mail tcf.monster sends, on one design (design B, approved 2026-10-22): a white card bordered in ink on cream,
// a header band whose tone says what the mail is (cream: a code · coral: news · ink: the account's end), cards with one
// button each, and a footer that says why the mail came. Each line is in the person's language with the other one
// under it, smaller and faint: mail apps run no code, so a language switch could never work.
// Mail HTML is tables and inline styles (what every mail app reads); faint text is a fixed lighter colour, not opacity
// (Outlook ignores opacity); the logo is a hosted PNG (mail apps block SVG). Codes: six digits in one block that one tap
// selects whole, and « Your code is 123456 » on its own line in the plain text (Apple Mail's AutoFill and Gmail's
// « Copy code » read that).
export type Lang = "fr" | "en";
export type MailId = "signup" | "signin" | "password" | "delete" | "deleted" | "welcome" | "luck" | "after";
type T = { en: string; fr: string };
export type Mail = { subject: string; html: string; text: string };

export const SITE = "https://tcf.monster";
export const CHAT_URL = "https://t.me/tcfmonster";
export const DONATE_URL = `${SITE}/about#don`;
const ADMIN = "@tcfmonsteradmin";
const ADMIN_URL = "https://t.me/tcfmonsteradmin";
const LOGO = `${SITE}/site/assets/mail-logo.png`;

const C = { coral: "#ff6b4a", ink: "#23201c", cream: "#fffbf2", card: "#fff3df", white: "#ffffff", muted: "#6e665c", line: "#eadfcb" };
/** the second language: the line's colour mixed 55 % into its background */
const FAINT: Record<string, string> = { [C.ink]: "#8a8580", [C.muted]: "#afaaa3", coralInk: "#864231", inkCream: "#9c9892" };
const SANS = "Nunito,'Segoe UI',Helvetica,Arial,sans-serif", SERIF = "Georgia,'Times New Roman',serif", MONO = "Menlo,Consolas,'Courier New',monospace";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** what a mail needs to know about the person */
export type Who = { lang: Lang; name?: string | null; code?: string; examDate?: string; /** good luck sent on the exam's own morning */ examToday?: boolean; stopUrl?: string };

function build(w: Who) {
  const L = w.lang, O: Lang = L === "en" ? "fr" : "en";
  const plain: string[] = [];
  const say = (t: T) => { plain.push(t[L]); return t; };

  type BiOpts = { size?: number; color?: string; faint?: string; weight?: number; font?: string; lh?: number; align?: string; gap?: number };
  const bi = (t: T, o: BiOpts = {}) => {
    const size = o.size ?? 15, col = o.color ?? C.ink, gap = o.gap ?? 14;
    const small = Math.max(12, Math.round(size * 0.8));
    return `<p style="margin:0 0 ${gap}px;text-align:${o.align ?? "left"}"><span style="display:block;font-family:${o.font ?? SANS};font-size:${size}px;line-height:${o.lh ?? 1.55};font-weight:${o.weight ?? 400};color:${col}">${esc(t[L])}</span><span lang="${O}" style="display:block;margin-top:3px;font-family:${SANS};font-size:${small}px;line-height:1.45;font-weight:600;color:${o.faint ?? FAINT[col] ?? FAINT[C.ink]}">${esc(t[O])}</span></p>`;
  };
  const band = (tone: "coral" | "cream" | "ink", title: T, sub?: T) => {
    say(title); if (sub) say(sub);
    const bg = tone === "coral" ? C.coral : tone === "ink" ? C.ink : C.card;
    const fg = tone === "ink" ? C.cream : C.ink;
    const faint = tone === "ink" ? FAINT.inkCream : tone === "coral" ? FAINT.coralInk : FAINT[C.ink];
    const s = tone === "cream" ? 52 : 68;
    return `<tr><td align="center" style="background:${bg};padding:30px 28px 26px;border-bottom:2px solid ${C.ink}">
<a href="${SITE}"><img src="${LOGO}" width="${s}" height="${s}" alt="tcf.monster" style="display:block;border:0;width:${s}px;height:${s}px"></a>
<div style="height:16px;line-height:16px">&nbsp;</div>
${bi(title, { font: SERIF, size: tone === "cream" ? 24 : 28, weight: 700, lh: 1.15, color: fg, faint, align: "center", gap: sub ? 8 : 0 })}
${sub ? bi(sub, { size: 15, weight: 700, color: fg, faint, align: "center", gap: 0 }) : ""}
</td></tr>`;
  };
  const text = (t: T) => { say(t); return `<tr><td style="padding:22px 28px 4px">${bi(t)}</td></tr>`; };
  const code = () => {
    const valid = { en: "Valid 5 minutes · never share it", fr: "Valable 5 minutes · ne le partagez jamais" };
    plain.push("", { en: "Your code is", fr: "Votre code est" }[L] + " " + w.code, "", valid[L]);
    return `<tr><td align="center" style="padding:6px 28px 4px"><div style="display:inline-block;background:${C.card};border:2px solid ${C.ink};border-radius:16px;padding:16px 26px;font-family:${MONO};font-weight:700;font-size:38px;letter-spacing:10px;line-height:1;color:${C.ink};-webkit-user-select:all;user-select:all">${w.code}</div></td></tr>
<tr><td align="center" style="padding:10px 28px 18px">${bi(valid, { size: 13, weight: 700, color: C.muted, align: "center", gap: 0 })}</td></tr>`;
  };
  const list = (items: T[]) => {
    items.forEach((t) => plain.push("• " + t[L]));
    return `<tr><td style="padding:4px 28px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map((t) => `<tr><td width="22" valign="top" style="padding:2px 0 0;font-family:${SANS};font-weight:800;font-size:15px;color:${C.coral}">•</td><td style="padding:0">${bi(t, { gap: 8 })}</td></tr>`).join("")}</table></td></tr>`;
  };
  const btn = (label: T, href: string, primary: boolean) =>
    `<a href="${href}" style="display:inline-block;background:${primary ? C.coral : C.white};color:${C.ink};border:2px solid ${C.ink};border-radius:999px;padding:11px 22px;font-family:${SANS};font-weight:800;font-size:14px;line-height:1.2;text-decoration:none">${esc(label[L])}</a>`;
  const card = (title: T, body: T, action?: { label: T; href: string; primary?: boolean }, tint = false) => {
    plain.push("", title[L], body[L]); if (action) plain.push(`${action.label[L]}: ${action.href}`);
    return `<tr><td style="padding:8px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:16px;background:${tint ? C.card : C.white}"><tr><td style="padding:18px 20px">
${bi(title, { size: 16, weight: 800, gap: 6 })}
${bi(body, { size: 14, color: C.muted, gap: action ? 14 : 0 })}
${action ? btn(action.label, action.href, !!action.primary) : ""}
</td></tr></table></td></tr>`;
  };
  const foot = (why: T, stop: boolean) => {
    const ask = { en: `A question? Write to our admin on Telegram: ${ADMIN}`, fr: `Une question ? Écrivez à notre admin sur Telegram : ${ADMIN}` };
    const stopT = { en: "Stop these e-mails", fr: "Ne plus recevoir ces e-mails" };
    plain.push("", "—", why[L], ask[L] + " " + ADMIN_URL);
    if (stop && w.stopUrl) plain.push(`${stopT[L]}: ${w.stopUrl}`);
    const askHtml = (lang: Lang) => esc(ask[lang]).replace(ADMIN, `<a href="${ADMIN_URL}" style="color:inherit">${ADMIN}</a>`);
    return `<tr><td style="padding:16px 28px 24px;border-top:1px solid ${C.line}">
${bi(why, { size: 12, color: C.muted, gap: 10 })}
<p style="margin:0 0 ${stop ? 10 : 0}px"><span style="display:block;font-family:${SANS};font-size:12px;line-height:1.55;color:${C.muted}">${askHtml(L)}</span><span lang="${O}" style="display:block;margin-top:3px;font-family:${SANS};font-size:12px;line-height:1.45;font-weight:600;color:${FAINT[C.muted]}">${askHtml(O)}</span></p>
${stop && w.stopUrl ? `<p style="margin:0;font-family:${SANS};font-size:12px;color:${C.muted}"><a href="${esc(w.stopUrl)}" style="color:${C.muted}">${esc(stopT[L])}</a> · <span lang="${O}" style="color:${FAINT[C.muted]}">${esc(stopT[O])}</span></p>` : ""}
</td></tr>`;
  };
  const shell = (subject: string, pre: string, rows: string[]) => {
    const tag = { en: "the TCF Canada, free, for everyone", fr: "le TCF Canada, gratuit, pour tout le monde" }[L];
    const html = `<!doctype html><html lang="${L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><meta name="format-detection" content="telephone=no,date=no,address=no"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.cream};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(pre)}${"&#8204;&nbsp;".repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream}"><tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.white};border:2px solid ${C.ink};border-radius:22px;overflow:hidden;border-collapse:separate">${rows.join("\n")}</table>
<p style="margin:14px 0 0;font-family:${SANS};font-size:12px;color:${C.muted}"><a href="${SITE}" style="color:${C.muted};text-decoration:none">tcf<span style="color:${C.coral}">.</span>monster</a> · ${esc(tag)}</p>
</td></tr></table></body></html>`;
    return { subject, html, text: plain.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n\ntcf.monster · " + tag + "\n" + SITE + "\n" };
  };
  return { L, say, band, text, code, list, card, foot, shell };
}

const name = (w: Who) => (w.name ?? "").trim();
/** « Welcome, Léa! » or « Welcome! » when the name is not known */
const hi = (w: Who, en: string, fr: string, enBare: string, frBare: string): T =>
  name(w) ? { en: en.replace("{name}", name(w)), fr: fr.replace("{name}", name(w)) } : { en: enBare, fr: frBare };
export function longDay(d: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
}

const CHAT_BTN = { label: { en: "Join on Telegram", fr: "Rejoindre sur Telegram" }, href: CHAT_URL };
const DONATE_BTN = { label: { en: "Donate", fr: "Faire un don" }, href: DONATE_URL };

const MAILS: Record<MailId, (w: Who) => Mail> = {
  signup(w) {
    const m = build(w);
    return m.shell({ en: "Your tcf.monster sign-up code", fr: "Votre code d'inscription tcf.monster" }[m.L], { en: "Valid 5 minutes. Enter it to finish your account.", fr: "Valable 5 minutes. Entrez-le pour finir votre compte." }[m.L], [
      m.band("cream", { en: "Confirm your e-mail", fr: "Confirmez votre e-mail" }),
      m.text({ en: "Enter this code to finish creating your account.", fr: "Entrez ce code pour finir de créer votre compte." }), m.code(),
      m.foot({ en: "You asked for this code on tcf.monster. If it wasn't you, ignore this e-mail: no account is created.", fr: "Vous avez demandé ce code sur tcf.monster. Si ce n'est pas vous, ignorez cet e-mail : aucun compte n'est créé." }, false)]);
  },
  signin(w) {
    const m = build(w);
    return m.shell({ en: "Your tcf.monster sign-in code", fr: "Votre code de connexion tcf.monster" }[m.L], { en: "Valid 5 minutes. Enter it to sign in.", fr: "Valable 5 minutes. Entrez-le pour vous connecter." }[m.L], [
      m.band("cream", { en: "Your sign-in code", fr: "Votre code de connexion" }),
      m.text({ en: "Enter this code to sign in. No password needed.", fr: "Entrez ce code pour vous connecter. Pas besoin de mot de passe." }), m.code(),
      m.foot({ en: "You asked for this code on tcf.monster. If it wasn't you, ignore this e-mail: nobody can sign in without the code.", fr: "Vous avez demandé ce code sur tcf.monster. Si ce n'est pas vous, ignorez cet e-mail : personne ne peut se connecter sans le code." }, false)]);
  },
  password(w) {
    const m = build(w);
    return m.shell({ en: "Code to set a new tcf.monster password", fr: "Code pour un nouveau mot de passe tcf.monster" }[m.L], { en: "Valid 5 minutes. Your other devices will be signed out.", fr: "Valable 5 minutes. Vos autres appareils seront déconnectés." }[m.L], [
      m.band("cream", { en: "Set a new password", fr: "Choisissez un nouveau mot de passe" }),
      m.text({ en: "Enter this code, then choose your new password. Every other device will be signed out.", fr: "Entrez ce code, puis choisissez votre nouveau mot de passe. Tous vos autres appareils seront déconnectés." }), m.code(),
      m.foot({ en: "You asked to change your password on tcf.monster. If it wasn't you, ignore this e-mail: your password stays the same.", fr: "Vous avez demandé à changer votre mot de passe sur tcf.monster. Si ce n'est pas vous, ignorez cet e-mail : votre mot de passe ne change pas." }, false)]);
  },
  delete(w) {
    const m = build(w);
    return m.shell({ en: "Code to delete your tcf.monster account", fr: "Code pour supprimer votre compte tcf.monster" }[m.L], { en: "Before you go: everything you practised would be erased.", fr: "Avant de partir : tout votre travail serait effacé." }[m.L], [
      m.band("ink", { en: "Before you go", fr: "Avant de partir" }, { en: "This code deletes your account for good.", fr: "Ce code supprime votre compte pour de bon." }),
      m.text({ en: "Deleting erases everything: your progress in each level, your exam results, your mock exams and your writing and speaking sessions. It can't be undone.", fr: "La suppression efface tout : vos progrès dans chaque niveau, vos résultats d'examen, vos examens blancs et vos séances d'écrit et d'oral. C'est définitif." }),
      m.card({ en: "Nothing to cancel", fr: "Rien à résilier" }, { en: "tcf.monster stays free. If something went wrong, tell our admin on Telegram: we read every message and often fix things the same day.", fr: "tcf.monster reste gratuit. Si quelque chose n'a pas marché, dites-le à notre admin sur Telegram : nous lisons chaque message et corrigeons souvent le jour même." }, { label: { en: "Keep my account", fr: "Garder mon compte" }, href: SITE, primary: true }, true),
      m.text({ en: "Still want to go? Enter this code on the Settings page:", fr: "Vous voulez toujours partir ? Entrez ce code dans les réglages :" }), m.code(),
      m.foot({ en: "You asked to delete your account on tcf.monster. If it wasn't you, ignore this e-mail: nothing is deleted.", fr: "Vous avez demandé la suppression de votre compte sur tcf.monster. Si ce n'est pas vous, ignorez cet e-mail : rien n'est supprimé." }, false)]);
  },
  deleted(w) {
    const m = build(w);
    return m.shell({ en: "Your tcf.monster account is deleted", fr: "Votre compte tcf.monster est supprimé" }[m.L], { en: "Everything is erased. Good luck with your exam.", fr: "Tout est effacé. Bonne chance pour votre examen." }[m.L], [
      m.band("ink", { en: "Your account is deleted", fr: "Votre compte est supprimé" }),
      m.text({ en: "Your progress, results and sessions are erased from our servers. Thank you for practising with us.", fr: "Vos progrès, résultats et séances sont effacés de nos serveurs. Merci de vous être entraîné·e avec nous." }),
      m.card({ en: "Changed your mind?", fr: "Vous changez d'avis ?" }, { en: "You can create a new account any time with the same e-mail. It starts empty.", fr: "Vous pouvez créer un nouveau compte quand vous voulez, avec le même e-mail. Il repart de zéro." }, { label: { en: "Create an account", fr: "Créer un compte" }, href: `${SITE}/sign-in` }),
      m.card({ en: "The public chat stays open", fr: "Le chat public reste ouvert" }, { en: "Candidates share the topics that came up and answer each other's questions.", fr: "Les candidats partagent les sujets tombés et répondent aux questions des autres." }, CHAT_BTN),
      m.foot({ en: "You deleted your account on tcf.monster. This is the last e-mail we send you.", fr: "Vous avez supprimé votre compte sur tcf.monster. C'est le dernier e-mail que nous vous envoyons." }, false)]);
  },
  welcome(w) {
    const m = build(w);
    const subject = hi(w, "Welcome to tcf.monster, {name}", "Bienvenue sur tcf.monster, {name}", "Welcome to tcf.monster", "Bienvenue sur tcf.monster")[m.L];
    return m.shell(subject, { en: "Your account is ready. Everything here is free, for good.", fr: "Votre compte est prêt. Tout ici est gratuit, pour de bon." }[m.L], [
      m.band("coral", hi(w, "Welcome, {name}!", "Bienvenue, {name} !", "Welcome!", "Bienvenue !"), { en: "Your account is ready. Everything here is free, for good.", fr: "Votre compte est prêt. Tout ici est gratuit, pour de bon." }),
      m.text({ en: "The 80 timed exams, the full mock exam, practice from A1 to C2 and Monster AI for writing and speaking: all of it is yours, with no premium plan.", fr: "Les 80 examens chronométrés, l'examen blanc complet, l'entraînement de A1 à C2 et Monster AI pour l'écrit et l'oral : tout est à vous, sans offre premium." }),
      m.card({ en: "Start your preparation", fr: "Commencer votre préparation" }, { en: "Your dashboard shows where you stand in each test.", fr: "Votre tableau de bord montre où vous en êtes dans chaque épreuve." }, { label: { en: "Open my dashboard", fr: "Ouvrir mon tableau de bord" }, href: SITE, primary: true }, true),
      m.card({ en: "Join the public chat", fr: "Rejoindre le chat public" }, { en: "Candidates share the topics that came up, give advice and answer questions.", fr: "Les candidats partagent les sujets tombés, se conseillent et répondent aux questions." }, CHAT_BTN),
      m.card({ en: "Keep it free for everyone", fr: "Garder tcf.monster gratuit" }, { en: "If tcf.monster helps you, a donation pays the domain, the hosting and the upkeep.", fr: "Si tcf.monster vous aide, un don paie le domaine, l'hébergement et l'entretien." }, DONATE_BTN),
      m.foot({ en: "You get this e-mail because you created an account on tcf.monster.", fr: "Vous recevez cet e-mail parce que vous avez créé un compte sur tcf.monster." }, true)]);
  },
  luck(w) {
    const m = build(w);
    const d = { en: longDay(w.examDate!, "en"), fr: longDay(w.examDate!, "fr") };
    // sent the night before; on the exam's own morning when the night before had no room
    const t = w.examToday;
    return m.shell((t ? hi(w, "Good luck today, {name}", "Bonne chance aujourd'hui, {name}", "Good luck today", "Bonne chance aujourd'hui") : hi(w, "Good luck tomorrow, {name}", "Bonne chance demain, {name}", "Good luck tomorrow", "Bonne chance demain"))[m.L], (t ? { en: "Today is the day. A few things to remember.", fr: "C'est aujourd'hui. Quelques rappels." } : { en: "Tomorrow is the day. A few things to remember.", fr: "C'est demain. Quelques rappels." })[m.L], [
      m.band("coral", t ? hi(w, "Good luck today, {name}!", "Bonne chance aujourd'hui, {name} !", "Good luck today!", "Bonne chance aujourd'hui !") : hi(w, "Good luck tomorrow, {name}!", "Bonne chance demain, {name} !", "Good luck tomorrow!", "Bonne chance demain !"), { en: `Your TCF Canada is on ${d.en}.`, fr: `Votre TCF Canada a lieu le ${d.fr}.` }),
      m.text(t ? { en: "You've prepared. Today, trust what you practised. A few things to keep in mind:", fr: "Vous vous êtes préparé·e. Aujourd'hui, faites confiance à votre entraînement. Quelques rappels :" } : { en: "You've prepared. Tonight, rest; tomorrow, trust what you practised. A few things to keep in mind:", fr: "Vous vous êtes préparé·e. Ce soir, reposez-vous ; demain, faites confiance à votre entraînement. Quelques rappels :" }),
      m.list([{ en: "Bring your ID and your convocation, and arrive early.", fr: "Apportez votre pièce d'identité et votre convocation, et arrivez en avance." },
        { en: "Listening: each recording plays once. If you miss one, let it go and move on.", fr: "Compréhension orale : chaque enregistrement passe une fois. Si vous en manquez un, passez au suivant." },
        { en: "Writing: watch the word count of each task.", fr: "Expression écrite : surveillez le nombre de mots de chaque tâche." },
        { en: "Speaking: if you don't understand, ask the examiner to repeat. It's allowed.", fr: "Expression orale : si vous ne comprenez pas, demandez à l'examinateur de répéter. C'est permis." }]),
      m.card({ en: "After the exam", fr: "Après l'examen" }, { en: "Share the writing and speaking topics you got in the public chat. It helps everyone who sits it next.", fr: "Partagez les sujets d'écrit et d'oral que vous avez eus dans le chat public. Cela aide tous ceux qui passent après vous." }, CHAT_BTN, true),
      m.foot({ en: "You get this e-mail because your exam date is set in your tcf.monster profile.", fr: "Vous recevez cet e-mail parce que votre date d'examen est indiquée dans votre profil tcf.monster." }, true)]);
  },
  after(w) {
    const m = build(w);
    return m.shell(hi(w, "How did it go, {name}?", "Comment ça s'est passé, {name} ?", "How did it go?", "Comment ça s'est passé ?")[m.L], { en: "Your topics can help the next candidates.", fr: "Vos sujets peuvent aider les prochains candidats." }[m.L], [
      m.band("coral", hi(w, "How did it go, {name}?", "Comment ça s'est passé, {name} ?", "How did it go?", "Comment ça s'est passé ?"), { en: "We hope you're proud of yourself.", fr: "Nous espérons que vous êtes fier·ère de vous." }),
      m.text({ en: `Your TCF Canada was on ${longDay(w.examDate!, "en")}. Whatever you feel about it, you did it.`, fr: `Votre TCF Canada a eu lieu le ${longDay(w.examDate!, "fr")}. Quoi que vous en pensiez, vous l'avez fait.` }),
      m.card({ en: "Share what you got", fr: "Partagez ce que vous avez eu" }, { en: "The writing and speaking topics, how the day went, what surprised you. In the public chat, it helps everyone who sits it next.", fr: "Les sujets d'écrit et d'oral, le déroulement, ce qui vous a surpris. Dans le chat public, cela aide tous ceux qui passent après vous." }, { ...CHAT_BTN, primary: true }, true),
      m.card({ en: "Waiting for your results", fr: "En attendant vos résultats" }, { en: "When they arrive, tell us in the chat. And if you sit it again, your dashboard is waiting.", fr: "Quand ils arrivent, dites-le-nous dans le chat. Et si vous le repassez, votre tableau de bord vous attend." }),
      m.card({ en: "Did tcf.monster help?", fr: "tcf.monster vous a aidé·e ?" }, { en: "A donation keeps it free for the next candidates.", fr: "Un don le garde gratuit pour les prochains candidats." }, DONATE_BTN),
      m.foot({ en: "You get this e-mail because your exam date is set in your tcf.monster profile.", fr: "Vous recevez cet e-mail parce que votre date d'examen est indiquée dans votre profil tcf.monster." }, true)]);
  },
};

/** the mails a person can stop: they carry the stop link and the one-click unsubscribe headers */
export const STOPPABLE: MailId[] = ["welcome", "luck", "after"];

export const renderMail = (id: MailId, w: Who): Mail => MAILS[id](w);
