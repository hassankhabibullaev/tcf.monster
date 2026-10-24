import { useEffect, useRef } from "react";
import { useSimWords } from "./words";
import type { Lang } from "../i18n";

/**
 * The examiner, as she would appear on a video call (the figure of the owner's earlier app, carried over on
 * 2026-10-18): a shaded portrait in front of an office out of focus, eyelids that blink, a slight sway, a nod while
 * she listens. Her surroundings and her jacket take the app's tokens (the wall and the sheet follow the theme, the
 * jacket is terracotta, the lips too); her face keeps its own colours in both themes, drawn as attributes of the SVG.
 * The mouth is three shapes sharing two corners (upper lip, inside, lower lip), no line across them; the neck is drawn
 * with the body so it goes behind the collar; only the lower lip moves, with the
 * loudness of her voice (`level`) or a syllable-like movement when that cannot be measured. `pondering`: her reply is
 * coming (eyes away and up). `thinking`: she reads her sheet. `mood`, quiet and rare: warm lifts the corners, curious
 * raises the brows, puzzled raises one. The status pill sits under the portrait, one small line.
 */
export type Mood = "neutral" | "warm" | "curious" | "puzzled";
export function Interviewer({ speaking, listening, thinking = false, pondering = false, mood = "neutral", level, lang }: { speaking: boolean; listening: boolean; thinking?: boolean; pondering?: boolean; mood?: Mood; level?: () => number | null; lang: Lang }) {
  const w = useSimWords(lang);
  const state = speaking ? "speaking" : thinking ? "reading" : pondering ? "pondering" : listening ? "listening" : "idle";
  const upper = useRef<SVGPathElement>(null);
  const inside = useRef<SVGPathElement>(null);
  const teeth = useRef<SVGPathElement>(null);
  const lower = useRef<SVGPathElement>(null);
  const live = useRef({ speaking, level, mood });
  live.current = { speaking, level, mood };

  useEffect(() => {
    let raf = 0;
    let open = 0;
    let smile = 0;
    const f = (n: number) => n.toFixed(2);
    const tick = (now: number) => {
      const { speaking: on, level: lv, mood: md } = live.current;
      const t = now / 1000;
      const measured = on ? lv?.() ?? null : 0;
      // no measure available: syllables at ~5 per second, with breaths
      const target = measured != null ? measured : Math.max(0, 0.5 + 0.5 * Math.sin(t * 31) * Math.sin(t * 7.3)) * (Math.sin(t * 1.9) > -0.75 ? 0.8 : 0.05);
      open += (Math.min(1, target) - open) * (target > open ? 0.5 : 0.22);
      // a slight smile at rest, a fuller one when she is warm (eased, so it never snaps)
      smile += ((md === "warm" ? 1 : 0.65) - smile) * 0.08;
      const o = open * 7; // how far the lower lip drops, in drawing units
      const x0 = 138 + o * 0.22 - smile * 1.6; // the corners come in a little as the mouth rounds, out a little with a smile
      const x1 = 162 - o * 0.22 + smile * 1.6;
      const c = 190 - smile * 2.3; // the corners, lifted by the smile; the centre of the lips stays
      const gap = `Q150 ${f(190 + 2 * o)}`; // bottom edge of the opening = top edge of the lower lip
      const teethDrop = Math.min(2.4, o * 0.55);
      upper.current?.setAttribute("d", `M${f(x0)} ${f(c)}Q144 183.6 150 186.4Q156 183.6 ${f(x1)} ${f(c)}Q150 188 ${f(x0)} ${f(c)}Z`);
      inside.current?.setAttribute("d", `M${f(x0)} ${f(c)}Q150 188 ${f(x1)} ${f(c)}${gap} ${f(x0)} ${f(c)}Z`);
      teeth.current?.setAttribute("d", `M${f(x0 + 4)} ${f(c - 0.4)}Q150 188.3 ${f(x1 - 4)} ${f(c - 0.4)}L${f(x1 - 5)} ${f(c - 0.4 + teethDrop)}Q150 ${f(188.9 + teethDrop)} ${f(x0 + 5)} ${f(c - 0.4 + teethDrop)}Z`);
      teeth.current?.setAttribute("opacity", f(Math.min(1, o / 2.2)));
      lower.current?.setAttribute("d", `M${f(x0)} ${f(c)}${gap} ${f(x1)} ${f(c)}Q150 ${f(201.5 + 2 * o)} ${f(x0)} ${f(c)}Z`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="iv" data-speaking={speaking} data-listening={state === "listening"} data-thinking={state === "reading"} data-pondering={state === "pondering"} data-mood={mood}>
      <div className="iv-frame">
      <svg viewBox="0 0 300 300" role="img" aria-label={state === "idle" ? w.ivAria.listening : w.ivAria[state]}>
        <defs>
          {/* the surroundings take the tokens (through the classes of their stops); the face keeps its own colours */}
          <linearGradient id="iv-g-wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" className="iv-wall-a" /><stop offset="1" className="iv-wall-b" /></linearGradient>
          <radialGradient id="iv-g-light" cx="0.2" cy="0.15" r="0.7"><stop offset="0" className="iv-light-a" /><stop offset="1" className="iv-light-b" /></radialGradient>
          <linearGradient id="iv-g-jacket" x1="0" y1="0" x2="1" y2="1"><stop offset="0" className="iv-jacket-a" /><stop offset="1" className="iv-jacket-b" /></linearGradient>
          <radialGradient id="iv-g-skin" cx="0.42" cy="0.38" r="0.75"><stop offset="0" stopColor="#f6d3b6" /><stop offset="0.6" stopColor="#ecbf9c" /><stop offset="1" stopColor="#d49f7a" /></radialGradient>
          <linearGradient id="iv-g-neck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c48f6b" /><stop offset="1" stopColor="#e4b592" /></linearGradient>
          <linearGradient id="iv-g-hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5a3d2b" /><stop offset="0.5" stopColor="#3a261b" /><stop offset="1" stopColor="#241610" /></linearGradient>
          <radialGradient id="iv-g-iris" cx="0.5" cy="0.45" r="0.6"><stop offset="0" stopColor="#8a5a36" /><stop offset="0.7" stopColor="#5a3820" /><stop offset="1" stopColor="#2e1b0f" /></radialGradient>
          <filter id="iv-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" /></filter>
          <filter id="iv-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" /></filter>
        </defs>

        {/* the office, out of focus: a shelf of books, a window, a plant */}
        <rect width="300" height="300" fill="url(#iv-g-wall)" />
        <g filter="url(#iv-blur)">
          <rect x="196" y="28" width="92" height="150" className="iv-shelf" />
          <rect x="202" y="36" width="80" height="26" className="iv-book iv-book-1" /><rect x="202" y="70" width="80" height="26" className="iv-book iv-book-2" /><rect x="202" y="104" width="80" height="26" className="iv-book iv-book-3" /><rect x="202" y="138" width="80" height="30" className="iv-book iv-book-4" />
          <rect x="18" y="26" width="86" height="116" className="iv-window" /><rect x="58" y="26" width="5" height="116" className="iv-frame" /><rect x="18" y="80" width="86" height="5" className="iv-frame" />
          <ellipse cx="34" cy="232" rx="30" ry="48" className="iv-plant" /><ellipse cx="58" cy="252" rx="22" ry="34" className="iv-plant iv-plant-2" />
        </g>
        <rect width="300" height="300" fill="url(#iv-g-light)" />

        {/* the neck first, long enough to go behind the collar; then the shoulders: the terracotta jacket over a light shirt */}
        <g className="iv-body">
          <path d="M126 180h48v90H126z" fill="url(#iv-g-neck)" />
          {/* the jaw's shadow on the neck, just under the chin */}
          <path d="M128 202c13 12 31 12 44 0v12c-13 9-31 9-44 0z" fill="#9c6a4e" opacity="0.55" filter="url(#iv-soft)" />
          {/* the jacket opens in a V: the neck shows from the chin down to the collar */}
          <path d="M22 300C26 242 68 218 114 216L150 262L186 216C232 218 274 242 278 300Z" fill="url(#iv-g-jacket)" />
          <path d="M114 216L150 262L150 248L128 216Z" className="iv-shirt" /><path d="M186 216L150 262L150 248L172 216Z" className="iv-shirt" />
          <path d="M114 216l-22 10 42 66 16-30z" className="iv-lapel" /><path d="M186 216l22 10-42 66-16-30z" className="iv-lapel iv-lapel-r" />
        </g>

        <g className="iv-pose">
          <g className="iv-head">
            {/* hair behind: it falls on both shoulders and leaves the neck free under the chin (the opening's top edge
                stays hidden behind the jaw, its sides overlap the neck's edges by two units) */}
            <path d="M82 144c0-58 30-96 68-96s68 38 68 96c0 34-6 62-16 80-10 6-22 4-30 0L172 196Q150 200 128 196L128 224c-8 4-20 6-30 0-10-18-16-46-16-80z" fill="url(#iv-g-hair)" />
            {/* ears */}
            <ellipse cx="93" cy="150" rx="8" ry="13" fill="#e0ae8b" /><ellipse cx="207" cy="150" rx="8" ry="13" fill="#e0ae8b" />
            <circle cx="93" cy="163" r="2.4" fill="#e9e2cf" /><circle cx="207" cy="163" r="2.4" fill="#e9e2cf" />
            {/* face */}
            <path d="M96 136c0-44 24-70 54-70s54 26 54 70c0 38-22 74-54 74s-54-36-54-74z" fill="url(#iv-g-skin)" />
            <ellipse className="iv-cheek" cx="118" cy="168" rx="13" ry="8" fill="#e79a8a" filter="url(#iv-soft)" /><ellipse className="iv-cheek" cx="182" cy="168" rx="13" ry="8" fill="#e79a8a" filter="url(#iv-soft)" />
            <path d="M150 206c-22 0-38-16-46-36 6 26 24 44 46 44s40-18 46-44c-8 20-24 36-46 36z" fill="#b98362" opacity="0.35" filter="url(#iv-soft)" />
            {/* hair in front */}
            <path d="M94 138c-2-46 22-78 58-78 34 0 58 28 56 76-8-26-28-46-52-52-10 18-34 38-62 54z" fill="url(#iv-g-hair)" />
            <path d="M112 84c14-14 34-20 52-16" fill="none" stroke="#7a5640" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
            <path d="M96 136c-5 24-4 52 3 76-11-16-17-46-15-76z" fill="url(#iv-g-hair)" /><path d="M206 134c5 26 4 54-3 78 11-16 17-48 15-78z" fill="url(#iv-g-hair)" />
            {/* brows */}
            <path className="iv-brow iv-brow-l" d="M110 126c8-6 20-7 29-2" stroke="#3a261b" /><path className="iv-brow iv-brow-r" d="M161 124c9-5 21-4 29 2" stroke="#3a261b" />
            {/* eyes */}
            {[125, 175].map((cx) => (
              <g key={cx}>
                <path d={`M${cx - 13} 142q13-10 26 0q-13 9-26 0z`} fill="#fbfaf7" />
                <clipPath id={`iv-eye-${cx}`}><path d={`M${cx - 13} 142q13-10 26 0q-13 9-26 0z`} /></clipPath>
                <g clipPath={`url(#iv-eye-${cx})`}><g className="iv-gaze"><circle cx={cx} cy="141.5" r="6.3" fill="url(#iv-g-iris)" /><circle cx={cx} cy="141.5" r="2.7" fill="#120b07" /><circle cx={cx + 2} cy="139.3" r="1.5" fill="#fff" opacity="0.9" /></g></g>
                <path d={`M${cx - 13} 142q13-10 26 0`} className="iv-line" stroke="#2a1a12" />
                <path d={`M${cx - 11} 145q11 6 22 0`} fill="none" stroke="#b07f60" strokeWidth="1" opacity="0.7" />
                <path className="iv-lowered" d={`M${cx - 14} 131h28v9.5q-14 4-28 0z`} fill="#e8b996" /><path className="iv-lowered iv-line iv-line-thin" d={`M${cx - 13} 140.5q13 4 26 0`} stroke="#2a1a12" />
                <g className="iv-lids"><path d={`M${cx - 14} 132h28v11q-14 8-28 0z`} fill="#e8b996" /><path d={`M${cx - 13} 143q13 7 26 0`} className="iv-line iv-line-thin" stroke="#2a1a12" /></g>
              </g>
            ))}
            {/* nose */}
            <path d="M150 146c-2 12-7 20-6 26 2 4 10 4 13 0" fill="none" stroke="#c08a68" strokeWidth="2" strokeLinecap="round" /><ellipse cx="150" cy="174" rx="9" ry="3" fill="#b98362" opacity="0.25" filter="url(#iv-soft)" />
            {/* mouth: inside, teeth, lower lip, then the upper lip on top — all drawn from the same two corners */}
            <path ref={inside} d="M138 190Q150 188 162 190Q150 190 138 190Z" fill="#4a1a1e" />
            <path ref={teeth} d="" fill="#f6f2ea" opacity="0" />
            <path ref={lower} d="M138 190Q150 190 162 190Q150 201.5 138 190Z" className="iv-lip" />
            <path ref={upper} d="M138 190Q144 183.6 150 186.4Q156 183.6 162 190Q150 188 138 190Z" className="iv-lip iv-lip-up" />
          </g>
        </g>
        {/* the sheet she looks at while she reads her notes */}
        <g className="iv-paper">
          <path d="M96 262l112-6 6 50H92z" className="iv-sheet" />
          <path d="M108 272l86-4M108 281l86-4M109 290l60-3" className="iv-rule" />
        </g>
      </svg>
      </div>
    </div>
  );
}
