// The outer doors: donations through the real Worker, the headers every API answer carries, what an error body may
// say, and the admin door from the wrong host or the wrong person.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setup, teardown, type QA, type Row } from "./helpers.ts";

let qa: QA;
beforeEach(() => { qa = setup(); });
afterEach(teardown);

describe("donations through the door", () => {
  it("from the public site: ok with CORS; from an unknown origin: 403 without CORS; the preflight; GET: 405", async () => {
    const ok = await qa.call("/api/donate", { body: { amount: 5, kind: "once" }, origin: "https://tcf.monster", ip: "1.1.1.1" });
    expect(ok.status).toBe(200);
    expect(ok.data.url).toContain("ko-fi.com");
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://tcf.monster");
    expect(ok.headers.get("x-robots-tag")).toBe("noindex");
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const bad = await qa.call("/api/donate", { body: { amount: 5, kind: "once" }, origin: "https://evil.example", ip: "1.1.1.2" });
    expect(bad.status).toBe(403);
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    expect(bad.headers.get("vary")).toBe("origin");
    const pre = await qa.call("/api/donate", { method: "OPTIONS", origin: "https://tcf.monster", headers: { "access-control-request-method": "POST" } });
    expect(pre.status).toBe(204);
    expect((await qa.call("/api/donate")).status).toBe(405);
    expect((await qa.call("/api/donate", { method: "PUT", body: {} })).status).toBe(405);
  });

  it("the 11th request in a minute from one address is 429; a 2 MB body is refused without reaching Stripe", async () => {
    for (let i = 0; i < 10; i++) expect((await qa.call("/api/donate", { body: { amount: 5, kind: "once" }, ip: "9.9.9.9" })).status).toBe(200);
    expect((await qa.call("/api/donate", { body: { amount: 5, kind: "once" }, ip: "9.9.9.9" })).status).toBe(429);
    expect((await qa.call("/api/donate", { body: { amount: 5, kind: "once" }, ip: "9.9.9.8" })).status).toBe(200);
    let stripe = 0;
    qa.stripe.handler = () => { stripe++; return new Response(JSON.stringify({ url: "https://checkout.stripe.com/x" }), { status: 200 }); };
    (qa.env as Row).STRIPE_SECRET_KEY = "rk_test";
    const big = await qa.call("/api/donate", { raw: JSON.stringify({ amount: 5, kind: "once", pad: "x".repeat(2 * 1024 * 1024) }), headers: { "content-type": "application/json" }, ip: "9.9.9.7" });
    expect(big.status).toBe(400);
    expect(stripe).toBe(0);
    // Stripe down: 502, the body says nothing about the key or the amount
    qa.stripe.handler = () => new Response("Internal Server Error", { status: 500 });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const down = await qa.call("/api/donate", { body: { amount: 123, kind: "once" }, ip: "9.9.9.6" });
    expect(down.status).toBe(502);
    expect(down.data).toEqual({ error: "payment unavailable" });
    expect(down.text).not.toContain("rk_test");
    expect(down.text).not.toContain("123");
    err.mockRestore();
    // every shape of bad input is 400 with a fixed reason, never an echo
    for (const body of [{ amount: "<b>5</b>", kind: "once" }, { amount: 5, kind: "<script>" }, { amount: 5, kind: "once", currency: "<x>" }, [], "x", null, 1e9]) {
      const r = await qa.call("/api/donate", { body, ip: "9.9.9.5" });
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.text).not.toMatch(/[<>]/);
    }
  });
});

