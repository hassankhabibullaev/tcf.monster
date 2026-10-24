// Small helpers the ported modules used to take from expression's lib/utils, lib/dates, lib/crypto and lib/gen/schema.

export function wordCount(text: string): number {
  return (text || "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export const nowIso = () => new Date().toISOString();

/** 16 random bytes as hex */
export function randomId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ---- checks on a Tâche 1 question (← lib/gen/schema.ts) ---- */

export const wordsOf = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Task-3-style markers that must never appear in a Task 1 interview question (opinion on society). */
const OPINION = /\b(selon vous|pensez-vous|à votre avis|faut-il|faudrait-il|devrait-on|devrait|est-il important|avantages?|inconvénients?|société|la jeunesse|les jeunes|l'avenir|le monde|l'environnement|l'éducation|la technologie|les réseaux sociaux|le gouvernement|les entreprises devraient)\b/i;
/** Wordings and topics a real examiner does not use in the Tâche 1 interview (too rare, too literary, off-ground). */
const UNNATURAL = /\b(achats?|acheté|objet|cadeau|météo|il pleut|voisins?|journée de repos|vous a été|vous tient à c(oe|œ)ur|gardez-vous|en mémoire|auquel|à laquelle|lequel|laquelle)\b/i;
export const isPersonalQuestion = (q: string) => !OPINION.test(q) && !UNNATURAL.test(q) && wordsOf(q.replace(/\s*pourquoi\s*\?\s*$/i, "")) <= 12;
