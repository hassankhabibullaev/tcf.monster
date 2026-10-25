// The admin's API (/api/admin/*): the people who registered and what they do, one person's page and actions, the
// reports on questions. Owner only once sign-in exists (ADMIN_OPEN = "0"); every request that changes something must
// carry the header x-admin: 1, which a page on another site cannot send without the browser asking first.
import { passedAccess, isOwnerEmail } from "./access.ts";
import { type Env, json, fail, nowIso, day, daysAgoIso, readJson } from "./util.ts";
import { currentUser } from "./auth.ts";
import { blockUser, unblockUser, parseSigns, scoreOf, SIGNS, ASK_AT, BLOCK_AT } from "./guard.ts";

type Row = Record<string, unknown>;
const all = async (env: Env, sql: string, ...args: unknown[]) => (await env.DB.prepare(sql).bind(...args).all()).results as Row[];
const one = async (env: Env, sql: string, ...args: unknown[]) => (await env.DB.prepare(sql).bind(...args).first()) as Row | null;
const num = (r: Row | null, k = "n") => Number(r?.[k] ?? 0);

/** is this request the owner's? While ADMIN_OPEN is "1", everyone is. */
export async function isOwner(env: Env, req: Request) {
  if (env.ADMIN_OPEN === "1") return true;
  const me = await currentUser(env, req);
  return !!me && isOwnerEmail(env, me.email) && (await passedAccess(env, req));
}

/** colours of one person's practice per section: { co: { ok, bad, amber }, ce: … } */
function colours(rows: Row[]) {
  const out: Record<string, { ok: number; bad: number; amber: number }> = {};
  for (const r of rows) {
    const c = (out[String(r.section)] ??= { ok: 0, bad: 0, amber: 0 });
    let blob: { q?: Record<string, unknown[]> } = {};
    try { blob = JSON.parse(String(r.data)); } catch { /* a broken row counts as empty */ }
    for (const v of Object.values(blob.q ?? {})) {
      // the app's state is { s: green | red | amber, t, a } (shared/progress.ts)
      const s = v && typeof v === "object" ? (v as { s?: string }).s : null;
      if (s === "green") c.ok++;
      else if (s === "red") c.bad++;
      else if (s === "amber") c.amber++;
    }
  }
  return out;
}

/** minutes the app's time zone is ahead of UTC, now */
function offsetMinutes(tz: string, at = new Date()) {
  const local = new Date(at.toLocaleString("en-US", { timeZone: tz }));
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((local.getTime() - utc.getTime()) / 60000);
}

/** the People page's top: sign-ups and activity, then sign-ups and active people per day over 30 days (local days) */
async function overview(env: Env) {
  const off = offsetMinutes(env.APP_TZ);
  const shift = `${off >= 0 ? "+" : ""}${off} minutes`;
  const today = day(env.APP_TZ);
  const todayStart = new Date(Date.parse(today + "T00:00:00Z") - off * 60000).toISOString();
  const d7 = daysAgoIso(7), d30 = daysAgoIso(30);
  const first = day(env.APP_TZ, new Date(Date.now() - 29 * 86400000));
  const [counts, work, disputesOpen, joined, active] = await Promise.all([
    one(env, `SELECT COUNT(*) people, SUM(created_at >= ?1) joinedToday, SUM(created_at >= ?2) joined7, SUM(created_at >= ?3) joined30,
      SUM(last_seen_at >= ?1) activeToday, SUM(last_seen_at >= ?2) active7, SUM(last_seen_at >= ?3) active30 FROM users`, todayStart, d7, d30),
    one(env, `SELECT (SELECT COALESCE(SUM(answered), 0) FROM practice_days WHERE day >= ?1) answered7,
      (SELECT COUNT(*) FROM attempts WHERE finished_at >= ?2) exams7,
      (SELECT COUNT(*) FROM expr_sessions WHERE status = 'done' AND finished_at >= ?2) expression7`, day(env.APP_TZ, new Date(Date.now() - 6 * 86400000)), d7),
    one(env, "SELECT COUNT(*) n FROM disputes WHERE status = 'open'"),
    all(env, "SELECT date(created_at, ?1) d, COUNT(*) n FROM users WHERE created_at >= ?2 GROUP BY d", shift, daysAgoIso(31)),
    // someone who practised, sat an exam or started a writing or speaking session that day
    all(env, `SELECT d, COUNT(DISTINCT u) n FROM (
        SELECT day d, user_id u FROM practice_days WHERE day >= ?1
        UNION ALL SELECT date(started_at, ?2), user_id FROM attempts WHERE started_at >= ?3
        UNION ALL SELECT date(started_at, ?2), user_id FROM expr_sessions WHERE started_at >= ?3)
      WHERE d >= ?1 GROUP BY d`, first, shift, daysAgoIso(31)),
  ]);
  const n = (k: string) => num(counts, k);
  return {
    people: n("people"), joinedToday: n("joinedToday"), joined7: n("joined7"), joined30: n("joined30"),
    activeToday: n("activeToday"), active7: n("active7"), active30: n("active30"),
    answered7: num(work, "answered7"), exams7: num(work, "exams7"), expression7: num(work, "expression7"),
    disputesOpen: num(disputesOpen),
    today, joined: joined.filter((r) => String(r.d) >= first), active,
  };
}

