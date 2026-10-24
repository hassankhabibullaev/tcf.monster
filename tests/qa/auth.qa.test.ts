// Sign-in, the way a real person and an attacker hit it: locks, dead codes, odd spellings of an e-mail, huge inputs,
// the cookie's flags on every host, other devices, a cookie whose person is gone, one address hammering the codes.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setup, teardown, PW, PW2, APP, type QA, type Row } from "./helpers.ts";

let qa: QA;
beforeEach(() => { qa = setup(); });
afterEach(teardown);

describe("passwords and locks", () => {
  it("ten wrong passwords lock for 15 minutes with the time; the right one is refused meanwhile; the lock lifts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
    await qa.signUp("a@b.com");
    for (let i = 0; i < 9; i++) expect((await qa.call("/api/auth/login", { body: { email: "a@b.com", password: PW2 } })).data).toEqual({ error: "wrong" });
    const locked = await qa.call("/api/auth/login", { body: { email: "a@b.com", password: PW2 } });
    expect(locked.status).toBe(429);
    expect(locked.data.error).toBe("locked");
    expect(Date.parse(locked.data.until) - Date.now()).toBe(15 * 60000);
    expect((await qa.call("/api/auth/login", { body: { email: "a@b.com", password: PW } })).status).toBe(429);
    vi.setSystemTime(new Date("2026-10-18T10:15:01Z"));
    expect((await qa.call("/api/auth/login", { body: { email: "a@b.com", password: PW } })).status).toBe(200);
    expect((qa.raw.prepare("SELECT failed_logins f, locked_until l FROM users").get() as Row)).toEqual({ f: 0, l: null });
  });

  it("a password shorter than the stretched shape, a missing one, an array body, a string body: 400, never 500", async () => {
    await qa.signUp("a@b.com");
    for (const body of [{ email: "a@b.com", password: "short" }, { email: "a@b.com" }, { email: "a@b.com", password: "A".repeat(44) }, [], "x", null, 42])
      expect((await qa.call("/api/auth/login", { body })).status, JSON.stringify(body)).toBe(400);
    expect((await qa.call("/api/auth/login", { raw: "{not json", headers: { "content-type": "application/json" } })).status).toBe(400);
  });

  it("a sign-up with an e-mail that already has an account becomes a password change, and the old password dies", async () => {
    const c1 = await qa.signUp("a@b.com");
    const c2 = await qa.signUp("a@b.com", PW2);
    expect(qa.count("SELECT COUNT(*) n FROM users")).toBe(1);
    expect((await qa.call("/api/me", { cookie: c1 })).status).toBe(401);
    expect((await qa.call("/api/me", { cookie: c2 })).status).toBe(200);
    expect((await qa.call("/api/auth/login", { body: { email: "a@b.com", password: PW } })).status).toBe(400);
  });
});

