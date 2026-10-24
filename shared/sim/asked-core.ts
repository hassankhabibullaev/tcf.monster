// The Tâche 1 questions already asked in the person's previous sessions, so the next session asks others. The list
// lives in the person's browser (it can echo what they said about themselves); a request carries it to the examiner's
// script and the server keeps nothing of it.

/** about four sessions: enough to avoid repeats, short enough that the usual exam questions come back */
export const ASKED_KEEP = 24;

export const normalizeQuestion = (q: string) => q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const STOP = new Set(["vous", "votre", "vos", "que", "qu", "est", "ce", "de", "du", "des", "la", "le", "les", "un", "une", "et", "en", "dans", "pour", "avec", "a", "au", "aux", "pouvez", "me", "parler", "quel", "quelle", "quels", "quelles", "qui", "quoi", "comment", "pourquoi", "plus", "y", "il", "se", "on"]);
const keywords = (q: string) => new Set(normalizeQuestion(q).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));

/** Same question, or the same question reworded (most content words shared). */
export function isRepeat(q: string, asked: string[]): boolean {
  const n = normalizeQuestion(q);
  const kw = keywords(q);
  for (const a of asked) {
    if (normalizeQuestion(a) === n) return true;
    const ka = keywords(a);
    if (!kw.size || !ka.size) continue;
    let shared = 0;
    for (const w of kw) if (ka.has(w)) shared++;
    if (shared / Math.min(kw.size, ka.size) >= 0.75 && shared >= 2) return true;
  }
  return false;
}

/** the list after a session: the new questions last, an old copy of one dropped, the oldest beyond ASKED_KEEP gone */
export const mergeAsked = (prev: string[], questions: string[]): string[] =>
  [...prev.filter((p) => !questions.some((q) => normalizeQuestion(q) === normalizeQuestion(p))), ...questions].slice(-ASKED_KEEP);

/** what a request may carry: strings, short, at most ASKED_KEEP of them */
export const askedFrom = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).filter((q): q is string => typeof q === "string" && !!q.trim()).slice(-ASKED_KEEP).map((q) => q.slice(0, 300));
