// Every interface word of the mock exam, French first. In English everything is English; the four tests keep their
// French names, « Tâche », NCLC and the level codes stay. A control is its label: no captions, no instructions,
// except the initiation page (the one place that explains) and the two lines of the mock page named in the contract.
import type { Lang } from "../i18n.ts";

const fr = {
  title: "Examen blanc", titles: "Examens blancs", mine: "Vos examens blancs", start: "Commencer", back: "Retour", open: "Ouvrir",
  co: "Compréhension orale", ce: "Compréhension écrite", ee: "Expression écrite", eo: "Expression orale",
  stageOf: (n: number) => `${n} / 4`,
  // the mock page
  leadShort: "Les quatre épreuves d'affilée, avec les pauses · 3 h 15 · le temps ne s'arrête pas.", noValue: "sans valeur officielle", certificatePdf: "Certificat (PDF)", lowestOfFour: "Niveau global · le plus bas des quatre", elapsed: (m: number) => `${m} min écoulées`,
  lead1: "Les quatre épreuves en une seule séance, dans l'ordre officiel.",
  lead2: "Environ 3 h 15 avec les pauses.",
  lead3: "Les conditions du vrai examen : le temps ne s'arrête pas.",
  oneADay: "Un examen blanc par jour", none: "Pas encore d'examen blanc", review: "Revoir",
  running: "Examen blanc en cours", resume: "Reprendre", abandon: "Abandonner", abandoned: "Abandonné", marking: "Correction en cours", notTaken: "non passée",
  abandonTitle: "Abandonner l'examen blanc ?", abandonBody: "Les épreuves terminées gardent leur résultat. Le reste ne sera pas passé.", keepGoing: "Continuer",
  deleteOne: "Supprimer", deleteTitle: "Supprimer cet examen blanc ?", deleteBody: "Il disparaît de vos résultats et de votre tableau de bord. On ne peut pas revenir en arrière.", cancel: "Annuler",
  failed: "Quelque chose s'est mal passé. Réessayez.", retry: "Réessayer",
  busyAttempt: "Un examen est en cours : terminez-le d'abord.", busySession: "Une séance est en cours : terminez-la d'abord.",
  // the initiation page
  expect: "Le déroulement",
  stageLine: { co: "Chaque enregistrement une seule fois, pas de retour en arrière.", ce: "Vous circulez librement entre les questions.", ee: "Les trois tâches, dans l'ordre que vous voulez.", eo: "Les trois tâches avec l'examinatrice Monster AI." } as Record<"co" | "ce" | "ee" | "eo", string>,
  minutes: (n: number) => `${n} min`, about: (n: number) => `${n} min environ`, pause: "Pause",
  noStop: "Le temps ne s'arrête pas une fois l'épreuve commencée.",
  atEnd: "À la fin : vos quatre résultats, votre niveau global et un certificat.",
  micTitle: "Expression orale", live: "Conversation en direct", liveSub: "Il faut un silence complet : musique, voix ou bruit de fond coupent l'examinatrice.", ptt: "Appuyer pour parler", pttSub: "Marche même avec du bruit autour : l'examinatrice attend votre bouton.",
  notify: "Être prévenu·e à la fin des pauses", notified: "Vous serez prévenu·e à la fin des pauses",
  // the rooms
  timeLeft: "Temps restant", timeUp: "Temps écoulé", finish: "Terminer", prev: "Précédent", next: "Suivant",
  offline: "Hors ligne — vos réponses sont gardées.",
  endFailed: "La fin de l'épreuve n'est pas arrivée au serveur. Elle est gardée ici.",
  // the break
  breakTitle: "Pause", breakNext: (name: string) => `Ensuite : ${name}`, continueNow: "Continuer maintenant", breakOver: "La pause est terminée", startEo: "Commencer l'expression orale",
  notifBody: (name: string) => `La pause est terminée — ${name} commence.`, tabAlert: "⏰ Pause terminée",
  // the transition card
  transition: (name: string, minutes: string) => `${name} · ${minutes}`, markingCard: "Correction",
  // the marking screen
  markingTitle: "Correction en cours", marked: "Corrigée", inProgress: "en cours", notMarked: "non évaluée", openProfile: "Ouvrir le profil",
  troubleMark: "La correction n'a pas abouti. Votre travail est enregistré.",
  // the results
  overall: (n: number) => `NCLC ${n}`, overallSub: "le plus bas de vos quatre épreuves", overallNone: "Niveau global",
  score: "Score", rightAnswers: "Bonnes réponses", nclcWord: "NCLC", cefr: "Niveau", tasksMarked: "Tâches corrigées", of20: "/ 20",
  rightOf: (n: number) => (n === 1 ? "1 bonne réponse sur 39" : `${n} bonnes réponses sur 39`), tasksOf: (n: number) => (n === 1 ? "1 tâche corrigée sur 3" : `${n} tâches corrigées sur 3`), results: "Résultats",
  endedTime: "Temps écoulé", endedAbandon: (name: string) => `Abandonné pendant ${name.toLowerCase()}`, took: (m: number) => `${m} min en tout`,
  certificate: "Certificat", noCertAbandon: "Pas de certificat : examen abandonné.", noCertLate: "Pas de certificat : reprise après la fin de la pause.", noCertBlank: "Pas de certificat : une épreuve est restée blanche.", noCertStale: "Pas de certificat : examen interrompu.",
  details: "Le détail", loading: "Chargement…",
  // the certificate
  certTitle: "Examen blanc TCF Canada", certNo: (n: number) => `Examen blanc n° ${n}`, certName: "Candidat·e", certDate: "Date",
  certTest: "Épreuve", certScore: "Score", certLevel: "Niveau", certOverall: "Niveau global", certLowest: "le plus bas des quatre",
  certLine: "Ce document n'a aucune valeur officielle. Il n'est pas une attestation et ne peut être présenté à aucune administration.",
  savePdf: "Enregistrer en PDF",
  // the dashboard card
  cardCount: (n: number) => (n === 1 ? "1 examen blanc" : `${n} examens blancs`), cardBest: "Meilleur niveau global", cardLast: "Dernier",
  // the band
  bandText: (name: string) => `Examen blanc en cours · ${name}`,
};
type Words = typeof fr;
const en: Words = {
  title: "Mock exam", titles: "Mock exams", mine: "Your mock exams", start: "Start", back: "Back", open: "Open",
  co: "Compréhension orale", ce: "Compréhension écrite", ee: "Expression écrite", eo: "Expression orale",
  stageOf: (n) => `${n} / 4`,
  leadShort: "The four tests in a row, with the breaks · 3 h 15 · the clock never stops.", noValue: "no official value", certificatePdf: "Certificate (PDF)", lowestOfFour: "Overall level · the lowest of the four", elapsed: (m) => `${m} min elapsed`,
  lead1: "The four tests in one sitting, in the official order.",
  lead2: "About 3 h 15 with the breaks.",
  lead3: "The real exam's conditions: the clock never stops.",
  oneADay: "One mock exam a day", none: "No mock exam yet", review: "Review",
  running: "Mock exam running", resume: "Resume", abandon: "Abandon", abandoned: "Abandoned", marking: "Marking", notTaken: "not taken",
  abandonTitle: "Abandon the mock exam?", abandonBody: "The tests you finished keep their result. The rest will not be taken.", keepGoing: "Keep going",
  deleteOne: "Delete", deleteTitle: "Delete this mock exam?", deleteBody: "It disappears from your results and your dashboard. This cannot be undone.", cancel: "Cancel",
  failed: "Something went wrong. Try again.", retry: "Retry",
  busyAttempt: "An exam is running: finish it first.", busySession: "A session is running: finish it first.",
  expect: "What to expect",
  stageLine: { co: "Each recording once, no going back.", ce: "You move freely between the questions.", ee: "The three tasks, in the order you like.", eo: "The three tasks with the Monster AI examiner." },
  minutes: (n) => `${n} min`, about: (n) => `about ${n} min`, pause: "Break",
  noStop: "The clock never stops once a test has started.",
  atEnd: "At the end: your four results, your overall level and a certificate.",
  micTitle: "Expression orale", live: "Live conversation", liveSub: "Needs complete silence: music, voices or background noise cut the examiner off.", ptt: "Push to talk", pttSub: "Works even with noise around: the examiner waits for your button.",
  notify: "Be told when a break ends", notified: "You will be told when a break ends",
  timeLeft: "Time left", timeUp: "Time is up", finish: "Finish", prev: "Previous", next: "Next",
  offline: "Offline — your answers are kept.",
  endFailed: "The end of the test did not reach the server. It is kept here.",
  breakTitle: "Break", breakNext: (name) => `Next: ${name}`, continueNow: "Continue now", breakOver: "The break is over", startEo: "Start the speaking test",
  notifBody: (name) => `The break is over — ${name} begins.`, tabAlert: "⏰ Break over",
  transition: (name, minutes) => `${name} · ${minutes}`, markingCard: "Marking",
  markingTitle: "Marking", marked: "Marked", inProgress: "in progress", notMarked: "not marked", openProfile: "Open the profile",
  troubleMark: "The marking did not go through. Your work is kept.",
  overall: (n) => `NCLC ${n}`, overallSub: "the lowest of your four tests", overallNone: "Overall level",
  score: "Score", rightAnswers: "Right answers", nclcWord: "NCLC", cefr: "Level", tasksMarked: "Tasks marked", of20: "/ 20",
  rightOf: (n) => (n === 1 ? "1 right answer out of 39" : `${n} right answers out of 39`), tasksOf: (n) => (n === 1 ? "1 task marked out of 3" : `${n} tasks marked out of 3`), results: "Results",
  endedTime: "Time ran out", endedAbandon: (name) => `Abandoned during ${name}`, took: (m) => `${m} min in all`,
  certificate: "Certificate", noCertAbandon: "No certificate: the exam was abandoned.", noCertLate: "No certificate: resumed after the end of the break.", noCertBlank: "No certificate: a test was left blank.", noCertStale: "No certificate: the exam was interrupted.",
  details: "The details", loading: "Loading…",
  certTitle: "TCF Canada mock exam", certNo: (n) => `Mock exam no. ${n}`, certName: "Candidate", certDate: "Date",
  certTest: "Test", certScore: "Score", certLevel: "Level", certOverall: "Overall level", certLowest: "the lowest of the four",
  certLine: "This document has no official value. It is not an attestation and cannot be presented to any authority.",
  savePdf: "Save as PDF",
  cardCount: (n) => (n === 1 ? "1 mock exam" : `${n} mock exams`), cardBest: "Best overall level", cardLast: "Last",
  bandText: (name) => `Mock exam running · ${name}`,
};
export const MOCK_WORDS: Record<Lang, Words> = { fr, en };
export const useMockWords = (lang: Lang): Words => MOCK_WORDS[lang];
export type { Words as MockWords };
