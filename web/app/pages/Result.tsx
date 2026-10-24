// A past session's result, inside the app: the score, the criteria, the text or the transcript with every mistake
// (those from this device: on another one, the marks alone).
import { useEffect, useState } from "react";
import { Empty, Button } from "../../ui/ui.tsx";
import { go } from "../../ui/router.ts";
import { useT, longDate } from "../i18n.ts";
import { loadSession } from "../sim/work.ts";
import { publicPrompt, safeJson, tachesOf, type Section, type StoredSession } from "../expr.ts";
import { SessionResults } from "../sim/index.ts";

export function Result({ s, id }: { s: Section; id: string }) {
  const { t, lang } = useT();
  const [d, setD] = useState<StoredSession | null | undefined>(undefined);
  useEffect(() => { loadSession(id).then(setD).catch(() => setD(null)); }, [id]);
  if (d === undefined) return <div className="skeleton tall" />;
  if (d === null) return <div className="section-page"><Empty icon={s} title={t.roomNotFound}><Button size="sm" onClick={() => go(`/${s}`)}>{t.sectionNames[s]}</Button></Empty></div>;
  const taches = tachesOf(d.session.taches);
  const views = d.tasks.map((x) => ({
    taskNo: x.taskNo, sessionId: d.session.id, prompt: publicPrompt(JSON.parse(x.promptJson)),
    responseText: x.responseText, wordCount: x.wordCount, turns: safeJson<{ role: string; text: string; audioKey?: string }[]>(x.turnsJson, []),
    score20: x.score20, level: x.level, nclc: x.nclc, feedbackMd: null, feedbackJson: x.feedbackJson ?? null, detailJson: x.detailJson, versionsJson: x.versionsJson, elsewhere: x.elsewhere,
  }));
  return (
    <SessionResults
      skill={s === "ee" ? "writing" : "speaking"}
      sessionId={d.session.id}
      views={views}
      summary={safeJson(d.session.summaryJson, null)}
      mode={d.session.kind === "practice" && taches.length === 1 ? "task" : "full"}
      selected={taches}
      lang={lang}
      onExit={() => go(`/${s}`)}
      dateLabel={longDate(d.session.startedAt.slice(0, 10), lang)}
    />
  );
}
