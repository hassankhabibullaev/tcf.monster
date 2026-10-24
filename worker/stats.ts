// The dashboard's numbers: per section, the best, the worst and the typical result, the current estimate, the trend;
// and a few facts about the person's work. "Typical" and "current" are medians, so one brilliant or one terrible day
// does not move them (the owner's rule: a single A1 among C1s must not count).
import { type Env, json, day } from "./util.ts";
import type { Me } from "./auth.ts";
import { mockStats } from "./mock/index.ts";

export type SectionStat = {
  n: number; best: number | null; worst: number | null; typical: number | null; current: number | null;
  last: string | null; trend: "up" | "down" | "flat" | null;
  /** the last eight results in time order, for a small line */
  series: number[];
};
export type Recent = { section: "co" | "ce" | "ee" | "eo"; kind: "exam" | "practice"; at: string; score: number | null; nclc: number | null; label: string; href: string };
export type Stats = {
  sections: Record<"co" | "ce" | "ee" | "eo", SectionStat>;
  facts: { sessions: number; minutes: number; days: number; streak: number; since: string | null };
  /** the last results, newest first */
  recent: Recent[];
  /** work per day for the last 12 weeks, oldest first: [day, minutes or answers] */
  activity: Record<string, number>;
  /** minutes of work per day for the last 12 weeks (practice time + simulator time), for the phone's seven-day bars */
  work: Record<string, number>;
  /** CO/CE practice colours per level, and the exams taken */
  practice: Record<"co" | "ce", Record<string, { green: number; red: number; amber: number }>>;
  exams: Record<"co" | "ce", { taken: number; distinct: number; best: number | null; last: number | null }>;
  /** EE/EO: average mark /20 per Tâche and overall */
  tasks: Record<"ee" | "eo", { sessions: number; avg20: number | null; byTask: Record<string, number | null> }>;
  /** the mock exams (docs/MOCK-EXAM.md §5): how many, the best overall level, the last one's four NCLC */
  mocks: { count: number; best: number | null; last: { id: number; at: string; status: string; nclc: Record<"co" | "ce" | "ee" | "eo", number | null>; overall: number | null } | null };
};

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** results in time order → the stat; `current` = median of the last five, `trend` = that against the five before */
export function sectionStat(results: { nclc: number; at: string }[]): SectionStat {
  if (!results.length) return { n: 0, best: null, worst: null, typical: null, current: null, last: null, trend: null, series: [] };
  const v = results.map((r) => r.nclc);
  const current = median(v.slice(-5));
  const before = v.length >= 6 ? median(v.slice(-10, -5)) : null;
  const trend = before === null || current === null ? null : current > before ? "up" : current < before ? "down" : "flat";
  return { n: v.length, best: Math.max(...v), worst: Math.min(...v), typical: median(v), current, last: results[results.length - 1].at, trend, series: v.slice(-8) };
}

/** days practised in a row, counting back from today or yesterday */
export function streakOf(days: Set<string>, today: string): number {
  const d = new Date(today + "T12:00:00Z");
  const key = () => d.toISOString().slice(0, 10);
  if (!days.has(key())) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (days.has(key())) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}

