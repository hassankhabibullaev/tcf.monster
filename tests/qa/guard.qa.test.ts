// The abuse guard (worker/guard.ts, worker/coce/guard.ts) through the real door: the bank for signed-in people only;
// no quota for a person; a pace or a daily volume no person reaches asks the human check (Turnstile), a pass holds,
// and going on regardless (or failing the check) blocks the account until the owner unblocks it. Every step is noted
// for the admin.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setup, teardown, PW, ADMIN, type QA, type Row } from "./helpers.ts";
import { GUARD, HUMAN_FAILS } from "../../worker/guard.ts";
import { day } from "../../worker/util.ts";

let qa: QA;
let cookie = "";
beforeEach(async () => {
  qa = setup({ OWNER_EMAIL: "owner@tcf.monster", ADMIN_OPEN: "0" });
  (qa.env as Row).ASSETS = { fetch: async (r: Request) => new Response(`[${JSON.stringify(new URL(r.url).pathname)}]`, { headers: { "content-type": "application/json", etag: '"e1"' } }) };
  cookie = await qa.signUp("student@example.com");
});
afterEach(teardown);

/** Cloudflare's shared counter, counting for ever (a test lasts less than its minute) */
const limiter = (n: number) => { const m = new Map<string, number>(); return { limit: async ({ key }: { key: string }) => { const c = (m.get(key) ?? 0) + 1; m.set(key, c); return { success: c <= n }; } }; };
/** Turnstile switched on, with a pretend siteverify: "good" passes as action "human" on tcf.monster, "down" is
 *  Cloudflare out of reach, anything else fails */
function turnstile() {
  Object.assign(qa.env, { TURNSTILE_SITEKEY: "site-key", TURNSTILE_SECRET: "secret" });
  const prev = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes("turnstile/v0/siteverify")) return prev(input, init);
    const token = new URLSearchParams(String(init?.body)).get("response");
    if (token === "down") return new Response("busy", { status: 503 });
    return new Response(JSON.stringify(token === "good" ? { success: true, action: "human", hostname: "tcf.monster" } : { success: false }), { status: 200 });
  });
}
/** blocked the way the guard blocks: the mark, and no session left */
const blockStudent = () => {
  qa.raw.prepare("UPDATE users SET blocked_at = '2026-10-24T00:00:00Z' WHERE email = ?").run("student@example.com");
  qa.raw.prepare("DELETE FROM sessions").run();
};
const reads = () => qa.count("SELECT COUNT(*) n FROM bank_reads");
const student = () => qa.raw.prepare("SELECT blocked_at, blocked_reason, human_until, human_fails FROM users WHERE email = ?").get("student@example.com") as Row;
const exam = (n: number) => `/data/exam-co-${String(n).padStart(2, "0")}.json`;

describe("who may read the bank", () => {
  it("signed out: every bank file answers 401, nothing is read", async () => {
    for (const p of ["/data/bank.json", "/data/co-A1.json", "/data/exam-ce-07.json"]) {
      const r = await qa.call(p);
      expect(r.status, p).toBe(401);
      expect(r.text, p).not.toContain("/data/");
    }
  });

  it("signed in: the files, kept an hour by the browser alone; names the export does not write are 404", async () => {
    const d = await qa.call("/data/co-A1.json", { cookie });
    expect(d.status).toBe(200);
    expect(d.data).toEqual(["/data/co-A1.json"]);
    expect(d.headers.get("cache-control")).toBe("private, max-age=3600");
    for (const p of ["/data/users.json", "/data/co-Z9.json", "/data/exam-co-1.json", "/data/co-A1.json.bak", "/data/co-A1.json/x"]) expect((await qa.call(p, { cookie })).status, p).toBe(404);
  });

  it("other spellings of the bank's folders are never files: encoded, doubled slashes, capitals", async () => {
    for (const p of ["/%64ata/co-A1.json", "/data%2Fco-A1.json", "/%2564ata/co-A1.json", "//data/co-A1.json", "/DATA/co-A1.json", "/Data/co-A1.json", "/%6Dedia/co/a1.mp3", "/media%2Fco%2Fa1.mp3", "//media/co/a1.mp3", "/data", "/%64ata"]) {
      for (const c of ["", cookie]) {
        const r = await qa.call(p, { cookie: c });
        expect(r.status, p).toBeGreaterThanOrEqual(400);
        expect(r.text, p).not.toContain("/data/co-A1.json");
      }
    }
  });

  it("the answer keys and the content summary never reach a person; the summary reaches the owner on the admin", async () => {
    for (const p of ["/data/key-co.json", "/data/key-ce.json", "/data/summary.json"]) expect((await qa.call(p, { cookie })).status, p).toBe(404);
    const owner = await qa.signUp("owner@tcf.monster");
    expect((await qa.call("/data/summary.json", { host: ADMIN, cookie: owner })).status).toBe(200);
    expect((await qa.call("/data/key-co.json", { host: ADMIN, cookie: owner })).status).toBe(404);
    expect((await qa.call("/data/co-A1.json", { host: ADMIN, cookie })).status).toBe(403);
    expect((await qa.call("/data/co-A1.json", { host: ADMIN, cookie: owner })).status).toBe(200);
  });
});

