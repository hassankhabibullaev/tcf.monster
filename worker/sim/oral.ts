/**
 * The speaking station, server side: the examiner's lines for a task (prepareTask) and her script for the live
 * session (liveScript). Every line is the LIVE examiner's to say. Nothing the candidate says comes here: the browser
 * keeps the recordings and the turns (web/app/sim/work.ts), opens the live session with the person's own key, adds
 * what was already said to the script (shared/sim/live-notes.ts) and marks the task itself.
 */
import { updateTask } from "./db.ts";
import { VOICE_PREFS } from "./ai/gemini.ts";
import type { RealtimeUsage } from "./ai/models.ts";
import { EXAMINER_LINES, SPEAKING, normalizeTasks, type TaskNo } from "./config.ts";
import { fallbackInterview } from "./oral-bank.ts";
import { isRepeat, recentAsked } from "./asked.ts";
import { argumentSystem, interviewSystem } from "./interview.ts";
import { TIMING, type Timing } from "./timing.ts";
import { getSession, getTask, promptOf } from "./session.ts";
import { FIXED_LINES, isFixedLine, byTime, CLIP_ID, MAX_UPLOAD_BYTES, speakingFacts, type Clip } from "../../shared/sim/oral-core.ts";
export { FIXED_LINES, isFixedLine, byTime, CLIP_ID, MAX_UPLOAD_BYTES, speakingFacts, type Clip };
import type { GeneratedPrompt } from "./types.ts";
import { relanceFor, roleplaySystem } from "./roleplay.ts";
import { CLOSE, FAREWELL, FIXED, opening, rules, type SessionShape } from "./oral-lines.ts";

/** `audioB64` is always null now (no recorded lines); the shape is kept for the browser */
export type Line = { text: string; audioB64: string | null };
/** What the examiner says at the end of a task and of the session (oral-lines.ts); every line is hers to say live. */
export type Closing = { /** the candidate had finished */ done: Line; /** she has to interrupt (one wording is picked) */ cut: Line[]; /** T2: a question asked too late is not answered, and she says why */ lateQuestion: Line | null; /** after the last task of the session */ farewell: Line | null };
/** `cut`: what she says when she interrupts the candidate (Tâche 1 presentation at 1 min 30, Tâche 3 development at the limit). */
export type OralPlan = { taskNo: TaskNo; intro: Line[]; /** what the live examiner says herself right after the intro (the subject of the task), before the preparation time or the opening */ subject: string[]; opening: Line; items: Line[]; ack: Line | null; cut: Line | null; relance: Line; stop: Line; closing?: Closing; timing: Timing };


/** The tasks of a session, ascending, and whether it is the exam: the script adapts to both. */
async function shapeOf(sessionId: string): Promise<SessionShape & { exam: boolean }> {
  const d = await getSession(sessionId);
  return { tasks: normalizeTasks(d?.session.taches ?? [1, 2, 3]) as (1 | 2 | 3)[], exam: d?.session.kind === "exam" };
}

const later = (t: string): Line => ({ text: t, audioB64: null });

/** Fills the examiner plan when the prompt does not carry one (Tâche 1: the fallback questions). */
async function ensureExaminerPlan(taskId: string, p: GeneratedPrompt): Promise<GeneratedPrompt> {
  const plan = { ...(p.examinerPlan ?? {}) };
  let changed = false;
  if (p.task === 1 && !(plan.questions?.length)) {
    const asked = await recentAsked();
    plan.questions = fallbackInterview((q) => isRepeat(q, asked));
    changed = true;
  }
  if (!changed) return p;
  const next = { ...p, examinerPlan: plan };
  await updateTask(taskId, { promptJson: JSON.stringify(next) });
  return next;
}