export async function handleStats(env: Env, me: Me): Promise<Response> {
  const [attempts, expr, practice, progress, taskRows, mocks] = await Promise.all([
    env.DB.prepare("SELECT id, section, exam, score, nclc, finished_at at FROM attempts WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY finished_at").bind(me.id).all<{ id: number; section: string; exam: number; score: number | null; nclc: number | null; at: string }>(),
    env.DB.prepare("SELECT id, section, kind, taches, score, nclc, status, started_at, finished_at, seconds, mock_id FROM expr_sessions WHERE user_id = ? ORDER BY started_at").bind(me.id).all<{ id: string; section: string; kind: string; taches: string; score: number | null; nclc: number | null; status: string; started_at: string; finished_at: string | null; seconds: number | null; mock_id: number | null }>(),
    env.DB.prepare("SELECT day, answered, seconds FROM practice_days WHERE user_id = ?").bind(me.id).all<{ day: string; answered: number; seconds: number }>(),
    env.DB.prepare("SELECT section, level, data FROM progress WHERE user_id = ?").bind(me.id).all<{ section: string; level: string; data: string }>(),
    env.DB.prepare("SELECT s.section, t.task_no, t.score20 FROM expr_tasks t JOIN expr_sessions s ON s.id = t.session_id WHERE s.user_id = ? AND t.score20 IS NOT NULL").bind(me.id).all<{ section: string; task_no: number; score20: number }>(),
    mockStats(env, me.id),
  ]);
  const by: Record<string, { nclc: number; at: string }[]> = { co: [], ce: [], ee: [], eo: [] };
  // below NCLC 4 the official tables stop: such a result counts as 3 here (shown as « < 4 »), so a bad day still weighs
  for (const a of attempts.results) if (by[a.section]) by[a.section].push({ nclc: a.nclc ?? 3, at: a.at });
  for (const s of expr.results) if (s.status === "done" && by[s.section]) by[s.section].push({ nclc: s.nclc ?? 3, at: s.finished_at ?? s.started_at });
  // a mock's listening and reading count like exams (its writing and speaking are sessions, counted above)
  for (const m of mocks.coce) by[m.section].push({ nclc: m.nclc ?? 3, at: m.at });
  for (const k of Object.keys(by)) by[k].sort((x, y) => (x.at < y.at ? -1 : 1));

  const days = new Set<string>();
  let seconds = 0, sessions = 0;
  for (const p of practice.results) { if (p.answered > 0) days.add(p.day); seconds += p.seconds; }
  for (const s of expr.results) { if (s.status !== "in_progress") { days.add(s.started_at.slice(0, 10)); sessions++; } seconds += s.seconds ?? 0; }
  sessions += attempts.results.length;
  for (const a of attempts.results) days.add(a.at.slice(0, 10));
  const since = [...days].sort()[0] ?? null;

  // the last results and the work per day (practice answers + simulator minutes), for the dashboard's story
  const recent: Recent[] = [];
  for (const a of attempts.results) recent.push({ section: a.section as Recent["section"], kind: "exam", at: a.at, score: a.score, nclc: a.nclc, label: `n° ${a.exam}`, href: `/${a.section}/examen/${a.exam}/resultat/${a.id}` });
  for (const s of expr.results) if (s.status === "done") {
    let taches: number[] = []; try { taches = JSON.parse(s.taches); } catch { /* none */ }
    recent.push({ section: s.section as Recent["section"], kind: s.kind === "exam" ? "exam" : "practice", at: s.finished_at ?? s.started_at, score: s.score, nclc: s.nclc, label: s.mock_id ? "blanc" : s.kind === "exam" ? "" : taches.map((n) => `T${n}`).join(" · "), href: s.mock_id ? `/mock/${s.mock_id}/result` : `/${s.section}/resultat/${s.id}` });
  }
  for (const m of mocks.coce) recent.push({ section: m.section, kind: "exam", at: m.at, score: null, nclc: m.nclc, label: "blanc", href: `/mock/${m.id}/result` });
  recent.sort((x, y) => (x.at < y.at ? 1 : -1));
  const activity: Record<string, number> = {};
  const cutoff = new Date(Date.now() - 84 * 86400000).toISOString().slice(0, 10);
  for (const p of practice.results) if (p.day >= cutoff) activity[p.day] = (activity[p.day] ?? 0) + p.answered;
  for (const s of expr.results) { const d = s.started_at.slice(0, 10); if (d >= cutoff && s.status !== "in_progress") activity[d] = (activity[d] ?? 0) + Math.max(1, Math.round((s.seconds ?? 0) / 60)); }
  const workSeconds: Record<string, number> = {};
  for (const p of practice.results) if (p.day >= cutoff) workSeconds[p.day] = (workSeconds[p.day] ?? 0) + (p.seconds ?? 0);
  for (const s of expr.results) { const d = s.started_at.slice(0, 10); if (d >= cutoff && s.status !== "in_progress") workSeconds[d] = (workSeconds[d] ?? 0) + (s.seconds ?? 0); }
  const work: Record<string, number> = Object.fromEntries(Object.entries(workSeconds).map(([d, sec]) => [d, Math.round(sec / 60)]));

  const colours: Stats["practice"] = { co: {}, ce: {} };
  for (const r of progress.results) {
    if (r.section !== "co" && r.section !== "ce") continue;
    const c = (colours[r.section][r.level] ??= { green: 0, red: 0, amber: 0 });
    let blob: { q?: Record<string, { s?: string }> } = {};
    try { blob = JSON.parse(r.data); } catch { /* empty */ }
    for (const v of Object.values(blob.q ?? {})) if (v && (v.s === "green" || v.s === "red" || v.s === "amber")) c[v.s]++;
  }
  const exams: Stats["exams"] = { co: { taken: 0, distinct: 0, best: null, last: null }, ce: { taken: 0, distinct: 0, best: null, last: null } };
  const seen: Record<string, Set<number>> = { co: new Set(), ce: new Set() };
  for (const a of attempts.results) {
    const e = exams[a.section as "co" | "ce"]; if (!e) continue;
    e.taken++; seen[a.section].add(a.exam);
    if (a.score != null) { e.best = Math.max(e.best ?? 0, a.score); e.last = a.score; }
  }
  exams.co.distinct = seen.co.size; exams.ce.distinct = seen.ce.size;
  const tasks: Stats["tasks"] = { ee: { sessions: 0, avg20: null, byTask: {} }, eo: { sessions: 0, avg20: null, byTask: {} } };
  const acc: Record<string, Record<string, number[]>> = { ee: {}, eo: {} };
  for (const t of taskRows.results) if (acc[t.section]) (acc[t.section][String(t.task_no)] ??= []).push(t.score20);
  for (const sec of ["ee", "eo"] as const) {
    const all: number[] = [];
    for (const [k, v] of Object.entries(acc[sec])) { tasks[sec].byTask[k] = v.length ? Math.round((v.reduce((x, y) => x + y, 0) / v.length) * 10) / 10 : null; all.push(...v); }
    tasks[sec].avg20 = all.length ? Math.round((all.reduce((x, y) => x + y, 0) / all.length) * 10) / 10 : null;
    tasks[sec].sessions = expr.results.filter((x) => x.section === sec && x.status === "done").length;
  }

  const out: Stats = {
    sections: { co: sectionStat(by.co), ce: sectionStat(by.ce), ee: sectionStat(by.ee), eo: sectionStat(by.eo) },
    facts: { sessions, minutes: Math.round(seconds / 60), days: days.size, streak: streakOf(days, day(env.APP_TZ)), since },
    recent: recent.slice(0, 8), activity, work, practice: colours, exams, tasks,
    mocks: { count: mocks.count, best: mocks.best, last: mocks.last },
  };
  return json(out);
}