const events = () => (qa.raw.prepare("SELECT kind FROM guard_events WHERE user_id = ? ORDER BY at").all(qa.userId("student@example.com")) as Row[]).map((r) => r.kind);
/** the bank's different files today, as if opened (the next one opened is counted after them) */
const opened = (n: number) => { const id = qa.userId("student@example.com"); for (let i = 0; i < n; i++) qa.raw.prepare("INSERT INTO bank_reads (user_id, day, kind, key) VALUES (?, ?, 'data', ?)").run(id, day(qa.env.APP_TZ), `/x/${i}`); };

describe("no quota: a person studying hard is never stopped", () => {
  it("a file opened again the same day is not counted again; the whole practice bank and twenty exams in a day pass", async () => {
    await qa.call("/data/co-A1.json", { cookie });
    await qa.call("/data/co-A1.json", { cookie });
    expect(reads()).toBe(1);
    for (let n = 1; n <= 20; n++) expect((await qa.call(exam(n), { cookie })).status, String(n)).toBe(200);
    expect(student().blocked_at).toBeNull();
  });

  it("past the day's write hold line nothing is noted, and the files still come", async () => {
    qa.raw.prepare("INSERT INTO budget (day, writes) VALUES (?, 50000)").run(day(qa.env.APP_TZ));
    expect((await qa.call("/data/co-A1.json", { cookie })).status).toBe(200);
    expect(reads()).toBe(0);
  });
});

describe("far more of the bank than anyone studies", () => {
  it(`past ${GUARD.day.bank.soft} different files in a day: the human check (noted); a pass, then on`, async () => {
    turnstile();
    opened(GUARD.day.bank.soft);
    const r = await qa.call(exam(1), { cookie });
    expect([r.status, r.data]).toEqual([429, { error: "human", turnstile: "site-key" }]);
    expect(events()).toEqual(["challenged"]);
    // anything else waits for the answer too
    expect((await qa.call("/api/me", { cookie })).status).toBe(429);
    expect((await qa.call(exam(1), { cookie, headers: { "x-turnstile": "good" } })).status).toBe(200);
    expect(events()).toEqual(["challenged", "passed"]);
    expect((await qa.call(exam(2), { cookie })).status).toBe(200);
  });

  it(`past ${GUARD.day.bank.hard} in a day: blocked, signed out everywhere, sign-in refused, with whom to write to`, async () => {
    opened(GUARD.day.bank.hard);
    const r = await qa.call(exam(1), { cookie });
    expect([r.status, r.data]).toEqual([403, { error: "blocked", contact: "https://t.me/tcfmonsteradmin" }]);
    expect(student().blocked_reason).toBe(`more than ${GUARD.day.bank.hard} question-bank files in a day`);
    expect(qa.count("SELECT COUNT(*) n FROM sessions")).toBe(0);
    expect((await qa.call("/api/auth/login", { body: { email: "student@example.com", password: PW } })).data).toEqual({ error: "blocked" });
    expect(events()).toEqual(["blocked"]);
  });
});

