// Three made-up questions in the browser shape (docs/COCE.md §1), for type checks while public/data/ is still being
// built. Nothing in the app imports this file.
import type { Question } from "../bank.ts";

export const FIXTURE: Question[] = [
  {
    id: "co-fx-1", section: "co", level: "A2",
    stem: "Que propose la femme ?", stemEn: "What does the woman suggest?",
    options: [
      { key: "A", text: null, textEn: null, reason: "Elle ne parle pas de cinéma." },
      { key: "B", text: null, textEn: null, reason: "Elle propose bien un café « après le travail »." },
      { key: "C", text: null, textEn: null, reason: "Le restaurant n'est pas mentionné." },
      { key: "D", text: null, textEn: null, reason: "Rien ne parle de marche." },
    ],
    answer: "B",
    hint: { fr: "Écoutez le moment [[après le travail]].", en: "Listen for [[after work]]." },
    keySentence: "On prend un café après le travail ?", keySentenceEn: "Shall we have a coffee after work?", explanation: null,
    audio: "/media/co/fixture-1.mp3", image: null,
    transcript: "— On prend un café après le travail ?\n— Avec plaisir.", transcriptEn: "— Shall we have a coffee after work?\n— Gladly.",
    words: [{ w: "On", s: 0.2, e: 0.4 }, { w: "prend", s: 0.4, e: 0.7 }, { w: "un", s: 0.7, e: 0.8 }, { w: "café", s: 0.8, e: 1.2 }, { w: "après", s: 1.3, e: 1.6 }, { w: "le", s: 1.6, e: 1.7 }, { w: "travail", s: 1.7, e: 2.2 }],
    segments: { options: [[3.0, 3.6], [3.7, 4.3], [4.4, 5.0], [5.1, 5.7]], question: [2.4, 2.9] },
    maxPlays: 2,
    passage: null, passageEn: null, passageImage: null,
    practiceOnly: false,
  },
  {
    id: "co-fx-2", section: "co", level: "B1",
    stem: "Pourquoi le train est-il en retard ?", stemEn: "Why is the train late?",
    options: [
      { key: "A", text: "Une grève", textEn: "A strike", reason: "Aucune grève n'est annoncée." },
      { key: "B", text: "La neige", textEn: "Snow", reason: "Il s'agit de la neige sur les voies." },
      { key: "C", text: "Une panne", textEn: "A breakdown", reason: "Le train n'est pas en panne." },
      { key: "D", text: "Un accident", textEn: "An accident", reason: "Rien n'évoque un accident." },
    ],
    answer: "B",
    hint: null, keySentence: null, keySentenceEn: null, explanation: "L'annonce parle de neige sur les voies.",
    audio: "/media/co/fixture-2.mp3", image: null,
    transcript: "En raison de la neige sur les voies, le train aura vingt minutes de retard.", transcriptEn: "Because of snow on the tracks, the train will be twenty minutes late.",
    words: null, segments: null, maxPlays: 1,
    passage: null, passageEn: null, passageImage: null,
    practiceOnly: true,
  },
  {
    id: "ce-fx-1", section: "ce", level: "B2",
    stem: "Quel est le but de ce message ?", stemEn: "What is the purpose of this message?",
    options: [
      { key: "A", text: "Annuler une réunion", textEn: "Cancel a meeting", reason: "La réunion est déplacée, pas annulée." },
      { key: "B", text: "Déplacer une réunion", textEn: "Move a meeting", reason: "« reportée à jeudi » : elle change de jour." },
      { key: "C", text: "Inviter un collègue", textEn: "Invite a colleague", reason: "Personne n'est invité." },
      { key: "D", text: "Demander un rapport", textEn: "Ask for a report", reason: "Aucun rapport n'est demandé." },
    ],
    answer: "B",
    hint: { fr: "Cherchez le mot [[reportée]].", en: "Look for [[postponed]]." },
    keySentence: "La réunion de mardi est reportée à jeudi.", keySentenceEn: "Tuesday's meeting is postponed to Thursday.", explanation: null,
    audio: null, image: null, transcript: null, transcriptEn: null, words: null, segments: null, maxPlays: 2,
    passage: "Bonjour à tous,\nLa réunion de mardi est reportée à jeudi, même heure, même salle.\nMerci de votre compréhension.",
    passageEn: "Hello everyone,\nTuesday's meeting is postponed to Thursday, same time, same room.\nThank you for your understanding.",
    passageImage: null,
    practiceOnly: false,
    placement: "CE-01-20", position: 20,
  },
];
