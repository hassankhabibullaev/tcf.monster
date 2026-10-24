/** Anchors corrections in the candidate's own text (pure functions, shared by server validation and the UI). */
export type CorrectionKind = "grammar" | "spelling" | "lexis" | "register" | "pronunciation" | "task";
/** sub: the precise type of mistake (« accord », « préposition », « mot faux »…), so mistakes can be grouped and counted */
export type Correction = { excerpt: string; suggestion: string; tip: string; kind: CorrectionKind; sub?: string };
/** a word or expression worth learning, taken from the candidate's own text */
export type VocabItem = { used: string; better: string; example: string };
export type Segment = { text: string; corr?: Correction };

const stripQuotes = (s: string) => s.trim().replace(/^[«"'\s]+|[»"'\s.…]+$/g, "");

/** Splits `text` into plain and corrected segments: first unused occurrence of each excerpt, case-insensitive, no overlap. */
export function segmentsOf(text: string, corrections: Correction[]): Segment[] {
  const spans: { start: number; end: number; corr: Correction }[] = [];
  const lower = text.toLowerCase();
  for (const c of corrections) {
    const needle = stripQuotes(c.excerpt).toLowerCase();
    if (needle.length < 2) continue;
    let from = 0;
    while (from <= lower.length) {
      const i = lower.indexOf(needle, from);
      if (i < 0) break;
      const end = i + needle.length;
      if (!spans.some((s) => i < s.end && end > s.start)) {
        spans.push({ start: i, end, corr: c });
        break;
      }
      from = i + 1;
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start > pos) out.push({ text: text.slice(pos, s.start) });
    out.push({ text: text.slice(s.start, s.end), corr: s.corr });
    pos = s.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

/** The candidate's own text with the corrections applied — a "model answer" they can actually learn. */
export function correctedText(text: string, corrections: Correction[]): string {
  return segmentsOf(text, corrections).map((s) => (s.corr ? stripQuotes(s.corr.suggestion) || s.text : s.text)).join("");
}

/** Keeps only corrections that really occur in the production and really change something. */
export function validCorrections(production: string, corrections: Correction[], max: number): Correction[] {
  const lower = production.toLowerCase();
  const seen = new Set<string>();
  const out: Correction[] = [];
  for (const c of corrections) {
    const ex = stripQuotes(c.excerpt);
    const key = ex.toLowerCase();
    if (ex.length < 2 || !lower.includes(key) || seen.has(key)) continue;
    if (stripQuotes(c.suggestion).toLowerCase() === key || !c.suggestion.trim()) continue;
    seen.add(key);
    out.push({ ...c, excerpt: ex, suggestion: stripQuotes(c.suggestion) });
    if (out.length >= max) break;
  }
  return out;
}

const wordsOfText = (t: string) => t.toLowerCase().replace(/[’']/g, "'").split(/[^\p{L}\p{N}']+/u).filter(Boolean);

/**
 * Writing Tâche 3: runs of `min` words or more taken as they are from a source document. Real correctors penalise
 * copying instead of reformulating, so the passages are shown to the candidate and given to the scorer as a fact.
 */
export function copiedPassages(text: string, documents: string[], min = 6): string[] {
  const tw = wordsOfText(text);
  const found: string[] = [];
  for (const doc of documents) {
    const dw = wordsOfText(doc);
    const grams = new Set<string>();
    for (let i = 0; i + min <= dw.length; i++) grams.add(dw.slice(i, i + min).join(" "));
    let i = 0;
    while (i + min <= tw.length) {
      if (!grams.has(tw.slice(i, i + min).join(" "))) {
        i += 1;
        continue;
      }
      // extend the run as far as it keeps matching the document
      let j = i + min;
      while (j < tw.length && dw.join(" ").includes(tw.slice(i, j + 1).join(" "))) j += 1;
      // « on voit de plus en plus de » is everyday French, not copying: a run needs real content words
      if (tw.slice(i, j).filter((w) => w.length > 4).length >= 3) found.push(tw.slice(i, j).join(" "));
      i = j;
    }
  }
  return [...new Set(found)].slice(0, 6);
}
