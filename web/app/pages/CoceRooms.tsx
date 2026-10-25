// The comprehension rooms, mounted in the frame: a practice level (rail narrowed) and the exam room (rail hidden). A new
// exam passes through the same dark hallway as EE/EO (the title, the logo, 3 · 2 · 1): the attempt is created only when
// the count reaches zero, so the seconds in the hallway are not taken from the exam; a running attempt found on arrival
// is resumed at once, no hallway. The old review room's address only points to the result page now.
import { useCallback, useEffect, useState } from "react";
import { Frame } from "../Frame.tsx";
import { Empty, Button } from "../../ui/ui.tsx";
import { go, replace } from "../../ui/router.ts";
import { useT } from "../i18n.ts";
import { useMe } from "../main.tsx";
import { api, ApiError } from "../api.ts";
import { loadExam, type Question, type Section } from "../coce/bank.ts";
import type { Level } from "../../../shared/progress.ts";
import { PracticeRoom, ExamRoom, useRoomWords, DURATION_MIN, type Attempt, type Help } from "../coce/room/index.ts";
import { noteRunning, currentRunning, takeStart } from "../coce/pages/index.ts";
import { Hallway } from "../sim/index.ts";
import "../sim/sim.css";

const resultPath = (a: Attempt) => `/${a.section}/exam/${a.exam}/result/${a.id}`;
const sallePath = (a: Attempt) => `/${a.section}/exam/${a.exam}/room`;

export function PracticeRoute({ section, level }: { section: Section; level: Level }) {
  const { lang } = useT();
  const { me, update } = useMe();
  // a search hit opens the room at its question (`?q=37`); otherwise the next unanswered one
  const q = Number(new URLSearchParams(location.search).get("q"));
  return (
    <Frame mode="room">
      <PracticeRoom
        section={section}
        level={level}
        lang={lang}
        start={Number.isInteger(q) && q > 0 ? q : null}
        settings={(me?.settings?.help as Help | undefined) ?? null}
        onSettings={(help) => update({ settings: { help } })}
        onExit={() => go(`/${section}/practice`)}
      />
    </Frame>
  );
}

type SalleState =
  | { step: "looking" }
  | { step: "hall" }
  | { step: "starting"; error: string | null }
  | { step: "room"; attempt: Attempt; questions: Question[]; fresh?: boolean }
  | { step: "lost" };

export function ExamSalle({ section, exam }: { section: Section; exam: number }) {
  const { t, lang } = useT();
  const rw = useRoomWords(lang);
  const [st, setSt] = useState<SalleState>({ step: "looking" });

  // the mode chosen on the hero page travels in the URL; a resumed attempt keeps the mode the server stored
  const mode = new URLSearchParams(location.search).get("mode") === "training" ? "training" : "exam";
  const errorOf = (e: unknown) => {
    const d = e instanceof ApiError ? e.data : {};
    return d.error === "hold" ? t.hold : d.error === "mock_running" ? t.mockRunning : d.error === "network" ? t.networkError : t.serverError;
  };

  // on arrival: an attempt already running for this exam → straight in; for another exam → its own room; none → the hallway
  useEffect(() => {
    let gone = false;
    setSt({ step: "looking" });
    void loadExam(section, exam).catch(() => null); // fetched while the hallway counts; cached for the room
    (async () => {
      try {
        // the answer every band shares (asked at most once a minute), not a request of its own
        const running = (await currentRunning()).attempt as unknown as Attempt | null;
        if (gone) return;
        // nothing runs: the hallway only after « Commencer » (Back onto a finished exam's room goes to its card)
        if (!running) { if (takeStart(section, exam)) setSt({ step: "hall" }); else replace(`/${section}/exam/${exam}`); return; }
        if (running.section !== section || running.exam !== exam) { replace(sallePath(running)); return; }
        const questions = await loadExam(section, exam);
        if (!gone) setSt({ step: "room", attempt: running, questions });
      } catch (e) {
        if (!gone) setSt({ step: "starting", error: errorOf(e) });
      }
    })();
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, exam]);

  // the count reached zero (or Réessayer was pressed): the attempt is created now and the room opens
  const start = useCallback(async () => {
    setSt({ step: "starting", error: null });
    try {
      const [attempt, questions] = await Promise.all([
        api<{ attempt: Attempt }>("/attempts", { section, exam, mode }).then((r) => r.attempt),
        loadExam(section, exam),
      ]);
      noteRunning(attempt as never);
      setSt({ step: "room", attempt, questions, fresh: true });
    } catch (e) {
      const d = e instanceof ApiError ? e.data : {};
      if (e instanceof ApiError && e.status === 409 && d.running) {
        const other = d.running as Attempt;
        if (other.section === section && other.exam === exam) { setSt({ step: "room", attempt: other, questions: await loadExam(section, exam) }); return; }
        replace(sallePath(other));
        return;
      }
      setSt({ step: "starting", error: errorOf(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, exam, mode]);

  if (st.step === "lost") {
    return <Frame mode="room"><div className="section-page room-missing"><Empty icon={section} title={t.roomNotFound}><Button size="sm" onClick={() => go(`/${section}`)}>{t.sectionNames[section]}</Button></Empty></div></Frame>;
  }
  if (st.step === "hall") {
    return <Frame mode="exam"><Hallway title={rw[section]} sub={`${DURATION_MIN[section]} min`} onDone={() => void start()} lang={lang} /></Frame>;
  }
  if (st.step === "looking" || st.step === "starting") {
    return (
      <Frame mode="exam">
        {st.step === "starting" && st.error ? (
          <div className="section-page room-missing">
            <Empty icon={section} title={st.error}>
              <Button size="sm" icon="refresh" onClick={() => void start()}>{rw.retry}</Button>
              <Button size="sm" kind="quiet" onClick={() => go(`/${section}/exam/${exam}`)}>{rw.back}</Button>
            </Empty>
          </div>
        ) : <div className="boot" aria-busy="true" />}
      </Frame>
    );
  }
  return (
    <Frame mode="exam">
      <ExamRoom
        section={section}
        exam={exam}
        attempt={st.attempt}
        fresh={st.fresh}
        questions={st.questions}
        lang={lang}
        onFinished={(a) => { noteRunning(null); replace(resultPath(a)); }}
        onLeave={() => { noteRunning(st.step === "room" ? (st.attempt as never) : null); go(`/${section}/exam/${exam}`); }}
      />
    </Frame>
  );
}

/** the old review address: the result page holds the review now */
export function ReviewRoute({ section, exam, attemptId }: { section: Section; exam: number; attemptId: string }) {
  useEffect(() => { replace(`/${section}/exam/${exam}/result/${attemptId}`); }, [section, exam, attemptId]);
  return <div className="boot" aria-busy="true" />;
}