/**
 * The examiner's lines for a task. Exam (`kind` = exam): the official script. Its first task opens with the welcome
 * that ends on « dites-moi vos prénom et nom » — and STOPS there: the live examiner hears the name, repeats it and
 * says the Tâche 1 line herself (examinerPreamble tells her to). So in the exam the candidate's first turn is the
 * name, not the presentation; the runner does not need to know (its clock rules start with the first turn as
 * before). Practice: the shorter lines, rules included in the intro.
 */
export async function prepareTask(sessionId: string, taskNo: TaskNo): Promise<OralPlan> {
  const task = await getTask(sessionId, taskNo);
  const p = await ensureExaminerPlan(task.id, promptOf(task));
  const shape = await shapeOf(sessionId);
  const first = shape.tasks[0] === taskNo;
  const last = shape.tasks[shape.tasks.length - 1] === taskNo;
  const exam = { exam: shape.exam };
  // exam, first task: the welcome alone (the name step, then her own Tâche 1 line); otherwise greeting + rules
  const intro = (shape.exam && first ? [opening(shape, exam)] : [...(first ? [opening(shape, exam)] : []), rules(taskNo, shape, first, exam)]).map(later);
  const closing: Closing = { done: later(CLOSE.done[taskNo]), cut: CLOSE.cut[taskNo].map(later), lateQuestion: taskNo === 2 ? later(CLOSE.lateQuestion2) : null, farewell: last ? later(FAREWELL) : null };
  // Tâche 1: the rules end with « pouvez-vous vous présenter ? »; then one live question per answer
  if (taskNo === 1) {
    return { taskNo, intro, subject: [], opening: { text: "", audioB64: null }, items: [], ack: null, cut: later(FIXED.cut1), relance: later(EXAMINER_LINES.relance1), stop: closing.done, closing, timing: TIMING[1] };
  }
  // Tâche 2: the rules, then the situation (on the screen too) and the preparation; after it, the cue; then the scene
  if (taskNo === 2) {
    const situation = p.roleplay?.situation && p.consigne.length > 400 ? p.roleplay.situation : p.consigne;
    return { taskNo, intro, subject: [situation, FIXED.prepStart], opening: later(FIXED.prepOver), items: [], ack: null, cut: null, relance: later(relanceFor(p)), stop: closing.done, closing, timing: TIMING[2] };
  }
  // Tâche 3: the rules, then the question (on the screen too) with the cue to start; then one live intervention per answer
  return { taskNo, intro, subject: [`${p.consigne} ${FIXED.go3}`], opening: { text: "", audioB64: null }, items: [], ack: null, cut: later(FIXED.cut3), relance: later(FIXED.relance3), stop: closing.done, closing, timing: TIMING[3] };
}

/**
 * Live examiner: her role, the rules and the script for one task (Gemini Live). The browser adds what was already
 * said (shared/sim/live-notes.ts: the earlier tasks, and the exchange before a cut), opens the session with the
 * person's own key and talks to her directly; nothing is sent per turn.
 */
export async function liveScript(sessionId: string, taskNo: TaskNo = 2): Promise<{ instructions: string; sessionSeconds: number }> {
  const task = await getTask(sessionId, taskNo);
  const p = await ensureExaminerPlan(task.id, promptOf(task));
  const t = SPEAKING.tasks[taskNo];
  const shape = await shapeOf(sessionId);
  const body = taskNo === 1 ? interviewSystem({ asked: await recentAsked(), pace: VOICE_PREFS.pace }) : taskNo === 2 ? roleplaySystem(p, { pace: VOICE_PREFS.pace }) : argumentSystem({ question: p.consigne, pace: VOICE_PREFS.pace });
  // the connection is opened up to 25 s before the task, and her opening (rules, situation) takes up to 45 s more
  return { instructions: `${examinerPreamble(shape, taskNo, "", { exam: shape.exam })}\n\n${body}`, sessionSeconds: t.prepSeconds + t.speakSeconds + 90 };
}

