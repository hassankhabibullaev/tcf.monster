/**
 * The examiner's fixed lines: the script of the test, from the greeting to the goodbye. The LIVE examiner says them
 * herself (one voice from the first word to the last); when she is not connected in time, the text is shown
 * instead. Pure module (no imports) so tests and scripts can read it.
 *
 * Two scripts:
 * - the EXAM (kind « exam », always the three tasks): the official words of France Éducation international
 *   (resources/examiner/script-irn-demo.txt) with TCF Canada's durations — the welcome and the rules, « dites-moi vos
 *   prénom et nom », each task announced in the official sentence;
 * - PRACTICE (one task, or several): the shorter lines of before — no name, no recording notice.
 *
 * Two tones: these lines are the EXAMINER's (neutral, posed); inside the Tâche 2 scene she is the person on the
 * card (livelier, warmer) and steps out of it, back to this tone, to close.
 */
export type SessionShape = { /** the tasks of the session, ascending */ tasks: (1 | 2 | 3)[] };
export type ScriptOpts = { /** the exam's official script, or the shorter practice lines */ exam?: boolean };

const DURATION: Record<1 | 2 | 3, string> = { 1: "deux minutes", 2: "trois minutes trente", 3: "quatre minutes trente" };
const NAME: Record<1 | 2 | 3, string> = { 1: "un entretien", 2: "un exercice en interaction", 3: "l'expression d'un point de vue" };
const ORDINAL: Record<1 | 2 | 3, string> = { 1: "première", 2: "deuxième", 3: "troisième" };

/** « la deuxième tâche », or « la dernière tâche » when it closes the session */
const taskLabel = (n: 1 | 2 | 3, shape: SessionShape) => (shape.tasks.length > 1 && shape.tasks[shape.tasks.length - 1] === n ? `la ${ORDINAL[n]} et dernière tâche` : `la ${ORDINAL[n]} tâche`);

/**
 * The exam's welcome, word for word from the official script (durations adapted to TCF Canada). It ends on the
 * request for the candidate's name: the live examiner is told (oral.ts, examinerPreamble) to listen to the answer,
 * repeat the name and then say the first task's line herself. So in the exam, the name answer is the candidate's
 * first turn, before the self-presentation; the runner's clock rules (timing.ts) are not touched by it: the
 * presentation still ends at the first long pause or at 1 min 30, counted by the browser from when it starts.
 */
export const EXAM_OPENING = "Bonjour. Bienvenue à l'épreuve d'expression orale du TCF Canada. Cette épreuve dure environ douze minutes. C'est un entretien en trois parties, sans préparation, sauf pour la deuxième tâche. L'entretien est enregistré. À tout moment, vous pouvez me faire répéter ou reformuler un mot ou une question. Attention, une fois l'enregistrement commencé, il ne pourra plus être arrêté. Nous commençons. Tout d'abord, dites-moi vos prénom et nom, s'il vous plaît.";

/** The exam's announcement of each task (official words, TCF Canada durations). */
export const EXAM_RULES: Record<1 | 2 | 3, string> = {
  1: "Voici la première tâche. Cette partie de l'épreuve dure deux minutes. Est-ce que vous pouvez vous présenter ?",
  2: "Nous passons à la deuxième tâche. Elle dure trois minutes trente. Nous allons discuter comme dans la vie quotidienne. Je vais vous présenter la situation ; vous aurez ensuite deux minutes pour la préparer. Voici la situation.",
  3: "Pour finir, voici la troisième tâche. Elle dure quatre minutes trente. Vous allez me donner votre opinion. Voici le sujet.",
};

/** The greeting (and, in practice, the count of tasks): said once, at the start of the session. */
export function opening(shape: SessionShape, opts: ScriptOpts = {}): string {
  if (opts.exam) return EXAM_OPENING;
  const n = shape.tasks.length;
  const list = n === 3 ? "trois tâches" : n === 2 ? `deux tâches, la ${ORDINAL[shape.tasks[0]]} et la ${ORDINAL[shape.tasks[1]]}` : `une seule tâche, la ${ORDINAL[shape.tasks[0]]}`;
  return `Bonjour, bienvenue à l'épreuve d'expression orale. Aujourd'hui, elle comporte ${list}.`;
}

