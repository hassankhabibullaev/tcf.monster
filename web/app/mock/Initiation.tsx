// The initiation page (docs/MOCK-EXAM.md §1.2): full screen, the one place that explains — the four stages in order
// with their times and one line each, the breaks between them, the speaking mode, the notification permission —,
// then Commencer, which creates the mock and leads to the hallway.
import { useState } from "react";
import { Button, Icon, MonsterAI, Mark } from "../../ui/ui.tsx";
import { go, replace } from "../../ui/router.ts";
import { useT } from "../i18n.ts";
import { useMe, useToast } from "../main.tsx";
import { Frame } from "../Frame.tsx";
import { startMock, MockApiError, BREAK_SECONDS, STAGE_SECONDS } from "./api.ts";
import { useMockWords } from "./words.ts";
import "./mock.css";

type Mic = "live" | "ptt";

export function Initiation() {
  const { lang, t } = useT();
  const w = useMockWords(lang);
  const { me, update } = useMe();
  const say = useToast();
  const [mode, setMode] = useState<Mic>(me?.settings?.eo?.mode === "ptt" ? "ptt" : "live");
  const [busy, setBusy] = useState(false);
  const [notif, setNotif] = useState<NotificationPermission | "none">(() => ("Notification" in window ? Notification.permission : "none"));
  const pickMode = (m: Mic) => { setMode(m); void update({ settings: { eo: { ...(me?.settings?.eo ?? {}), mode: m } } }); };

  async function start() {
    setBusy(true);
    try {
      const m = await startMock(mode);
      replace(`/mock/${m.id}`);
    } catch (e) {
      const d = e instanceof MockApiError ? e.data : {};
      if (e instanceof MockApiError && e.status === 409 && d.error === "running" && d.mock) { replace(`/mock/${(d.mock as { id: number }).id}`); return; }
      say(d.error === "hold" ? t.hold : d.error === "daily_cap" ? w.oneADay : d.error === "attempt_running" ? w.busyAttempt : d.error === "session_running" ? w.busySession : d.error === "network" ? t.networkError : w.failed, "bad");
    } finally { setBusy(false); }
  }
  const askNotif = async () => { try { setNotif(await Notification.requestPermission()); } catch { /* refused */ } };

  const rows: { kind: "test"; s: "co" | "ce" | "ee" | "eo" }[] = [{ kind: "test", s: "co" }, { kind: "test", s: "ce" }, { kind: "test", s: "ee" }, { kind: "test", s: "eo" }];
  const breaks: Record<"co" | "ce" | "ee", "break1" | "break2" | "break3"> = { co: "break1", ce: "break2", ee: "break3" };
  return (
    <Frame mode="exam">
      <div className="mk-init">
        <div className="mk-init-head">
          <h1 className="mk-init-title">{w.title}</h1>
          <p className="mk-init-brand"><MonsterAI powered lang={lang} /></p>
        </div>
        <section className="mk-init-block">
          <h2 className="sim-caps">{w.expect}</h2>
          <ol className="mk-init-stages">
            {rows.map(({ s }) => (
              <li key={s}>
                <div className="card mk-init-stage">
                  <Mark s={s} big iconOnly />
                  <span className="mk-init-tile mob-only num" aria-hidden="true">{s.toUpperCase()}</span>
                  <div className="mk-init-stage-text">
                    <b>{w[s]}</b>
                    <span>{w.stageLine[s]}</span>
                  </div>
                  <span className="num mk-init-min">{s === "eo" ? w.about(12) : w.minutes(STAGE_SECONDS[s] / 60)}</span>
                </div>
                {s !== "eo" && <div className="mk-init-break"><Icon name="clock" size={14} /><span>{w.pause} · {w.minutes(BREAK_SECONDS[breaks[s]] / 60)}</span></div>}
              </li>
            ))}
          </ol>
          <p className="mk-init-line">{w.noStop}</p>
          <p className="mk-init-line">{w.atEnd}</p>
        </section>
        <section className="mk-init-block">
          <h2 className="sim-caps">{w.micTitle}</h2>
          <div className="picks setup-mic-picks" role="group" aria-label={w.micTitle}>
            <button type="button" className="pick" aria-pressed={mode === "live"} onClick={() => pickMode("live")}><b><Icon name="eo" size={14} className="mob-only" />{w.live}</b><span>{w.liveSub}</span></button>
            <button type="button" className="pick" aria-pressed={mode === "ptt"} onClick={() => pickMode("ptt")}><b>{w.ptt}</b><span>{w.pttSub}</span></button>
          </div>
        </section>
        {notif === "default" && <Button kind="quiet" onClick={() => void askNotif()} icon="clock">{w.notify}</Button>}
        {notif === "granted" && <p className="mk-init-line muted"><Icon name="check" size={14} /> {w.notified}</p>}
        <div className="mk-foot mk-init-foot">
          <Button kind="quiet" onClick={() => go("/mock")} aria-label={w.back} className="mk-init-back"><Icon name="arrowLeft" size={18} className="mob-only" /><span className="desk-only">{w.back}</span></Button>
          <span className="mk-foot-mid" />
          <Button kind="primary" busy={busy} onClick={() => void start()} className="mk-init-start">{w.start}<Icon name="chevronRight" size={18} className="mob-only" /></Button>
        </div>
      </div>
    </Frame>
  );
}