describe("codes", () => {
  it("a code is dead after five wrong tries, after ten minutes, and a proof dies with its code", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
    await qa.call("/api/auth/code", { body: { email: "a@b.com" } });
    const code = qa.lastCode(), wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) {
      const r = await qa.call("/api/auth/verify", { body: { email: "a@b.com", code: wrong } });
      expect(r.status).toBe(400);
      expect(r.data).toEqual({ error: "wrong", left: 4 - i });
    }
    expect((await qa.call("/api/auth/verify", { body: { email: "a@b.com", code: wrong } })).data.error).toBe("expired");
    expect((await qa.call("/api/auth/verify", { body: { email: "a@b.com", code } })).data.error).toBe("expired");
    // a fresh code, verified, then left for eleven minutes: the proof is no good
    vi.setSystemTime(new Date("2026-10-18T10:01:00Z"));
    await qa.call("/api/auth/code", { body: { email: "a@b.com" } });
    const v = await qa.call("/api/auth/verify", { body: { email: "a@b.com", code: qa.lastCode() } });
    expect(v.status).toBe(200);
    vi.setSystemTime(new Date("2026-10-18T10:12:00Z"));
    expect((await qa.call("/api/auth/password", { body: { email: "a@b.com", proof: v.data.proof, password: PW, terms: true } })).data.error).toBe("expired");
    expect(qa.count("SELECT COUNT(*) n FROM users")).toBe(0);
  });

  it("a second code inside 30 s says how long to wait; the first code still works", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
    await qa.call("/api/auth/code", { body: { email: "a@b.com" } });
    const first = qa.lastCode();
    vi.setSystemTime(new Date("2026-10-18T10:00:12Z"));
    const again = await qa.call("/api/auth/code", { body: { email: "a@b.com" } });
    expect(again.status).toBe(429);
    expect(again.data).toEqual({ error: "wait", wait: 18 });
    expect(qa.mails.length).toBe(1);
    expect((await qa.call("/api/auth/verify", { body: { email: "a@b.com", code: first } })).status).toBe(200);
  });

  it("the wrong code of a wrong kind: a delete code never verifies an e-mail, a verify code never deletes", async () => {
    const c = await qa.signUp("a@b.com");
    await qa.call("/api/me/delete/code", { body: {}, cookie: c });
    const del = qa.lastCode();
    expect((await qa.call("/api/auth/verify", { body: { email: "a@b.com", code: del } })).data.error).toBe("expired");
    await qa.call("/api/auth/code", { body: { email: "a@b.com" } });
    const mail = qa.lastCode();
    if (mail !== del) expect((await qa.call("/api/me/delete", { body: { code: mail }, cookie: c })).data.error).toBe("wrong");
    expect(qa.count("SELECT COUNT(*) n FROM users")).toBe(1);
  });

  it("terms not accepted (false, 'yes', 1, missing) never creates an account", async () => {
    for (const terms of [false, "yes", 1, undefined]) {
      await qa.call("/api/auth/code", { body: { email: "a@b.com" } });
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + 31_000);
      const v = await qa.call("/api/auth/verify", { body: { email: "a@b.com", code: qa.lastCode() } });
      const r = await qa.call("/api/auth/password", { body: { email: "a@b.com", proof: v.data.proof, password: PW, terms } });
      expect(r.status, String(terms)).toBe(400);
      expect(r.data.error).toBe("terms");
    }
    expect(qa.count("SELECT COUNT(*) n FROM users")).toBe(0);
  });
});

describe("the e-mail as people type it", () => {
  it("'  A@B.com ' and 'a@b.com' are one account, in every route", async () => {
    await qa.call("/api/auth/code", { body: { email: "  A@B.com " } });
    expect(qa.mails[0].to).toBe("a@b.com");
    const v = await qa.call("/api/auth/verify", { body: { email: "a@B.COM", code: qa.lastCode() } });
    expect(v.status).toBe(200);
    const p = await qa.call("/api/auth/password", { body: { email: "A@b.com\n", proof: v.data.proof, password: PW, terms: true } });
    expect(p.status).toBe(200);
    expect((qa.raw.prepare("SELECT email FROM users").get() as Row).email).toBe("a@b.com");
    expect((await qa.call("/api/auth/login", { body: { email: "\tA@B.COM ", password: PW } })).status).toBe(200);
    expect(qa.count("SELECT COUNT(*) n FROM users")).toBe(1);
  });

  it("very long or odd e-mails are refused before any e-mail is sent", async () => {
    for (const email of ["a".repeat(195) + "@b.com", "a b@c.com", "a@b", "@b.com", "a@", "", 42, null, { x: 1 }, "a@b.com".repeat(40)]) {
      const r = await qa.call("/api/auth/code", { body: { email } });
      expect(r.status, JSON.stringify(email)).toBe(400);
      expect(r.data).toEqual({ error: "email" });
    }
    expect(qa.mails.length).toBe(0);
    expect(qa.count("SELECT COUNT(*) n FROM codes")).toBe(0);
  });

  it("a 2 MB body is refused as not ours, without reading it as JSON", async () => {
    const r = await qa.call("/api/auth/code", { raw: JSON.stringify({ email: "a@b.com", pad: "x".repeat(2 * 1024 * 1024) }), headers: { "content-type": "application/json" } });
    expect(r.status).toBe(400);
    expect(qa.mails.length).toBe(0);
  });
});

