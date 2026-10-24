// The small floating card every app page shows while a mock runs (docs/MOCK-EXAM.md §3.3): the test the clock says,
// the time left, Reprendre, Abandonner. Never on the mock's own pages. The row comes with the exam attempts' own
// request (one call a minute, not two), and the stage is worked out here from the server's clock rules.
import { useEffect, useState } from "react";
import { Button, Sheet } from "../../ui/ui.tsx";
import { go } from "../../ui/router.ts";
import type { Lang } from "../i18n.ts";
import { countdown, useRunning } from "../coce/pages/shared.ts";
import { serverNow } from "../coce/room/hooks.ts";
import { abandonMock, currentStage, refreshMock, stageEndsAt, testOfStage, type MockRow } from "./api.ts";
import { useMockWords } from "./words.ts";

export function MockBand({ lang, path }: { lang: Lang; path: string }) {
  const w = useMockWords(lang);
  const { mock: raw, reload } = useRunning(true);
  const mock = raw as unknown as MockRow | null;
  const [now, setNow] = useState(serverNow);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!mock) return; const id = setInterval(() => setNow(serverNow()), 1000); return () => clearInterval(id); }, [mock]);
  useEffect(() => { const off = () => reload(); window.addEventListener("tcfm:mock", off); return () => window.removeEventListener("tcfm:mock", off); }, [reload]);
  if (!mock || path.startsWith("/mock")) return null;
  const pos = currentStage(mock, now);
  const test = testOfStage(pos.stage);
  const ends = stageEndsAt(pos);
  const left = ends != null ? ends - now : pos.breakUntil ? Date.parse(pos.breakUntil) - now : NaN;
  async function abandon() {
    if (!mock) return;
    setBusy(true);
    try { await abandonMock(mock.id); setOpen(false); refreshMock(); reload(); go(`/mock/${mock.id}/result`); }
    catch { /* the sheet stays; the next press tries again */ }
    finally { setBusy(false); }
  }
  return (
    <>
      <div className="cp-float" role="status">
        <span className="cp-float-text"><strong>{w.bandText(test ? w[test] : w.marking)}</strong><span className="num">{isNaN(left) ? "" : countdown(left)}</span></span>
        <span className="cp-float-actions">
          <Button size="sm" kind="primary" onClick={() => go(`/mock/${mock.id}`)}>{w.resume}</Button>
          <Button size="sm" kind="quiet" onClick={() => setOpen(true)}>{w.abandon}</Button>
        </span>
      </div>
      <Sheet open={open} title={w.abandonTitle} onClose={() => !busy && setOpen(false)} actions={<><Button onClick={() => setOpen(false)} disabled={busy}>{w.keepGoing}</Button><Button kind="danger" busy={busy} onClick={abandon}>{w.abandon}</Button></>}>
        <p>{w.abandonBody}</p>
      </Sheet>
    </>
  );
}
