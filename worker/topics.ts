// The weekly copy of the monthly EE/EO topics from their public source (word for word; model answers are never copied).
// EO: month → « Partie n » → Tâche 2 and 3 topics. EE: month → « Combinaison n » → Tâche 1, 2, 3.
// The month pages are plain HTML with the data in Next.js script strings. A page is read when its address is new or
// its month is one of the three newest; its rows are written only when what was taken from it changed.
import { type Env, nowIso, addWrites } from "./util.ts";
import type { JobResult } from "./jobs.ts";

const BASE = "https://www.formation-tcfcanada.com/epreuve";
export const SECTIONS = { eo: "expression-orale", ee: "expression-ecrite" } as const;
type Section = keyof typeof SECTIONS;
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export type TopicRow = {
  id: number; month: string; part: number; part_id: number; tache: number | null; position: number;
  title: string; body: Record<string, unknown>;
};

async function get(url: string, fetcher: typeof fetch) {
  const r = await fetcher(url, { headers: { "user-agent": "Mozilla/5.0 (tcf.monster topics sync, weekly)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

export function monthSlugs(html: string) {
  const slugs = new Set([...html.matchAll(/sujets-actualites\/([a-z0-9-]+)"/g)].map((m) => m[1]));
  slugs.delete("favoris");
  return [...slugs].sort();
}

/** "2026-10" from the page title (« … Octobre 2026 ») */
export function monthOf(html: string) {
  const m = html.match(new RegExp(`<title>[^<]*?(${MOIS.join("|")})\\s+(\\d{4})`, "i"));
  return m ? `${m[2]}-${String(MOIS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}` : null;
}

/** the JSON array that follows "key": in the page's script strings */
function array(html: string, key: string): unknown[] | null {
  const s = html.replaceAll('\\"', '"').replaceAll("\\\\", "\\");
  const start = s.indexOf(`"${key}":[`);
  if (start < 0) return null;
  const from = start + key.length + 3;
  let depth = 0, inStr = false, j = from;
  for (; j < s.length; j++) {
    const c = s[j];
    if (inStr) { if (c === "\\") j++; else if (c === '"') inStr = false; }
    else if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") { if (--depth === 0) break; }
  }
  try { return JSON.parse(s.slice(from, j + 1)); } catch { return null; }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
type Obj = Record<string, unknown>;

export function parseEO(html: string, month: string): TopicRow[] | null {
  const parts = array(html, "parties") as Obj[] | null;
  if (!parts) return null;
  const rows: TopicRow[] = [];
  for (const p of parts) {
    ((p.sujets as Obj[]) ?? []).forEach((t, i) => {
      const body: Obj = {};
      const desc = str(t.description);
      if (desc && !desc.startsWith("$")) body.description = desc;
      if (str(t.question)) body.question = str(t.question);
      rows.push({ id: Number(t.id), month, part: Number(p.jour), part_id: Number(p.id), tache: Number(t.tache), position: i, title: str(t.title), body });
    });
  }
  return rows;
}

export function parseEE(html: string, month: string): TopicRow[] | null {
  const list = array(html, "combinaisons") as Obj[] | null;
  if (!list) return null;
  return list.map((c, i) => {
    const t3 = (c.tache3 ?? {}) as Obj;
    const doc = (d: unknown) => str(d && typeof d === "object" ? (d as Obj).contenu : d);
    const label = str(c.titre);
    return {
      id: Number(c.id), month, part: Number(label.match(/\d+/)?.[0] ?? i + 1), part_id: Number(c.id), tache: null, position: i,
      title: label,
      body: {
        tache1: str((c.tache1 as Obj | undefined)?.sujet), tache2: str((c.tache2 as Obj | undefined)?.sujet),
        tache3: { title: str(t3.titre), document1: doc(t3.document1), document2: doc(t3.document2) },
      },
    };
  });
}

async function sha256(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** write one month's rows; the month's topics no longer on the source get gone_at (kept: results point to them) */
export async function saveMonth(env: Env, section: Section, month: string, rows: TopicRow[], at = nowIso()) {
  const up = env.DB.prepare(
    `INSERT INTO topics (section, id, month, part, part_id, tache, position, title, body, first_seen, last_seen)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
     ON CONFLICT(section, id) DO UPDATE SET month = ?3, part = ?4, part_id = ?5, tache = ?6, position = ?7, title = ?8, body = ?9, last_seen = ?10, gone_at = NULL`);
  const stmts = rows.map((r) => up.bind(section, r.id, month, r.part, r.part_id, r.tache, r.position, r.title, JSON.stringify(r.body), at));
  stmts.push(env.DB.prepare("UPDATE topics SET gone_at = ?3 WHERE section = ?1 AND month = ?2 AND last_seen < ?3 AND gone_at IS NULL").bind(section, month, at));
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  await addWrites(env, rows.length);
}

export async function syncTopics(env: Env, fetcher: typeof fetch = fetch): Promise<JobResult> {
  const notes: string[] = [];
  let failed = false;
  for (const section of Object.keys(SECTIONS) as Section[]) {
    const path = `${BASE}/${SECTIONS[section]}/sujets-actualites`;
    let slugs: string[];
    try { slugs = monthSlugs(await get(path, fetcher)); } catch (e) { notes.push(`${section}: index unreadable (${(e as Error).message})`); failed = true; continue; }
    if (!slugs.length) { notes.push(`${section}: no month links (layout changed?)`); failed = true; continue; }
    const known = new Map(((await env.DB.prepare("SELECT slug, month, hash FROM topic_pages WHERE section = ?").bind(section).all()).results as { slug: string; month: string | null; hash: string | null }[]).map((r) => [r.slug, r]));
    const recent = new Set([...known.values()].map((r) => r.month).filter(Boolean).sort().slice(-3));
    const toRead = slugs.filter((s) => !known.has(s) || !known.get(s)!.month || recent.has(known.get(s)!.month));
    const changed: string[] = [];
    let rowsChanged = 0;
    for (const slug of toRead) {
      const at = nowIso();
      let html: string;
      try { html = await get(`${path}/${slug}`, fetcher); } catch (e) { notes.push(`${section} ${slug}: unreadable (${(e as Error).message})`); failed = true; continue; }
      const month = monthOf(html);
      const rows = month ? (section === "eo" ? parseEO(html, month) : parseEE(html, month)) : null;
      if (!month || !rows) { notes.push(`${section} ${slug}: nothing found (layout changed?)`); failed = true; continue; }
      const hash = await sha256(JSON.stringify(rows));
      if (known.get(slug)?.hash !== hash) {
        await saveMonth(env, section, month, rows, at);
        changed.push(month);
        rowsChanged += rows.length;
      }
      await env.DB.prepare("INSERT INTO topic_pages (section, slug, month, hash, last_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(section, slug) DO UPDATE SET month = ?3, hash = ?4, last_at = ?5")
        .bind(section, slug, month, hash, at).run();
    }
    const unit = section === "eo" ? "topics" : "combinaisons";
    if (!changed.length) notes.push(`${section}: ${toRead.length} pages read, no change`);
    else notes.push(`${section}: ${changed.length === 1 ? changed[0] : `${changed.length} months`} updated, ${rowsChanged} ${unit}`);
  }
  return { ok: !failed, detail: notes.join(" · ") };
}
