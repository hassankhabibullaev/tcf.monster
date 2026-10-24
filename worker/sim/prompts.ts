/**
 * The subjects of the simulator come from the `topics` table (the monthly topic lists, word for word, refreshed
 * weekly by worker/topics.ts) and become the GeneratedPrompt the engine was written against. Nothing is invented.
 *
 * Rules: never a hidden row nor one gone from the source; « at random » = a random row of the NEWEST month that has
 * rows for that section and tâche. EO Tâche 1 has no subject. An EO session with Tâche 2 and Tâche 3 takes both
 * from the SAME Partie (as the real test does); when the person chose one of them, the other follows its Partie.
 * EE: a row is a Combinaison (tâche 1, 2 and 3 together): one session uses ONE combinaison for all its tasks.
 */
import { all, one } from "./db.ts";
import { nowIso, safeJson } from "./util.ts";
import { EXAMINER_LINES, SPEAKING, SPEC_VERSION, WRITING, type TaskNo, type ThemeId } from "./config.ts";
import { RELATION, type Relation } from "./roleplay.ts";
import type { GeneratedPrompt, SourceDocument } from "./types.ts";

export type Section = "ee" | "eo";
export type TopicRow = { section: Section; id: number; month: string; part: number; part_id: number; tache: number | null; position: number; title: string; body: string; first_seen: string; last_seen: string; gone_at: string | null; hidden: number };

const ALIVE = "hidden = 0 AND gone_at IS NULL";
/** EO rows carry their tâche (2 or 3); an EE row holds the three (tache NULL) */
const tacheClause = (section: Section, taskNo: TaskNo) => (section === "eo" ? `AND tache = ${taskNo}` : "AND tache IS NULL");

async function newestMonth(section: Section, taskNo: TaskNo): Promise<string | null> {
  const r = await one<{ month: string }>(`SELECT month FROM topics WHERE section = ? AND ${ALIVE} ${tacheClause(section, taskNo)} ORDER BY month DESC LIMIT 1`, section);
  return r?.month ?? null;
}

/** a random live row of the newest month; within one Partie when `partId` is given */
async function randomTopic(section: Section, taskNo: TaskNo, partId?: number | null): Promise<TopicRow | null> {
  if (partId != null) {
    const r = await one<TopicRow>(`SELECT * FROM topics WHERE section = ? AND part_id = ? AND ${ALIVE} ${tacheClause(section, taskNo)} ORDER BY RANDOM() LIMIT 1`, section, partId);
    if (r) return r;
  }
  const month = await newestMonth(section, taskNo);
  if (!month) return null;
  return one<TopicRow>(`SELECT * FROM topics WHERE section = ? AND month = ? AND ${ALIVE} ${tacheClause(section, taskNo)} ORDER BY RANDOM() LIMIT 1`, section, month);
}

/** a row the person chose; a hidden or gone one is refused (null → drawn at random instead) */
async function chosenTopic(section: Section, id: number): Promise<TopicRow | null> {
  return one<TopicRow>(`SELECT * FROM topics WHERE section = ? AND id = ? AND ${ALIVE}`, section, id);
}

/** The topic rows of a session's tasks (EO Tâche 1 has none). */
export async function pickTopics(section: Section, taches: TaskNo[], topicIds: Partial<Record<TaskNo, number>> = {}): Promise<Partial<Record<TaskNo, TopicRow>>> {
  const out: Partial<Record<TaskNo, TopicRow>> = {};
  if (section === "ee") {
    // one combinaison for every task of the session
    const wanted = topicIds[1] ?? topicIds[2] ?? topicIds[3];
    const row = (wanted != null ? await chosenTopic("ee", wanted) : null) ?? (await randomTopic("ee", 1));
    if (!row) throw new Error("aucun sujet d'expression écrite disponible");
    for (const t of taches) out[t] = row;
    return out;
  }
  // EO: Tâche 2 and 3 from the same Partie; a chosen one fixes the Partie for the other
  let partId: number | null = null;
  for (const t of [2, 3] as TaskNo[]) {
    const id = topicIds[t];
    if (!taches.includes(t) || id == null) continue;
    const row = await chosenTopic("eo", id);
    if (row && row.tache === t) {
      out[t] = row;
      partId ??= row.part_id;
    }
  }
  for (const t of [2, 3] as TaskNo[]) {
    if (!taches.includes(t) || out[t]) continue;
    const row = await randomTopic("eo", t, partId);
    if (!row) throw new Error(`aucun sujet disponible pour la tâche ${t}`);
    out[t] = row;
    partId ??= row.part_id;
  }
  return out;
}