describe("the cookie", () => {
  it("on tcf.monster: HttpOnly, Secure, SameSite=Lax, Domain=tcf.monster, Path=/, 30 days; on this Mac: no Domain, no Secure", async () => {
    const live = await qa.call("/api/auth/code", { body: { email: "a@b.com" } });
    expect(live.status).toBe(200);
    const v = await qa.call("/api/auth/verify", { body: { email: "a@b.com", code: qa.lastCode() } });
    const p = await qa.call("/api/auth/password", { body: { email: "a@b.com", proof: v.data.proof, password: PW, terms: true } });
    const parts = p.setCookie.split(";").map((s) => s.trim());
    expect(parts[0]).toMatch(/^tcfm_session=[A-Za-z0-9_-]{43}$/);
    expect(parts).toEqual(expect.arrayContaining(["Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=2592000", "Domain=tcf.monster", "Secure"]));
    // the same person signing in from the local preview (http, app.localhost): a cookie the browser will keep
    const r = await (await import("../../worker/index.ts")).default.fetch(new Request("http://app.localhost:3204/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "http://app.localhost:3204" }, body: JSON.stringify({ email: "a@b.com", password: PW }) }), qa.env);
    expect(r.status).toBe(200);
    const local = (r.headers.get("set-cookie") ?? "").split(";").map((s) => s.trim());
    expect(local).not.toContain("Secure");
    expect(local.some((x) => x.startsWith("Domain="))).toBe(false);
    expect(local).toEqual(expect.arrayContaining(["HttpOnly", "SameSite=Lax", "Path=/"]));
  });

  it("sign out everywhere ends the other devices at once; a deleted person's cookie is dead", async () => {
    const a = await qa.signUp("a@b.com");
    const b = (await qa.call("/api/auth/login", { body: { email: "a@b.com", password: PW } })).cookie;
    const c = (await qa.call("/api/auth/login", { body: { email: "a@b.com", password: PW } })).cookie;
    expect(qa.count("SELECT COUNT(*) n FROM sessions")).toBe(3);
    const out = await qa.call("/api/me/signout-all", { body: {}, cookie: b });
    expect(out.status).toBe(200);
    expect(out.setCookie).toMatch(/Max-Age=0/);
    for (const k of [a, b, c]) expect((await qa.call("/api/me", { cookie: k })).status).toBe(401);
    expect(qa.count("SELECT COUNT(*) n FROM sessions")).toBe(0);
    // the person is removed from the database (admin delete, or a restore): their cookies open nothing
    const d = await qa.signUp("d@b.com");
    expect((await qa.call("/api/me", { cookie: d })).status).toBe(200);
    qa.raw.prepare("DELETE FROM users WHERE email = 'd@b.com'").run();
    for (const path of ["/api/me", "/api/progress?section=co", "/api/attempts/running", "/api/me/stats"])
      expect((await qa.call(path, { cookie: d })).status, path).toBe(401);
    expect((await qa.call("/api/sync", { body: { events: [] }, cookie: d })).status).toBe(401);
    // and a made-up cookie, or an empty one
    expect((await qa.call("/api/me", { cookie: "tcfm_session=" + "x".repeat(43) })).status).toBe(401);
    expect((await qa.call("/api/me", { cookie: "tcfm_session=" })).status).toBe(401);
  });

  it("a change from another site is refused on every writing method, with or without a cookie", async () => {
    const c = await qa.signUp("a@b.com");
    expect((await qa.call("/api/me", { body: { name: "X" }, cookie: c, origin: "https://evil.example" })).status).toBe(403);
    expect((await qa.call("/api/me/signout-all", { body: {}, cookie: c, origin: "https://tcf.monster.evil.example" })).status).toBe(403);
    expect((await qa.call("/api/attempts/1", { method: "PATCH", body: { answers: {} }, cookie: c, origin: "https://evil.example" })).status).toBe(403);
    expect((await qa.call("/api/expr/session/abc", { method: "DELETE", cookie: c, origin: "https://evil.example" })).status).toBe(403);
    expect((await qa.call("/api/auth/logout", { body: {}, cookie: c, origin: "null" })).status).toBe(403);
    expect(qa.count("SELECT COUNT(*) n FROM sessions")).toBe(1);
    // no Origin at all (an older browser, a keepalive beacon): accepted, the cookie's SameSite does the rest
    expect((await qa.call("/api/me", { body: { name: "Y" }, cookie: c, origin: null })).status).toBe(200);
  });
});

describe("one address hammering", () => {
  it("exists: 10 a minute from one address like the codes; then 429; another address goes on", async () => {
    for (let i = 0; i < 10; i++) expect((await qa.call("/api/auth/exists", { body: { email: `p${i}@b.com` }, ip: "203.0.113.20" })).status).toBe(200);
    const r = await qa.call("/api/auth/exists", { body: { email: "p99@b.com" }, ip: "203.0.113.20" });
    expect(r.status).toBe(429);
    expect(r.data).toEqual({ error: "too_many" });
    expect((await qa.call("/api/auth/exists", { body: { email: "p99@b.com" }, ip: "203.0.113.21" })).data).toEqual({ exists: false });
  });

  it("sign-in by code counts as a password guess: 30 a minute from one address, then 429", async () => {
    await qa.signUp("a@b.com", PW, { ip: "198.51.100.5" });
    for (let i = 0; i < 30; i++) expect((await qa.call("/api/auth/signin-code", { body: { email: "a@b.com", code: "000000" }, ip: "198.51.100.6" })).status).toBe(400);
    expect((await qa.call("/api/auth/signin-code", { body: { email: "a@b.com", code: "000000" }, ip: "198.51.100.6" })).status).toBe(429);
  });

  it("codes: 10 a minute from one address, whatever the e-mails; then 429 and no e-mail", async () => {
    for (let i = 0; i < 10; i++) expect((await qa.call("/api/auth/code", { body: { email: `p${i}@b.com` }, ip: "203.0.113.9" })).status).toBe(200);
    const r = await qa.call("/api/auth/code", { body: { email: "p99@b.com" }, ip: "203.0.113.9" });
    expect(r.status).toBe(429);
    expect(r.data).toEqual({ error: "too_many" });
    expect(qa.mails.length).toBe(10);
    expect((await qa.call("/api/auth/code", { body: { email: "p99@b.com" }, ip: "203.0.113.10" })).status).toBe(200);
  });

  it("passwords: 30 guesses a minute from one address across accounts, then 429; the lock per account is untouched", async () => {
    await qa.signUp("a@b.com", PW, { ip: "198.51.100.1" });
    await qa.signUp("b@b.com", PW, { ip: "198.51.100.1" });
    // 30 guesses spread over 30 accounts (one per account, so no account lock gets in the way)
    for (let i = 0; i < 30; i++) expect((await qa.call("/api/auth/login", { body: { email: i === 0 ? "a@b.com" : `n${i}@b.com`, password: PW2 }, ip: "198.51.100.2" })).status).toBe(400);
    const r = await qa.call("/api/auth/login", { body: { email: "b@b.com", password: PW }, ip: "198.51.100.2" });
    expect(r.status).toBe(429);
    expect(r.data.error).toBe("too_many");
    expect((qa.raw.prepare("SELECT failed_logins f FROM users WHERE email = 'b@b.com'").get() as Row).f).toBe(0);
    expect((await qa.call("/api/auth/login", { body: { email: "b@b.com", password: PW }, ip: "198.51.100.3" })).status).toBe(200);
  });
});

describe("methods and unknown routes", () => {
  it("GET on an auth route is 405, an unknown auth route 404, both JSON with no cache and no echo", async () => {
    const g = await qa.call("/api/auth/login");
    expect(g.status).toBe(405);
    const u = await qa.call("/api/auth/whatever<script>", { body: {} });
    expect(u.status).toBe(404);
    for (const r of [g, u]) {
      expect(r.headers.get("content-type")).toContain("application/json");
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(r.headers.get("x-robots-tag")).toBe("noindex");
      expect(r.text).not.toContain("script");
    }
    expect((await qa.call("/api/auth/login", { host: "admin.tcf.monster", body: { email: "a@b.com", password: PW } })).status).toBe(404);
    expect(APP).toBe("tcf.monster");
  });
});