// each sort, then the newest sign-up first among equals
const PEOPLE_SORT: Record<string, string> = {
  seen: "u.last_seen_at IS NULL, u.last_seen_at DESC",
  joined: "u.created_at DESC",
  name: "coalesce(u.name, u.email) COLLATE NOCASE",
  email: "u.email",
  exam: "u.exam_date IS NULL, u.exam_date",
  practice: "answered DESC",
  exams: "exams DESC",
};

async function people(env: Env, url: URL) {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const filter = url.searchParams.get("filter") ?? "all";
  const sort = PEOPLE_SORT[url.searchParams.get("sort") ?? "seen"] ?? PEOPLE_SORT.seen;
  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
  const PAGE = 50;
  // every numbered argument is used once whatever the filter, so the four always bind
  const where = ["(?1 = '' OR u.email LIKE ?2 OR lower(coalesce(u.name, '')) LIKE ?2)", "?3 IS NOT NULL AND ?4 IS NOT NULL"];
  if (filter === "active") where.push("u.last_seen_at >= ?3");
  if (filter === "new") where.push("u.created_at >= ?3");
  if (filter === "exam") where.push("u.exam_date >= ?4");
  if (filter === "blocked") where.push("u.blocked_at IS NOT NULL");
  const w = where.join(" AND ");
  const args = [q, `%${q}%`, daysAgoIso(7), day(env.APP_TZ)];
  // one query for the page; the counts are read through each table's (user_id, …) index
  const rows = await all(env, `
    SELECT u.id, u.email, u.name, u.created_at, u.last_seen_at, u.target_nclc, u.exam_date, u.blocked_at,
      (SELECT COALESCE(SUM(answered), 0) FROM practice_days p WHERE p.user_id = u.id) answered,
      (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.finished_at IS NOT NULL) exams,
      (SELECT COUNT(*) FROM expr_sessions e WHERE e.user_id = u.id AND e.status = 'done') expression
    FROM users u WHERE ${w} ORDER BY ${sort}, u.created_at DESC LIMIT ${PAGE} OFFSET ${page * PAGE}`, ...args);
  const total = await one(env, `SELECT COUNT(*) n FROM users u WHERE ${w}`, ...args);
  return { rows, total: num(total), page, pageSize: PAGE };
}