/** The subject of one task, chosen or random; EO Tâche 1 ignores `topicId`. */
export async function promptFor(section: Section, taskNo: TaskNo, topicId?: number | null): Promise<GeneratedPrompt> {
  if (section === "eo" && taskNo === 1) return promptFromTopic(section, 1, null);
  const topics = await pickTopics(section, [taskNo], topicId != null ? { [taskNo]: topicId } : {});
  return promptFromTopic(section, taskNo, topics[taskNo] ?? null);
}

/** what the person reads: the title, except the site's « #3 » placeholders, where the description holds the text */
export function topicText(row: TopicRow): string {
  const body = safeJson<Record<string, unknown>>(row.body, {});
  if (/^#\d+$/.test(row.title.trim())) return String(body.description ?? "").trim() || row.title;
  return row.title.trim();
}

/**
 * Who the examiner is in a Tâche 2 card written from her side (« Je suis votre ami(e)… », « Je travaille à… »):
 * a friend, colleague, neighbour, relative or classmate is addressed with « tu », anyone else with « vous ».
 */
export function relationOf(card: string): Relation {
  const t = card.toLowerCase();
  if (/\bami\(?e?\)?s?\b/.test(t)) return "ami";
  if (/coll[èe]gue/.test(t)) return "collegue";
  if (/voisin|même immeuble|m[êe]me rue/.test(t)) return "voisin";
  if (/\b(votre|mon|ma) (fr[èe]re|s[œoe]+ur|cousin|m[èe]re|p[èe]re|oncle|tante|parents?|fils|fille|grand-m[èe]re|grand-p[èe]re)\b|de votre famille/.test(t)) return "famille";
  if (/camarade|colocataire|m[êe]me classe|m[êe]me cours/.test(t)) return "camarade";
  if (/^je (travaille|suis (un|une|le|la|l')?\s?(employ|responsable|professeur|chef|agent|vendeu|propri|g[ée]rant|directeur|directrice|secr[ée]taire|m[ée]decin|conseill|animat|formateur|formatrice|guide|serveu|r[ée]ceptionniste))|^je (dirige|loue|propose|vends|cherche un emploi|g[èe]re|tiens)/.test(t)) return "professionnel";
  if (/je travaille|je suis (employ|responsable|professeur|chef|agent|vendeu|propri|g[ée]rant|m[ée]decin|conseill|animat|formateur|formatrice|guide|serveu|r[ée]ceptionniste)/.test(t)) return "professionnel";
  return "inconnu";
}

const THEME_WORDS: [ThemeId, RegExp][] = [
  ["travail", /travail|emploi|entreprise|coll[èe]gue|carri[èe]re|m[ée]tier|bureau|stage|formation professionnelle|salari/i],
  ["etudes", /[ée]tud|[ée]cole|universit|cours|dipl[ôo]me|[ée]l[èe]ve|apprentissage|professeur/i],
  ["logement", /logement|appartement|maison|colocat|d[ée]m[ée]nag|quartier|immeuble|louer|location|chambre/i],
  ["sante", /sant[ée]|m[ée]decin|m[ée]dicament|sport|maladie|h[ôo]pital|alimentation|r[ée]gime|bien-[êe]tre/i],
  ["environnement", /environnement|pollution|climat|nature|recycl|[ée]colog|plastique|v[ée]lo|animaux?/i],
  ["technologie", /technolog|internet|num[ée]rique|t[ée]l[ée]phone|ordinateur|robot|intelligence artificielle|application|r[ée]seaux sociaux|en ligne/i],
  ["voyages", /voyage|vacances|tourisme|touristique|h[ôo]tel|pays|visite|s[ée]jour|train|avion/i],
  ["famille", /famille|enfant|parent|mariage|anniversaire|grands?-parents|couple/i],
  ["medias", /t[ée]l[ée]vision|s[ée]rie|film|cin[ée]ma|livre|lecture|journal|presse|musique|[ée]mission|publicit/i],
  ["vie-civique", /ville|mairie|association|b[ée]n[ée]vol|citoyen|soci[ée]t[ée]|loi|vote|immigration|transports? en commun/i],
  ["consommation", /achet|achat|prix|argent|magasin|consomm|cadeau|restaurant|march[ée]|vendre/i],
];
/** a rough theme for the history (never shown to the candidate): the first list of words that the subject matches */
export function themeOf(text: string): ThemeId {
  for (const [id, re] of THEME_WORDS) if (re.test(text)) return id;
  return "loisirs";
}

/** The official instruction of writing Tâche 3, built from the Manuel's two parts. */
export const EE_T3_CONSIGNE = `Vous rédigez un texte qui compare les deux points de vue exprimés dans les deux documents ci-dessous, puis vous prenez position. Première partie (${WRITING.tasks[3].part1Words}) : vous présentez et comparez les deux points de vue. Deuxième partie (${WRITING.tasks[3].part2Words}) : vous donnez votre opinion sur le thème traité et vous l'argumentez. Texte de ${WRITING.tasks[3].wordsMin} à ${WRITING.tasks[3].wordsMax} mots.`;

/** A topics row (or none, for EO Tâche 1) → the prompt stored with the task. Pure. */
export function promptFromTopic(section: Section, taskNo: TaskNo, row: TopicRow | null): GeneratedPrompt {
  const base = { generatedAt: nowIso(), specVersion: SPEC_VERSION, source: "bank" as const };
  const label = row ? `${row.month} · P${row.part}` : "";
  const id = `${section}:${row ? row.id : "none"}:${taskNo}`;
  if (section === "eo") {
    const s = SPEAKING.tasks[taskNo];
    const timing = { timeLimitSeconds: s.speakSeconds, prepTimeSeconds: s.prepSeconds };
    if (taskNo === 1 || !row) return { id, skill: "speaking", task: taskNo, theme: "entretien", topic: "entretien", consigne: EXAMINER_LINES.opening1, ...timing, ...base };
    const text = topicText(row);
    if (taskNo === 2) {
      const rel = relationOf(text);
      return { id, skill: "speaking", task: 2, theme: themeOf(text), topic: label, consigne: text, roleplay: { situation: text, examinerRole: RELATION[rel].role, register: RELATION[rel].register, kind: rel }, ...timing, ...base };
    }
    return { id, skill: "speaking", task: 3, theme: themeOf(text), topic: label, consigne: text, ...timing, ...base };
  }
  if (!row) throw new Error("sujet d'expression écrite manquant");
  const w = WRITING.tasks[taskNo];
  const body = safeJson<{ tache1?: string; tache2?: string; tache3?: { title?: string; document1?: string; document2?: string } }>(row.body, {});
  const common = { skill: "writing" as const, topic: label, wordCountMin: w.wordsMin, wordCountMax: w.wordsMax, timeLimitSeconds: w.minutes * 60, ...base };
  if (taskNo === 1) return { id, task: 1, theme: themeOf(body.tache1 ?? ""), consigne: (body.tache1 ?? "").trim(), ...common };
  if (taskNo === 2) return { id, task: 2, theme: themeOf(body.tache2 ?? ""), consigne: (body.tache2 ?? "").trim(), ...common };
  const t3 = body.tache3 ?? {};
  const sourceDocuments: SourceDocument[] = [
    { author: "Document 1", text: (t3.document1 ?? "").trim() },
    { author: "Document 2", text: (t3.document2 ?? "").trim() },
  ];
  return { id, task: 3, theme: themeOf(`${t3.title ?? ""} ${t3.document1 ?? ""}`), title: (t3.title ?? "").trim(), consigne: EE_T3_CONSIGNE, sourceDocuments, ...common };
}

/** every live topic of a section (for a chooser), newest month first, in the source's order */
export async function listTopics(section: Section): Promise<TopicRow[]> {
  return all<TopicRow>(`SELECT * FROM topics WHERE section = ? AND ${ALIVE} ORDER BY month DESC, part, tache, position`, section);
}