describe("headers on every API answer", () => {
  it("x-robots-tag, no-store, JSON content-type, the security headers — on successes, refusals and the 500 path", async () => {
    const c = await qa.signUp("a@b.com");
    const answers = [
      await qa.call("/api/me", { cookie: c }),
      await qa.call("/api/me"),
      await qa.call("/api/nothing"),
      await qa.call("/api/auth/login"),
      await qa.call("/api/attempts/abc", { cookie: c }),
      await qa.call("/api/progress", { cookie: c }),
      await qa.call("/api/expr/start", { body: {}, cookie: c }),
      await qa.call("/api/admin/overview", { host: "admin.tcf.monster" }),
      await qa.call("/api/admin/overview"),
      await qa.call("/api/donate", { body: {}, ip: "2.2.2.2" }),
    ];
    for (const r of answers) {
      const where = `${r.status} ${r.text.slice(0, 40)}`;
      expect(r.headers.get("x-robots-tag"), where).toBe("noindex");
      expect(r.headers.get("cache-control"), where).toBe("no-store");
      expect(r.headers.get("content-type"), where).toContain("application/json");
      expect(r.headers.get("x-content-type-options"), where).toBe("nosniff");
      expect(r.headers.get("content-security-policy"), where).toContain("default-src 'self'");
    }
    // a route that throws: 500, JSON, the same headers, and not a word of the exception
    const db = qa.env.DB as Row;
    const prepare = db.prepare.bind(db);
    db.prepare = (sql: string) => { if (/FROM sessions/.test(sql)) throw new Error("D1_ERROR: database is locked, user a@b.com"); return prepare(sql); };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = await qa.call("/api/me", { cookie: c });
    err.mockRestore();
    db.prepare = prepare;
    expect(boom.status).toBe(500);
    expect(boom.data).toEqual({ error: "server error" });
    expect(boom.headers.get("x-robots-tag")).toBe("noindex");
    expect(boom.headers.get("cache-control")).toBe("no-store");
    expect(boom.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("error bodies never echo what was sent: e-mails, names, ids, paths", async () => {
    const c = await qa.signUp("a@b.com");
    const probes: [string, Record<string, unknown>][] = [
      ["/api/auth/code", { body: { email: "<img src=x onerror=alert(1)>@evil" } }],
      ["/api/auth/login", { body: { email: "zz<script>@b.com", password: "pw<script>" } }],
      ["/api/me", { body: { target_nclc: "<script>" }, cookie: c }],
      ["/api/me", { body: { exam_date: "<script>" }, cookie: c }],
      ["/api/attempts", { body: { section: "<script>", exam: "<script>" }, cookie: c }],
      ["/api/attempts/1<script>", { cookie: c }],
      ["/api/progress?section=<script>", { cookie: c }],
      ["/api/expr/<script>", { cookie: c }],
      ["/api/<script>", {}],
      ["/api/admin/people/<script>/<script>", { host: "admin.tcf.monster", body: {} }],
    ];
    for (const [path, o] of probes) {
      const r = await qa.call(path, o as never);
      expect(r.status, path).toBeGreaterThanOrEqual(400);
      expect(r.text, path).not.toMatch(/script|onerror|evil/i);
      expect(r.text, path).not.toMatch(/\n\s+at |\.ts:\d+/);
    }
  });

  it("pages carry the CSP and noindex; files are cached by the asset server, pages are not", async () => {
    (qa.env as Row).ASSETS = { fetch: async (r: Request) => new Response(`asset ${new URL(r.url).pathname}`, { headers: { "content-type": "text/html" } }) };
    const page = await qa.call("/co/exam/12");
    expect(page.text).toBe("asset /app/");
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(page.headers.get("content-security-policy")).toContain("base-uri 'none'");
    expect(page.headers.get("cache-control")).toBe("no-cache");
    expect(page.headers.get("x-robots-tag")).toBe("noindex");
    const file = await qa.call("/assets/app-1.js");
    expect(file.headers.get("cache-control")).toBeNull();
    expect((await qa.call("/data/exam-co-12.json")).text).toBe("asset /data/exam-co-12.json");
  });
});

describe("the admin door", () => {
  it("/api/admin/* on the app host is 404 for everyone, the owner included", async () => {
    const owner = await qa.signUp("owner@example.com");
    for (const p of ["/api/admin/overview", "/api/admin/people", "/api/admin/disputes"]) {
      expect((await qa.call(p, { cookie: owner })).status, p).toBe(404);
      expect((await qa.call(p)).status, p).toBe(404);
    }
    expect((await qa.call("/api/admin/people/x/delete", { body: {}, cookie: owner, headers: { "x-admin": "1" } })).status).toBe(404);
  });

  it("the admin host: no cookie → 403; another person → 403; the owner → 200; writes need x-admin: 1; cross-site → 403", async () => {
    const owner = await qa.signUp("owner@example.com");
    const other = await qa.signUp("other@example.com");
    const otherId = qa.userId("other@example.com");
    const A = "admin.tcf.monster";
    expect((await qa.call("/api/admin/overview", { host: A })).status).toBe(403);
    expect((await qa.call("/api/admin/overview", { host: A, cookie: other })).status).toBe(403);
    expect((await qa.call("/api/admin/overview", { host: A, cookie: "tcfm_session=" + "x".repeat(43) })).status).toBe(403);
    expect((await qa.call("/api/admin/overview", { host: A, cookie: owner })).status).toBe(200);
    // a write without the header, with the header from another site, with the header from the right place
    expect((await qa.call(`/api/admin/people/${otherId}/signout`, { host: A, cookie: owner, body: {}, headers: { "x-admin": "" } })).status).toBe(403);
    expect((await qa.call(`/api/admin/people/${otherId}/signout`, { host: A, cookie: owner, body: {}, origin: "https://evil.example" })).status).toBe(403);
    expect((await qa.call(`/api/admin/people/${otherId}/signout`, { host: A, cookie: other, body: {} })).status).toBe(403);
    expect(qa.count("SELECT COUNT(*) n FROM sessions WHERE user_id = ?", otherId)).toBe(1);
    expect((await qa.call(`/api/admin/people/${otherId}/signout`, { host: A, cookie: owner, body: {} })).status).toBe(200);
    expect(qa.count("SELECT COUNT(*) n FROM sessions WHERE user_id = ?", otherId)).toBe(0);
    // reads with a writing method, writes with a reading one
    expect((await qa.call("/api/admin/overview", { host: A, cookie: owner, method: "DELETE" })).status).toBe(405);
    expect((await qa.call(`/api/admin/people/${otherId}/delete`, { host: A, cookie: owner })).status).toBe(404);
    expect(qa.count("SELECT COUNT(*) n FROM users")).toBe(2);
  });
});
