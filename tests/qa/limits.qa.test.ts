// The free plan's daily limits cannot be spent by one script or one account (2026-10-24): the hold line stops only
// new starts, the practice calendar's rows per bundle, starts counted apart, a site-wide and a per-network cap on codes.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setup, teardown, type QA, type Row } from "./helpers.ts";
import type { Event } from "../../shared/progress.ts";
import { resetLimits } from "../../worker/util.ts";

let qa: QA, cookie: string;
beforeEach(async () => { qa = setup(); cookie = await qa.signUp("a@b.com"); });
afterEach(teardown);

const now = () => Math.floor(Date.now() / 1000);
let n = 0;
const ev = (t: number, qid: string): Event => ({ id: `e${++n}x${Math.random().toString(36).slice(2, 10)}`, section: "co", level: "B1", type: "answer", qid, key: "B", right: true, t, dt: 10 } as Event);

describe("one account cannot spend the day", () => {
  it("past the hold line nothing new starts, but a running exam still saves and finishes; sign-in works", async () => {
    const started = await qa.call("/api/attempts", { body: { section: "co", exam: 1 }, cookie });
    expect(started.status).toBe(201);
    const id = started.data.attempt.id;
    qa.raw.prepare("INSERT INTO budget (day, writes) VALUES (?, 50000) ON CONFLICT(day) DO UPDATE SET writes = 50000").run(new Date().toLocaleDateString("en-CA", { timeZone: qa.env.APP_TZ }));
    expect((await qa.call("/api/attempts", { body: { section: "co", exam: 2 }, cookie })).data).toEqual({ error: "hold" });
    expect((await qa.call(`/api/attempts/${id}`, { method: "PATCH", body: { answers: { "CO-01-01": "A" }, at: Date.now() }, cookie })).status).toBe(200);
    expect((await qa.call(`/api/attempts/${id}/finish`, { body: { ended: "done" }, cookie })).status).toBe(200);
    expect((await qa.call("/api/me", { body: { name: "Léa" }, cookie })).status).toBe(200);
    expect((await qa.call("/api/auth/code", { body: { email: "a@b.com", lang: "en" } })).status).toBe(200);
  });

  it("the practice calendar: answers older than a week change the level but write no day; at most 20 days a bundle", async () => {
    const t = now();
    const old = Array.from({ length: 30 }, (_, i) => ev(t - (8 + i) * 86400, `old${i}`));
    const r = await qa.call("/api/sync", { body: { events: [...old, ev(t - 60, "fresh")] }, cookie });
    expect(r.data.applied).toBe(31);
    const days = qa.raw.prepare("SELECT day FROM practice_days").all() as Row[];
    expect(days.length).toBe(1);
    const week = Array.from({ length: 7 }, (_, d) => Array.from({ length: 4 }, (_, l) => ({ ...ev(t - d * 86400 - 60, `w${d}-${l}`), level: (["A1", "A2", "B1", "B2"] as const)[l] }))).flat();
    await qa.call("/api/sync", { body: { events: week }, cookie });
    expect((qa.raw.prepare("SELECT COUNT(*) n FROM practice_days").get() as Row).n).toBeLessThanOrEqual(21);
  });

  it("starts are counted apart from what was started: deleting exams does not lower the day's count", async () => {
    for (let i = 1; i <= 3; i++) {
      const s = await qa.call("/api/attempts", { body: { section: "co", exam: i }, cookie });
      const id = s.data.attempt.id;
      await qa.call(`/api/attempts/${id}/finish`, { body: { ended: "done" }, cookie });
      expect((await qa.call(`/api/attempts/${id}`, { method: "DELETE", cookie })).status).toBe(200);
    }
    expect((qa.raw.prepare("SELECT COUNT(*) n FROM starts").get() as Row).n).toBe(3);
  });

});