describe("pace: faster than a person", () => {
  it("past the pace line: the human check; a failed answer asks again; a pass holds, the next requests come without it", async () => {
    turnstile();
    (qa.env as Row).USER_PACE = limiter(3);
    for (let i = 0; i < 3; i++) expect((await qa.call("/api/me", { cookie })).status).toBe(200);
    expect((await qa.call("/api/me", { cookie })).data).toEqual({ error: "human", turnstile: "site-key" });
    expect((await qa.call("/api/me", { cookie, headers: { "x-turnstile": "bad" } })).status).toBe(429);
    expect(student().human_fails).toBe(1);
    // Cloudflare out of reach is not the person's failure
    expect((await qa.call("/api/me", { cookie, headers: { "x-turnstile": "down" } })).status).toBe(429);
    expect(student().human_fails).toBe(1);
    expect((await qa.call("/api/me", { cookie, headers: { "x-turnstile": "good" } })).status).toBe(200);
    expect(Date.parse(student().human_until)).toBeGreaterThan(Date.now() + 40 * 60_000);
    expect((await qa.call("/api/me", { cookie })).status).toBe(200);
    expect(events()).toEqual(["challenged", "failed", "passed"]);
  });

  it("one token brought by many requests at once (a page loading): one pass, no failure counted for the others", async () => {
    turnstile();
    (qa.env as Row).USER_PACE = limiter(0);
    await qa.call("/api/me", { cookie });
    // Cloudflare accepts a token once: the first check passes, any later check of it is refused
    let used = false;
    const prev = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes("siteverify")) return prev(input, init);
      const first = !used; used = true;
      return new Response(JSON.stringify(first ? { success: true, action: "human", hostname: "tcf.monster" } : { success: false }), { status: 200 });
    });
    const all = await Promise.all(Array.from({ length: 6 }, () => qa.call("/api/me", { cookie, headers: { "x-turnstile": "good" } })));
    expect(all.every((r) => r.status === 200)).toBe(true);
    expect(student().human_fails).toBe(0);
    expect(student().blocked_at).toBeNull();
  });

  it(`${HUMAN_FAILS} failed checks: blocked`, async () => {
    turnstile();
    (qa.env as Row).USER_PACE = limiter(0);
    await qa.call("/api/me", { cookie });
    for (let i = 0; i < HUMAN_FAILS; i++) await qa.call("/api/me", { cookie, headers: { "x-turnstile": "bad" } });
    expect(student().blocked_reason).toBe(`${HUMAN_FAILS} failed human checks`);
  });

  it("still far faster after passing the check: blocked", async () => {
    turnstile();
    (qa.env as Row).USER_PACE = limiter(0);
    (qa.env as Row).USER_BURST = limiter(2);
    await qa.call("/api/me", { cookie });
    expect((await qa.call("/api/me", { cookie, headers: { "x-turnstile": "good" } })).status).toBe(200);
    const r = await qa.call("/api/me", { cookie });
    expect(r.status).toBe(403);
    expect(student().blocked_reason).toBe("requests far faster than a person, after the human check");
  });

  it("without Turnstile configured (this Mac) the pace line asks nothing", async () => {
    (qa.env as Row).USER_PACE = limiter(0);
    expect((await qa.call("/api/me", { cookie })).status).toBe(200);
  });

  it("the owner is never paced, counted or blocked", async () => {
    const owner = await qa.signUp("owner@tcf.monster");
    turnstile();
    (qa.env as Row).USER_PACE = limiter(0);
    (qa.env as Row).USER_BURST = limiter(0);
    for (let i = 0; i < 5; i++) { const r = await qa.call("/data/co-A1.json", { cookie: owner }); expect(r.status, r.text).toBe(200); }
    expect(qa.count("SELECT COUNT(*) n FROM bank_reads")).toBe(0);
  });
});

describe("the day's volume", () => {
  const usage = (requests: number, writes = 0) => qa.raw.prepare("INSERT INTO usage (user_id, day, requests, writes) VALUES (?, ?, ?, ?)").run(qa.userId("student@example.com"), day(qa.env.APP_TZ), requests, writes);
  it(`past ${GUARD.day.requests.soft} requests: the check once; past ${GUARD.day.requests.hard}: blocked`, async () => {
    turnstile();
    usage(GUARD.day.requests.soft);
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await qa.call("/api/me", { cookie })).status;
    expect(last).toBe(429);
    expect((await qa.call("/api/me", { cookie, headers: { "x-turnstile": "good" } })).status).toBe(200);
    qa.raw.prepare("UPDATE usage SET requests = ?").run(GUARD.day.requests.hard);
    const seen = new Set<number>();
    for (let i = 0; i < 25; i++) seen.add((await qa.call("/api/me", { cookie })).status);
    expect(seen.has(403)).toBe(true); // the request that crossed the line; after it the session is gone (401)
    expect(student().blocked_reason).toBe(`more than ${GUARD.day.requests.hard} requests in a day`);
  });
  it("a light day writes no counter at all (counted in memory, written in groups of 25)", async () => {
    for (let i = 0; i < 10; i++) await qa.call("/api/me", { cookie });
    expect(qa.count("SELECT COUNT(*) n FROM usage")).toBe(0);
  });
});

