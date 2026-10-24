/**
 * Scores, version 5 (2026-10), writing and speaking: a few criteria shown as LEVELS (A1 to C2), one overall mark out
 * of 20, and up to three short tips. Pure module: no bindings, so the Worker, the result screen and the tests share it.
 *
 * Why it changed. The scorer used to write one impression on every row (« 13, 13, 13, 13 ») and could not tell a
 * clean-but-simple production from a richer one. Now it first LISTS evidence with exact quotes — complex structures
 * used correctly, mistakes, precise words — the quotes are checked against the production in code, and the counts
 * frame the Grammar, Vocabulary and Spelling scores. The overall mark is the scorer's judgement of the whole
 * production, kept within one point of what the criteria support.
 */

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
/** the official /20 ↔ level correspondence (IRCC table); `span` = how many score points the level covers */
export const CEFR_LEVELS: { id: Cefr; min: number; max: number; span: number; status: string }[] = [
  { id: "A1", min: 0, max: 3, span: 3, status: "Very weak" },
  { id: "A2", min: 4, max: 5, span: 2, status: "Weak" },
  { id: "B1", min: 6, max: 9, span: 4, status: "Almost there" },
  { id: "B2", min: 10, max: 13, span: 4, status: "On target" },
  { id: "C1", min: 14, max: 15, span: 2, status: "Excellent" },
  { id: "C2", min: 16, max: 20, span: 5, status: "Outstanding" },
];
export function cefrOf(score20: number) {
  const s = Math.max(0, Math.min(20, Math.round(score20)));
  return CEFR_LEVELS.find((l) => s >= l.min && s <= l.max) ?? CEFR_LEVELS[0];
}

/* ---------- evidence ---------- */

export const COMPLEX_TYPES = ["subjonctif", "hypothese_conditionnel", "relative_simple", "relative_complexe", "mise_en_relief", "pronom_y_en", "gerondif", "concession", "passif", "discours_indirect", "consequence_but", "temps_composes", "restriction_negation", "question_indirecte", "inversion"] as const;
export type ComplexType = (typeof COMPLEX_TYPES)[number];
/** the common ones: every B1 speaker uses « qui » and « parce que »; they show little about the level */
const BASIC_TYPES = new Set<string>(["relative_simple"]);
/** the ones that mark the upper levels: a production without any of them is B2 at most, however clean */
const ADVANCED_TYPES = new Set<string>(["subjonctif", "hypothese_conditionnel", "relative_complexe", "gerondif", "concession", "temps_composes", "consequence_but", "restriction_negation", "question_indirecte", "inversion"]);

