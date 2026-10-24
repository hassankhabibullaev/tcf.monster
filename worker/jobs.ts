// A job is a named piece of work run on a schedule or by hand from the admin. Every run is recorded: its last state
// in `jobs`, and one line in `job_log` (kept 60 days). A job never throws past here: a failure is a recorded run.
import { type Env, nowIso } from "./util.ts";
import { syncTopics } from "./topics.ts";
import { backup } from "./backup.ts";
import { finalizeStale } from "./coce/attempts.ts";
import { finalizeStaleMocks } from "./mock/index.ts";
import { newsJob } from "./news.ts";

export type JobResult = { ok: boolean; detail: string };
type Job = { title: string; run: (env: Env) => Promise<JobResult> };

export const JOBS: Record<string, Job> = {
  topics: { title: "Topics sync", run: (env) => syncTopics(env) },
  backup: { title: "Nightly backup", run: (env) => backup(env) },
  cleanup: { title: "Cleanup", run: (env) => cleanup(env) },
  mails: { title: "Exam and welcome mails", run: (env) => newsJob(env) },
};

export async function runJob(env: Env, name: string): Promise<JobResult> {
  const job = JOBS[name];
  if (!job) return { ok: false, detail: "unknown job" };
  const t0 = Date.now();
  let r: JobResult;
  try { r = await job.run(env); } catch (e) { r = { ok: false, detail: String((e as Error)?.message ?? e).slice(0, 300) }; }
  const at = nowIso(), seconds = (Date.now() - t0) / 1000;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO jobs (name, last_at, ok, detail, seconds) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(name) DO UPDATE SET last_at = ?2, ok = ?3, detail = ?4, seconds = ?5")
      .bind(name, at, r.ok ? 1 : 0, r.detail, seconds),
    env.DB.prepare("INSERT INTO job_log (at, name, ok, detail) VALUES (?, ?, ?, ?)").bind(at, name, r.ok ? 1 : 0, r.detail),
  ]);
  return r;
}

/** expired sign-ins and codes, old counters and log lines */
async function cleanup(env: Env): Promise<JobResult> {
  const now = nowIso();
  const cut = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
  const r = await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM codes WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM budget WHERE day < ?").bind(cut(30).slice(0, 10)),
    env.DB.prepare("DELETE FROM job_log WHERE at < ?").bind(cut(60)),
    env.DB.prepare("DELETE FROM mail WHERE at < ?").bind(cut(90)),
  ]);
  const n = r.map((x) => x.meta.changes ?? 0);
  const stale = await finalizeStale(env); // CO/CE exam attempts left running past their deadline, scored as time-outs
  const mocks = await finalizeStaleMocks(env); // mock exams nobody came back to
  return { ok: true, detail: `${n[0]} sign-ins and ${n[1]} codes expired, ${n[3] + n[4]} old log lines removed, ${stale} exam attempts closed, ${mocks} mock exams closed` };
}
