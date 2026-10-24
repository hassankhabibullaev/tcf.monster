// The question bank's files (/data/*: the questions, their answers and the names of their recordings) go to
// signed-in people only. The recordings and pictures themselves are plain files under names nobody can guess
// (scripts/copy-media.mjs): only these files name them. Each request passes the abuse guard (worker/guard.ts: pace
// and daily volume far beyond a person → the human check, then a block); each different file a person opens is noted
// once a day, and far more of the bank than anyone studies in a day asks the check, then blocks. Past the day's write
// hold line nothing is noted: the app keeps working.
import { type Env, fail, day, BUDGET_HOLD, addWrites } from "../util.ts";
import { currentUser, type Me } from "../auth.ts";
import { isOwner } from "../admin.ts";
import { guardRequest, guardAmount } from "../guard.ts";
import { isOwnerEmail } from "../access.ts";

/** the files of the bank export the browser reads, nothing else (the answer keys are the Worker's, in R2) */
const DATA_FILE = /^\/data\/(bank|(co|ce)-(A1|A2|B1|B2|C1|C2)|exam-(co|ce)-\d{2})\.json$/;
/** the admin's too: the content summary (web/admin/lib.ts) */
const ADMIN_FILE = /^\/data\/summary\.json$/;

/** note this file for today; how many different files the person opened today (null: not counted) */
export async function noteRead(env: Env, me: Me, key: string): Promise<number | null> {
  const today = day(env.APP_TZ);
  const spent = await env.DB.prepare("SELECT writes FROM budget WHERE day = ?").bind(today).first<{ writes: number }>();
  if ((spent?.writes ?? 0) >= BUDGET_HOLD) return null;
  const r = await env.DB.prepare("INSERT OR IGNORE INTO bank_reads (user_id, day, kind, key) VALUES (?, ?, 'data', ?)").bind(me.id, today, key).run();
  if (!r.meta.changes) return null; // already opened today: nothing new to count
  await addWrites(env, 1);
  const n = await env.DB.prepare("SELECT COUNT(*) n FROM bank_reads WHERE user_id = ? AND day = ?").bind(me.id, today).first<{ n: number }>();
  return Number(n?.n ?? 0);
}

/** /data/* — the bank's files from the built pages, for a signed-in person (app) or the owner (admin's pages) */
export async function handleData(req: Request, env: Env, url: URL, admin: boolean): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return fail(405, "GET only");
  if (!DATA_FILE.test(url.pathname) && !(admin && ADMIN_FILE.test(url.pathname))) return fail(404, "not found");
  if (admin) {
    if (!(await isOwner(env, req))) return fail(403, "owner only");
  } else {
    const me = await currentUser(env, req);
    if (!me) return fail(401, "signed out");
    const stopped = await guardRequest(req, env, me, false);
    if (stopped) return stopped;
    if (req.method === "GET" && !isOwnerEmail(env, me.email)) {
      // counting must never cost the file: a database hiccup here still serves it
      const opened = await noteRead(env, me, url.pathname).catch(() => null);
      if (opened !== null) {
        const asked = await guardAmount(env, me, "bank", opened);
        if (asked) return asked;
      }
    }
  }
  const inm = req.headers.get("if-none-match");
  const res = await env.ASSETS.fetch(new Request(new URL(url.pathname, "https://assets"), { method: req.method, headers: inm ? { "if-none-match": inm } : {} }));
  const out = new Response(res.body, res);
  // the browser keeps it an hour without asking again; nothing in between keeps a copy
  out.headers.set("cache-control", "private, max-age=3600");
  return out;
}
