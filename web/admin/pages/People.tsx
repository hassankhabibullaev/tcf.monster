// The admin's first page: how many people registered and how they use the app, then everyone, searchable and sortable.
import { useEffect, useState } from "react";
import { Icon, Seg, Empty, Button, Chip } from "../../ui/ui.tsx";
import { useApi, useLocation, setParams, linkProps, go, num, when, date, daysLeft } from "../lib.ts";

export type PersonRow = {
  id: string; email: string; name: string | null; created_at: string; last_seen_at: string | null; target_nclc: number | null;
  exam_date: string | null; answered: number; exams: number; expression: number; blocked_at: string | null;
};
type Top = {
  people: number; joinedToday: number; joined7: number; joined30: number;
  activeToday: number; active7: number; active30: number;
  answered7: number; exams7: number; expression7: number; disputesOpen: number;
  /** the e-mails that could not be sent in the last day (a code someone is waiting for) */
  mailFailed: { at: string; email: string; kind: string; detail: string | null }[];
  today: string; joined: { d: string; n: number }[]; active: { d: string; n: number }[];
};

const FILTERS: [string, string][] = [["all", "All"], ["active", "Active 7 d"], ["new", "New 7 d"], ["exam", "Exam ahead"], ["blocked", "Blocked"]];
const SORTS: [string, string][] = [["seen", "Last active"], ["joined", "Joined"], ["name", "Name"], ["exam", "Exam date"], ["practice", "Practice"], ["exams", "Exams"]];

export function ExamDate({ d }: { d: string | null }) {
  if (!d) return <span className="muted">—</span>;
  const left = daysLeft(d)!;
  return <span>{date(d)} <span className={left < 0 ? "muted" : left <= 14 ? "warn" : "muted"}>· {left < 0 ? "past" : `${left} d`}</span></span>;
}

function Stat({ label, value, sub, to }: { label: string; value: string; sub: string; to?: string }) {
  const inner = <><span className="stat-label">{label}</span><span className="stat-value">{value}</span><span className="stat-sub">{sub}</span></>;
  return to ? <a className="card stat link-card" {...linkProps(to)}>{inner}</a> : <div className="card stat">{inner}</div>;
}

/** one bar a day over the last 30 days, ending on the app's today */
function Bars({ title, rows, today, word }: { title: string; rows: { d: string; n: number }[]; today: string; word: string }) {
  const byDay = new Map(rows.map((r) => [r.d, Number(r.n)]));
  const end = Date.parse(today + "T12:00:00Z");
  const days = Array.from({ length: 30 }, (_, i) => new Date(end - (29 - i) * 86400000).toISOString().slice(0, 10));
  const max = Math.max(1, ...days.map((d) => byDay.get(d) ?? 0));
  const peak = Math.max(0, ...days.map((d) => byDay.get(d) ?? 0));
  return (
    <section className="card pad">
      <div className="card-head"><h2>{title}</h2><span className="muted">most {num(peak)} a day</span></div>
      <div className="spark" role="img" aria-label={`${title} per day over the last 30 days`}>
        {days.map((d) => { const n = byDay.get(d) ?? 0; return <i key={d} className={n ? "on" : ""} style={{ height: `${Math.max(4, (n / max) * 100)}%` }} title={`${date(d)} · ${n} ${word}`} />; })}
      </div>
      <div className="spark-axis"><span>{date(days[0])}</span><span>today</span></div>
    </section>
  );
}

function Overview() {
  const { data: o } = useApi<Top>("/overview");
  if (!o) return <div className="stats"><div className="skeleton stat-skel" /><div className="skeleton stat-skel" /><div className="skeleton stat-skel" /><div className="skeleton stat-skel" /></div>;
  return (
    <>
      <div className="stats">
        <Stat label="Registered" value={num(o.people)} sub={`+${num(o.joinedToday)} today · +${num(o.joined7)} in 7 d · +${num(o.joined30)} in 30 d`} to="/?filter=new" />
        <Stat label="Active today" value={num(o.activeToday)} sub={`${num(o.active7)} in 7 d · ${num(o.active30)} in 30 d`} to="/?filter=active" />
        <Stat label="Answers · 7 d" value={num(o.answered7)} sub={`${num(o.exams7)} CO·CE exams · ${num(o.expression7)} EE·EO`} />
        <Stat label="Open disputes" value={num(o.disputesOpen)} sub="to handle" to="/disputes" />
      </div>
      {o.mailFailed?.length > 0 && (
        <section className="card pad">
          <div className="card-head"><h2>E-mails not sent · last 24 h</h2><span className="muted">{num(o.mailFailed.length)}</span></div>
          <ul className="plain-list">
            {o.mailFailed.map((m, i) => <li key={i}><b>{m.email}</b> <span className="muted">· {m.kind} · {when(m.at)} · {(m.detail ?? "").slice(0, 120)}</span></li>)}
          </ul>
        </section>
      )}
      <div className="grid-2">
        <Bars title="Sign-ups" rows={o.joined} today={o.today} word="sign-ups" />
        <Bars title="People practising" rows={o.active} today={o.today} word="people" />
      </div>
    </>
  );
}

