import { useMemo } from "react";
import { segmentsOf, type Correction } from "./types";
import { useSimWords } from "./words";
import type { Lang } from "../i18n";

/**
 * The candidate's own words. `corrected = false`: mistakes underlined, hover or tap shows the fix and a tip.
 * `corrected = true`: the same text with the fixes applied, the changed words in green.
 */
export function Highlighted({ text, corrections, corrected, lang }: { text: string; corrections: Correction[]; corrected: boolean; lang: Lang }) {
  const w = useSimWords(lang);
  const segs = useMemo(() => segmentsOf(text, corrections), [text, corrections]);
  return (
    <span className="hl">
      {segs.map((s, i) =>
        !s.corr ? (
          <span key={i}>{s.text}</span>
        ) : corrected ? (
          <span key={i} className="fix" tabIndex={0}>
            {s.corr.suggestion}
            <span className="err-tip" role="tooltip">
              <span>{w.youWrote(s.text)}</span>
              <span>{s.corr.tip}</span>
            </span>
          </span>
        ) : (
          <span key={i} className="err" data-kind={s.corr.kind} tabIndex={0}>
            {s.text}
            <span className="err-tip" role="tooltip">
              <b>{w.kindsShort[s.corr.kind]}{s.corr.sub ? ` · ${s.corr.sub}` : ""}</b>
              <span className="err-fix">→ {s.corr.suggestion}</span>
              <span>{s.corr.tip}</span>
            </span>
          </span>
        ),
      )}
    </span>
  );
}
