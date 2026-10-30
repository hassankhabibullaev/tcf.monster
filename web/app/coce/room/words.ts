// Every interface word of the comprehension rooms, French first (UX §9). In English everything is English: only the
// section names, NCLC and the level codes stay as they are. A control is its label: no captions, no instructions.
import type { Lang } from "../../i18n.ts";

const fr = {
  co: "Compréhension orale", ce: "Compréhension écrite",
  examN: (code: string, n: number) => `Examen ${code} n° ${n}`, examNo: (n: number) => `n° ${n}`,
  practice: "Entraînement", training: "Libre",
  // header
  back: "Retour", questionOf: (n: number, of: number) => `Question ${n} sur ${of}`,
  pickerTitle: "Questions", timeLeft: "Temps restant", timeUp: "Temps écoulé",
  // help toggles on the panel line
  transcript: "Transcription", hint: "Indice", shortHint: "Indice court", english: "Traduction anglaise", autoplay: "Lecture auto",
  fullText: "Texte complet", view: "Affichage", text: "Texte",
  hintNote: "Résumé écrit pour l'entraînement, pas le texte original.",
  // footer
  prev: "Précédent", next: "Suivant", retry: "Réessayer", finish: "Terminer l'épreuve", resume: "Reprendre",
  start: "Commencer", review: "Revoir", more: "Plus", reset: "Réinitialiser", cancel: "Annuler", saved: "Enregistré",
  markGreen: "Marquer vert", markAmber: "Marquer ambre", optionsEn: "Options en anglais",
  resetTitle: "Réinitialiser cette question ?", resetBody: "Elle redevient grise, comme jamais vue.",
  // a report on one question
  report: "Signaler un problème", reported: "Signalé", reportMessage: "Votre message", send: "Envoyer",
  reportRef: (section: string, level: string, n: number) => `${section} · ${level} · n° ${n}`,
  reportSent: "Merci, c'est envoyé", reportFailed: "Le message n'est pas parti. Réessayez.", reportCap: "Assez de signalements pour aujourd'hui.",
  // colours (the legend is the one allowed caption)
  legend: { grey: "Nouveau", green: "Juste", red: "Faux", amber: "Corrigé" },
  done: "Répondu", todo: "Sans réponse", current: "En cours",
  // player
  play: "Lire", pause: "Pause", position: "Position",
  audioUnavailable: "Audio indisponible", question: "La question", optionsSpoken: "Les propositions",
  // feedback
  why: (k: string) => `Pourquoi ${k}`, whyNot: (k: string) => `Pourquoi pas ${k}`,
  answerWas: (k: string) => `La réponse était ${k}`, keySentence: "La phrase clé", explanation: "Explication",
  right: "Juste", wrong: "Faux", yourAnswer: "Votre réponse", noAnswer: "Sans réponse", skipped: "Passée",
  questionLevel: (n: number, level: string) => `Question ${n} · ${level}`, rightAnswer: "Bonne réponse",
  statement: (k: string) => `Proposition ${k}`,
  // bands
  offlinePractice: "Hors ligne — vos réponses sont gardées sur cet appareil.",
  offlineExam: "Hors ligne — vos réponses sont gardées.",
  loadFailed: "Les questions n'ont pas pu être chargées.", finishFailed: "Le résultat n'est pas arrivé. Réessayez.",
  // exam sheets
  finishTitle: "Terminer l'épreuve ?", finishAll: "Toutes les questions ont une réponse.",
  abandonTest: "Abandonner le test",
  unanswered: (n: number) => (n === 1 ? "1 question sans réponse." : `${n} questions sans réponse.`), unansweredWrong: "Les questions sans réponse comptent faux.",
  leaveTitle: "Quitter l'examen ?", leaveBody: "Le temps continue.", stay: "Rester", leave: "Quitter", continueExam: "Continuer l'examen",
};

type Words = typeof fr;

const en: Words = {
  co: "Compréhension orale", ce: "Compréhension écrite",
  examN: (code, n) => `Exam ${code} no. ${n}`, examNo: (n) => `no. ${n}`,
  practice: "Practice", training: "Free",
  back: "Back", questionOf: (n, of) => `Question ${n} of ${of}`,
  pickerTitle: "Questions", timeLeft: "Time left", timeUp: "Time is up",
  transcript: "Transcript", hint: "Hint", shortHint: "Short hint", english: "English translation", autoplay: "Autoplay",
  fullText: "Full text", view: "View", text: "Text",
  hintNote: "A summary written for practice, not the original text.",
  prev: "Previous", next: "Next", retry: "Retry", finish: "Complete the test", resume: "Resume",
  start: "Start", review: "Review", more: "More", reset: "Reset", cancel: "Cancel", saved: "Saved",
  markGreen: "Mark green", markAmber: "Mark amber", optionsEn: "Options in English",
  resetTitle: "Reset this question?", resetBody: "It goes back to grey, as if never seen.",
  report: "Report a problem", reported: "Reported", reportMessage: "Your message", send: "Send",
  reportRef: (section, level, n) => `${section} · ${level} · no. ${n}`,
  reportSent: "Thank you, it's sent", reportFailed: "The message did not go through. Try again.", reportCap: "Enough reports for today.",
  legend: { grey: "New", green: "Right", red: "Wrong", amber: "Corrected" },
  done: "Answered", todo: "Unanswered", current: "Current",
  play: "Play", pause: "Pause", position: "Position",
  audioUnavailable: "Audio unavailable", question: "The question", optionsSpoken: "The options",
  why: (k) => `Why ${k}`, whyNot: (k) => `Why not ${k}`,
  answerWas: (k) => `The answer was ${k}`, keySentence: "The key sentence", explanation: "Explanation",
  right: "Right", wrong: "Wrong", yourAnswer: "Your answer", noAnswer: "No answer", skipped: "Skipped",
  questionLevel: (n, level) => `Question ${n} · ${level}`, rightAnswer: "Right answer",
  statement: (k) => `Option ${k}`,
  offlinePractice: "Offline — your answers are kept on this device.",
  offlineExam: "Offline — your answers are kept.",
  loadFailed: "The questions could not be loaded.", finishFailed: "The result did not come through. Try again.",
  finishTitle: "Complete the test?", finishAll: "Every question has an answer.",
  abandonTest: "Abandon the test",
  unanswered: (n) => (n === 1 ? "1 question unanswered." : `${n} questions unanswered.`), unansweredWrong: "Unanswered questions count as wrong.",
  leaveTitle: "Leave the exam?", leaveBody: "The clock keeps running.", stay: "Stay", leave: "Leave", continueExam: "Continue the exam",
};

export const ROOM_WORDS: Record<Lang, Words> = { fr, en };
export const useRoomWords = (lang: Lang): Words => ROOM_WORDS[lang];
export type { Words as RoomWords };