/** a column title that sorts the list */
function Th({ sort, by, label, r }: { sort: string; by?: string; label: string; r?: boolean }) {
  if (!by) return <th className={r ? "r" : undefined}>{label}</th>;
  const on = sort === by;
  return (
    <th className={r ? "r" : undefined} aria-sort={on ? "descending" : undefined}>
      <button type="button" className={`th-sort${on ? " on" : ""}`} onClick={() => setParams({ sort: by === "seen" ? null : by, page: null })}>
        {label}{on && <Icon name="chevronDown" size={14} />}
      </button>
    </th>
  );
}

export function People() {
  const { params } = useLocation();
  const filter = params.get("filter") ?? "all", sort = params.get("sort") ?? "seen", page = Number(params.get("page") ?? 0);
  const [q, setQ] = useState(params.get("q") ?? "");
  // a new search goes back to the first page; the page of a link or of Back stays (nothing typed yet)
  useEffect(() => {
    if (q.trim() === (params.get("q") ?? "")) return;
    const t = setTimeout(() => setParams({ q: q.trim() || null, page: null }), 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const qs = new URLSearchParams({ filter, sort, page: String(page), q: params.get("q") ?? "" });
  const { data, error } = useApi<{ rows: PersonRow[]; total: number; page: number; pageSize: number }>(`/people?${qs}`);
  const pages = data ? Math.ceil(data.total / data.pageSize) : 0;
  const searching = !!params.get("q") || filter !== "all";

  return (
    <div className="page">
      <div className="page-head"><h1 className="title">People</h1></div>
      <Overview />

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or e-mail" aria-label="Search people" />
        </label>
        <Seg label="Filter" value={filter} options={FILTERS} onChange={(v) => setParams({ filter: v === "all" ? null : v, page: null })} />
        <span className="spacer" />
        {data && <span className="muted strong">{num(data.total)} {data.total === 1 ? "person" : "people"}</span>}
        <label className="select mob-only">
          <span className="muted">Sort</span>
          <select value={sort} onChange={(e) => setParams({ sort: e.target.value === "seen" ? null : e.target.value, page: null })}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {error && <Empty icon="alert" title="People could not load">{error}</Empty>}
      {data && !data.rows.length && <Empty icon="users" title={searching ? "Nobody matches" : "Nobody yet"} />}
      {data && data.rows.length > 0 && (
        <>
          <div className="card table-wrap desk-table">
            <table className="table">
              <thead>
                <tr>
                  <Th sort={sort} by="name" label="Person" />
                  <Th sort={sort} by="joined" label="Joined" />
                  <Th sort={sort} by="seen" label="Last active" />
                  <Th sort={sort} label="Target" />
                  <Th sort={sort} by="exam" label="Exam" />
                  <Th sort={sort} by="practice" label="Answers" r />
                  <Th sort={sort} by="exams" label="CO·CE exams" r />
                  <Th sort={sort} label="EE·EO" r />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((p) => (
                  <tr key={p.id} className="click" onClick={() => go(`/people/${p.id}`)}>
                    <td><a className="who" href={`/people/${p.id}`} onClick={(e) => { e.stopPropagation(); linkProps(`/people/${p.id}`).onClick(e); }}><strong>{p.name ?? "—"}{p.blocked_at && <> <Chip tone="bad">blocked</Chip></>}</strong><span className="muted">{p.email}</span></a></td>
                    <td className="nowrap">{date(p.created_at)}</td>
                    <td className="nowrap">{when(p.last_seen_at)}</td>
                    <td className="nowrap">{p.target_nclc ? `NCLC ${p.target_nclc}` : "—"}</td>
                    <td className="nowrap"><ExamDate d={p.exam_date} /></td>
                    <td className="r num">{num(p.answered)}</td>
                    <td className="r num">{num(p.exams)}</td>
                    <td className="r num">{num(p.expression)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="cards-list mob-list">
            {data.rows.map((p) => (
              <li key={p.id}>
                <a className="card person-card" {...linkProps(`/people/${p.id}`)}>
                  <span className="who"><strong>{p.name ?? "—"}{p.blocked_at && <> <Chip tone="bad">blocked</Chip></>}</strong><span className="muted">{p.email}</span></span>
                  <span className="person-card-meta">
                    <span>{when(p.last_seen_at)}</span>
                    <span>joined {date(p.created_at)}</span>
                    {p.target_nclc && <span>NCLC {p.target_nclc}</span>}
                    {p.exam_date && <span>exam {date(p.exam_date)}</span>}
                  </span>
                  <span className="person-card-meta num">
                    <span>{num(p.answered)} answers</span><span>{num(p.exams)} exams</span><span>{num(p.expression)} EE·EO</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="pager">
              <span className="muted">{num(page * data.pageSize + 1)}–{num(Math.min(data.total, (page + 1) * data.pageSize))} of {num(data.total)}</span>
              <span className="pager-buttons">
                <Button size="sm" disabled={page === 0} onClick={() => setParams({ page: page - 1 ? String(page - 1) : null })}>Previous</Button>
                <Button size="sm" disabled={page + 1 >= pages} onClick={() => setParams({ page: String(page + 1) })}>Next</Button>
              </span>
            </div>
          )}
        </>
      )}
      {!data && !error && <div className="skeleton tall" />}
    </div>
  );
}
