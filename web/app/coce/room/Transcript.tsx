// The transcript of a recording, in three parts read from its lines: the speech itself, the four spoken options (the
// trailing « A. … » lines, when any) as a small list under it, and the spoken question (the last line ending in « ? »)
// in its own small box with the mark « ? » at the bottom. Every French word is a button that plays from there: exactly
// where the timing is known (`words` for the speech, `segments` for the question and the options), otherwise at a
// place shared out from the known ones and the recording's length (transcript-time.ts). The word being spoken is lit
// (exact timing only). With English on, the transcript is two columns, French at the left, English at the right, each
// labelled « FR » / « EN » (stacked on a phone).
import { useEffect, useMemo, useState, type RefObject } from "react";
import type { Lang } from "../../i18n.ts";
import type { Segments, Word } from "../bank.ts";
import type { PlayerHandle } from "./Player.tsx";
import { useRoomWords } from "./words.ts";
import { LangTag } from "./Passage.tsx";
import { lineSpans, wordStart, type LineTime } from "./transcript-time.ts";

export type TranscriptProps = {
  text: string | null;
  textEn: string | null;
  words: Word[] | null;
  segments: Segments | null;
  english: boolean;
  lang: Lang;
  player: RefObject<PlayerHandle | null>;
  /** the options' English (spoken-only options carry it), used when the English transcript has no option lines */
  optionsEn?: (string | null)[];
};

function currentWord(words: Word[], t: number) {
  let i = -1;
  for (let k = 0; k < words.length; k++) { if (words[k].s <= t) i = k; else break; }
  return i;
}

/** speech lines · the question line · the option lines, from the transcript's text */
function split(text: string | null) {
  const lines = text ? text.split(/\n+/).map((l) => l.trim()).filter(Boolean) : [];
  const options: string[] = [];
  while (lines.length && /^[A-D]\.\s/.test(lines[lines.length - 1])) options.unshift(lines.pop()!.replace(/^[A-D]\.\s*/, ""));
  const question = lines.length && /\?$/.test(lines[lines.length - 1]) ? lines.pop()! : null;
  return { speech: lines, question, options };
}

const LETTERS = ["A", "B", "C", "D"];

/** a line's words as buttons, each playing from its estimated place */
function Words({ text, onWord }: { text: string; onWord: (offset: number) => void }) {
  const parts: { w: string; at: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) parts.push({ w: m[0], at: m.index });
  return <>{parts.map((p, i) => <span key={i}>{i > 0 ? " " : ""}<button type="button" className="cr-word" onClick={() => onWord(p.at)}>{p.w}</button></span>)}</>;
}

