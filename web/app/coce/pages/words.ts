// Every word of the CO / CE pages, French first (UX §9). In English everything is English: only the four section
// names, NCLC and the level codes stay as they are. A control is its label: the colour legend and the hero's lines
// under the mode picks are the only sentences that explain anything.
import type { Lang } from "../../i18n.ts";
import type { AttemptMode } from "./shared.ts";

const fr = {
  // the mode switch
  modeLabel: "Mode", examen: "Examen", entrainement: "Entraînement",
  // practice
  questions: (n: number) => `${n} questions`,
  levelWorth: (p: number, n: number, t: number) => `Une question vaut ${p} points ; les ${n} de ce niveau font ${t} des 699 points d'un examen.`,
  open: "Ouvrir", seenOf: (seen: number, of: number) => `${seen} / ${of} vues`, pts: (p: number) => `${p} pts`,
  search: "Rechercher une question", noHits: "Aucune question ne correspond.",
  legend: { grey: "Gris · nouveau", green: "Vert · juste du premier coup", red: "Rouge · faux", amber: "Ambre · corrigé" },
  // exams
  examNo: (n: number) => `n° ${n}`, examTitle: (s: string, n: number) => `Examen ${s.toUpperCase()} n° ${n}`,
  newExam: "Nouveau", done: "Terminé", running: "En cours",
  attempts: (n: number) => (n === 1 ? "1 essai" : `${n} essais`), minutes: (m: number) => `${m} min`,
  nclc: (n: number) => `NCLC ${n}`, nclcLow: "NCLC 3", scoreOf: (s: number) => `${s} / 699`,
  start: "Commencer", resume: "Reprendre", abandon: "Abandonner", review: "Revoir", back: "Retour", cancel: "Annuler",
  allExams: "Tous les examens", pastAttempts: "Essais passés",
  deleteAttempt: "Supprimer", deleteTitle: "Supprimer cet essai ?", deleteBody: "Il disparaît de vos résultats et de votre tableau de bord.",
  // the hero: the two modes, each explaining itself in its own lines (the one place allowed to explain); the two
  // picks have the same number of lines, matched pair by pair, so the difference reads line by line
  modeChoice: "Mode", modeExam: "Mode examen réel", modeTraining: "Mode libre", modeExamShort: "Examen réel", modeTrainingShort: "Mode libre", examShort: (s: string) => `Examen ${s.toUpperCase()}`, examsOf: (s: string) => `${s.toUpperCase()} · Examens`,
  modeShort: { exam: "Réel", training: "Libre" } as Record<AttemptMode, string>,
  modeLines: {
    exam: {
      co: ["Chaque enregistrement n'est joué qu'une fois.", "La question suivante vient d'elle-même.", "Pas de retour en arrière."],
      ce: ["Vous passez d'une question à l'autre librement, comme le jour J.", "Une réponse peut changer tant que le temps court.", "Le chronomètre tourne : 60 minutes."],
    },
    training: {
      co: ["Réécoutez autant que vous voulez.", "Vous passez à la suivante quand vous voulez.", "Revenez en arrière librement."],
      ce: ["Vous passez d'une question à l'autre librement.", "Une réponse peut changer tant que le temps court.", "Le chronomètre tourne quand même : 60 minutes."],
    },
  } as Record<AttemptMode, Record<"co" | "ce", string[]>>,
  lineClock: "Le temps continue même si vous quittez la salle.",
  // result: four cells (the score, the right answers, the NCLC, the level), then the levels
  score: "Score", rightAnswers: "Bonnes réponses", nclcWord: "NCLC", cefr: "Niveau", byLevel: "Par niveau",
  perLevel: (l: string, r: number, of: number) => `${l} : ${r} sur ${of}`,
  endedAbandon: "Terminé avant la fin — les questions sans réponse comptent faux.",
  endedTime: "Temps écoulé — les questions sans réponse comptent faux.",
  points: (n: number) => `${n} points`,
  abandoned: "Abandonné", timedOut: "Temps écoulé",
  practiseLevel: (l: string) => `S'entraîner au ${l}`,
  filter: "Afficher", filters: { all: "Toutes", wrong: "Fausses", blank: "Sans réponse" } as Record<"all" | "wrong" | "blank", string>,
  stillRunning: "Cet examen est encore en cours.", resultMissing: "Ce résultat n'existe pas.",
  // the running band (and the hero while something runs)
  bandText: (s: string, n: number) => `Examen ${s.toUpperCase()} n° ${n} en cours`,
  abandonTitle: "Abandonner ?", abandonBody: "Les questions sans réponse comptent faux.", keepGoing: "Continuer l'examen",
  // when it goes wrong
  failed: "Quelque chose s'est mal passé.", retry: "Réessayer",
};