/**
 * One examiner from the first word to the last. Each task runs on its own live connection (a long one is fragile on
 * the free tier), so every connection is told that it is the same person, in which tone to speak, and what the
 * candidate already said (the browser adds it: shared/sim/live-notes.ts): she never greets twice, never introduces
 * herself again.
 * Exam, first task: after the welcome's « dites-moi vos prénom et nom » she hears the name, repeats it and says the
 * official Tâche 1 line herself (it is NOT in the script she is handed, so it is given here as an instruction).
 */
export function examinerPreamble(shape: SessionShape, taskNo: TaskNo, continuity: string, opts: { exam?: boolean } = {}): string {
  const first = shape.tasks[0] === taskNo;
  const last = shape.tasks[shape.tasks.length - 1] === taskNo;
  const name = opts.exam && first ? `\n# Le nom du candidat\nAprès la phrase « dites-moi vos prénom et nom », tu écoutes la réponse, tu répètes son prénom et son nom (« Merci, [prénom] [nom]. »), puis tu enchaînes avec la première tâche : tu dis exactement : "${rules(1, shape, true, { exam: true })}" — et tu écoutes sa présentation.` : "";
  return `# Une seule examinatrice, du début à la fin
Tu es LA MÊME examinatrice pendant toute l'épreuve d'expression orale (${shape.tasks.length === 1 ? "une tâche aujourd'hui" : `${shape.tasks.length} tâches aujourd'hui : ${shape.tasks.map((n) => `la ${n === 1 ? "première" : n === 2 ? "deuxième" : "troisième"}`).join(", ")}`}). Cette connexion couvre la tâche ${taskNo}${first ? ", la première" : last ? ", la dernière" : ""}. ${first ? "C'est toi qui accueilles le candidat." : "Le candidat et toi vous êtes déjà parlé : tu ne dis plus bonjour, tu ne te présentes pas, tu ne recommences aucune introduction."}
# Deux voix, et seulement deux
- L'EXAMINATRICE : accueil, consignes, lecture de la situation ou du sujet, questions de l'entretien et de la tâche 3, transitions, clôture, au revoir. Ton neutre, posé, professionnel, bienveillant mais sobre : volume égal, articulation nette, débit posé, jamais enjoué, jamais d'exclamation, jamais de rire, aucune emphase. C'est ta voix par défaut, du premier mot au dernier.
- LA PERSONNE DE LA CARTE (tâche 2, UNIQUEMENT quand tu réponds aux questions du candidat dans la scène) : un peu plus vivante et chaleureuse, celle d'une vraie personne qui rend service. Dès que la scène est finie (la phrase de régie qui clôt la tâche), tu redeviens l'examinatrice. Lire la situation et annoncer la préparation, c'est l'examinatrice qui le fait.
# Consignes de régie
Une consigne de régie (« dis exactement cette phrase ») se dit telle quelle, sans rien ajouter ni commenter : ce sont les phrases du déroulement de l'épreuve. Le temps de chaque tâche est tenu par l'application, pas par toi : tu ne parles jamais du temps de toi-même.${name}${continuity ? `\n${continuity}` : ""}`;
}

/** The browser could not open, or lost, the live session: kept in the Worker logs so the cause can be found. */
export async function realtimeFailed(sessionId: string, reason: string): Promise<void> {
  console.error(`live examiner failed (session ${sessionId}): ${reason.slice(0, 300)}`);
}

/** The live session's tokens, reported by the browser when the task ends. No ledger here: only a log line. */
export async function logRealtimeUsage(sessionId: string, model: string, u: RealtimeUsage, responses: number, taskNo: TaskNo = 2): Promise<void> {
  const n = (v: unknown) => Math.max(0, Math.min(5e6, Math.round(Number(v) || 0)));
  console.log(`live t${taskNo} ${sessionId.slice(0, 8)} ${model}: ${responses} answers, audio in ${n(u.audioIn)} / out ${n(u.audioOut)} tokens`);
}