/** The rules of a task, said before it (after the greeting for the first one, after the transition for the others). */
export function rules(n: 1 | 2 | 3, shape: SessionShape, first: boolean, opts: ScriptOpts = {}): string {
  if (opts.exam) return EXAM_RULES[n];
  const lead = first ? `Commençons par ${taskLabel(n, shape)} :` : `Passons à ${taskLabel(n, shape)} :`;
  if (n === 1) return `${lead} ${NAME[1]} de ${DURATION[1]}, sans préparation. Je vais vous poser quelques questions sur vous. Pour commencer, pouvez-vous vous présenter ?`;
  if (n === 2) return `${lead} ${NAME[2]}. Je vais vous présenter une situation. Vous aurez deux minutes pour préparer vos questions, puis nous jouerons la scène pendant ${DURATION[2]}. Voici la situation.`;
  return `${lead} ${NAME[3]}. Il n'y a pas de préparation ; vous avez ${DURATION[3]}. Voici le sujet.`;
}

export const FIXED = {
  /** Tâche 2: after the situation, before the preparation */
  prepStart: "Vous pouvez prendre des notes. Je vous laisse vous préparer.",
  /** Tâche 2: end of the preparation */
  prepOver: "La préparation est terminée. C'est à vous, je vous écoute.",
  /** Tâche 3: after the subject */
  go3: "Je vous écoute.",
  /** Tâche 1: right after the self-presentation; her follow-ups come straight after */
  ack1: "Merci. Je vais maintenant vous poser quelques questions pour mieux vous connaître.",
  /** Tâche 1: the presentation reaches 1 min 30 while the candidate is still speaking */
  cut1: "Merci, je vous arrête là. Je vais maintenant vous poser quelques questions pour mieux vous connaître.",
  /** Tâche 3: the development has reached its limit and the candidate is still speaking */
  cut3: "Merci. J'ai une question pour vous.",
  relance1: "D'accord. Pouvez-vous m'en dire un peu plus ?",
  relance3: "Pouvez-vous développer ce point ?",
  open3: "Je vous écoute.",
};

/** The end of a task: the candidate had finished (« done »), or she has to interrupt (« cut », several wordings). */
export const CLOSE = {
  done: { 1: "Très bien, je vous remercie.", 2: "Merci. Nous allons nous arrêter là pour cette tâche.", 3: "Merci beaucoup." } as Record<1 | 2 | 3, string>,
  cut: {
    1: ["Merci, je dois vous arrêter là : le temps est écoulé.", "Je vous arrête ici, le temps est écoulé. Merci."],
    2: ["Excusez-moi, je vous arrête : le temps est écoulé.", "Pardon, je dois vous interrompre, le temps est écoulé."],
    3: ["Merci, je vous arrête là : le temps est écoulé.", "Je dois vous arrêter ici, le temps est écoulé. Merci."],
  } as Record<1 | 2 | 3, string[]>,
  /** T2: the candidate asked one more question with too little time left: it is not answered, and she says why */
  lateQuestion2: "Je suis désolée, le temps est écoulé, je ne peux plus répondre à cette question. Nous allons nous arrêter là.",
};

/** The end of the session: said after the close of the last task; the marking has already started meanwhile. */
export const FAREWELL = "L'épreuve est terminée. Vos résultats arrivent dans un instant. Je vous souhaite une bonne journée, au revoir.";

/** Every fixed wording (to tell the examiner's fixed lines from her own in a transcript). */
export const ALL_LINES: string[] = [...Object.values(FIXED), ...Object.values(CLOSE.done), ...Object.values(CLOSE.cut).flat(), CLOSE.lateQuestion2, FAREWELL, EXAM_OPENING, ...Object.values(EXAM_RULES)];
/** A transcript line that is one of the script's lines, exam or practice (the practice opening and rules vary with the session, so they are matched by their start). */
export const isScriptLine = (text: string) => ALL_LINES.includes(text) || /^(Bonjour, bienvenue à l'épreuve|Bonjour\. Bienvenue à l'épreuve|Commençons par la |Passons à la |Voici la première tâche\.|Nous passons à la deuxième tâche\.|Pour finir, voici la troisième tâche\.)/.test(text);