async function person(env: Env, id: string) {
  const u = await one(env, `SELECT id, email, name, created_at, last_seen_at, target_nclc, exam_date, lang, settings, terms_version, terms_at,
    gemini_status, gemini_checked_at, gemini_error, note, password IS NOT NULL has_password, blocked_at, blocked_reason, human_until, human_needed_at, human_reason, human_fails, guard_signs FROM users WHERE id = ?`, id);
  if (!u) return null;
  const [devices, prog, att, expr, practice, today, reports, reads, events, use] = await Promise.all([
    all(env, "SELECT id, device, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC", id, nowIso()),
    all(env, "SELECT section, level, data FROM progress WHERE user_id = ?", id),
    all(env, "SELECT id, section, exam, mock_id, started_at, deadline_at, finished_at, ended, score, nclc, right_count, wrong_count, blank_count FROM attempts WHERE user_id = ? ORDER BY started_at DESC LIMIT 200", id),
    all(env, "SELECT id, section, kind, replace(replace(taches, '[', ''), ']', '') taches, mode, mock_id, started_at, finished_at, status ended, score, nclc, seconds FROM expr_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 200", id),
    all(env, "SELECT day, section, level, answered, wrong, seconds, last_at FROM practice_days WHERE user_id = ? ORDER BY last_at DESC LIMIT 200", id),
    one(env, "SELECT SUM(answered) n FROM practice_days WHERE user_id = ? AND day = ?", id, day(env.APP_TZ)),
    all(env, "SELECT id, section, level, n, message, status, created_at FROM disputes WHERE user_id = ? ORDER BY id DESC LIMIT 100", id),
    // question-bank files opened, today and over seven days (the guard's counts)
    all(env, "SELECT kind, SUM(day = ?2) today, COUNT(DISTINCT key) week FROM bank_reads WHERE user_id = ?1 AND day >= ?3 GROUP BY kind",
      id, day(env.APP_TZ), day(env.APP_TZ, new Date(Date.now() - 6 * 86_400_000))),
    // what the abuse guard did (worker/guard.ts): checks asked, passed, failed, blocks, unblocks — 90 days
    all(env, "SELECT at, kind, detail FROM guard_events WHERE user_id = ? ORDER BY at DESC LIMIT 100", id),
    // requests and changes counted today (written in groups of 25: a light day shows nothing)
    one(env, "SELECT requests, writes FROM usage WHERE user_id = ? AND day = ?", id, day(env.APP_TZ)),
  ]);
  const bank = { data: { today: 0, week: 0 } } as Record<string, { today: number; week: number }>;
  for (const r of reads) if (bank[String(r.kind)]) bank[String(r.kind)] = { today: num(r, "today"), week: num(r, "week") };
  let settings = {};
  try { settings = JSON.parse(String(u.settings)); } catch { /* keep {} */ }
  // the signs of a machine seen in the last seven days and the score they make (worker/guard.ts)
  const seen = parseSigns(u.guard_signs as string | null);
  const signs = (Object.keys(seen) as (keyof typeof SIGNS)[]).map((k) => ({ sign: k, label: SIGNS[k].label, weight: SIGNS[k].weight, at: seen[k] }));
  const { guard_signs: _signs, ...user } = u;
  return { user: { ...user, settings, has_password: Boolean(u.has_password) }, devices, colours: colours(prog), attempts: att, expression: expr, practice, answeredToday: num(today), disputes: reports, bank, guard: { events, today: { requests: num(use, "requests"), writes: num(use, "writes") }, score: scoreOf(seen), askAt: ASK_AT, blockAt: BLOCK_AT, signs } };
}

/** what the owner can do to one person; each one confirmed in the page first */
async function act(env: Env, id: string, action: string, body: Row | null) {
  const exists = await one(env, "SELECT id FROM users WHERE id = ?", id);
  if (!exists) return fail(404, "no such person");
  const d = env.DB;
  if (action === "signout") {
    const r = await d.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
    return json({ ok: true, removed: r.meta.changes ?? 0 });
  }
  if (action === "reset-progress") {
    const section = String(body?.section ?? "all");
    if (!["all", "co", "ce", "ee", "eo"].includes(section)) return fail(400, "bad section");
    const s = section === "all" ? "" : " AND section = ?2";
    const bind = (sql: string) => (section === "all" ? d.prepare(sql).bind(id) : d.prepare(sql).bind(id, section));
    const stmts = [];
    if (section === "all" || section === "co" || section === "ce") {
      stmts.push(bind(`DELETE FROM progress WHERE user_id = ?1${s}`), bind(`DELETE FROM practice_days WHERE user_id = ?1${s}`), bind(`DELETE FROM attempts WHERE user_id = ?1${s}`));
    }
    if (section === "all" || section === "ee" || section === "eo") {
      stmts.push(bind(`DELETE FROM expr_tasks WHERE session_id IN (SELECT id FROM expr_sessions WHERE user_id = ?1${s})`), bind(`DELETE FROM expr_sessions WHERE user_id = ?1${s}`));
    }
    if (section === "all") stmts.push(d.prepare("DELETE FROM mocks WHERE user_id = ?").bind(id));
    await d.batch(stmts);
    return json({ ok: true });
  }
  if (action === "delete") {
    // everything that belongs to the person, then the person (no reliance on cascades)
    await d.batch([d.prepare("DELETE FROM expr_tasks WHERE session_id IN (SELECT id FROM expr_sessions WHERE user_id = ?)").bind(id)]
      .concat(["sessions", "progress", "practice_days", "attempts", "expr_sessions", "user_kv", "mocks", "disputes", "starts", "bank_reads", "usage", "guard_events"].map((t) => d.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(id)))
      .concat(d.prepare("DELETE FROM codes WHERE email = (SELECT email FROM users WHERE id = ?)").bind(id), d.prepare("DELETE FROM mail WHERE email = (SELECT email FROM users WHERE id = ?)").bind(id), d.prepare("DELETE FROM users WHERE id = ?").bind(id)));
    return json({ ok: true });
  }
  if (action === "block") {
    // the owner's own account never: with ADMIN_OPEN "0" nobody could unblock it
    const self = await one(env, "SELECT 1 n FROM users WHERE id = ? AND lower(email) = lower(?)", id, env.OWNER_EMAIL ?? "");
    if (self) return fail(400, "the owner cannot be blocked");
    await blockUser(env, id, "by the owner");
    return json({ ok: true });
  }
  if (action === "unblock") {
    await unblockUser(env, id);
    return json({ ok: true });
  }
  if (action === "note") {
    const note = String(body?.note ?? "").slice(0, 2000);
    await d.prepare("UPDATE users SET note = ? WHERE id = ?").bind(note || null, id).run();
    return json({ ok: true });
  }
  return fail(404, "no such action");
}