describe("two tabs saving at the same moment", () => {
  it("both bundles land in the same level: neither one's answers is lost", async () => {
    const t = now() - 30;
    const one = Array.from({ length: 5 }, (_, i) => ev(t, `tabA${i}`));
    const two = Array.from({ length: 5 }, (_, i) => ev(t, `tabB${i}`));
    const [a, b] = await Promise.all([one, two].map((events) => qa.call("/api/sync", { body: { events }, cookie })));
    expect([a.data.applied, b.data.applied]).toEqual([5, 5]);
    const row = qa.raw.prepare("SELECT data FROM progress WHERE section = 'co' AND level = 'B1'").get() as Row;
    expect(Object.keys(JSON.parse(row.data).q).sort()).toEqual([...one, ...two].map((e) => e.qid).sort());
    expect((qa.raw.prepare("SELECT answered FROM practice_days").get() as Row).answered).toBe(10);
  });
});

describe("starts", () => {
  it("far more starts than anyone sits in a day: blocked (all of them in a day is about 100)", async () => {
    const id = qa.userId("a@b.com");
    for (let i = 0; i < 200; i++) qa.raw.prepare("INSERT INTO starts (user_id, kind, at) VALUES (?, 'attempt', ?)").run(id, new Date().toISOString());
    const r = await qa.call("/api/attempts", { body: { section: "co", exam: 1 }, cookie });
    expect(r.status).toBe(403);
    expect(r.data.error).toBe("blocked");
    expect(qa.count("SELECT COUNT(*) n FROM attempts")).toBe(0);
  });

});

describe("the day's e-mails", () => {
  it("one network: 15 codes a day, whatever the addresses; another network still gets its own", async () => {
    for (let i = 0; i < 15; i++) {
      if (i % 9 === 0) resetLimits(); // the minute's limit per address is another rule: spread over the day
      expect((await qa.call("/api/auth/code", { body: { email: `n${i}@example.com`, lang: "en" }, ip: "203.0.113.9" })).status, String(i)).toBe(200);
    }
    resetLimits();
    const r = await qa.call("/api/auth/code", { body: { email: "n99@example.com", lang: "en" }, ip: "203.0.113.9" });
    expect([r.status, r.data.error]).toEqual([429, "too_many"]);
    expect((await qa.call("/api/auth/code", { body: { email: "n99@example.com", lang: "en" }, ip: "198.51.100.4" })).status).toBe(200);
    // the network is kept as a keyed hash, never the address
    expect(qa.count("SELECT COUNT(*) n FROM mail WHERE ip LIKE '%203.0.113%'")).toBe(0);
  });

  it("the account-deletion code obeys the site's hour of account codes", async () => {
    const at = new Date().toISOString();
    for (let i = 0; i < 60; i++) qa.raw.prepare("INSERT INTO mail (at, email, kind, ok) VALUES (?, ?, 'signin', 1)").run(at, `p${i}@example.com`);
    const r = await qa.call("/api/me/delete/code", { body: {}, cookie });
    expect([r.status, r.data.error]).toEqual([429, "busy"]);
  });

  it("sign-in codes for existing accounts: 60 an hour for the whole site", async () => {
    const at = new Date().toISOString();
    for (let i = 0; i < 60; i++) qa.raw.prepare("INSERT INTO mail (at, email, kind, ok) VALUES (?, ?, 'signin', 1)").run(at, `p${i}@example.com`);
    const r = await qa.call("/api/auth/code", { body: { email: "a@b.com", lang: "en", why: "signin" } });
    expect([r.status, r.data.error]).toEqual([429, "busy"]);
  });
});

describe("the nightly run's own door", () => {
  it("/__job/* answers 404 to anyone without the run's key, whatever the method", async () => {
    for (const o of [{}, { body: {} }, { body: {}, headers: { "x-job": "guess" } }]) expect((await qa.call("/__job/cleanup", { ...o, cookie })).status).toBe(404);
    expect(qa.count("SELECT COUNT(*) n FROM job_log")).toBe(0);
  });
});