export type RawEvidence = {
  complex: { type: string; quote: string }[];
  errors: { quote: string; fix: string; kind: string; times: number }[];
  precise: string[];
  idioms: string[];
};
export type Evidence = {
  /** distinct kinds of complex structure used correctly (« qui / que » relatives left out) */
  complexTypes: string[];
  /** how many of those are advanced kinds (subjunctive, real hypothesis, « dont », concession…) */
  advanced: number;
  /** audible, certain mistakes, counted with their repetitions */
  grammarErrors: number;
  lexisErrors: number;
  /** writing only */
  spellingErrors: number;
  precise: number;
  idioms: number;
  /** what was kept after checking the quotes against the transcript */
  quotes: { complex: { type: string; quote: string }[]; errors: { quote: string; fix: string; kind: string; times: number }[]; precise: string[]; idioms: string[] };
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[«»"“”.,;:!?…()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Only what the candidate really said counts: a quote that is not in the transcript is dropped. */
export function checkEvidence(raw: RawEvidence | null | undefined, candidateText: string, spoken = false): Evidence {
  const text = ` ${norm(candidateText)} `;
  const said = (q: string) => {
    const n = norm(q ?? "");
    return n.length >= 2 && text.includes(n);
  };
  const uniq = (list: string[]) => [...new Map(list.filter(said).map((q) => [norm(q), q.trim()])).values()];
  const complex = (raw?.complex ?? []).filter((c) => (COMPLEX_TYPES as readonly string[]).includes(c.type) && said(c.quote)).map((c) => ({ type: c.type, quote: c.quote.trim() }));
  const seen = new Set<string>();
  const errors = (raw?.errors ?? [])
    .filter((e) => said(e.quote) && norm(e.fix ?? "") !== norm(e.quote) && norm(e.fix ?? "").length > 0)
    .filter((e) => !seen.has(norm(e.quote)) && !!seen.add(norm(e.quote)))
    .map((e) => ({ quote: e.quote.trim(), fix: e.fix.trim(), kind: e.kind === "lexis" || e.kind === "spelling" ? e.kind : "grammar", times: Math.max(1, Math.min(3, Math.round(Number(e.times) || 1))) }));
  const precise = uniq(raw?.precise ?? []).slice(0, 12);
  const idioms = uniq(raw?.idioms ?? []).slice(0, 8);
  // how much a mistake weighs: on the page, every one; in speech, a listener at normal speed lets a one-off slip half
  // go by, and only a mistake that comes back counts in full (`spoken`)
  const count = (kind: string) => errors.filter((e) => e.kind === kind).reduce((s, e) => s + (spoken ? (e.times >= 2 ? 1 : 0.5) : e.times), 0);
  const complexTypes = [...new Set(complex.map((c) => c.type).filter((t) => !BASIC_TYPES.has(t)))];
  return {
    complexTypes,
    advanced: complexTypes.filter((t) => ADVANCED_TYPES.has(t)).length,
    grammarErrors: count("grammar"),
    lexisErrors: count("lexis"),
    spellingErrors: count("spelling"),
    precise: precise.length,
    idioms: idioms.length,
    quotes: { complex, errors, precise, idioms },
  };
}

export type Range = [number, number];
/**
 * Variety: what separates clean-but-simple production (10) from solid B2 (12–13), C1 (14–15) and beyond. Advanced
 * structures open the levels one by one; idiomatic expressions count too — near-native French shows its level in
 * turns of phrase more than in subjunctives (a C2 text with one « dont » used to be held at 11).
 */
function varietyCap(e: Evidence): number {
  const a = e.advanced + Math.floor(e.idioms / 2);
  const several = e.complexTypes.length >= 3;
  if (a === 0) return 10;
  // a single advanced structure can be a set phrase: it needs company to count for a level
  if (a === 1) return several ? 12 : 11;
  if (a <= 3) return 11 + a;
  if (a === 4) return 15;
  return e.idioms >= 2 ? 20 : 16;
}

/**
 * Mistakes, per 100 words. One slip in a long production costs nothing below the very top: natives make them.
 *
 * The table was reset on 2026-10-05 against texts marked by real DELF examiners (tests/fixtures/human-rated.json):
 * a 270-word argued letter with about eleven mistakes, several of them basic (« nous vous prions de reconsidéré »,
 * « tout l'école », « les décisions seraient fait »), was validated as a B2 performance; a simple 180-word text with
 * seven or eight light mistakes scored 24.5/25 at B1. The first version of this table put both a level too low:
 * a B2 writer makes several mistakes per paragraph. Density starts to cost a level only around one mistake
 * every other sentence.
 */
export function errorCap(errors: number, words: number): number {
  const d = (errors / Math.max(60, words)) * 100;
  return errors === 0 ? 20 : d <= 0.7 ? 18 : d <= 1.6 ? 16 : d <= 3 ? 14 : d <= 5 ? 12 : d <= 7 ? 10 : d <= 10 ? 8 : d <= 14 ? 6 : 5;
}

/**
 * What the evidence allows, per criterion (inclusive /20 range), for writing and speaking alike (speaking only
 * lists mistakes that are audible and certain; writing lists every mistake on the page, and has a Spelling row).
 * Thresholds were set on the graded samples in tests/fixtures/ and the owner's real sessions; see the README.
 */
export function evidenceBounds(e: Evidence, words: number): { grammar: Range; vocabulary: Range; spelling: Range } {
  const dense = (n: number) => (n / Math.max(60, words)) * 100;
  let gHi = Math.min(varietyCap(e), errorCap(e.grammarErrors, words));
  // simple language with more than the odd slip is B1, not the B2 threshold (one mistake is never a pattern, even
  // in a short text: a single — and wrongly reported — correction once cost a clean 108-word message two points)
  if (e.advanced === 0 && e.idioms < 2 && e.grammarErrors >= 2 && dense(e.grammarErrors) > 3.5) gHi = Math.min(gHi, 9);
  const clean = dense(e.grammarErrors) <= 0.7;
  // enough structures attempted and mistakes that stay occasional: not below the B2 threshold
  const gLo = clean && e.advanced >= 4 ? 13 : dense(e.grammarErrors) <= 1.6 && e.advanced >= 2 ? 11 : dense(e.grammarErrors) <= 5 && e.advanced >= 1 ? 9 : 0;
  const grammar: Range = [Math.min(gLo, gHi), gHi];

  // vocabulary follows what was listed, and never sits far from grammar: the two are one language level seen twice
  const p = e.precise + e.idioms;
  const listed = p <= 2 ? 10 : p <= 5 ? 11 : p <= 8 ? 13 : e.idioms >= 3 ? 20 : 15;
  // (a learner's words are usually a little ahead of their grammar: two points while the grammar is B1, one above;
  // simple language stays at 11)
  const vHi = Math.min(listed, errorCap(e.lexisErrors, words), grammar[1] + (grammar[1] <= 9 ? 2 : 1), e.advanced === 0 ? 11 : 20);
  const vLo = e.lexisErrors === 0 && p >= 9 ? 12 : dense(e.lexisErrors) <= 0.7 && p >= 6 ? 10 : 0;
  const vocabulary: Range = [Math.min(Math.max(vLo, grammar[0] - 1), vHi), vHi];
  // correct spelling of simple words is not a level far above the language itself, but it is never held below B2 for that
  return { grammar, vocabulary, spelling: [0, Math.min(errorCap(e.spellingErrors, words), Math.max(gHi + 3, 12))] };
}

/**
 * The counts are a guard against generosity in the middle of the scale, not a ceiling on excellence, and the scorer
 * does not always list everything it saw (in a dialogue made of questions it sometimes lists nothing). So when it
 * places a production at C1 or above and mistakes are few, the cap gives way to within two points of its score:
 * a missed list costs two points at most, never a level and a half.
 */
export function boundedScore(score: number, range: Range, errors: number, words: number): number {
  const d = (errors / Math.max(60, words)) * 100;
  const hi = score >= 14 && d <= 2.6 ? Math.max(range[1], Math.min(score - 2, errorCap(errors, words))) : range[1];
  return Math.max(range[0], Math.min(hi, score));
}

/**
 * The scorer stops at 15 even when everything it lists says « native-like »: on eight near-native samples scored
 * on 2026-10-05 it gave 15–17 for texts written for 18, while its own evidence showed no mistake and five to eight
 * idiomatic expressions (the samples written for 14 showed one to four). So the stretch is done here: a production
 * the scorer already places in C1, without mistakes, with that many idiomatic turns, is lifted into C2.
 */
export function nativeStretch(e: Evidence, words: number): number {
  const mistakes = e.grammarErrors + e.lexisErrors;
  if (mistakes > 1 || (mistakes / Math.max(60, words)) * 100 > 0.7 || e.idioms < 5) return 0;
  return e.idioms >= 7 || e.advanced >= 4 ? 3 : 2;
}
/** Applied to a row or to the overall judgement, only from the C1 line up, never past 19. */
export const stretched = (score: number, by: number) => (by > 0 && score >= 14 ? Math.min(19, score + by) : score);

/**
 * What real examiners call B2 (DELF grid, and a validated B2 letter with about eleven mistakes in 270 words): the
 * task is carried out and developed, and mistakes, though regular, are not dense. Such a production is not marked
 * below the B2 threshold, whatever the scorer's impression of the grammar.
 */
export function atB2Threshold(taskScore: number, e: Evidence, words: number): boolean {
  const density = ((e.grammarErrors + e.lexisErrors) / Math.max(60, words)) * 100;
  return taskScore >= 12 && words >= 60 && density <= 5;
}
export const B2_THRESHOLD = 10;

/**
 * A flat addition to every criterion and to the overall judgement, before anything else. Tried at 1.5 on 2026-10-06
 * and set back to 0 the same day: the owner wants the leniency in the judging itself (a listener who lets slips go),
 * not a number added afterwards. Kept as the one place to turn if a flat shift is ever wanted again.
 */
export const LENIENCY = 0;

/** A missing or wrong accent only (« decouvrir », « bientot »): it counts for half a spelling mistake. */
export function accentOnly(written: string, correct: string): boolean {
  const flat = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return written.trim() !== correct.trim() && flat(written) === flat(correct);
}

/**
 * The overall mark. `holistic` is the scorer's single judgement of the whole performance from the transcript; the
 * recording (fluency, pronunciation) moves it by its share; the result stays close to the weighted criteria (never
 * more than a point away once rounded), so an impression cannot contradict the evidence.
 */
/**
 * How far the overall judgement may move the mark away from the criteria. A little more room upwards than downwards:
 * measured against texts marked by real examiners, the criteria ran half a point to a point low (the earlier setting,
 * the other way round, had been tuned on samples graded by hand that were themselves too strict).
 */
export const WHOLE_MARGIN = { up: 0.6, down: 0.4 };
export function wholeScore(opts: { holistic: number | null | undefined; criteriaMean: number; audioMean: number | null }): number {
  const { criteriaMean, audioMean } = opts;
  if (opts.holistic == null || !Number.isFinite(opts.holistic)) return criteriaMean;
  const h = audioMean == null ? opts.holistic : opts.holistic * 0.7 + audioMean * 0.3;
  return Number(Math.max(criteriaMean - WHOLE_MARGIN.down, Math.min(criteriaMean + WHOLE_MARGIN.up, h)).toFixed(2));
}

/* ---------- tips ---------- */

export type Fix = { said: string; say: string; label: string; why: string };
export type NextStep = { what: string; example: string };
export type SoundTip = { word: string; heard: string; tip: string; /** which of the candidate's recorded answers, and where in it (seconds) */ answer?: number; atS?: number };
export type Tip =
  | { kind: "fix"; label: string; said: string; say: string; note: string }
  | { kind: "sound"; label: string; said: string; say: string; note: string; answer?: number; atS?: number }
  | { kind: "next"; label: string; say: string; note: string };

const short = (s: string, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** Corrections the scorer proposed, kept only when the passage is really in the transcript and really changes. */
export function validFixes(fixes: Fix[] | null | undefined, candidateText: string): Fix[] {
  const text = ` ${norm(candidateText)} `;
  const out: Fix[] = [];
  for (const f of fixes ?? []) {
    const said = norm(f.said ?? "");
    if (said.length < 3 || !text.includes(said) || norm(f.say ?? "") === said || !norm(f.say ?? "")) continue;
    if (out.some((o) => norm(o.said) === said)) continue;
    out.push({ said: f.said.trim().replace(/^[«"\s]+|[»"\s.]+$/g, ""), say: f.say.trim().replace(/^[«"\s]+|[»"\s.]+$/g, ""), label: short(f.label, 18) || "Fix", why: short(f.why, 70) });
  }
  return out;
}

/** At most three, in the order they help: one thing said wrong, one sound, one step towards the next level. */
export function buildTips(opts: { fixes: Fix[]; sound?: SoundTip | null; next?: NextStep | null }): Tip[] {
  const tips: Tip[] = [];
  const fix = (f: Fix): Tip => ({ kind: "fix", label: f.label, said: f.said, say: f.say, note: f.why });
  if (opts.fixes[0]) tips.push(fix(opts.fixes[0]));
  const s = opts.sound;
  if (s && s.word.trim() && s.tip.trim()) tips.push({ kind: "sound", label: "Sound", said: short(s.heard, 30), say: short(s.word, 30), note: short(s.tip, 70), ...(s.answer != null && s.atS != null ? { answer: s.answer, atS: s.atS } : {}) });
  else if (opts.fixes[1]) tips.push(fix(opts.fixes[1]));
  const n = opts.next;
  if (n && n.example.trim()) tips.push({ kind: "next", label: "Next level", say: short(n.example, 110), note: short(n.what, 60) });
  return tips.slice(0, 3);
}

/* ---------- what the scorer is asked for ---------- */

const str = { type: "string" };
const obj = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const list = (items: unknown) => ({ type: "array", items });
/** Fields added to the scorer's answer. Writing has no `errors` list here: its mistakes are the corrections it already returns. */
export const evidenceField = (speaking: boolean) =>
  obj({
    complex: list(obj({ type: { type: "string", enum: [...COMPLEX_TYPES] }, quote: str })),
    ...(speaking ? { errors: list(obj({ quote: str, fix: str, kind: { type: "string", enum: ["grammar", "lexis"] }, times: { type: "integer" } })) } : {}),
    precise: list(str),
    idioms: list(str),
  });
export const JUDGEMENT_FIELDS = {
  overall: obj({ reason: str, level: str, score: { type: "integer" } }),
  fixes: list(obj({ said: str, say: str, label: str, why: str })),
  next: obj({ what: str, example: str }),
};

const COMPLEX_HELP = `type : subjonctif (« pour que je puisse ») ; hypothese_conditionnel (si + imparfait → conditionnel : « si je pouvais, j'y retournerais » ; PAS « si tout se passe bien, je voudrais », PAS un simple « je voudrais / j'aimerais ») ; relative_simple (qui, que, où, ce que, ce qui) ; relative_complexe (dont, lequel, auquel, préposition + qui, celui que, ceux qui) ; mise_en_relief (« ce que je préfère, c'est… », « c'est… qui ») ; pronom_y_en (« on y trouve », « j'en ai l'occasion ») ; gerondif (« en voyageant ») ; concession (bien que, même si, certes… mais, quitte à, avoir beau) ; passif ; discours_indirect (« il dit qu'il est… ») ; consequence_but (si bien que, tellement… que, de sorte que, afin de) ; temps_composes (plus-que-parfait, futur antérieur, conditionnel passé, infinitif passé) ; restriction_negation (ne… que, ne… guère, ne… plus jamais, ni… ni) ; question_indirecte (« je me demandais si… », « pourriez-vous me dire combien… », « j'aimerais savoir comment… ») ; inversion (question avec inversion du sujet au conditionnel ou soutenue : « auriez-vous… ? », « serait-il possible de… ? », « faut-il que… ? » ; pas « est-ce que », pas « avez-vous »)`;

/** The order the scorer works in: the facts first, then the levels, then the single mark, then the advice. */
export function scoringSteps(speaking: boolean): string {
  const who = speaking ? "du candidat (2 à 8 mots, copiés de ses répliques, jamais de l'examinatrice)" : "du texte (2 à 8 mots, copiés caractère pour caractère)";
  return `## Ce que tu rends, dans cet ordre
ÉTAPE 1 — evidence : un RELEVÉ FACTUEL, avant tout jugement. Chaque entrée cite les mots EXACTS ${who}. Ne gonfle pas et n'oublie rien : ce relevé encadre les notes.
- complex : chaque structure complexe employée CORRECTEMENT, une entrée par occurrence (12 au plus). ${COMPLEX_HELP}.
${speaking ? "- errors : TOUTES les erreurs AUDIBLES et CERTAINES (règle 7.d), même une seule occurrence — le serveur décide de leur poids, et une ou deux ne coûtent rien : quote (ses mots), fix (le même passage corrigé), kind (grammar ou lexis), times (combien de fois cette même erreur revient, 1 à 3). Pense à l'ordre des mots (« oublier le travail un peu »), au mot faux (« la vie est très bien », « c'est fatigué », « plus mieux »), au temps ou au mode (« si j'aurais », « si le bus sera gratuit », « bien que ça suffit »), à la préposition ou au pronom (« pendant quatre ans » pour « depuis », « intéressé de », « je vais lui inscrire »). Rien de ce que les points a, b, c de la règle 7 écartent.\n" : ""}- precise : les mots ou collocations PRÉCIS bien employés (12 au plus) : termes du métier ou du sujet, verbes exacts, connecteurs variés (« en revanche », « d'ailleurs », « dans un premier temps »). Pas les mots très courants (grand, beau, aimer, travail, beaucoup, parce que, mais, donc).
- idioms : TOUTES les expressions idiomatiques, imagées ou tournures de locuteur natif employées avec justesse (12 au plus) : « donner du fil à retordre », « ça en vaut la peine », « pour rien au monde », « à y regarder de près », « là où le bât blesse », « quitte à », « cela va sans dire », « on aurait tort de ». C'est ce relevé qui ouvre les notes de 16 et plus : ne l'abrège pas.
ÉTAPE 2 — criteria : pour chacun, reason, level, score, en cohérence avec ton relevé.${speaking ? "" : " Puis corrections (TOUTES les erreurs qui coûtent des points, 14 au plus) et vocabulary, comme décrit plus haut."}
ÉTAPE 3 — overall : UNE note d'ensemble sur 20 pour toute la production, comme une correctrice qui ${speaking ? "écoute" : "lit"} puis décide — pas la moyenne de tes critères. reason (une phrase), level, score. Utilise toute l'échelle : une production quasi native (nombreuses expressions idiomatiques dans ton relevé, aucune erreur qui compte) reçoit 16 à 18, pas 15.
ÉTAPE 4 — fixes : 0 à 2 corrections, les plus rentables${speaking ? ", prises dans errors" : ", prises dans corrections"}. said = ses mots exacts (2 à 8 mots) ; say = le même passage corrigé, en changeant le minimum ; label = le type d'erreur en ANGLAIS, 1 ou 2 mots (Word order, Tense, Verb form, Preposition, Article, Agreement, Word choice, Spelling, Register) ; why = la règle en ANGLAIS, 8 mots au plus. Liste vide s'il n'y a pas d'erreur ${speaking ? "audible et certaine" : "nette"} : n'invente rien.
ÉTAPE 5 — next : ce qui le ferait passer au niveau SUPÉRIEUR à celui de overall. what = en ANGLAIS, 8 mots au plus (« Add one concession », « Develop each idea with an example ») ; example = UNE phrase modèle en français, 16 mots au plus, construite avec SON contenu (son métier, sa ville, son sujet), qu'il pourrait ${speaking ? "redire" : "réécrire"} telle quelle.`;
}