export function Transcript({ text, textEn, words, segments, english, lang, player, optionsEn }: TranscriptProps) {
  const w = useRoomWords(lang);
  const [at, setAt] = useState(-1);
  const fr = useMemo(() => split(text), [text]);
  const en = useMemo(() => split(textEn), [textEn]);
  const live = !!words && words.length > 0;
  // the timing usually covers the speech only; when it runs over the whole text (no speech of its own), the words are the body
  const liveAll = live && fr.speech.length === 0;

  // follow the voice: one read a frame, one render when the word changes
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const tick = () => {
      const a = player.current?.audio;
      const t = a && (a.currentTime > 0) ? a.currentTime : -1;
      const i = t < 0 ? -1 : currentWord(words, t);
      setAt((prev) => (prev === i ? prev : i));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, words, player]);

  // keep the lit word in view inside the scrolling panel
  useEffect(() => {
    if (at < 0) return;
    const el = document.querySelector<HTMLElement>(`.cr-word[data-i="${at}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [at]);

  const seek = (s: number) => player.current?.seek(Math.max(0, s - 0.15), true);

  // the lines in the order they are spoken, each with its real span when known: the speech (timed as one block, or
  // line by line without timing), the question, the options
  const speechLines = live ? [] : fr.speech;
  const showQuestion = !!fr.question && !liveAll;
  const showOptions = fr.options.length > 0 && !liveAll;
  const times = useMemo(() => {
    const lines: LineTime[] = [];
    if (live) lines.push({ chars: 1, span: [words![0].s, words![words!.length - 1].e] });
    speechLines.forEach((l) => lines.push({ chars: l.length, span: null }));
    if (showQuestion) lines.push({ chars: fr.question!.length, span: segments?.question ?? null });
    if (showOptions) fr.options.forEach((o, i) => lines.push({ chars: o.length, span: segments?.options?.[i] ?? null }));
    return lines;
  }, [live, words, speechLines, showQuestion, showOptions, fr, segments]);
  const base = live ? 1 : 0;
  const qIndex = base + speechLines.length;
  const optIndex = (i: number) => qIndex + (showQuestion ? 1 : 0) + i;
  /** play from a word of an untimed line (or a line timed as a whole): its share of the line, the length read at the press */
  const seekLine = (line: number, offset: number) => {
    const chars = times[line]?.chars ?? 1;
    player.current?.seek((duration) => Math.max(0, wordStart(lineSpans(times, duration)[line], offset, chars) - 0.15), true);
  };

  // the timed words, cut into the transcript's speech lines (`p` marks the first word of a new line)
  const turns = useMemo(() => {
    const out: { x: Word; i: number }[][] = [];
    (words ?? []).forEach((x, i) => { if (!out.length || x.p) out.push([]); out[out.length - 1].push({ x, i }); });
    return out;
  }, [words]);

  const frQuestion = showQuestion ? (
    <div className="cr-q" lang="fr" aria-label={w.question}>
      <span className="cr-q-mark" aria-hidden="true">?</span>
      <span className="cr-q-text"><Words text={fr.question!} onWord={(o) => seekLine(qIndex, o)} /></span>
    </div>
  ) : null;
  const frSpeech = (live || speechLines.length > 0) ? (
    <div className="cr-bi-fr" lang="fr">
      {live ? turns.map((turn, t) => (
        <p key={t} className="cr-words">
          {turn.map(({ x, i }) => (
            <button key={i} type="button" className="cr-word" data-i={i} data-state={i === at ? "now" : i < at ? "heard" : undefined} onClick={() => seek(x.s)}>{x.w}</button>
          ))}
        </p>
      )) : speechLines.map((l, i) => <p key={i} className="cr-words"><Words text={l} onWord={(o) => seekLine(base + i, o)} /></p>)}
    </div>
  ) : null;
  const frOptions = showOptions ? (
    <ol className="cr-spoken" lang="fr" aria-label={w.optionsSpoken}>
      {fr.options.map((o, i) => (
        <li key={i}>
          <b className="cr-spoken-key">{LETTERS[i] ?? i + 1}</b>
          <span className="cr-spoken-text"><Words text={o} onWord={(off) => seekLine(optIndex(i), off)} /></span>
        </li>
      ))}
    </ol>
  ) : null;

  // the speech first, the spoken options, then the question in its box at the bottom (the owner, 2026-10-24)
  const french = <>{frSpeech}{frOptions}{frQuestion}</>;
  // the English column: the same three parts, plain text
  const enOptions = fr.options.map((_, i) => (en.options.length === fr.options.length ? en.options[i] : optionsEn?.[i]) ?? null);
  const hasEnglish = english && (!!textEn || enOptions.some(Boolean));
  if (!hasEnglish) return <div className="cr-transcript" data-live={live || undefined}>{french}</div>;
  return (
    <div className="cr-transcript cr-cols" data-live={live || undefined}>
      <div className="cr-sheet"><LangTag lang="fr" />{french}</div>
      <div className="cr-sheet" lang="en"><LangTag lang="en" />
        {!liveAll && en.speech.length > 0 && <div className="cr-bi-fr">{en.speech.map((p, i) => <p key={i}>{p}</p>)}</div>}
        {liveAll && textEn && <div className="cr-bi-fr"><p>{textEn}</p></div>}
        {showOptions && enOptions.some(Boolean) && (
          <ol className="cr-spoken">{enOptions.map((o, i) => <li key={i}><b className="cr-spoken-key">{LETTERS[i] ?? i + 1}</b><span className="cr-spoken-text">{o ?? ""}</span></li>)}</ol>
        )}
        {showQuestion && en.question && <div className="cr-q"><span className="cr-q-mark" aria-hidden="true">?</span><span className="cr-q-text">{en.question}</span></div>}
      </div>
    </div>
  );
}
