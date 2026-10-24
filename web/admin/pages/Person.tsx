import { useEffect, useState } from "react";
import { BackLink, Icon, Chip, Mark, Button, Sheet, Seg, ColourBar, Empty, type Section, type Tone } from "../../ui/ui.tsx";
import { useApi, useSummary, api, linkProps, go, num, when, date, minutes, plural } from "../lib.ts";
import { ExamDate } from "./People.tsx";
import { useToast } from "../main.tsx";

type Attempt = { id: number; section: "co" | "ce"; exam: number; started_at: string; deadline_at: string; finished_at: string | null; ended: string | null; score: number | null; nclc: number | null; right_count: number | null; wrong_count: number | null; blank_count: number | null; mock_id: number | null };
type Expr = { id: number; section: "ee" | "eo"; kind: string; taches: string; mode: string | null; started_at: string; finished_at: string | null; ended: string | null; score: number | null; seconds: number | null };
type Practice = { day: string; section: "co" | "ce"; level: string; answered: number; wrong: number; seconds: number; last_at: string };
type Report = { id: number; section: "co" | "ce"; level: string; n: number; message: string; status: "open" | "resolved"; created_at: string };
type Detail = {
  user: { id: string; email: string; name: string | null; created_at: string; last_seen_at: string | null; target_nclc: number | null; exam_date: string | null; lang: string; settings: Record<string, unknown>; terms_version: string | null; terms_at: string | null; gemini_status: string; gemini_checked_at: string | null; gemini_error: string | null; note: string | null; has_password: boolean };
  devices: { id: string; device: string | null; created_at: string; last_seen_at: string }[];
  colours: Record<string, { ok: number; bad: number; amber: number }>;
  attempts: Attempt[]; expression: Expr[]; practice: Practice[]; answeredToday: number; disputes: Report[];
};

const KEY_CHIP: Record<string, [Tone, string]> = { ok: ["ok", "working"], error: ["bad", "rejected"], quota: ["amber", "limit"], none: ["new", "none"] };

const ENDED: Record<string, string> = { done: "finished", time: "time ran out", abandon: "abandoned", abandoned: "abandoned", in_progress: "in progress", early: "ended early", dropped: "dropped" };

