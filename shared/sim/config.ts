/**
 * Single place for every exam figure: timings, word counts, task weights, level mapping.
 *
 * Sources
 * - Official (worker/sim/exam-reference.json, Manuel du candidat TCF Canada + IRCC table): durations, word ranges,
 *   task descriptions, criteria names, /20 → NCLC table. The numbers are copied here by hand (no JSON import:
 *   the tsconfig has no resolveJsonModule and the file is small); change both when one changes.
 * - Per-task writing times: 10 / 15 / 25 min, set by the owner on 2026-10-05 (the official test gives 60 min for
 *   the three tasks together and no time per task; the full simulation here lasts the sum, 50 min).
 * - FALLBACK (not in any official source): task weights 6 / 6 / 8 = 20 points. The marking grid itself
 *   (docs/rubric.md) is a non-official pedagogical grid.
 */

export const SPEC_VERSION = "1.0";
export const RUBRIC_VERSION = "2.1-non-officielle";

export type Skill = "writing" | "speaking";
export type TaskNo = 1 | 2 | 3;
export type Level = "A2" | "B1" | "B2" | "C1" | "C2";
/** TCF Canada has no target level: every candidate gets the same kind of prompt. Levels only describe results. */
export const LEVEL_ORDER: Level[] = ["A2", "B1", "B2", "C1", "C2"];

/** The candidate's target on the /20 scale (10/20 = NCLC 7). Feedback is phrased relative to it. */
export const TARGET_SCORE20 = 10;
export type TargetStatus = "below" | "on" | "above";
export function targetStatus(score20: number): TargetStatus {
  return score20 < TARGET_SCORE20 ? "below" : score20 === TARGET_SCORE20 ? "on" : "above";
}
export const STATUS_LABEL: Record<TargetStatus, string> = {
  below: `En dessous de l'objectif (${TARGET_SCORE20}/20)`,
  on: `Objectif atteint (${TARGET_SCORE20}/20)`,
  above: `Excellent — au-dessus de l'objectif (${TARGET_SCORE20}/20)`,
};

export const SKILL_LABEL: Record<Skill, string> = { writing: "Expression écrite", speaking: "Expression orale" };
export const SKILL_SLUG: Record<Skill, string> = { writing: "ecrit", speaking: "oral" };
export const SKILL_FROM_SLUG: Record<string, Skill> = { ecrit: "writing", oral: "speaking" };

/* ---- the official facts (exam-reference.json, « epreuves ») ---- */
const EE = {
  criteres: [
    "communiquer un message de façon claire",
    "donner les informations demandées",
    "décrire, raconter, expliquer",
    "justifier un choix, une position, une décision, etc.",
    "enchaîner des idées et faire preuve de cohérence dans votre discours",
    "comparer deux points de vue",
    "exprimer votre avis et l'argumenter",
    "utiliser un vocabulaire et des structures adaptés à la tâche demandée",
    "être capable de faire une synthèse et de reformuler",
  ],
  taches: [
    { description: "Rédaction d'un message pour décrire, raconter et/ou expliquer, adressé à un ou plusieurs destinataires, dont le statut a été précisé dans la consigne.", words_min: 60, words_max: 120 },
    { description: "Rédaction d'un article, d'un courrier, d'une note, etc. à l'intention de plusieurs destinataires pour faire un compte rendu d'expérience ou un récit. Comptes rendus et récits accompagnés de commentaires, d'opinions ou d'arguments, en fonction d'un objectif (ex : revendiquer, se réconcilier, etc.).", words_min: 120, words_max: 150 },
    { description: "Rédaction d'un texte (pour un journal, un site Internet, un collègue, un supérieur hiérarchique, etc.) qui compare deux points de vue portant sur un fait de société (1re partie), exprimés dans deux documents courts et simples de 90 mots environ chacun. Le candidat prend position sur le thème traité dans les deux documents (2e partie).", words_min: 120, words_max: 180, part1_words: "40 à 60 mots", part2_words: "80 à 120 mots" },
  ],
};
const EO = {
  duration_min_approx: 12,
  criteres: [
    "parler de vous, de votre environnement, familial et professionnel",
    "poser des questions adaptées à la situation de communication proposée",
    "donner votre opinion et expliquer les avantages et inconvénients d'un projet, exprimer votre accord et votre désaccord",
    "présenter une argumentation claire et structurée dans un style approprié au contexte",
    "présenter de façon détaillée et structurée des sujets complexes, les développer et conclure",
  ],
  taches: [
    { name: "Entretien dirigé sans préparation", prep_s: 0, speaking_s: 120, objective: "Le candidat fait preuve de sa capacité à échanger avec une personne qu'il ne connaît pas (l'examinateur)." },
    { name: "Exercice en interaction avec préparation", prep_s: 120, speaking_s: 210, objective: "Le candidat fait preuve de sa capacité à obtenir des informations dans une situation de la vie quotidienne courante. Les statuts de l'interlocuteur et du candidat sont précisés dans la consigne." },
    { name: "Expression d'un point de vue sans préparation", prep_s: 0, speaking_s: 270, objective: "Le candidat fait preuve de sa capacité à parler de manière spontanée, continue et convaincante en répondant à une question choisie par l'examinateur." },
  ],
};
/** IRCC: /20 → NCLC, the same for writing and speaking (exam-reference.json, « nclc.rows ») */
const NCLC_ROWS: { nclc: number; cecrl: string; range: [number, number] }[] = [
  { nclc: 10, cecrl: "C1–C2", range: [16, 20] },
  { nclc: 9, cecrl: "C1", range: [14, 15] },
  { nclc: 8, cecrl: "B2", range: [12, 13] },
  { nclc: 7, cecrl: "B2", range: [10, 11] },
  { nclc: 6, cecrl: "B1", range: [7, 9] },
  { nclc: 5, cecrl: "B1", range: [6, 6] },
  { nclc: 4, cecrl: "A2", range: [4, 5] },
];

