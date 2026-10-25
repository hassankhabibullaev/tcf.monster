// The mock exam page (docs/MOCK-EXAM.md §1.1): one card — three lines and Commencer, which opens the initiation page —
// then the past mocks, newest first, each opening its results, each deletable. Locked without a Gemini key; while a
// mock runs the card says so with Reprendre and Abandonner; a mock may start whenever none runs.
import { useEffect, useState } from "react";
import { BackLink, Button, Chip, Empty, Icon, Sheet, MonsterAI } from "../../ui/ui.tsx";
import { go, linkProps } from "../../ui/router.ts";
import { useT, longDate } from "../i18n.ts";
import { useMe, useToast } from "../main.tsx";
import { Locked } from "../pages/Expression.tsx";
import { serverNow } from "../coce/room/hooks.ts";
import { abandonMock, currentStage, deleteMock, listMocks, refreshMock, stageEndsAt, testOfStage, useRunningMock, STAGE_SECONDS, type MockRow } from "./api.ts";
import { useMockWords } from "./words.ts";
import "./mock.css";

const nclcOf = (n: number | null | undefined) => (n == null ? null : Math.max(3, n));

export function MockPage() {
  const { lang } = useT();
  const w = useMockWords(lang);
  const { me } = useMe();
  const say = useToast();
  const { mock: running, set, reload } = useRunningMock(true);
  const [mocks, setMocks] = useState<MockRow[] | null>(null);
  const [del, setDel] = useState<MockRow | null>(null);
  const [ab, setAb] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => listMocks().then(setMocks).catch(() => setMocks([]));
  useEffect(() => { load(); }, []);
  if (me?.gemini_status === "none") return <div className="section-page mk-page"><h1 className="mk-h1">{w.title}</h1><Locked /></div>;

  const pos = running ? currentStage(running) : null;
  const test = pos ? testOfStage(pos.stage) : null;
  const ends = pos ? stageEndsAt(pos) : null;
  const left = ends != null ? Math.max(0, ends - serverNow()) : null;

  async function abandon() {
    if (!running) return;
    setBusy(true);
    try { await abandonMock(running.id); setAb(false); set(null); refreshMock(); load(); go(`/mock/${running.id}/result`); }
    catch { say(w.failed, "bad"); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!del) return;
    setBusy(true);
    try { await deleteMock(del.id); setMocks((l) => (l ?? []).filter((m) => m.id !== del.id)); setDel(null); }
    catch { say(w.failed, "bad"); }
    finally { setBusy(false); }
  }

  return (
    <div className="section-page mk-page">
      <div className="mk-h1-row"><span className="mob-only"><BackLink to="/" label={w.back} word={false} /></span><h1 className="mk-h1">{w.title}</h1></div>
      <section className="card pad mk-hero">
        {running ? (
          <>
            <div className="mk-hero-head"><h2>{w.running}</h2><MonsterAI powered lang={lang} /></div>
            <p className="mk-hero-line num">{test ? w[test] : w.marking}{left != null && <> · {Math.floor(left / 60000)} min {String(Math.floor((left / 1000) % 60)).padStart(2, "0")}</>}</p>
            <div className="mk-hero-acts">
              <Button kind="primary" onClick={() => go(`/mock/${running.id}`)}>{w.resume}</Button>
              <Button kind="quiet" onClick={() => setAb(true)}>{w.abandon}</Button>
            </div>
          </>
        ) : (
          <>
            <div className="mk-hero-head"><MonsterAI powered lang={lang} /></div>
            <div className="mk-hero-chips mob-only num" aria-hidden="true">{(["co", "ce", "ee", "eo"] as const).map((t, i) => <span key={t}>{i > 0 && <i>·</i>}<b>{t.toUpperCase()} {t === "eo" ? 12 : STAGE_SECONDS[t] / 60}</b></span>)}</div>
            <ul className="mk-hero-lines desk-only"><li>{w.lead1}</li><li>{w.lead2}</li><li>{w.lead3}</li></ul>
            <p className="mk-hero-short mob-only">{w.leadShort}</p>
            <div className="mk-hero-acts">
              <Button kind="primary" onClick={() => go("/mock/new")}>{w.start}<Icon name="chevronRight" size={18} className="mob-only" /></Button>
            </div>
          </>
        )}
      </section>

      {mocks && mocks.length > 0 && (
        <section className="mk-list">
          <div className="card-head"><h2>{w.mine}</h2><span className="muted">{mocks.length}</span></div>
          <ul className="hist">
            {mocks.map((m) => {
              const r = m.result;
              const over = m.status === "done" || m.status === "abandoned";
              return (
                <li key={m.id} className="hist-item">
                  <a className="card hist-row mk-row" {...linkProps(over ? `/mock/${m.id}/result` : `/mock/${m.id}`)}>
                    <span className="hist-main">
                      <strong>{longDate(m.startedAt.slice(0, 10), lang)}</strong>
                      <span className="mk-row-chips">
                        {(["co", "ce", "ee", "eo"] as const).map((t) => { const n = nclcOf(r?.[t]?.nclc ?? (r?.[t] ? 3 : null)); return <Chip key={t} tone={n == null ? "new" : "muted"}>{t.toUpperCase()} {n == null ? "—" : n}</Chip>; })}
                      </span>
                    </span>
                    {m.status === "abandoned" ? <Chip tone="bad">{w.abandoned}</Chip> : m.status === "marking" || !over ? <Chip tone="amber">{m.status === "marking" ? w.marking : w.running}</Chip> : r?.overall != null ? <Chip tone="accent">NCLC {r.overall}</Chip> : null}
                    <Icon name="arrowRight" size={16} className="muted desk-only" /><Icon name="chevronRight" size={18} className="muted mob-only" />
                  </a>
                  {over && <button type="button" className="hist-del" aria-label={w.deleteOne} title={w.deleteOne} onClick={() => setDel(m)}><Icon name="x" size={16} /></button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {mocks && !mocks.length && !running && <Empty icon="co" title={w.none} />}

      <Sheet open={ab} title={w.abandonTitle} onClose={() => !busy && setAb(false)} actions={<><Button onClick={() => setAb(false)} disabled={busy}>{w.keepGoing}</Button><Button kind="danger" busy={busy} onClick={() => void abandon()}>{w.abandon}</Button></>}><p>{w.abandonBody}</p></Sheet>
      <Sheet open={del !== null} title={w.deleteTitle} onClose={() => !busy && setDel(null)} actions={<><Button onClick={() => setDel(null)} disabled={busy}>{w.cancel}</Button><Button kind="danger" busy={busy} onClick={() => void remove()}>{w.deleteOne}</Button></>}><p>{w.deleteBody}</p></Sheet>
      <span hidden>{String(reload)}</span>
    </div>
  );
}
