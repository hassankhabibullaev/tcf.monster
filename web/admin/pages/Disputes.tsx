// The reports people send from a practice question (« Signaler un problème »), as tickets: one list, newest first,
// open · done · all; one report's page with the message, the question (its text read from the same bank files the
// app uses), who sent it, and Mark done (with an optional note) / Reopen.
import { useEffect, useState } from "react";
import { BackLink, Icon, Chip, Mark, Seg, Empty, Button } from "../../ui/ui.tsx";
import { useApi, useLocation, setParams, linkProps, go, api, num, when, date, plural } from "../lib.ts";
import { useToast } from "../main.tsx";

type Row = {
  id: number; user_id: string; email: string | null; name: string | null; section: "co" | "ce"; level: string;
  question_id: string; n: number; message: string; status: "open" | "resolved"; created_at: string; resolved_at: string | null; note: string | null;
};
type One = Row & { user_created_at: string | null; last_seen_at: string | null; reports: number };
type D = { rows: Row[]; page: number; pageSize: number; open: number; resolved: number };

type Q = {
  id: string; stem: string; answer: string; options: { key: string; text: string | null }[];
  passage: string | null; transcript: string | null; hint: { fr: string } | null; explanation: string | null;
};
const levels = new Map<string, Promise<Q[]>>();
const loadLevel = (section: string, level: string) => {
  const k = `${section}-${level}`;
  let p = levels.get(k);
  if (!p) { p = fetch(`/data/${k}.json`).then((r) => (r.ok ? (r.json() as Promise<Q[]>) : Promise.reject(new Error(`HTTP ${r.status}`)))); p.catch(() => levels.delete(k)); levels.set(k, p); }
  return p;
};

const STATUS: [string, string][] = [["open", "Open"], ["resolved", "Done"], ["all", "All"]];

const StatusChip = ({ d }: { d: Row }) => <Chip tone={d.status === "open" ? "amber" : "ok"} dot>{d.status === "open" ? "open" : "done"}</Chip>;
const Ref = ({ d }: { d: Row }) => <span className="dispute-ref"><Mark s={d.section} /> <strong>{d.level} · n° {d.n}</strong></span>;