export type Words = typeof fr;
const en: Words = {
  modeLabel: "Mode", examen: "Exam", entrainement: "Practice",
  questions: (n) => `${n} questions`,
  levelWorth: (p, n, t) => `One question is worth ${p} points; the ${n} at this level make ${t} of an exam's 699.`,
  open: "Open", seenOf: (seen, of) => `${seen} / ${of} seen`, pts: (p) => `${p} pts`,
  search: "Search the questions", noHits: "No question matches.",
  legend: { grey: "Grey · new", green: "Green · right the first time", red: "Red · wrong", amber: "Amber · corrected" },
  examNo: (n) => `no. ${n}`, examTitle: (s, n) => `Exam ${s.toUpperCase()} no. ${n}`,
  newExam: "New", done: "Completed", running: "In progress",
  attempts: (n) => (n === 1 ? "1 attempt" : `${n} attempts`), minutes: (m) => `${m} min`,
  nclc: (n) => `NCLC ${n}`, nclcLow: "NCLC 3", scoreOf: (s) => `${s} / 699`,
  start: "Start", resume: "Resume", abandon: "Abandon", review: "Review", back: "Back", cancel: "Cancel",
  allExams: "All exams", pastAttempts: "Past attempts",
  deleteAttempt: "Delete", deleteTitle: "Delete this attempt?", deleteBody: "It disappears from your results and your dashboard.",
  modeChoice: "Mode", modeExam: "Real exam mode", modeTraining: "Free mode", modeExamShort: "Real exam", modeTrainingShort: "Free mode", examShort: (s) => `Exam ${s.toUpperCase()}`, examsOf: (s) => `${s.toUpperCase()} · Exams`,
  modeShort: { exam: "Real", training: "Free" },
  modeLines: {
    exam: {
      co: ["Each recording plays once.", "The next question comes by itself.", "No going back."],
      ce: ["You move freely between the questions, as on the day.", "An answer can change while the clock runs.", "The clock runs: 60 minutes."],
    },
    training: {
      co: ["Replay as often as you like.", "Move to the next question when you want.", "Go back freely."],
      ce: ["You move freely between the questions.", "An answer can change while the clock runs.", "The clock runs all the same: 60 minutes."],
    },
  },
  lineClock: "The clock keeps running even if you leave the room.",
  score: "Score", rightAnswers: "Right answers", nclcWord: "NCLC", cefr: "Level", byLevel: "By level",
  perLevel: (l, r, of) => `${l}: ${r} of ${of}`,
  endedAbandon: "Finished early — unanswered questions count as wrong.",
  endedTime: "Time ran out — unanswered questions count as wrong.",
  points: (n) => `${n} points`,
  abandoned: "Abandoned", timedOut: "Time ran out",
  practiseLevel: (l) => `Practise ${l}`,
  filter: "Show", filters: { all: "All", wrong: "Wrong", blank: "Unanswered" },
  stillRunning: "This exam is still in progress.", resultMissing: "This result does not exist.",
  bandText: (s, n) => `Exam ${s.toUpperCase()} no. ${n} in progress`,
  abandonTitle: "Abandon?", abandonBody: "Unanswered questions count as wrong.", keepGoing: "Continue the exam",
  failed: "Something went wrong.", retry: "Retry",
};

export const WORDS: Record<Lang, Words> = { fr, en };
