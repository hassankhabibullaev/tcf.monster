// The feedback: nothing until an answer is given, then it fades in under the options. Right: « Pourquoi B » and its
// reason. Wrong: « Pourquoi pas C » then « La réponse était B — pourquoi B ». The explanation stands in when reasons are
// missing; the key sentence closes when there is one.
import type { Lang } from "../../i18n.ts";
import type { Key, Question } from "../bank.ts";
import { useRoomWords } from "./words.ts";

export type FeedbackProps = {
  q: Question;
  /** the chosen key; null = no answer; "-" = skipped (exam, audio failed) */
  chosen: Key | "-" | null;
  /** show the feedback (after the answer in practice; always in review) */
  shown: boolean;
  english: boolean;
  lang: Lang;
};

export function Feedback({ q, chosen, shown, english, lang }: FeedbackProps) {
  const w = useRoomWords(lang);
  if (!shown) return null;
  const reason = (k: Key) => q.options.find((o) => o.key === k)?.reason ?? null;
  const rightReason = reason(q.answer);
  const right = chosen === q.answer;
  const wrongReason = chosen && chosen !== "-" && !right ? reason(chosen) : null;
  const blocks: { title: string; body: string | null; tone: "ok" | "bad" | "none" }[] = [];
  if (right) blocks.push({ title: w.why(q.answer), body: rightReason, tone: "ok" });
  else {
    if (chosen === null) blocks.push({ title: w.noAnswer, body: null, tone: "bad" });
    else if (chosen === "-") blocks.push({ title: w.skipped, body: null, tone: "none" });
    else blocks.push({ title: w.whyNot(chosen), body: wrongReason, tone: "bad" });
    blocks.push({ title: `${w.answerWas(q.answer)} — ${w.why(q.answer).replace(/^\S+/, (m) => m.toLowerCase())}`, body: rightReason, tone: "ok" });
  }
  const noReasons = blocks.every((b) => !b.body);
  return (
    <div className="cr-fb" data-tone={right ? "ok" : "bad"} aria-live="polite">
      {blocks.map((b, i) => (
        <div key={i} className="cr-fb-block" data-tone={b.tone}>
          <h3>{b.title}</h3>
          {b.body && <p lang="fr">{b.body}</p>}
        </div>
      ))}
      {noReasons && q.explanation && (
        <div className="cr-fb-block">
          <h3>{w.explanation}</h3>
          <p lang="fr">{q.explanation}</p>
        </div>
      )}
      {q.keySentence && (
        <div className="cr-fb-block cr-fb-key">
          <h3>{w.keySentence}</h3>
          <p><span lang="fr">« {q.keySentence} »</span>{english && q.keySentenceEn && <span lang="en" className="cr-en">{q.keySentenceEn}</span>}</p>
        </div>
      )}
    </div>
  );
}