/** the question as the person saw it: stem, options with the right one marked, the passage or the transcript */
function QuestionText({ d }: { d: Row }) {
  const [q, setQ] = useState<Q | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadLevel(d.section, d.level)
      .then((qs) => { if (live) setQ(qs.find((x) => x.id === d.question_id) ?? null); })
      .catch((e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [d.section, d.level, d.question_id]);
  if (err) return <p className="muted">The question could not load: {err}</p>;
  if (q === undefined) return <div className="skeleton" />;
  if (q === null) return <p className="muted">This question is no longer in the bank ({d.question_id}).</p>;
  return (
    <div className="dispute-q" lang="fr">
      {q.passage && <p className="dispute-q-text">{q.passage}</p>}
      {q.transcript && <p className="dispute-q-text">{q.transcript}</p>}
      <p><strong>{q.stem}</strong></p>
      <ol className="dispute-q-options">
        {q.options.map((o) => <li key={o.key} className={o.key === q.answer ? "ok-text" : ""}><strong>{o.key}</strong> {o.text ?? "(spoken)"}{o.key === q.answer ? " ✓" : ""}</li>)}
      </ol>
      {q.explanation && <p className="muted">{q.explanation}</p>}
    </div>
  );
}

export function Disputes() {
  const { params } = useLocation();
  const status = params.get("status") ?? "open";
  const page = Number(params.get("page") ?? 0);
  const { data, error } = useApi<D>(`/disputes?status=${status}&page=${page}`);
  const total = data ? (status === "open" ? data.open : status === "resolved" ? data.resolved : data.open + data.resolved) : 0;
  const pages = data ? Math.ceil(total / data.pageSize) : 0;
  const who = (d: Row) => d.email ? (d.name ?? d.email) : "deleted account";
  return (
    <div className="page">
      <div className="page-head"><h1 className="title">Disputes</h1></div>
      <div className="toolbar">
        <Seg label="Status" value={status} options={STATUS.map(([v, l]) => [v, data ? `${l} ${num(v === "open" ? data.open : v === "resolved" ? data.resolved : data.open + data.resolved)}` : l] as [string, string])} onChange={(v) => setParams({ status: v === "open" ? null : v, page: null })} />
      </div>
      {error && <Empty icon="alert" title="Disputes could not load">{error}</Empty>}
      {data && !data.rows.length && <Empty icon="check" title={status === "open" ? "Nothing open" : "No dispute"} />}
      {data && data.rows.length > 0 && (
        <>
          <div className="card table-wrap desk-table">
            <table className="table">
              <thead><tr><th>#</th><th>Question</th><th>Report</th><th>From</th><th>Sent</th><th>Status</th></tr></thead>
              <tbody>
                {data.rows.map((d) => (
                  <tr key={d.id} className="click" onClick={() => go(`/disputes/${d.id}`)}>
                    <td className="num muted"><a href={`/disputes/${d.id}`} onClick={(e) => { e.stopPropagation(); linkProps(`/disputes/${d.id}`).onClick(e); }}>{d.id}</a></td>
                    <td className="nowrap"><Ref d={d} /></td>
                    <td className="msg-cell"><span className="ellipsis">{d.message}</span></td>
                    <td className="nowrap">{who(d)}</td>
                    <td className="nowrap">{when(d.created_at)}</td>
                    <td><StatusChip d={d} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="cards-list mob-list">
            {data.rows.map((d) => (
              <li key={d.id}>
                <a className="card person-card" {...linkProps(`/disputes/${d.id}`)}>
                  <span className="dispute-line"><Ref d={d} /><StatusChip d={d} /></span>
                  <span className="clamp-2">{d.message}</span>
                  <span className="person-card-meta"><span>#{d.id}</span><span>{who(d)}</span><span>{when(d.created_at)}</span></span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {pages > 1 && data && (
        <div className="pager">
          <span className="muted">{num(page * data.pageSize + 1)}–{num(Math.min(total, (page + 1) * data.pageSize))} of {num(total)}</span>
          <span className="pager-buttons">
            <Button size="sm" disabled={page === 0} onClick={() => setParams({ page: page - 1 ? String(page - 1) : null })}>Previous</Button>
            <Button size="sm" disabled={page + 1 >= pages} onClick={() => setParams({ page: String(page + 1) })}>Next</Button>
          </span>
        </div>
      )}
      {!data && !error && <div className="skeleton tall" />}
    </div>
  );
}

export function Dispute({ id }: { id: number }) {
  const { data: d, error, reload } = useApi<One>(`/disputes/${id}`);
  const say = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (a: "resolve" | "reopen") => {
    setBusy(true);
    try { await api(`/disputes/${id}/${a}`, a === "resolve" ? { note } : {}); if (a === "resolve") { say("Marked done"); go("/disputes"); } else { say("Open again"); reload(); } }
    catch (e) { say((e as Error).message, "bad"); }
    finally { setBusy(false); }
  };
  if (error) return <div className="page"><BackLink to="/disputes" label="Disputes" /><Empty icon="flag" title={error === "no such dispute" ? "This dispute no longer exists" : "Could not load"}>{error !== "no such dispute" && error}</Empty></div>;
  if (!d) return <div className="page"><div className="skeleton tall" /></div>;
  return (
    <div className="page">
      <BackLink to="/disputes" label="Disputes" />
      <div className="page-head dispute-head">
        <h1 className="title">#{d.id}</h1><Ref d={d} /><StatusChip d={d} />
      </div>
      <div className="grid-person dispute-grid">
        <div className="stack">
          <section className="card pad d-report">
            <div className="card-head"><h2>Report</h2><span className="muted">{when(d.created_at)}</span></div>
            <p className="dispute-msg">{d.message}</p>
          </section>
          <section className="card pad d-question">
            <div className="card-head">
              <h2>Question</h2>
              <a className="btn quiet sm" href={`https://tcf.monster/${d.section}/practice/${d.level}?q=${d.n}`} target="_blank" rel="noopener">In the app <Icon name="external" size={14} /></a>
            </div>
            <QuestionText d={d} />
          </section>
        </div>
        <div className="stack">
          <section className="card pad d-from">
            <h2>From</h2>
            {d.email ? (
              <a className="from" {...linkProps(`/people/${d.user_id}`)}>
                <span className="avatar small" aria-hidden="true">{(d.name ?? d.email)[0].toUpperCase()}</span>
                <span className="who"><strong>{d.name ?? d.email}</strong><span className="muted">{d.email}</span></span>
                <Icon name="arrowRight" size={16} className="muted" />
              </a>
            ) : <p className="muted">Deleted account</p>}
            {d.email && (
              <dl className="kv">
                <div><dt>Joined</dt><dd>{date(d.user_created_at, true)}</dd></div>
                <div><dt>Last active</dt><dd>{when(d.last_seen_at)}</dd></div>
                <div><dt>Disputes</dt><dd>{plural(d.reports, "report")}</dd></div>
              </dl>
            )}
          </section>
          <section className="card pad d-handle">
            <h2>{d.status === "open" ? "Handle" : `Done ${date(d.resolved_at)}`}</h2>
            {d.status === "open" ? (
              <>
                <textarea className="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Note (optional)" aria-label="Note" maxLength={2000} />
                <div className="note-actions"><Button kind="primary" icon="check" busy={busy} onClick={() => act("resolve")}>Mark done</Button></div>
              </>
            ) : (
              <>
                {d.note ? <p className="dispute-msg">{d.note}</p> : <p className="muted">No note.</p>}
                <div className="note-actions"><Button busy={busy} onClick={() => act("reopen")}>Reopen</Button></div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
