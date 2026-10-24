// Where each line of a transcript sits in its recording, pure. Some lines carry their real time (the timed words of
// the speech, the question and options from `segments`); the others get theirs by sharing the time between their known
// neighbours (or the start, or the end of the recording) in proportion to their length in characters. A word inside a
// line starts at the same share of the line. Good enough to land within a breath of the word; exact where the timing
// is known.

export type LineTime = { chars: number; span: [number, number] | null };

/** every line's [start, end] in seconds, the unknown ones shared out between the known ones */
export function lineSpans(lines: LineTime[], duration: number): [number, number][] {
  const out: [number, number][] = lines.map((l) => (l.span ? [l.span[0], l.span[1]] : [0, 0]));
  let i = 0;
  while (i < lines.length) {
    if (lines[i].span) { i++; continue; }
    let j = i;
    while (j < lines.length && !lines[j].span) j++;
    // the run i..j-1 is unknown: from the end of what comes before to the start of what comes after
    const from = i > 0 ? out[i - 1][1] : 0;
    const to = j < lines.length ? out[j][0] : Math.max(from, duration || from);
    const total = lines.slice(i, j).reduce((a, l) => a + Math.max(1, l.chars), 0);
    let at = from;
    for (let k = i; k < j; k++) {
      const len = ((to - from) * Math.max(1, lines[k].chars)) / total;
      out[k] = [at, at + len];
      at += len;
    }
    i = j;
  }
  return out;
}

/** the second a word starts, from its line's span and its character offset in the line */
export function wordStart(span: [number, number], offset: number, chars: number): number {
  return span[0] + (span[1] - span[0]) * (chars > 0 ? Math.min(1, offset / chars) : 0);
}