type Activity = { at: string; s: Section; what: string; result: string; length: string; tag: string; tone?: "bad" | "amber" };
function activity(d: Detail): Activity[] {
  const out: Activity[] = [];
  for (const a of d.attempts) out.push({
    at: a.started_at, s: a.section, what: `Exam ${a.exam}${a.mock_id ? " · mock exam" : ""}`,
    result: a.finished_at ? `${a.score} · NCLC ${a.nclc} · ${a.right_count}/${a.wrong_count}/${a.blank_count}` : "running",
    length: a.finished_at ? minutes((Date.parse(a.finished_at) - Date.parse(a.started_at)) / 1000) : "—",
    tag: a.ended ? ENDED[a.ended] : "in progress", tone: a.ended === "abandon" ? "bad" : a.ended === "time" ? "amber" : undefined,
  });
  for (const e of d.expression) out.push({
    at: e.started_at, s: e.section, what: `${e.kind === "exam" ? "Exam · Tâche 1 → 3" : `Tâche ${e.taches}`}${e.mode ? ` · ${e.mode === "live" ? "live" : "push to talk"}` : ""}`,
    result: e.score != null ? `${e.score} / 20` : "—", length: minutes(e.seconds), tag: e.ended ? ENDED[e.ended] ?? e.ended : "in progress", tone: e.ended === "dropped" || e.ended === "abandoned" ? "bad" : undefined,
  });
  for (const p of d.practice) out.push({
    at: p.last_at, s: p.section, what: `Practice ${p.level}`, result: `${p.answered} answered · ${p.wrong} wrong`, length: minutes(p.seconds), tag: "practice",
  });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

function SectionCard({ s, d, total }: { s: Section; d: Detail; total?: number }) {
  if (s === "co" || s === "ce") {
    const done = d.attempts.filter((a) => a.section === s && a.finished_at);
    const best = done.reduce<Attempt | null>((b, a) => (!b || (a.score ?? 0) > (b.score ?? 0) ? a : b), null);
    const latest = done[0];
    const c = d.colours[s] ?? { ok: 0, bad: 0, amber: 0 };
    const answered = d.practice.filter((p) => p.section === s).reduce((n, p) => n + p.answered, 0);
    return (
      <section className="card pad sec-card">
        <Mark s={s} big />
        <div className="sec-score"><span className="stat-value small">{best ? best.score : "—"}</span>{best && <span className="muted">best · NCLC {best.nclc}</span>}</div>
        <span className="muted">{done.length ? `${plural(done.length, "exam")} · latest ${latest.score}` : "No exam yet"}</span>
        <ColourBar {...c} total={total} />
        <span className="muted small">{num(c.ok + c.amber + c.bad)}{total ? ` of ${num(total)}` : ""} practised · {num(answered)} answers</span>
      </section>
    );
  }
  const rows = d.expression.filter((e) => e.section === s);
  const scored = rows.filter((e) => e.score != null);
  const avg = scored.length ? scored.reduce((n, e) => n + (e.score ?? 0), 0) / scored.length : null;
  return (
    <section className="card pad sec-card">
      <Mark s={s} big />
      <div className="sec-score"><span className="stat-value small">{avg == null ? "—" : avg.toFixed(1)}</span>{avg != null && <span className="muted">average / 20</span>}</div>
      <span className="muted">{rows.length ? plural(rows.length, "session") : "No session yet"}</span>
      <span className="muted small">{plural(rows.filter((e) => e.kind === "exam").length, "full test")} · {num(rows.filter((e) => e.ended === "dropped" || e.ended === "abandoned").length)} abandoned</span>
    </section>
  );
}

type Act = "signout" | "reset-progress" | "delete" | null;

export function Person({ id }: { id: string }) {
  const { data: d, error, reload } = useApi<Detail>(`/people/${id}`);
  const summary = useSummary();
  const say = useToast();
  const [act, setAct] = useState<Act>(null);
  const [resetWhat, setResetWhat] = useState<"all" | Section>("all");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [allActs, setAllActs] = useState(false);
  useEffect(() => { if (d) setNote(d.user.note ?? ""); }, [d]);

  if (error) return <div className="page"><BackLink to="/" label="People" /><Empty icon="users" title={error === "no such person" ? "This person no longer exists" : "Could not load"}>{error !== "no such person" && error}</Empty></div>;
  if (!d) return <div className="page"><div className="skeleton tall" /></div>;
  const u = d.user;
  const totals = summary ? { co: Object.values(summary.bank.co).reduce((n, l) => n + l.questions, 0), ce: Object.values(summary.bank.ce).reduce((n, l) => n + l.questions, 0) } : undefined;
  const acts = activity(d);
  const close = () => { setAct(null); setTyped(""); setResetWhat("all"); };

  async function run() {
    if (!act) return;
    setBusy(true);
    try {
      await api(`/people/${id}/${act}`, act === "reset-progress" ? { section: resetWhat } : {});
      const name = u.name ?? u.email;
      if (act === "delete") { say(`${name}'s account was deleted`); close(); go("/"); return; }
      say({ signout: `${name} is signed out everywhere`, "reset-progress": "Progress reset" }[act]);
      close(); reload();
    } catch (e) {
      say((e as Error).message, "bad");
    } finally { setBusy(false); }
  }

  async function saveNote() {
    try { await api(`/people/${id}/note`, { note }); setSavedNote(true); setTimeout(() => setSavedNote(false), 2000); }
    catch (e) { say((e as Error).message, "bad"); }
  }

  const sheet = {
    signout: { title: `Sign ${u.name ?? "this person"} out everywhere?`, body: `${plural(d.devices.length, "device")} will ask for the password again.`, button: "Sign out everywhere", danger: false },
    "reset-progress": { title: "Reset progress?", body: "Practice colours, exam attempts and results are deleted for what you choose. This cannot be undone.", button: "Reset", danger: true },
    delete: { title: "Delete this account?", body: "The account and everything in it go: progress, results, key, devices. This cannot be undone.", button: "Delete account", danger: true },
  } as const;
  const s = act ? sheet[act] : null;

  return (
    <div className="page">
      <BackLink to="/" label="People" />
      <div className="person-head">
        <div className="person-id">
          <span className="avatar" aria-hidden="true">{(u.name ?? u.email)[0].toUpperCase()}</span>
          <div>
            <h1 className="title">{u.name ?? u.email}</h1>
            <p className="muted">{u.email}</p>
          </div>
        </div>
        <div className="person-actions">
          <Button size="sm" onClick={() => setAct("signout")} disabled={!d.devices.length}>Sign out everywhere</Button>
          <Button size="sm" onClick={() => setAct("reset-progress")}>Reset progress</Button>
          <Button size="sm" kind="danger" onClick={() => setAct("delete")}>Delete account</Button>
        </div>
      </div>
      <dl className="facts">
        <div><dt>Joined</dt><dd>{date(u.created_at, true)}</dd></div>
        <div><dt>Last active</dt><dd>{when(u.last_seen_at)}</dd></div>
        <div><dt>Target</dt><dd>{u.target_nclc ? `NCLC ${u.target_nclc}` : "—"}</dd></div>
        <div><dt>Exam</dt><dd>{u.exam_date ? <ExamDate d={u.exam_date} /> : "not registered yet"}</dd></div>
        <div><dt>Language</dt><dd>{u.lang === "en" ? "English" : "Français"}</dd></div>
        <div><dt>Today</dt><dd>{plural(d.answeredToday, "answer")}</dd></div>
      </dl>

      <div className="sections">
        {(["co", "ce", "ee", "eo"] as Section[]).map((s) => <SectionCard key={s} s={s} d={d} total={totals?.[s as "co" | "ce"]} />)}
      </div>

      <div className="grid-person">
        <section className="card pad">
          <div className="card-head"><h2>Activity</h2><span className="muted">{num(acts.length)}</span></div>
          {acts.length ? (
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>When</th><th>What</th><th>Result</th><th className="r">Time</th><th></th></tr></thead>
                <tbody>
                  {acts.slice(0, allActs ? 500 : 20).map((a, i) => (
                    <tr key={i}>
                      <td className="nowrap">{when(a.at)}</td>
                      <td className="nowrap"><Mark s={a.s} /> {a.what}</td>
                      <td className="num nowrap">{a.result}</td>
                      <td className="r num nowrap">{a.length}</td>
                      <td><Chip tone={a.tone ?? (a.tag === "practice" ? "new" : "muted")}>{a.tag}</Chip></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {acts.length > 20 && !allActs && <div className="more"><Button size="sm" kind="quiet" onClick={() => setAllActs(true)}>Show all {num(acts.length)}</Button></div>}
            </div>
          ) : <p className="muted">Nothing done yet.</p>}
        </section>

        <div className="stack">
          <section className="card pad">
            <div className="card-head"><h2>Disputes</h2><span className="muted">{d.disputes.length}</span></div>
            {d.disputes.length ? (
              <ul className="list">
                {d.disputes.map((r) => (
                  <li key={r.id}>
                    <a className="list-row" {...linkProps(`/disputes/${r.id}`)}>
                      <Mark s={r.section} />
                      <span className="ellipsis">{r.level} · n° {r.n} — {r.message}</span>
                      <Chip tone={r.status === "open" ? "amber" : "ok"} dot>{r.status === "open" ? "open" : "done"}</Chip>
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">None sent.</p>}
          </section>
          <section className="card pad">
            <h2>Account</h2>
            <dl className="kv">
              <div><dt>Gemini key</dt><dd><Chip tone={KEY_CHIP[u.gemini_status]?.[0]} dot>{KEY_CHIP[u.gemini_status]?.[1]}</Chip>{u.gemini_checked_at && <span className="muted"> checked {when(u.gemini_checked_at)}</span>}{u.gemini_error && <span className="kv-sub bad-text">{u.gemini_error}</span>}</dd></div>
              <div><dt>Password</dt><dd>{u.has_password ? "set" : "not set yet"}</dd></div>
              <div><dt>Terms</dt><dd>{u.terms_at ? `v${u.terms_version} · ${date(u.terms_at, true)}` : "—"}</dd></div>
              <div><dt>Settings</dt><dd className="settings">{Object.keys(u.settings).length ? <Settings v={u.settings} /> : <span className="muted">defaults</span>}</dd></div>
            </dl>
          </section>
          <section className="card pad">
            <div className="card-head"><h2>Devices</h2><span className="muted">{d.devices.length}</span></div>
            {d.devices.length ? (
              <ul className="devices">
                {d.devices.map((v) => (
                  <li key={v.id}><Icon name={/iphone|android/i.test(v.device ?? "") ? "phone" : "laptop"} size={18} /><span>{v.device ?? "Unknown device"}</span><span className="muted">{when(v.last_seen_at)}</span></li>
                ))}
              </ul>
            ) : <p className="muted">Signed in nowhere.</p>}
          </section>
          <section className="card pad">
            <div className="card-head"><h2>Note</h2>{savedNote && <Chip tone="ok">saved</Chip>}</div>
            <textarea className="note" value={note ?? ""} onChange={(e) => setNote(e.target.value)} rows={3} aria-label="Note about this person" maxLength={2000} />
            <div className="note-actions"><Button size="sm" onClick={saveNote} disabled={(note ?? "") === (u.note ?? "")}>Save note</Button></div>
          </section>
        </div>
      </div>

      <Sheet open={!!act} title={s?.title ?? ""} onClose={close} actions={<>
        <Button onClick={close}>Cancel</Button>
        <Button kind={s?.danger ? "danger" : "primary"} busy={busy} onClick={run} disabled={act === "delete" && typed.trim().toLowerCase() !== u.email}>{s?.button}</Button>
      </>}>
        <p>{s?.body}</p>
        {act === "reset-progress" && <Seg label="What to reset" value={resetWhat} onChange={setResetWhat} options={[["all", "Everything"], ["co", "CO"], ["ce", "CE"], ["ee", "EE"], ["eo", "EO"]]} />}
        {act === "delete" && (
          <label className="field">
            <span>Type <strong>{u.email}</strong></span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        )}
      </Sheet>
    </div>
  );
}

function Settings({ v }: { v: Record<string, unknown> }) {
  return (
    <ul className="settings-list">
      {Object.entries(v).map(([k, val]) => (
        <li key={k}><span className="muted">{k}</span> {val && typeof val === "object" ? Object.entries(val as Record<string, unknown>).filter(([, x]) => x === true).map(([x]) => x).join(", ") || "all off" : String(val)}</li>
      ))}
    </ul>
  );
}
