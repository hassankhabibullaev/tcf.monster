// The real Worker on a real SQLite: the admin API (people, disputes), the topics sync (against a pretend source site), backups, cleanup.
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../worker/index.ts";
import { makeEnv } from "../scripts/local-env.ts";
import { demoSql } from "./fixtures/people.ts";
import { syncTopics, monthOf, parseEO, parseEE } from "../worker/topics.ts";
import { runJob } from "../worker/jobs.ts";
import type { Env } from "../worker/util.ts";

type Row = Record<string, any>;
let env: Env, raw: ReturnType<typeof makeEnv>["raw"], r2: ReturnType<typeof makeEnv>["r2"];

beforeEach(() => {
  const e = makeEnv();
  env = e.env as unknown as Env; raw = e.raw; r2 = e.r2;
});

const call = async (path: string, o: { method?: string; body?: unknown; headers?: Record<string, string>; host?: string } = {}) => {
  const method = o.method ?? (o.body !== undefined ? "POST" : "GET");
  const r = await worker.fetch(new Request(`https://${o.host ?? "admin.tcf.monster"}${path}`, {
    method,
    headers: { ...(method === "POST" ? { "x-admin": "1", "content-type": "application/json" } : {}), ...o.headers },
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
  }), env);
  const data: any = r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text();
  return { status: r.status, data, headers: r.headers };
};
const count = (sql: string, ...a: unknown[]) => Number((raw.prepare(sql).get(...(a as never[])) as Row).n);