/** the reports people sent on practice questions, newest first (status: open · resolved · all) */
async function disputes(env: Env, url: URL) {
  const status = url.searchParams.get("status") ?? "open";
  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
  const PAGE = 50;
  const w = status === "open" || status === "resolved" ? "d.status = ?1" : "?1 = ?1";
  const rows = await all(env, `SELECT d.id, d.user_id, u.email, u.name, d.section, d.level, d.question_id, d.n, d.message, d.status, d.created_at, d.resolved_at, d.note
    FROM disputes d LEFT JOIN users u ON u.id = d.user_id WHERE ${w} ORDER BY d.id DESC LIMIT ${PAGE} OFFSET ${page * PAGE}`, status);
  const counts = await all(env, "SELECT status s, COUNT(*) n FROM disputes GROUP BY status");
  const c = Object.fromEntries(counts.map((r) => [r.s, Number(r.n)]));
  return { rows, page, pageSize: PAGE, open: c.open ?? 0, resolved: c.resolved ?? 0 };
}

/** one report with the person who sent it and how many reports they sent in all */
async function dispute(env: Env, id: number) {
  return one(env, `SELECT d.id, d.user_id, u.email, u.name, u.created_at user_created_at, u.last_seen_at, d.section, d.level, d.question_id, d.n,
      d.message, d.status, d.created_at, d.resolved_at, d.note, (SELECT COUNT(*) FROM disputes x WHERE x.user_id = d.user_id) reports
    FROM disputes d LEFT JOIN users u ON u.id = d.user_id WHERE d.id = ?`, id);
}

/** done (with the owner's optional note) or open again */
async function settle(env: Env, id: number, action: string, body: Row | null) {
  if (action !== "resolve" && action !== "reopen") return fail(404, "no such action");
  const note = String(body?.note ?? "").trim().slice(0, 2000) || null;
  const r = action === "resolve"
    ? await env.DB.prepare("UPDATE disputes SET status = 'resolved', resolved_at = ?, note = ? WHERE id = ?").bind(nowIso(), note, id).run()
    : await env.DB.prepare("UPDATE disputes SET status = 'open', resolved_at = NULL WHERE id = ?").bind(id).run();
  return r.meta.changes ? json({ ok: true }) : fail(404, "no such dispute");
}

export async function handleAdmin(req: Request, env: Env, url: URL): Promise<Response> {
  if (!(await isOwner(env, req))) return fail(403, "owner only");
  const p = url.pathname.slice("/api/admin".length);
  const write = req.method === "POST";
  if (write && req.headers.get("x-admin") !== "1") return fail(403, "missing x-admin header");
  if (!write && req.method !== "GET") return fail(405, "GET or POST");

  if (!write && p === "/overview") return json(await overview(env));
  if (!write && p === "/people") return json(await people(env, url));
  let m = p.match(/^\/people\/([\w-]+)$/);
  if (!write && m) { const r = await person(env, m[1]); return r ? json(r) : fail(404, "no such person"); }
  m = p.match(/^\/people\/([\w-]+)\/([\w-]+)$/);
  if (write && m) return act(env, m[1], m[2], await readJson<Row>(req));
  if (!write && p === "/disputes") return json(await disputes(env, url));
  m = p.match(/^\/disputes\/(\d+)$/);
  if (!write && m) { const r = await dispute(env, Number(m[1])); return r ? json(r) : fail(404, "no such dispute"); }
  m = p.match(/^\/disputes\/(\d+)\/(\w+)$/);
  if (write && m) return settle(env, Number(m[1]), m[2], await readJson<Row>(req));
  return fail(404, "not found");
}
