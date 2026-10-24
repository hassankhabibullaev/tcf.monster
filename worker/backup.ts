// Nightly copy of everything people produced, to the private R2 bucket: backups/<day>/<table>-<page>.json.
// Read in pages by rowid, so a large table is never held in one piece. The last 3 nights are kept (2026-10-22): D1's
// own Time Travel restores any minute of the last 7 days on the free plan (wrangler d1 time-travel restore), and 30
// nightly copies of everyone's data would grow toward R2's free 10 GB, the one place a bill could come from.
const KEEP = 3;
// Sign-ins and one-time codes are not copied: they expire anyway.
import { type Env, day } from "./util.ts";
import type { JobResult } from "./jobs.ts";

// topics are not copied: the weekly sync fetches them again from their source
export const BACKED_UP = ["users", "progress", "practice_days", "attempts", "expr_sessions", "expr_tasks", "user_kv", "mocks", "disputes", "hidden"];
/** rows a file: progress rows are each person's whole level state, so fewer of them (CPU to turn them into text) */
const PAGE: Record<string, number> = { progress: 150, expr_tasks: 300 };

/** one table (the nightly run asks one table a call, each with its own CPU time), or all of them and the pruning */
export async function backup(env: Env, only?: string): Promise<JobResult> {
  const today = day(env.APP_TZ);
  let rows = 0, bytes = 0, files = 0;
  if (only && only !== "prune" && !BACKED_UP.includes(only)) return { ok: false, detail: `no table ${only}` };
  for (const table of only ? BACKED_UP.filter((t) => t === only) : BACKED_UP) {
    const size = PAGE[table] ?? 500;
    for (let last = 0, page = 0; ; page++) {
      const { results } = await env.DB.prepare(`SELECT rowid AS _rowid, * FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT ?`).bind(last, size).all();
      if (!results.length && page > 0) break;
      // password hashes are never copied out of the database: after a restore, people set a new one with an e-mail code
      if (table === "users") for (const r of results) delete (r as Record<string, unknown>).password;
      const body = JSON.stringify(results);
      await env.FILES.put(`backups/${today}/${table}-${String(page).padStart(4, "0")}.json`, body, { httpMetadata: { contentType: "application/json" } });
      rows += results.length; bytes += body.length; files++;
      if (results.length < size) break;
      last = Number(results[results.length - 1]._rowid);
    }
  }
  if (only && only !== "prune") return { ok: true, detail: `${only}: ${rows} rows in ${files} files, ${(bytes / 1e6).toFixed(2)} MB` };
  const list = await env.FILES.list({ prefix: "backups/20", delimiter: "/" });
  const days = (list.delimitedPrefixes ?? []).sort();
  for (const d of days.slice(0, Math.max(0, days.length - KEEP))) {
    const old = await env.FILES.list({ prefix: d });
    for (const o of old.objects) await env.FILES.delete(o.key);
  }
  const kept = Math.min(days.length, KEEP);
  return { ok: true, detail: `${rows} rows in ${files} files, ${(bytes / 1e6).toFixed(2)} MB · ${kept} day${kept === 1 ? "" : "s"} kept` };
}