describe("admin API", () => {
  beforeEach(() => raw.exec(demoSql()));

  it("overview counts sign-ups and activity, with 30 days of sign-ups and active people", async () => {
    const { status, data } = await call("/api/admin/overview");
    expect(status).toBe(200);
    expect(data).toMatchObject({ people: 6, joined7: 2, joined30: 6, disputesOpen: 0 });
    expect(data.active7).toBe(count("SELECT COUNT(*) n FROM users WHERE last_seen_at >= ?", new Date(Date.now() - 7 * 86400000).toISOString()));
    expect(data.exams7).toBe(count("SELECT COUNT(*) n FROM attempts WHERE finished_at >= ?", new Date(Date.now() - 7 * 86400000).toISOString()));
    expect(data.joined.reduce((n: number, r: Row) => n + r.n, 0)).toBe(6);
    expect(data.active.length).toBeGreaterThan(0);
    const first = new Date(Date.parse(data.today) - 29 * 86400000).toISOString().slice(0, 10);
    for (const r of [...data.joined, ...data.active]) expect(r.d >= first && r.d <= data.today, r.d).toBe(true);
  });

  it("people: search, filters, sort and pages", async () => {
    expect((await call("/api/admin/people")).data.total).toBe(6);
    expect((await call("/api/admin/people?q=SOF")).data.rows.map((r: Row) => r.name)).toEqual(["Sofia"]);
    expect((await call("/api/admin/people?filter=new")).data.rows.map((r: Row) => r.name).sort()).toEqual(["Lin", "Olena"]);
    const byEmail = (await call("/api/admin/people?sort=email")).data.rows.map((r: Row) => r.email);
    expect(byEmail).toEqual([...byEmail].sort());
    const byName = (await call("/api/admin/people?sort=name")).data.rows.map((r: Row) => r.name);
    expect(byName).toEqual([...byName].sort());
    const byPractice = (await call("/api/admin/people?sort=practice")).data.rows.map((r: Row) => r.answered);
    expect(byPractice).toEqual([...byPractice].sort((a, b) => b - a));
    const a = (await call("/api/admin/people?q=amina")).data.rows[0];
    expect(a.exams).toBe(count("SELECT COUNT(*) n FROM attempts WHERE user_id = 'demo-1' AND finished_at IS NOT NULL"));
    expect(a.answered).toBe(count("SELECT SUM(answered) n FROM practice_days WHERE user_id = 'demo-1'"));
    expect(a.expression).toBe(count("SELECT COUNT(*) n FROM expr_sessions WHERE user_id = 'demo-1' AND status = 'done'"));
    // a search for a quote or a percent sign is just text
    expect((await call("/api/admin/people?q=%27%25")).data.total).toBe(0);
  });

  it("a person: profile without secrets, colours from the progress rows, attempts and devices", async () => {
    raw.prepare("UPDATE users SET password = 'pbkdf2-sha256$1$salt$secret-hash' WHERE id = 'demo-1'").run();
    const { data } = await call("/api/admin/people/demo-1");
    expect(data.user.email).toBe("amina@demo.tcf.monster");
    expect(JSON.stringify(data)).not.toContain("secret-hash");
    expect(data.user.password).toBeUndefined();
    expect(data.user.has_password).toBe(true);
    const blobs = raw.prepare("SELECT data FROM progress WHERE user_id = 'demo-1' AND section = 'co'").all() as Row[];
    const ok = blobs.flatMap((b) => Object.values(JSON.parse(b.data).q)).filter((v: any) => v.s === "green").length;
    expect(data.colours.co.ok).toBe(ok);
    expect(data.devices.length).toBe(2);
    expect(data.attempts.length).toBe(count("SELECT COUNT(*) n FROM attempts WHERE user_id = 'demo-1'"));
    expect(data.disputes).toEqual([]);
    expect((await call("/api/admin/people/nobody")).status).toBe(404);
  });

  it("disputes as tickets: the list, one report with its sender, done with a note, reopened", async () => {
    const add = raw.prepare("INSERT INTO disputes (user_id, section, level, question_id, n, message, created_at) VALUES (?, 'co', 'B2', 'q-1', ?, ?, ?)");
    add.run("demo-1", 4, "La réponse B est juste", "2026-10-20T10:00:00Z");
    add.run("demo-1", 9, "Audio coupé", "2026-10-21T10:00:00Z");
    add.run("demo-2", 2, "Faute de frappe", "2026-10-22T10:00:00Z");
    const list = (await call("/api/admin/disputes")).data;
    expect(list.rows.map((r: Row) => r.message)).toEqual(["Faute de frappe", "Audio coupé", "La réponse B est juste"]);
    expect([list.open, list.resolved]).toEqual([3, 0]);
    expect((await call("/api/admin/overview")).data.disputesOpen).toBe(3);

    const one = (await call("/api/admin/disputes/2")).data;
    expect(one).toMatchObject({ id: 2, n: 9, email: "amina@demo.tcf.monster", name: "Amina", reports: 2, status: "open", note: null });
    expect((await call("/api/admin/people/demo-1")).data.disputes.map((r: Row) => r.id)).toEqual([2, 1]);

    expect((await call("/api/admin/disputes/2/resolve", { body: { note: "  audio replaced  " } })).status).toBe(200);
    expect((await call("/api/admin/disputes/2")).data).toMatchObject({ status: "resolved", note: "audio replaced" });
    expect((await call("/api/admin/disputes?status=resolved")).data.rows.map((r: Row) => r.id)).toEqual([2]);
    expect((await call("/api/admin/disputes?status=open")).data.rows.map((r: Row) => r.id)).toEqual([3, 1]);
    expect((await call("/api/admin/disputes?status=all")).data.rows.length).toBe(3);

    await call("/api/admin/disputes/2/reopen", { body: {} });
    expect((await call("/api/admin/disputes/2")).data).toMatchObject({ status: "open", resolved_at: null });
    expect((await call("/api/admin/disputes/99")).status).toBe(404);
    expect((await call("/api/admin/disputes/99/resolve", { body: {} })).status).toBe(404);
    expect((await call("/api/admin/disputes/2/delete", { body: {} })).status).toBe(404);
  });

  it("the old Content and Jobs routes are gone", async () => {
    for (const p of ["/api/admin/content", "/api/admin/topics", "/api/admin/jobs"]) expect((await call(p)).status, p).toBe(404);
    for (const p of ["/api/admin/hide", "/api/admin/jobs/backup/run", "/api/admin/mail/test"]) expect((await call(p, { body: {} })).status, p).toBe(404);
  });

  it("actions: sign out everywhere, reset one section, note, delete (a key lives in the person's browser: none to remove)", async () => {
    expect((await call("/api/admin/people/demo-1/signout", { body: {} })).data.removed).toBe(2);
    expect(count("SELECT COUNT(*) n FROM sessions WHERE user_id = 'demo-1'")).toBe(0);

    expect((await call("/api/admin/people/demo-1/remove-key", { body: {} })).status).not.toBe(200);

    const ceBefore = count("SELECT COUNT(*) n FROM attempts WHERE user_id = 'demo-1' AND section = 'ce'");
    await call("/api/admin/people/demo-1/reset-progress", { body: { section: "co" } });
    expect(count("SELECT COUNT(*) n FROM progress WHERE user_id = 'demo-1' AND section = 'co'")).toBe(0);
    expect(count("SELECT COUNT(*) n FROM attempts WHERE user_id = 'demo-1' AND section = 'co'")).toBe(0);
    expect(count("SELECT COUNT(*) n FROM attempts WHERE user_id = 'demo-1' AND section = 'ce'")).toBe(ceBefore);
    expect((await call("/api/admin/people/demo-1/reset-progress", { body: { section: "xx" } })).status).toBe(400);

    await call("/api/admin/people/demo-1/note", { body: { note: "asked about C1" } });
    expect((await call("/api/admin/people/demo-1")).data.user.note).toBe("asked about C1");

    await call("/api/admin/people/demo-1/delete", { body: {} });
    for (const t of ["users", "sessions", "progress", "practice_days", "attempts", "expr_sessions", "mocks"])
      expect(count(`SELECT COUNT(*) n FROM ${t} WHERE ${t === "users" ? "id" : "user_id"} = 'demo-1'`)).toBe(0);
    expect(count("SELECT COUNT(*) n FROM users")).toBe(5);
  });

  it("changes need the x-admin header; other methods are refused", async () => {
    const r = await worker.fetch(new Request("https://admin.tcf.monster/api/admin/people/demo-1/delete", { method: "POST" }), env);
    expect(r.status).toBe(403);
    expect(count("SELECT COUNT(*) n FROM users WHERE id = 'demo-1'")).toBe(1);
    expect((await call("/api/admin/overview", { method: "DELETE" })).status).toBe(405);
  });

  it("once ADMIN_OPEN is 0, only the owner's live session gets in", async () => {
    (env as Row).ADMIN_OPEN = "0";
    expect((await call("/api/admin/overview")).status).toBe(403);
    const hash = async (t: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
    raw.prepare("INSERT INTO users (id, email, created_at) VALUES ('owner', 'owner@example.com', 'x')").run();
    raw.prepare("INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at) VALUES (?, 'owner', 'x', 'x', '2999-01-01')").run(await hash("tok-owner"));
    raw.prepare("INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at) VALUES (?, 'demo-1', 'x', 'x', '2999-01-01')").run(await hash("tok-amina"));
    raw.prepare("INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at) VALUES (?, 'owner', 'x', 'x', '2000-01-01')").run(await hash("tok-old"));
    expect((await call("/api/admin/overview", { headers: { cookie: "tcfm_session=tok-owner" } })).status).toBe(200);
    expect((await call("/api/admin/overview", { headers: { cookie: "tcfm_session=tok-amina" } })).status).toBe(403);
    expect((await call("/api/admin/overview", { headers: { cookie: "tcfm_session=tok-old" } })).status).toBe(403);
  });

  it("pages: any admin address gets the admin page, any app address the app page, with strict headers", async () => {
    (env as Row).ASSETS = { fetch: async (r: Request) => new Response(`asset ${new URL(r.url).pathname}`) };
    const page = await call("/people/demo-1");
    expect(page.data).toBe("asset /admin/");
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(page.headers.get("x-robots-tag")).toBe("noindex");
    expect((await call("/assets/admin-1.js")).data).toBe("asset /assets/admin-1.js");
    expect((await call("/profile", { host: "tcf.monster" })).data).toBe("asset /app/");
    expect((await call("/api/admin/overview", { host: "tcf.monster" })).status).toBe(404);
  });
});

// a pretend formation-tcfcanada.com: index pages listing month addresses, month pages with the data in script strings
function site(pages: Record<string, string>) {
  const hits: string[] = [];
  const fetcher = (async (url: string) => {
    hits.push(url);
    const body = pages[url];
    return body === undefined ? new Response("no", { status: 404 }) : new Response(body);
  }) as unknown as typeof fetch;
  return { fetcher, hits };
}
const B = "https://www.formation-tcfcanada.com/epreuve";
const esc = (o: unknown) => JSON.stringify(o).replaceAll('"', '\\"');
const index = (slugs: string[]) => slugs.map((s) => `<a href="/epreuve/x/sujets-actualites/${s}">`).join("") + `<a href="/epreuve/x/sujets-actualites/favoris">`;
const eoPage = (title: string, parties: unknown[]) => `<title>Sujets Expression Orale TCF Canada - ${title}</title><script>self.__next_f.push([1,"${esc({ parties })}"])</script>`;
const eePage = (title: string, combinaisons: unknown[]) => `<title>Sujets Expression Écrite TCF Canada - ${title}</title><script>self.__next_f.push([1,"${esc({ combinaisons })}"])</script>`;
const partie = (id: number, jour: number, topics: [number, number, string][]) => ({ id, jour, date: "x", sujets: topics.map(([tid, tache, title]) => ({ id: tid, tache, title, description: "$undefined", correction: "MODEL ANSWER" })) });
const combi = (id: number, n: number) => ({ id, titre: `Combinaison ${n}`, tache1: { sujet: "Écrivez à Alex.", correction: "MODEL" }, tache2: { sujet: "Racontez." }, tache3: { titre: "Pour ou contre ?", document1: { contenu: "Doc 1" }, document2: "Doc 2" } });

describe("topics sync", () => {
  it("parses months, Parties and Combinaisons, and never keeps the model answers", () => {
    expect(monthOf("<title>Sujets - Août 2026</title>")).toBe("2026-08");
    const eo = parseEO(eoPage("Octobre 2026", [partie(1, 3, [[11, 2, "Posez-moi des questions."], [12, 3, "Qu’en pensez-vous ?"]])]), "2026-10")!;
    expect(eo).toEqual([
      { id: 11, month: "2026-10", part: 3, part_id: 1, tache: 2, position: 0, title: "Posez-moi des questions.", body: {} },
      { id: 12, month: "2026-10", part: 3, part_id: 1, tache: 3, position: 1, title: "Qu’en pensez-vous ?", body: {} },
    ]);
    const ee = parseEE(eePage("Octobre 2026", [combi(7, 4)]), "2026-10")!;
    expect(ee[0]).toMatchObject({ id: 7, part: 4, tache: null, title: "Combinaison 4", body: { tache1: "Écrivez à Alex.", tache3: { title: "Pour ou contre ?", document1: "Doc 1", document2: "Doc 2" } } });
    expect(JSON.stringify([eo, ee])).not.toContain("MODEL");
  });

  it("first run reads every month; later runs read new addresses and the three newest months only; a vanished topic is kept as gone", async () => {
    const months = ["mai-2026", "juin-2026", "juillet-2026", "aot-2026"];
    const titles = ["Mai 2026", "Juin 2026", "Juillet 2026", "Août 2026"];
    const pages: Record<string, string> = {
      [`${B}/expression-orale/sujets-actualites`]: index(months),
      [`${B}/expression-ecrite/sujets-actualites`]: index(["aot-2026"]),
      [`${B}/expression-ecrite/sujets-actualites/aot-2026`]: eePage("Août 2026", [combi(70, 1), combi(71, 2)]),
    };
    months.forEach((m, i) => { pages[`${B}/expression-orale/sujets-actualites/${m}`] = eoPage(titles[i], [partie(100 + i, 1, [[1000 + i * 10, 2, `T2 ${m}`], [1001 + i * 10, 3, `T3 ${m}`]])]); });
    let s = site(pages);
    const first = await syncTopics(env, s.fetcher);
    expect(first.ok).toBe(true);
    expect(count("SELECT COUNT(*) n FROM topics WHERE section = 'eo'")).toBe(8);
    expect(count("SELECT COUNT(*) n FROM topics WHERE section = 'ee'")).toBe(2);
    expect(s.hits.length).toBe(2 + 4 + 1);

    // nothing changed: the oldest month is not read again, and no topic row is written
    const writes = count("SELECT COALESCE(SUM(writes), 0) n FROM budget");
    s = site(pages);
    const second = await syncTopics(env, s.fetcher);
    expect(second.detail).toContain("no change");
    expect(s.hits).not.toContain(`${B}/expression-orale/sujets-actualites/mai-2026`);
    expect(count("SELECT COALESCE(SUM(writes), 0) n FROM budget")).toBe(writes);

    // a new month appears and one August topic disappears from the source
    pages[`${B}/expression-orale/sujets-actualites`] = index([...months, "septembre-2026"]);
    pages[`${B}/expression-orale/sujets-actualites/septembre-2026`] = eoPage("Septembre 2026", [partie(200, 1, [[2000, 2, "Nouveau"]])]);
    pages[`${B}/expression-orale/sujets-actualites/aot-2026`] = eoPage("Août 2026", [partie(103, 1, [[1030, 2, "T2 aot-2026"]])]);
    s = site(pages);
    await syncTopics(env, s.fetcher);
    expect(count("SELECT COUNT(*) n FROM topics WHERE id = 2000")).toBe(1);
    expect(raw.prepare("SELECT gone_at FROM topics WHERE id = 1031").get()).not.toEqual({ gone_at: null });
    expect(raw.prepare("SELECT gone_at FROM topics WHERE id = 1030").get()).toEqual({ gone_at: null });
  });

  it("a broken source is a failed run, recorded, with nothing lost", async () => {
    raw.prepare("INSERT INTO topics (section, id, month, part, part_id, tache, position, title, first_seen, last_seen) VALUES ('eo', 5, '2026-10', 1, 9, 2, 0, 'Gardé', 'x', 'x')").run();
    const s = site({ [`${B}/expression-orale/sujets-actualites`]: "<html>new layout</html>" });
    const r = await syncTopics(env, s.fetcher);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("eo: no month links");
    expect(r.detail).toContain("ee: index unreadable");
    expect(count("SELECT COUNT(*) n FROM topics")).toBe(1);
  });
});

describe("jobs", () => {
  it("backup copies every table people produce, in pages, and keeps 3 nights (Time Travel covers 7 days)", async () => {
    raw.exec(demoSql());
    for (let d = 1; d <= 31; d++) await r2.put(`backups/2026-01-${String(d).padStart(2, "0")}/users-0000.json`, "[]");
    const r = await runJob(env, "backup");
    expect(r.ok).toBe(true);
    const keys = [...r2.mem.keys()];
    const today = keys.find((k) => k.includes("/users-0000.json") && !k.startsWith("backups/2026-01"))!;
    expect(JSON.parse(r2.mem.get(today)!).length).toBe(6);
    expect(keys.some((k) => k.includes("/progress-0000.json"))).toBe(true);
    expect(keys.some((k) => k.includes("/sessions-"))).toBe(false); // sign-in cookies are never backed up
    expect(keys.some((k) => k.includes("/expr_sessions-"))).toBe(true);
    const days = new Set(keys.map((k) => k.split("/")[1]));
    expect(days.size).toBe(3);
    expect(days.has("2026-01-29")).toBe(false); // tonight's copy and the two before it
    expect(days.has("2026-01-30") && days.has("2026-01-31")).toBe(true);
    expect(keys.some((k) => k.includes("/topics-"))).toBe(false); // fetched again by the weekly sync
    expect(raw.prepare("SELECT name, ok FROM jobs").get()).toEqual({ name: "backup", ok: 1 });
    expect(count("SELECT COUNT(*) n FROM job_log")).toBe(1);
  });

  it("cleanup removes expired sign-ins and codes only", async () => {
    raw.exec(demoSql());
    raw.prepare("INSERT INTO codes (email, purpose, code_hash, created_at, expires_at) VALUES ('a@b.c', 'signup', 'h', 'x', '2000-01-01'), ('d@e.f', 'signup', 'h', 'x', '2999-01-01')").run();
    raw.prepare("UPDATE sessions SET expires_at = '2000-01-01' WHERE id = 'demo-s-0-1'").run();
    const before = count("SELECT COUNT(*) n FROM sessions");
    const r = await runJob(env, "cleanup");
    expect(r.detail).toMatch(/^1 sign-ins and 1 codes expired/);
    expect(count("SELECT COUNT(*) n FROM sessions")).toBe(before - 1);
    expect(count("SELECT COUNT(*) n FROM codes")).toBe(1);
  });

  it("a job that throws is a recorded failure, not a crash", async () => {
    (env as Row).FILES = { put: async () => { throw new Error("bucket unavailable"); }, list: async () => ({ delimitedPrefixes: [] }) };
    const r = await runJob(env, "backup");
    expect(r).toEqual({ ok: false, detail: "bucket unavailable" });
    expect(raw.prepare("SELECT ok, detail FROM jobs WHERE name = 'backup'").get()).toEqual({ ok: 0, detail: "bucket unavailable" });
  });

});
