// What the app reads of the content: the EE/EO topics (signed-in people; the admin has its own, richer view).
import { type Env, json, fail } from "./util.ts";

type Row = Record<string, unknown>;

/**
 * GET /api/topics?section=eo|ee[&month=2026-10][&q=words]
 * → { months: [{ month, parts }], rows: [{ id, month, part, tache, position, title, body }] }
 * Without `q`: the month's rows (the newest month when none is given). With `q`: the matching rows of every month.
 * Hidden topics and topics gone from the source are never sent.
 */
/** the answer is the same for everyone and the topics change once a week: it is kept 10 minutes in Cloudflare's cache
 *  (free; one copy per data centre), since one answer reads every topic row of a section (~1 300 for EO) and the free
 *  plan reads 5 million rows a day. A topic hidden in the admin disappears within those 10 minutes. */
export const TOPICS_CACHE_SECONDS = 600;
export async function handleTopics(req: Request, env: Env, url: URL): Promise<Response> {
  if (req.method !== "GET") return fail(405, "GET");
  const section = url.searchParams.get("section") === "ee" ? "ee" : "eo";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(`https://cache.tcf.monster/topics?s=${section}&m=${encodeURIComponent(url.searchParams.get("month") ?? "")}&q=${encodeURIComponent(q)}`);
  const own = (r: Response) => new Response(r.body, { status: r.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, max-age=300" } });
  if (cache) {
    const hit = await cache.match(key).catch(() => undefined);
    if (hit) return own(hit);
  }
  const fresh = await readTopics(env, url, section, q);
  if (cache) await cache.put(key, new Response(JSON.stringify(fresh), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${TOPICS_CACHE_SECONDS}` } })).catch(() => {});
  return json(fresh, 200, { "cache-control": "private, max-age=300" });
}

async function readTopics(env: Env, url: URL, section: string, q: string) {
  const months = (await env.DB.prepare("SELECT month, COUNT(DISTINCT part) parts, COUNT(*) n FROM topics WHERE section = ? AND hidden = 0 AND gone_at IS NULL GROUP BY month ORDER BY month DESC").bind(section).all()).results as Row[];
  const month = url.searchParams.get("month") || String(months[0]?.month ?? "");
  // a search reads the section once (kept in this server's memory ten minutes) and looks through it here: any words
  // typed cost no database reads (a script typing random words used to read the whole section each time)
  const rows = q
    ? (await sectionRows(env, section)).filter((r) => String(r.title).toLowerCase().includes(q) || String(r.body).toLowerCase().includes(q)).slice(0, 400)
    : ((await env.DB.prepare(`SELECT id, month, part, tache, position, title, body FROM topics
      WHERE section = ?1 AND hidden = 0 AND gone_at IS NULL AND month = ?2 ORDER BY part, tache, position LIMIT 400`).bind(section, month).all()).results as Row[]);
  return {
    months,
    month,
    rows: rows.map((r) => {
      let body: Row = {};
      try { body = JSON.parse(String(r.body)); } catch { /* none */ }
      // a few source rows carry « #1 » as their title and the text in the description
      const title = /^#\d+$/.test(String(r.title)) && body.description ? String(body.description) : String(r.title);
      return { id: r.id, month: r.month, part: r.part, tache: r.tache, position: r.position, title, body };
    }),
  };
}

const sections = new Map<string, { at: number; rows: Promise<Row[]> }>();
/** every visible topic of a section, newest month first, read once per server every ten minutes */
function sectionRows(env: Env, section: string): Promise<Row[]> {
  const kept = sections.get(section);
  if (kept && Date.now() - kept.at < TOPICS_CACHE_SECONDS * 1000) return kept.rows;
  const rows = env.DB.prepare(`SELECT id, month, part, tache, position, title, body FROM topics WHERE section = ? AND hidden = 0 AND gone_at IS NULL
    ORDER BY month DESC, part, tache, position LIMIT 5000`).bind(section).all().then((r) => r.results as Row[]);
  rows.catch(() => sections.delete(section));
  sections.set(section, { at: Date.now(), rows });
  return rows;
}
export const resetTopicRows = () => sections.clear();
