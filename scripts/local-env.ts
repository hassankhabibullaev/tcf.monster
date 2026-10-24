// The Worker's surroundings on this Mac: a real SQLite (Node's own) behind the D1 interface, with the project's
// migrations; a folder or memory behind the R2 interface; the built pages behind ASSETS. Used by the tests and by
// scripts/dev.mjs, so both run the real Worker code.
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, statSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type Row = Record<string, unknown>;

export function makeD1(file = ":memory:") {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  // the migrations not yet applied, in order (the same list wrangler keeps on Cloudflare)
  db.exec("CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)");
  const done = new Set((db.prepare("SELECT name FROM _local_migrations").all() as Row[]).map((r) => r.name));
  if ((db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'users'").get() as Row).n) done.add("0001_init.sql"); // a database made before this list existed
  for (const f of readdirSync(join(ROOT, "migrations")).filter((x: string) => x.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    db.exec(readFileSync(join(ROOT, "migrations", f), "utf8"));
    db.prepare("INSERT OR IGNORE INTO _local_migrations (name) VALUES (?)").run(f);
  }
  const exec = (sql: string, args: unknown[]) => {
    const st = db.prepare(sql);
    const vals = args.map((a) => (typeof a === "boolean" ? Number(a) : a === undefined ? null : a)) as never[];
    if (/^\s*(select|with)/i.test(sql)) return { results: (st.all(...vals) as Row[]).map((r) => ({ ...r })), success: true, meta: { changes: 0 } };
    // a write that hands its rows back (INSERT/UPDATE/DELETE … RETURNING), as D1 does
    if (/\breturning\b/i.test(sql)) { const rows = (st.all(...vals) as Row[]).map((r) => ({ ...r })); return { results: rows, success: true, meta: { changes: rows.length } }; }
    const r = st.run(...vals);
    return { results: [] as Row[], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  type Stmt = { sql: string; args: unknown[]; bind: (...a: unknown[]) => Stmt; all: () => Promise<ReturnType<typeof exec>>; first: () => Promise<Row | null>; run: () => Promise<ReturnType<typeof exec>> };
  const stmt = (sql: string, args: unknown[] = []): Stmt => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    all: async () => exec(sql, args),
    first: async () => exec(sql, args).results[0] ?? null,
    run: async () => exec(sql, args),
  });
  const d1 = {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: Stmt[]) => {
      db.exec("BEGIN");
      try { const out = list.map((s) => exec(s.sql, s.args)); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
  return { d1, raw: db };
}

/** R2 in memory, or in a folder when one is given */
export function makeR2(folder?: string) {
  const mem = new Map<string, string>();
  const path = (k: string) => join(folder!, k);
  const keys = () => {
    if (!folder) return [...mem.keys()];
    const out: string[] = [];
    const walk = (d: string, pre: string) => { if (!existsSync(d)) return; for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p, pre + f + "/"); else out.push(pre + f); } };
    walk(folder, "");
    return out;
  };
  return {
    mem,
    put: async (k: string, v: string) => { if (folder) { mkdirSync(dirname(path(k)), { recursive: true }); writeFileSync(path(k), v); } else mem.set(k, v); },
    // bytes, with ranges, like R2: `body` is a stream; `text()` stays for the backups
    get: async (k: string, opts?: { range?: { offset?: number; length?: number; suffix?: number } }) => {
      const raw = folder ? (existsSync(path(k)) ? readFileSync(path(k)) : null) : mem.has(k) ? Buffer.from(mem.get(k)!) : null;
      if (raw == null) return null;
      const r = opts?.range;
      const offset = r ? (r.suffix != null ? Math.max(0, raw.length - r.suffix) : r.offset ?? 0) : 0;
      const length = r ? (r.suffix != null ? Math.min(r.suffix, raw.length) : r.length ?? raw.length - offset) : raw.length;
      const slice = raw.subarray(offset, offset + length);
      return { text: async () => raw.toString("utf8"), arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength), body: new Blob([slice]).stream(), size: raw.length, range: r, httpEtag: `"${raw.length}"`, httpMetadata: {} as Record<string, string> };
    },
    head: async (k: string) => { const exists = folder ? existsSync(path(k)) : mem.has(k); if (!exists) return null; const size = folder ? statSync(path(k)).size : Buffer.byteLength(mem.get(k)!); return { size, httpEtag: `"${size}"`, httpMetadata: {} as Record<string, string> }; },
    delete: async (k: string) => { if (folder) rmSync(path(k), { force: true }); else mem.delete(k); },
    list: async ({ prefix = "", delimiter }: { prefix?: string; delimiter?: string }) => {
      const all = keys().filter((k) => k.startsWith(prefix)).sort();
      if (!delimiter) return { objects: all.map((key) => ({ key })), delimitedPrefixes: [] };
      const pre = new Set<string>(), objects: { key: string }[] = [];
      for (const k of all) { const i = k.indexOf(delimiter, prefix.length); if (i >= 0) pre.add(k.slice(0, i + 1)); else objects.push({ key: k }); }
      return { objects, delimitedPrefixes: [...pre] };
    },
  };
}

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon" };

/** the built pages (dist/), answered the way Cloudflare's asset server does for this project */
export function makeAssets(dir = join(ROOT, "dist")) {
  return {
    fetch: async (input: Request | string) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      let p = join(dir, decodeURIComponent(url.pathname));
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
      if (!existsSync(p) && existsSync(p + ".html")) p += ".html"; // /site/terms → terms.html, as Cloudflare does
      if (!existsSync(p)) return new Response("not found", { status: 404 });
      return new Response(readFileSync(p), { headers: { "content-type": TYPES[extname(p)] ?? "application/octet-stream" } });
    },
  };
}

export function makeEnv(o: { db?: string; files?: string; assets?: string } = {}) {
  const { d1, raw } = makeD1(o.db);
  const r2 = makeR2(o.files);
  const env = {
    DB: d1, FILES: r2, ASSETS: makeAssets(o.assets),
    APP_TZ: "Asia/Tashkent", OWNER_EMAIL: "owner@example.com", ADMIN_OPEN: "1", MAIL_FROM: "tcf.monster <test@example.com>", WRITES_FLUSH_EVERY: "1", LOCAL_DEV: "1",
  } as Record<string, unknown>;
  return { env, raw, r2 };
}
