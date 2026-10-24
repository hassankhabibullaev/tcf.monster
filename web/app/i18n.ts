// Every word of the app, French first. Exam terms stay French in English too (Compréhension orale, Tâche, Partie…).
import { createContext, useContext } from "react";

const fr = {
  // frame
  home: "Accueil", profile: "Profil", aboutSite: "À propos de tcf.monster", mockExam: "Examen blanc", mockCode: "BLANC",
  langWord: "Langue", themeWord: "Thème", settings: "Réglages", menu: "Menu",
  skip: "Aller au contenu", lightMode: "Mode clair", darkMode: "Mode sombre",
  // door
  signInTitle: "Se connecter", email: "E-mail", password: "Mot de passe", show: "Afficher", hide: "Masquer",
  signIn: "Se connecter", forgot: "Mot de passe oublié ?", createAccount: "Créer votre compte", welcomeBack: "Bon retour", back: "Retour",
  wrongLogin: "E-mail ou mot de passe incorrect.", locked: (t: string) => `Trop d'essais. Réessayez à ${t}.`,
  pitchTitle: "Tout le TCF Canada, gratuitement.",
  pitch1: "Les quatre épreuves : compréhension orale et écrite, expression écrite et orale.",
  pitch2: "Les conditions de l'examen, ou de l'aide quand vous le voulez.",
  pitch3: "Votre progression sur le téléphone, la tablette et l'ordinateur.",
  backToSite: "Retour au site",
  // code flow
  step: (n: number) => `${n} / 3`,
  yourEmail: "Votre e-mail", getCode: "Recevoir un code",
  checkInbox: "Vérifiez vos e-mails", codeSentTo: "Code envoyé à", codeLabel: "Code à 6 chiffres",
  continue: "Continuer", changeAddress: "Changer d'adresse", resend: "Renvoyer", resendIn: (s: number) => `Renvoyer · ${s} s`,
  badEmail: "Ce n'est pas une adresse e-mail.", codeWrong: "Code incorrect.", codeExpired: "Ce code ne marche plus. Demandez-en un nouveau.",
  tooMany: "Trop de codes demandés. Réessayez dans une heure.", mailFailed: "L'e-mail n'est pas parti. Réessayez dans un instant.",
  closed: "Les inscriptions ouvrent bientôt.",
  choosePassword: "Choisissez un mot de passe", newPassword: "Nouveau mot de passe", passwordHint: "8 caractères ou plus",
  existsNote: "Vous avez déjà un compte avec cette adresse : choisissez un nouveau mot de passe.",
  strength: ["trop court", "faible", "correct", "solide"],
  terms: ["Je comprends que tcf.monster est gratuit, tenu par des bénévoles et fourni tel quel, et que les dons sont des contributions volontaires, pas le paiement d'un service.", "J'accepte que ses créateurs ne puissent être tenus responsables d'aucune perte, d'aucun retard ni d'aucun préjudice."],
  termsRead: "J'ai lu l'intégralité des", termsLink: "conditions d'utilisation", termsEnd: "et je les accepte.",
  createMine: "Créer mon compte", savePassword: "Enregistrer et me connecter",
  networkError: "Pas de connexion. Réessayez dans un instant.", serverError: "Quelque chose s'est mal passé. Réessayez.",
  serverDown: (code: number) => `Le serveur n'a pas répondu (erreur ${code}). Votre mot de passe n'a pas été vérifié : réessayez dans une minute.`,
  pageError: (what: string) => `Cette page a rencontré un problème (${what}). Rechargez la page et réessayez.`,
  // welcome sentence
  welcome1: "Je m'appelle", welcome2: ", je vise le", welcome3: "et je passe l'examen le", welcome3and: "et", welcome3none: "je ne suis pas encore inscrit·e",
  firstName: "prénom", pickDate: "choisir une date", notRegistered: "Pas encore inscrit·e", prevMonth: "Mois précédent", nextMonth: "Mois suivant",
  letsGo: "C'est parti", stepOf: (n: number) => `${n} sur 3`,
  // home
  sectionNames: { co: "Compréhension orale", ce: "Compréhension écrite", ee: "Expression écrite", eo: "Expression orale" }, setDate: "Choisir une date",
  currentLevel: "Niveau actuel", nclcOr: (n: number | null) => (n === null ? "NCLC < 4" : `NCLC ${n}`),
  best: "Meilleur", typical: "Habituel", worst: "Moins bon",
  trendUp: "En progrès", trendDown: "En baisse", trendFlat: "Stable",
  factSessions: (n: number) => (n === 1 ? "1 séance" : `${n} séances`), factMinutes: (n: number) => `${n} min de travail`,
  factDays: (n: number) => (n === 1 ? "1 jour de pratique" : `${n} jours de pratique`), factStreak: (n: number) => `${n} jours d'affilée`,
  helloWord: "Bonjour,", helloDays1: "il reste", helloDays2: (n: number): string => (n === 0 ? "— l'examen est aujourd'hui !" : n === 1 ? "jour avant votre examen" : "jours avant votre examen"), helloNoDate: "Pas encore de date d'examen.", helloPast: (d: string) => `Votre examen était le ${d}.`,
  helloGoal1: "et votre objectif est", helloGoal2: (n: number): string => (n === 0 ? " — à vous de jouer." : n === 4 ? " — atteint dans les quatre épreuves !" : ` — atteint dans ${n} épreuve${n > 1 ? "s" : ""} sur 4.`), factFirst: (d: string) => `première connexion le ${d}`, goalNone: "Choisir un objectif NCLC", goalReached: "atteint", goalGap: (n: number) => `encore ${n}`,
  activityTitle: "Vos douze dernières semaines", questionsSeen: "questions vues", nothingYet: "Rien pour l'instant.", openWord: "Ouvrir", tabExam: "Examen", examsTaken: "Examens passés", examsDistinct: (n: number) => `${n} différent${n > 1 ? "s" : ""}`, lastOne: "Dernier", sessionsWord: "Séances", average: "Moyenne",
  exam: "Examen",
  // profile
  profileTitle: "Profil", nameLabel: "Prénom", targetLabel: "Objectif", examLabel: "Date de l'examen", saved: "Enregistré", signOut: "Se déconnecter", signOutAll: "Se déconnecter partout",
  deleteAccount: "Supprimer le compte", account: "Compte", emailLabel: "E-mail", geminiKey: "Clé Gemini",
  deleteTitle: "Supprimer votre compte ?", deleteBody: "Tout part : votre progression, vos résultats et, sur cet appareil, votre clé, vos textes et vos enregistrements. On ne peut pas revenir en arrière.",
  sendDeleteCode: "Recevoir un code", deleteCodeTitle: "Confirmer la suppression", deleteNow: "Supprimer définitivement",
  cancel: "Annuler", signedOutAll: "Déconnecté partout", accountDeleted: "Compte supprimé",
  signOutAllTitle: "Se déconnecter partout ?", signOutAllBody: "Chaque appareil demandera de nouveau le mot de passe, celui-ci aussi.", change: "Modifier", save: "Enregistrer", none: "aucune",
  // states
  notFound: "Cette page n'existe pas.", backHome: "Accueil",
  // expression (EE · EO)
  tabTopics: "Sujets", tabPractice: "Entraînement", tabPracticeWith: "S'entraîner avec", tabSimulator: "Simulateur", history: "Historique", allSessions: (n: number) => `Toutes les séances · ${n}`,
  what: "Quoi", fullTest: "L'épreuve complète", fullTestSub: "Tâche 1 → 2 → 3 · le déroulement officiel", someTasks: "Quelques tâches", someTasksSub: "une ou deux, à choisir",
  topic: "Sujet", random: "Au hasard", randomSub: (m: string) => `dans le dernier mois · ${m}`, chosen: "Choisi", chosenSub: "dans l'onglet Sujets", chooseTopic: "Choisir un sujet",
  modeLabel: "Mode", live: "Conversation en direct", liveSub: "Il faut un silence complet : musique, voix ou bruit de fond coupent l'examinatrice.", ptt: "Appuyer pour parler", pttSub: "Marche même avec du bruit autour : l'examinatrice attend votre bouton.",
  start: "Commencer", keyActive: "Clé Gemini · active", keyNone: "Clé Gemini · aucune", keyError: "Clé Gemini · refusée", keyQuota: "Clé Gemini · limite du jour",
  month: "Mois", part: "Partie", combination: "Combinaison", byPart: "Par partie", byTask: "Par tâche", searchTopics: "Un mot, tous les mois", examWithPart: "Examen avec cette partie",
  practise1: "S'entraîner", noTopics: "Aucun sujet", tache: (n: number) => `Tâche ${n}`,
  sessionsEmpty: "Aucune séance", scoreOf20: (n: number) => `${n} / 20`, inProgress: "En cours", abandoned: "Abandonnée",
  // the key sheet
  profileWord: "Profil", keyStatus: "État", keyTitle: "Votre clé Gemini", keyPanelLead2: " — l'examinatrice qui vous parle et la correction de vos textes — est propulsé par Gemini, l'IA de Google. Pour l'utiliser gratuitement, il vous faut votre propre clé Gemini, gratuite elle aussi. Regardez la vidéo, obtenez votre clé, puis collez-la ici : elle reste sur cet appareil, jamais chez nous.",
  lockedUntilKey: "se débloque avec votre clé Gemini gratuite", seeInstructions: "Voir les instructions",
  keyField: "Clé", keyCheck: "Vérifier", keyChecking: "Vérification…", keyOk: "Clé active", keyRemove: "Retirer la clé",
  keyShape: "Ce n'est pas une clé Gemini : elle commence par AQ. (ou AIza pour les anciennes), sans espace.", keyRefused: "Google refuse cette clé. Créez-en une nouvelle sur aistudio.google.com.", keyUnreachable: "Impossible de joindre Google pour l'instant. Réessayez.",
  keyRemoveTitle: "Retirer la clé ?", keyRemoveBody: "Monster AI s'arrête sur cet appareil jusqu'à ce qu'une clé y soit collée à nouveau (la même, ou une autre de Google AI Studio).",
  // the room
  roomNotFound: "Cette séance n'existe pas.", leave: "Quitter",
  mockRunning: "Un examen blanc est en cours : terminez-le d'abord.", hold: "Le site a atteint sa limite du jour. Revenez demain.", examCap: "Six examens aujourd'hui, c'est le maximum. À demain !", dailyCap: "Douze séances aujourd'hui, c'est le maximum. À demain !",
};

