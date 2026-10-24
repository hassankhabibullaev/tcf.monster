// The room's own rail (laptop): one column of round discs at the left, 48 px wide — the same discs as the phone's strip
// (green · amber · red, grey when unseen, the current one filled in the accent) —, the current one kept in view. A click jumps; read-only when
// `onPick` is missing (the CO exam: no going back). Hidden on phones, where the bottom-sheet Picker does this job.
// `Strip` is the number strip of the practice footer (laptop and phone): full discs in the question's colour, grey when
// unseen, the current one bigger and ringed in the accent; it scrolls sideways and keeps the current one in view; a tap jumps.
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Lang } from "../../i18n.ts";
import type { PickTone } from "./Picker.tsx";
import { useRoomWords } from "./words.ts";

export type RailHandle = { focus: () => void };

export type RailProps = {
  /** 1-based */
  current: number;
  total: number;
  tone: (n: number) => PickTone;
  onPick?: (n: number) => void;
  lang: Lang;
  ref?: Ref<RailHandle>;
};

const quiet = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Rail({ current, total, tone, onPick, lang, ref }: RailProps) {
  const w = useRoomWords(lang);
  const nav = useRef<HTMLElement>(null);
  const name = (t: PickTone) => (t === "done" ? w.done : t === "todo" ? w.todo : w.legend[t]);
  const show = (block: ScrollLogicalPosition) => nav.current?.querySelector<HTMLElement>(`[aria-current="true"]`)?.scrollIntoView({ block, behavior: quiet() ? "auto" : "smooth" });

  useEffect(() => { show("nearest"); }, [current]);
  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = nav.current?.querySelector<HTMLElement>(`[aria-current="true"]`);
      show("center");
      if (el && el.tagName === "BUTTON") el.focus({ preventScroll: true }); else nav.current?.focus({ preventScroll: true });
    },
  }), []);

  return (
    <nav ref={nav} className="cr-rail" aria-label={w.pickerTitle} tabIndex={-1} data-no-thumb="">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
        const t = tone(n);
        const label = `${w.questionOf(n, total)} · ${name(t)}`;
        const cur = n === current ? "true" : undefined;
        return onPick ? (
          <button key={n} type="button" className="cr-rail-item cr-disc" data-tone={t} aria-current={cur} aria-label={label} onClick={() => onPick(n)}>{n}</button>
        ) : (
          <span key={n} className="cr-rail-item cr-disc" data-tone={t} aria-current={cur} aria-label={label}>{n}</span>
        );
      })}
    </nav>
  );
}

export function Strip({ current, total, tone, onPick, lang }: Omit<RailProps, "ref">) {
  const w = useRoomWords(lang);
  const nav = useRef<HTMLElement>(null);
  const name = (t: PickTone) => (t === "done" ? w.done : t === "todo" ? w.todo : w.legend[t]);
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>(`[aria-current="true"]`);
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: quiet() ? "auto" : "smooth" });
  }, [current, total]);
  return (
    <nav ref={nav} className="cr-strip" aria-label={w.pickerTitle}>
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
        const t = tone(n);
        const label = `${w.questionOf(n, total)} · ${name(t)}`;
        const cur = n === current ? "true" : undefined;
        return onPick ? (
          <button key={n} type="button" className="cr-disc" data-tone={t} aria-current={cur} aria-label={label} onClick={() => onPick(n)}>{n}</button>
        ) : (
          <span key={n} className="cr-disc" data-tone={t} aria-current={cur} aria-label={label}>{n}</span>
        );
      })}
    </nav>
  );
}