export type WritingTaskConfig = {
  task: TaskNo;
  label: string;
  /** one-line summary for lists (the official description is long) */
  short: string;
  description: string;
  wordsMin: number;
  wordsMax: number;
  part1Words?: string;
  part2Words?: string;
  sourceDocWords?: number;
  /** advised time — also the clock for an isolated task */
  minutes: number;
  /** FALLBACK weight */
  maxPoints: number;
  register: string;
};

export const WRITING: { totalMinutes: number; tasks: Record<TaskNo, WritingTaskConfig>; criteria: string[] } = {
  // the sum of the three task times below (the official test allows 60)
  totalMinutes: 50,
  criteria: EE.criteres,
  tasks: {
    1: { task: 1, label: "Tâche 1", short: "Message à un proche : décrire, raconter, expliquer", description: EE.taches[0].description, wordsMin: EE.taches[0].words_min, wordsMax: EE.taches[0].words_max, minutes: 10, maxPoints: 6, register: "informel à neutre, adapté au destinataire" },
    2: { task: 2, label: "Tâche 2", short: "Article ou témoignage : récit d'expérience et opinion", description: EE.taches[1].description, wordsMin: EE.taches[1].words_min, wordsMax: EE.taches[1].words_max, minutes: 15, maxPoints: 6, register: "neutre à formel" },
    3: { task: 3, label: "Tâche 3", short: "Comparer deux points de vue, puis prendre position", description: EE.taches[2].description, wordsMin: EE.taches[2].words_min, wordsMax: EE.taches[2].words_max, part1Words: EE.taches[2].part1_words, part2Words: EE.taches[2].part2_words, sourceDocWords: 90, minutes: 25, maxPoints: 8, register: "formel" },
  },
};

export type SpeakingTaskConfig = {
  task: TaskNo;
  label: string;
  name: string;
  objective: string;
  prepSeconds: number;
  speakSeconds: number;
  maxPoints: number;
};

export const SPEAKING: { approxMinutes: number; tasks: Record<TaskNo, SpeakingTaskConfig>; criteria: string[] } = {
  approxMinutes: EO.duration_min_approx,
  criteria: EO.criteres,
  tasks: {
    1: { task: 1, label: "Tâche 1", name: EO.taches[0].name, objective: EO.taches[0].objective, prepSeconds: EO.taches[0].prep_s, speakSeconds: EO.taches[0].speaking_s, maxPoints: 6 },
    2: { task: 2, label: "Tâche 2", name: EO.taches[1].name, objective: EO.taches[1].objective, prepSeconds: EO.taches[1].prep_s, speakSeconds: EO.taches[1].speaking_s, maxPoints: 6 },
    3: { task: 3, label: "Tâche 3", name: EO.taches[2].name, objective: EO.taches[2].objective, prepSeconds: EO.taches[2].prep_s, speakSeconds: EO.taches[2].speaking_s, maxPoints: 8 },
  },
};

