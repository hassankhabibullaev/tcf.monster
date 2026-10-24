// The one top line of every room (docs/MOCK-EXAM.md §2.1, docs/COCE.md §4): LEFT what the room is (a back button in
// practice, the test's name, « 2 / 4 » in the mock, the practice progress bar), CENTRE the device's local time in the
// timed rooms, RIGHT the one timer of every room in its own container. The writing and speaking rooms add their Tâche
// pills on a second row. 76 px with 24 px kept above (112 px with the second row); the floating glass of the room rule.
import { useEffect, useState, type ReactNode } from "react";
import { Clock } from "../ui/ui.tsx";
import type { Lang } from "./i18n.ts";

export type RoomClock = { secondsLeft: number; idle?: boolean; warnUnder?: number; blinkUnder?: number; label: string };

/** the device's time on 24 hours, « 14:32 », the colon beating once a second so it reads as a live clock */
export function LocalTime({ lang }: { lang: Lang }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 5_000); return () => clearInterval(id); }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  void lang;
  return <span className="room-time num" role="timer" aria-label={`${hh}:${mm}`}>{hh}<span className="room-time-colon" aria-hidden="true">:</span>{mm}</span>;
}

export function RoomBar({ className, left, time, lang, centre, clock, steps, right }: { className?: string; left: ReactNode; /** the local time in the centre (the timed rooms) */ time?: boolean; lang: Lang; /** something else in the centre (the practice progress bar) */ centre?: ReactNode; clock?: RoomClock | null; steps?: ReactNode; /** something at the right (the phone's ⋯ button) */ right?: ReactNode }) {
  return (
    <header className={`room-bar${className ? ` ${className}` : ""}`} data-steps={steps ? "" : undefined}>
      <div className="room-bar-left">{left}</div>
      <div className="room-bar-centre">{centre ?? (time ? <LocalTime lang={lang} /> : null)}</div>
      <div className="room-bar-right">
        {right}
        {clock && <Clock secondsLeft={Math.max(0, clock.secondsLeft)} idle={!!clock.idle} warnUnder={clock.warnUnder ?? 300} blinkUnder={clock.blinkUnder ?? 60} label={clock.label} />}
      </div>
      {steps && <div className="room-bar-steps">{steps}</div>}
    </header>
  );
}