type Dict = typeof fr;
const en: Dict = {
  home: "Home", profile: "Profile", aboutSite: "About tcf.monster", mockExam: "Mock exam", mockCode: "MOCK",
  langWord: "Language", themeWord: "Theme", settings: "Settings", menu: "Menu",
  skip: "Skip to content", lightMode: "Light mode", darkMode: "Dark mode",
  signInTitle: "Sign in", email: "E-mail", password: "Password", show: "Show", hide: "Hide",
  signIn: "Sign in", forgot: "Forgot your password?", createAccount: "Create your account", welcomeBack: "Welcome back", back: "Back",
  wrongLogin: "Wrong e-mail or password.", locked: (t) => `Too many tries. Try again at ${t}.`,
  pitchTitle: "The whole TCF Canada, for free.",
  pitch1: "The four tests: Compréhension orale and écrite, Expression écrite and orale.",
  pitch2: "Real exam conditions, or help when you want it.",
  pitch3: "Your progress on your phone, tablet and laptop.",
  backToSite: "Back to the site",
  step: (n) => `${n} / 3`,
  yourEmail: "Your e-mail", getCode: "Get a code",
  checkInbox: "Check your e-mail", codeSentTo: "Code sent to", codeLabel: "6-digit code",
  continue: "Continue", changeAddress: "Change address", resend: "Resend", resendIn: (s) => `Resend · ${s} s`,
  badEmail: "That is not an e-mail address.", codeWrong: "Wrong code.", codeExpired: "This code no longer works. Ask for a new one.",
  tooMany: "Too many codes asked for. Try again in an hour.", mailFailed: "The e-mail did not go out. Try again in a moment.",
  closed: "Sign-ups open soon.",
  choosePassword: "Choose a password", newPassword: "New password", passwordHint: "8 characters or more",
  existsNote: "You already have an account with this address: choose a new password.",
  strength: ["too short", "weak", "fair", "strong"],
  terms: ["I understand that tcf.monster is free, volunteer-run and provided as is, and that donations are voluntary contributions, not payment for any service.", "I accept that its builders cannot be held responsible for any loss, delay or harm."],
  termsRead: "I have read the full", termsLink: "terms of use", termsEnd: "and accept them.",
  createMine: "Create my account", savePassword: "Save and sign in",
  networkError: "No connection. Try again in a moment.", serverError: "Something went wrong. Try again.",
  serverDown: (code: number) => `The server did not answer (error ${code}). Your password was not checked: try again in a minute.`,
  pageError: (what: string) => `This page hit a problem (${what}). Reload the page and try again.`,
  welcome1: "My name is", welcome2: ", I'm aiming for", welcome3: "and my exam is on", welcome3and: "and", welcome3none: "I haven't registered yet",
  firstName: "first name", pickDate: "pick a date", notRegistered: "Not registered yet", prevMonth: "Previous month", nextMonth: "Next month",
  letsGo: "Let's go", stepOf: (n) => `${n} of 3`,
  sectionNames: { co: "Compréhension orale", ce: "Compréhension écrite", ee: "Expression écrite", eo: "Expression orale" }, setDate: "Pick a date",
  currentLevel: "Current level", nclcOr: (n) => (n === null ? "NCLC < 4" : `NCLC ${n}`),
  best: "Best", typical: "Typical", worst: "Lowest",
  trendUp: "Improving", trendDown: "Slipping", trendFlat: "Steady",
  factSessions: (n) => (n === 1 ? "1 session" : `${n} sessions`), factMinutes: (n) => `${n} min of work`,
  factDays: (n) => (n === 1 ? "1 day of practice" : `${n} days of practice`), factStreak: (n) => `${n} days in a row`,
  helloWord: "Hello,", helloDays1: "there are", helloDays2: (n) => (n === 0 ? "— the exam is today!" : n === 1 ? "day left before your exam" : "days left before your exam"), helloNoDate: "No exam date yet.", helloPast: (d) => `Your exam was on ${d}.`,
  helloGoal1: "and your goal is", helloGoal2: (n) => (n === 0 ? " — your move." : n === 4 ? " — reached in all four tests!" : ` — reached in ${n} of 4 tests.`), factFirst: (d) => `first sign-in on ${d}`, goalNone: "Pick a target NCLC", goalReached: "reached", goalGap: (n) => `${n} to go`,
  activityTitle: "Your last twelve weeks", questionsSeen: "questions seen", nothingYet: "Nothing here yet.", openWord: "Open", tabExam: "Exam", examsTaken: "Exams taken", examsDistinct: (n) => `${n} different`, lastOne: "Latest", sessionsWord: "Sessions", average: "Average",
  exam: "Exam",
  profileTitle: "Profile", nameLabel: "First name", targetLabel: "Target", examLabel: "Exam date", saved: "Saved", signOut: "Sign out", signOutAll: "Sign out everywhere",
  deleteAccount: "Delete account", account: "Account", emailLabel: "E-mail", geminiKey: "Gemini key",
  deleteTitle: "Delete your account?", deleteBody: "Everything goes: your progress, your results and, on this device, your key, your texts and your recordings. This cannot be undone.",
  sendDeleteCode: "Get a code", deleteCodeTitle: "Confirm the deletion", deleteNow: "Delete for good",
  cancel: "Cancel", signedOutAll: "Signed out everywhere", accountDeleted: "Account deleted",
  signOutAllTitle: "Sign out everywhere?", signOutAllBody: "Every device will ask for the password again, this one too.", change: "Change", save: "Save", none: "none", notFound: "This page does not exist.", backHome: "Home",
  tabTopics: "Topics", tabPractice: "Practice", tabPracticeWith: "Practise with", tabSimulator: "simulator", history: "History", allSessions: (n) => `All sessions · ${n}`,
  what: "What", fullTest: "The full test", fullTestSub: "Tâche 1 → 2 → 3 · the official script", someTasks: "Some tasks", someTasksSub: "one or two, your pick",
  topic: "Topic", random: "At random", randomSub: (m) => `from the newest month · ${m}`, chosen: "Chosen", chosenSub: "in the Topics tab", chooseTopic: "Choose a topic",
  modeLabel: "Mode", live: "Live conversation", liveSub: "Needs complete silence: music, voices or background noise cut the examiner off.", ptt: "Push to talk", pttSub: "Works even with noise around: the examiner waits for your button.",
  start: "Start", keyActive: "Gemini key · active", keyNone: "Gemini key · none", keyError: "Gemini key · refused", keyQuota: "Gemini key · daily limit",
  month: "Month", part: "Partie", combination: "Combinaison", byPart: "By part", byTask: "By task", searchTopics: "Any word, every month", examWithPart: "Exam with this part",
  practise1: "Practise", noTopics: "No topic", tache: (n) => `Tâche ${n}`,
  sessionsEmpty: "No session", scoreOf20: (n) => `${n} / 20`, inProgress: "In progress", abandoned: "Abandoned",
  profileWord: "Profile", keyStatus: "Status", keyTitle: "Your Gemini key", keyPanelLead2: " — the examiner who talks to you and the marking of your texts — is powered by Gemini, Google's AI. To use it for free, you need your own Gemini key, free as well. Watch the video, get your key, then paste it here: it stays on this device, never with us.",
  lockedUntilKey: "unlocks with your free Gemini key", seeInstructions: "See instructions",
  keyField: "Key", keyCheck: "Check", keyChecking: "Checking…", keyOk: "Key active", keyRemove: "Remove the key",
  keyShape: "This is not a Gemini key: it starts with AQ. (or AIza for older ones), with no space.", keyRefused: "Google refuses this key. Create a new one on aistudio.google.com.", keyUnreachable: "Google could not be reached just now. Try again.",
  keyRemoveTitle: "Remove the key?", keyRemoveBody: "Monster AI stops on this device until a key is pasted here again (the same one, or another from Google AI Studio).",
  roomNotFound: "This session does not exist.", leave: "Leave",
  mockRunning: "A mock exam is running: finish it first.",
  hold: "The site has reached its daily limit. Come back tomorrow.", examCap: "Six exams today is the maximum. See you tomorrow!", dailyCap: "Twelve sessions today is the maximum. See you tomorrow!",
};

export type Lang = "fr" | "en";
export const DICTS: Record<Lang, Dict> = { fr, en };
export const LangContext = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>({ lang: "en", t: en, setLang: () => {} });
export const useT = () => useContext(LangContext);

/** before sign-in: the choice made on this device, else French for a French browser, else English */
export function guessLang(): Lang {
  try { const s = localStorage.getItem("lang"); if (s === "fr" || s === "en") return s; } catch { /* private mode */ }
  return "en"; // English unless this device chose French (the owner, 2026-10-22)
}
export function rememberLang(l: Lang) { try { localStorage.setItem("lang", l); } catch { /* private mode */ } }

export const MONTHS = {
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
/** "18 février 2027" / "18 February 2027" */
export function longDate(iso: string, lang: Lang) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}${lang === "fr" && d === 1 ? "er" : ""} ${MONTHS[lang][m - 1]} ${y}`;
}
