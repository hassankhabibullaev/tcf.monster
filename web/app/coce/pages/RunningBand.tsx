// The small floating card every app page shows while an exam attempt is running (bottom right on a laptop, above the
// tab bar on a phone): the exam, the time left, Reprendre, Abandonner. Never on the running exam's own page.
import { useEffect, useState } from "react";
import { Button, Sheet } from "../../../ui/ui.tsx";
import { go } from "../../../ui/router.ts";
import type { Lang } from "../../i18n.ts";
import { WORDS } from "./words.ts";
import { countdown, finishAttempt, noteRunning, resultPath, sallePath, serverNow, toMs, useRunning } from "./shared.ts";

export type RunningBandProps = { lang: Lang; /** true on the salle route: nothing shown, nothing asked */ hidden?: boolean; /** the page shown: on the running exam's own page the hero says it all, the band stays away */ path?: string };

export function RunningBand({ lang, hidden, path }: RunningBandProps) {
  const w = WORDS[lang];
  const { attempt, set, reload } = useRunning(!hidden);
  const onOwnPage = !!attempt && path === `/${attempt.section}/exam/${attempt.exam}`;
  const [now, setNow] = useState(serverNow);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const deadline = attempt ? toMs(attempt.deadlineAt) : NaN;
  const left = deadline - now;

  // one tick a second while something runs; past the deadline the server finalises it on the next ask
  useEffect(() => {
    if (!attempt || hidden) return;
    setNow(serverNow());
    const id = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(id);
  }, [attempt, hidden]);
  useEffect(() => {
    if (!attempt || hidden || !(left <= 0)) return;
    const id = setTimeout(reload, 1500);
    return () => clearTimeout(id);
  }, [attempt, hidden, left <= 0, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  if (hidden || !attempt || onOwnPage) return null;

  async function abandon() {
    if (!attempt) return;
    setBusy(true); setFailed(false);
    try {
      const done = await finishAttempt(attempt.id, "abandon");
      setOpen(false); noteRunning(null);
      go(resultPath(done ?? attempt));
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="cp-float" role="status">
        <span className="cp-float-text"><strong>{w.bandText(attempt.section, attempt.exam)}</strong><span className="num">{isNaN(left) ? "" : countdown(left)}</span></span>
        <span className="cp-float-actions">
          <Button size="sm" kind="primary" onClick={() => go(sallePath(attempt))}>{w.resume}</Button>
          <Button size="sm" kind="quiet" onClick={() => setOpen(true)}>{w.abandon}</Button>
        </span>
      </div>
      <Sheet open={open} title={w.abandonTitle} onClose={() => !busy && setOpen(false)} actions={<>
        <Button onClick={() => setOpen(false)} disabled={busy}>{w.keepGoing}</Button>
        <Button kind="danger" busy={busy} onClick={abandon}>{w.abandon}</Button>
      </>}>
        <p>{w.abandonBody}</p>
        {failed && <p className="bad-text">{w.failed}</p>}
      </Sheet>
    </>
  );
}
