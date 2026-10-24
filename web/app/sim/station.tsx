import { useEffect, type ReactNode } from "react";
import { Icon, MonsterAI } from "../../ui/ui";
import { RoomBar } from "../room-bar.tsx";
import { touchActive } from "./active-session";
import { useSimWords } from "./words";
import type { Lang } from "../i18n";

/** While a session is live: the browser's record is stamped every few seconds, and leaving the page asks first. */
export function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    touchActive();
    const id = setInterval(touchActive, 10_000);
    const onHide = () => touchActive();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onUnload);
      touchActive();
    };
  }, [active]);
}

export type Step = { taskNo: number; done: boolean; active: boolean; /** writing: words written there */ words?: number };

/**
 * The room, outside the app (no rail, no bars, the whole screen). The top strip never changes shape: LEFT the test's
 * name in small caps and the Tâches as the stages of the test — fixed-width pills joined by a short line (done ✓ ·
 * current in the accent · next muted), the same place and size in every phase —; RIGHT the one clock of every room
 * (idle before the time runs). No way back up here: the red Terminer of the footer is the way out, as in every room.
 * The body is the runner's; an optional strip at the bottom (controls). Nothing scrolls as a page: a panel scrolls
 * inside itself; the two strips float over the body (the room rule, docs/COCE.md §4) and `data-foot` keeps the bottom
 * strip's height free. « Monster AI · propulsé par Gemini » sits in the bottom right corner.
 */
export function Station({ skill, steps, onSelect, secondsLeft, running = true, warnUnder = 20, blinkUnder = 10, children, foot, lang, sub }: { skill: "writing" | "speaking"; steps: Step[]; onSelect?: (index: number) => void; /** null: the clock stands idle at zero */ secondsLeft: number | null; running?: boolean; warnUnder?: number; blinkUnder?: number; children: ReactNode; foot?: ReactNode; lang: Lang; /** a stage of the mock exam: « 3 / 4 » after the test's name (docs/MOCK-EXAM.md §2) */ sub?: string }) {
  const w = useSimWords(lang);
  const shown = secondsLeft ?? 0;
  const live = secondsLeft != null && running;
  const stepsList = (
          <ol className="room-steps" aria-label={w.steps}>
            {steps.map((s, i) => {
              const inner = (
                <>
                  {s.done && <Icon name="check" size={14} />}
                  <span className="room-step-word">{w.taskN(s.taskNo)}</span>
                  <span className="room-step-no num">{s.taskNo}</span>
                </>
              );
              const state = s.done ? "done" : s.active ? "current" : (s.words ?? 0) > 0 ? "started" : "next";
              return (
                <li key={s.taskNo}>
                  {onSelect ? (
                    <button type="button" className="room-step" data-state={state} aria-current={s.active ? "step" : undefined} aria-label={w.taskN(s.taskNo)} onClick={() => onSelect(i)}>{inner}</button>
                  ) : (
                    <span className="room-step" data-state={state} aria-current={s.active ? "step" : undefined}>{inner}</span>
                  )}
                </li>
              );
            })}
          </ol>
  );
  return (
    <div className="room" data-skill={skill} data-foot={foot ? "" : undefined} data-mock={sub ? "" : undefined}>
      <RoomBar lang={lang} time steps={stepsList}
        left={<><span className="room-name sim-caps">{skill === "writing" ? w.ee : w.eo}{sub && <span className="room-sub num">{sub}</span>}</span><span className="room-code mob-only num">{skill === "writing" ? "EE" : "EO"}{sub && <span className="room-sub num">{sub}</span>}</span></>}
        clock={{ secondsLeft: Math.round(shown), idle: !live, warnUnder, blinkUnder, label: live && shown <= 0 ? w.timeUp : w.timeLeft }} />
      {children}
      {foot && <div className="room-foot">{foot}</div>}
      <span className="room-powered"><MonsterAI powered lang={lang} /></span>
    </div>
  );
}
