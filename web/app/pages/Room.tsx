// The room: the writing or speaking station. A practice session keeps the rail, narrowed to its icons; an exam hides
// it. Reached from a Start; a reload rebuilds the session from the server and what this browser kept. When the station is over, back to the
// section page.
import { useEffect, useState } from "react";
import { Empty, Button } from "../../ui/ui.tsx";
import { replace } from "../../ui/router.ts";
import { useT } from "../i18n.ts";
import { useMe } from "../main.tsx";
import { loadSession } from "../sim/work.ts";
import { loadStarted, rebuildStarted, type Section, type StartedSession } from "../expr.ts";
import { OralRunner, EcritRunner } from "../sim/index.ts";
import { Frame } from "../Frame.tsx";
import "../sim/sim.css";

export function Room({ s, id }: { s: Section; id: string }) {
  const { t, lang } = useT();
  const { me } = useMe();
  const [state, setState] = useState<{ s: StartedSession; startedAtMs: number } | null | undefined>(() => loadStarted(id) ?? undefined);
  const fresh = !!state; // just started in this tab: the room opens at once from what the start gave
  useEffect(() => {
    // the server's copy, always asked: a session already over opens on its result page, never in a room that would
    // run it again; one rebuilt from the server carries the drafts and the marks the server holds
    loadSession(id).then((d) => {
      if (d.session.status === "done" || d.session.status === "abandoned") { replace(`/${s}/result/${id}`); return; }
      if (!fresh) setState({ s: rebuildStarted(d), startedAtMs: Date.parse(d.session.startedAt) });
    }).catch(() => { if (!fresh) setState(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const exit = () => replace(`/${s}`);
  if (state === undefined) return <Frame mode="room"><div className="boot" aria-busy="true" /></Frame>;
  if (state === null) return <Frame mode="room"><div className="section-page room-missing"><Empty icon={s} title={t.roomNotFound}><Button size="sm" onClick={exit}>{t.sectionNames[s]}</Button></Empty></div></Frame>;
  const micMode = state.s.micMode ?? (me?.settings?.eo?.mode === "ptt" ? "ptt" : "live");
  return (
    <Frame mode={state.s.kind === "exam" ? "exam" : "room"}>
      {state.s.skill === "speaking"
        ? <OralRunner session={state.s} startedAtMs={state.startedAtMs} kind={state.s.kind} micMode={micMode} lang={lang} onExit={exit} />
        : <EcritRunner session={state.s} startedAtMs={state.startedAtMs} kind={state.s.kind} lang={lang} onExit={exit} />}
    </Frame>
  );
}