/** Exact examiner lines the engine relies on (the opening question of Tâche 1, the stock follow-up, the stop). */
export const EXAMINER_LINES = {
  opening1: "Pour commencer, pouvez-vous vous présenter ?",
  relance1: "D'accord. Pouvez-vous m'en dire un peu plus ?",
  relance2: "Vous vouliez savoir autre chose ?",
  stop: "Merci, nous allons nous arrêter là.",
};

export const ALL_TASKS: TaskNo[] = [1, 2, 3];

export function normalizeTasks(input: unknown): TaskNo[] {
  const arr = Array.isArray(input) ? input : [];
  const set = new Set<TaskNo>();
  for (const x of arr) {
    const n = Number(x);
    if (n === 1 || n === 2 || n === 3) set.add(n);
  }
  const out = [...set].sort((a, b) => a - b);
  return out.length ? out : [...ALL_TASKS];
}

/** Writing: one overall clock = sum of the times of the selected tasks (50 min when all three). */
export function writingTotalSeconds(tasks: TaskNo[]): number {
  return tasks.reduce((s, t) => s + WRITING.tasks[t].minutes * 60, 0);
}

/** Speaking: per-task clocks; total = prep + speaking of the selected tasks. */
export function speakingTotalSeconds(tasks: TaskNo[]): number {
  return tasks.reduce((s, t) => s + SPEAKING.tasks[t].prepSeconds + SPEAKING.tasks[t].speakSeconds, 0);
}

export function totalSeconds(skill: Skill, tasks: TaskNo[]): number {
  return skill === "writing" ? writingTotalSeconds(tasks) : speakingTotalSeconds(tasks);
}

export function maxPoints(skill: Skill, tasks: TaskNo[]): number {
  const cfg = skill === "writing" ? WRITING.tasks : SPEAKING.tasks;
  return tasks.reduce((s, t) => s + cfg[t].maxPoints, 0);
}

export function tasksLabel(tasks: TaskNo[]): string {
  if (tasks.length === 3) return "Tâches 1, 2 et 3";
  if (tasks.length === 2) return `Tâches ${tasks[0]} et ${tasks[1]}`;
  return `Tâche ${tasks[0]}`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Official IRCC mapping of a /20 expression score to NCLC + CECRL. */
export function nclcFor(score20: number, skill: Skill): { nclc: number; cecrl: string } {
  void skill; // the official table is the same for both skills; the parameter is kept for the callers
  const s = Math.round(score20);
  for (const r of NCLC_ROWS) {
    const [lo, hi] = r.range;
    if (s >= lo && s <= hi) return { nclc: r.nclc, cecrl: r.cecrl };
  }
  if (s < 4) return { nclc: 3, cecrl: "A1–A2" };
  return { nclc: 10, cecrl: "C1–C2" };
}

/** Single CECRL level for a /20 score (used for the "estimated level" line). */
export function levelFor(score20: number): Level {
  if (score20 >= 16) return "C2";
  if (score20 >= 14) return "C1";
  if (score20 >= 10) return "B2";
  if (score20 >= 6) return "B1";
  return "A2";
}

/** Theme taxonomy (a rough label kept in the prompt; never shown to the candidate). */
export const THEMES = [
  { id: "travail", label: "Travail" },
  { id: "etudes", label: "Études" },
  { id: "logement", label: "Logement" },
  { id: "sante", label: "Santé" },
  { id: "environnement", label: "Environnement" },
  { id: "technologie", label: "Technologie" },
  { id: "voyages", label: "Voyages" },
  { id: "famille", label: "Famille" },
  { id: "medias", label: "Médias" },
  { id: "vie-civique", label: "Vie civique" },
  { id: "consommation", label: "Consommation" },
  { id: "loisirs", label: "Loisirs" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