describe("blocked accounts and the owner", () => {
  it("a blocked account cannot sign in by a code", async () => {
    blockStudent();
    await qa.call("/api/auth/code", { body: { email: "student@example.com", lang: "fr", why: "signin" } });
    expect((await qa.call("/api/auth/signin-code", { body: { email: "student@example.com", code: qa.lastCode() } })).data).toEqual({ error: "blocked" });
    expect(qa.count("SELECT COUNT(*) n FROM sessions")).toBe(0);
  });

  it("a blocked account cannot set a new password after a code", async () => {
    blockStudent();
    await qa.call("/api/auth/code", { body: { email: "student@example.com", lang: "fr", why: "reset" } });
    const v = await qa.call("/api/auth/verify", { body: { email: "student@example.com", code: qa.lastCode() } });
    expect(v.data.proof).toBeTruthy();
    expect((await qa.call("/api/auth/password", { body: { email: "student@example.com", proof: v.data.proof, password: PW, lang: "fr" } })).data).toEqual({ error: "blocked" });
    expect(qa.count("SELECT COUNT(*) n FROM sessions")).toBe(0);
  });

  it("the admin's person page shows the block and the counts; Unblock lets the person in again from zero", async () => {
    const owner = await qa.signUp("owner@tcf.monster");
    const id = qa.userId("student@example.com");
    await qa.call("/data/co-A1.json", { cookie });
    let p = await qa.call(`/api/admin/people/${id}`, { host: ADMIN, cookie: owner });
    expect(p.data.bank.data).toEqual({ today: 1, week: 1 });
    expect(p.data.guard.events).toEqual([]);
    expect((await qa.call(`/api/admin/people/${id}/block`, { host: ADMIN, cookie: owner, body: {} })).status).toBe(200);
    p = await qa.call(`/api/admin/people/${id}`, { host: ADMIN, cookie: owner });
    expect(p.data.user.blocked_reason).toBe("by the owner");
    expect(p.data.guard.events.map((e: Row) => e.kind)).toEqual(["blocked"]);
    expect((await qa.call("/api/admin/people?filter=blocked", { host: ADMIN, cookie: owner })).data.rows.map((r: Row) => r.id)).toEqual([id]);
    expect((await qa.call("/api/auth/login", { body: { email: "student@example.com", password: PW } })).data).toEqual({ error: "blocked" });
    qa.raw.prepare("UPDATE users SET human_fails = 3 WHERE id = ?").run(id);
    expect((await qa.call(`/api/admin/people/${id}/unblock`, { host: ADMIN, cookie: owner, body: {} })).status).toBe(200);
    expect(reads()).toBe(0);
    expect(student().human_fails).toBe(0);
    const back = await qa.call("/api/auth/login", { body: { email: "student@example.com", password: PW } });
    expect(back.status).toBe(200);
    expect((await qa.call("/data/co-A1.json", { cookie: back.cookie })).status).toBe(200);
  });

  it("the owner's own account cannot be blocked", async () => {
    const owner = await qa.signUp("owner@tcf.monster");
    const r = await qa.call(`/api/admin/people/${qa.userId("owner@tcf.monster")}/block`, { host: ADMIN, cookie: owner, body: {} });
    expect(r.status).toBe(400);
    expect((await qa.call("/api/me", { cookie: owner })).status).toBe(200);
  });

  it("a person who is not the owner cannot block or unblock", async () => {
    const id = qa.userId("student@example.com");
    expect((await qa.call(`/api/admin/people/${id}/unblock`, { host: ADMIN, cookie, body: {} })).status).toBe(403);
  });
});
