import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MonsterAI } from "../../ui/ui";
import { playCount } from "../coce/room/sound";

/** one second per number: 3 · 2 · 1 */
const SECOND_MS = 1000;
/** the announcement stays this long once the count is over */
export const ANNOUNCE_MS = 2000;

export type HallProps = {
  /** what is announced (a test's name, « Pause », « Correction en cours ») */
  title: ReactNode;
  /** one line under it (« 35 min », « Ensuite : Compréhension écrite ») */
  sub?: ReactNode;
  /** 3 · 2 · 1 first (one real second each, a tone on every number), then the title for `announceMs`, then `onDone` */
  count?: boolean;
  announceMs?: number;
  onDone?: () => void;
  /** a big clock (« 04:58 ») under the title */
  clock?: ReactNode;
  /** lines that fill in (the marking) */
  rows?: ReactNode;
  /** one or two buttons under everything */
  actions?: ReactNode;
  /** « Monster AI · propulsé par Gemini » under the title */
  ai?: boolean;
  /** the application is working: three dots breathe under the title */
  busy?: boolean;
  lang?: "fr" | "en";
  /** a line at the very top (the mock's stage chips and the time, on a break) */
  head?: ReactNode;
};

/**
 * The one screen for every wait and every announcement (UX §1, docs/MOCK-EXAM.md §2.5): the dark hall with the logo.
 * The hallway before an exam counts 3 · 2 · 1 and announces the test; the breaks of the mock show their clock on it;
 * the marking fills its rows on it; the simulator shows it while the examiner's task is prepared. Drawn on
 * `document.body`, above everything, opaque from its first frame. Practice never passes through here.
 */
export function Hall({ title, sub, count = false, announceMs = ANNOUNCE_MS, onDone, clock, rows, actions, ai = false, busy = false, lang = "fr", head }: HallProps) {
  const [n, setN] = useState(count ? 3 : 0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!count) return;
    playCount(n);
    if (n <= 0) return;
    const id = setTimeout(() => setN((c) => c - 1), SECOND_MS);
    return () => clearTimeout(id);
  }, [count, n]);
  // the announcement: once the count is over (or at once without one), `onDone` after `announceMs`
  useEffect(() => {
    if (n > 0 || !onDone) return;
    const id = setTimeout(() => done.current?.(), announceMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  const counting = count && n > 0;
  return createPortal(
    <div className="sim-hall" role="dialog" aria-live="assertive" aria-busy={busy || undefined}>
      {head && <div className="sim-hall-head">{head}</div>}
      <img className="sim-hall-logo" src="/app-icon.svg" alt="" width="64" height="64" />
      {counting ? (
        <div className="sim-hall-count" key={n}>{n}</div>
      ) : (
        <div className="sim-hall-stack" key="announce">
          <div className="sim-hall-title">{title}</div>
          {sub && <div className="sim-hall-sub">{sub}</div>}
          {ai && <div className="sim-hall-ai"><MonsterAI powered lang={lang} /></div>}
          {clock && <div className="sim-hall-clock num">{clock}</div>}
          {busy && <div className="sim-hall-busy" aria-hidden="true"><i /><i /><i /></div>}
          {rows && <div className="sim-hall-rows">{rows}</div>}
          {actions && <div className="sim-hall-acts">{actions}</div>}
        </div>
      )}
    </div>,
    document.body,
  );
}

/** the hallway before an exam room: 3 · 2 · 1, the test announced with its time, then the room */
export function Hallway({ title, sub, ai = false, onDone, lang }: { title: ReactNode; sub?: ReactNode; ai?: boolean; onDone: () => void; lang?: "fr" | "en" }) {
  return <Hall count title={title} sub={sub} ai={ai} onDone={onDone} lang={lang} />;
}
