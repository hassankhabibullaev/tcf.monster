// Progress sync under bad bundles, replays, two devices and a budget that is spent, through the real door.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setup, teardown, type QA, type Row } from "./helpers.ts";
import { apply, emptyState, type Event } from "../../shared/progress.ts";

let qa: QA, cookie: string;
beforeEach(async () => { qa = setup(); cookie = await qa.signUp("a@b.com"); });
afterEach(teardown);

const now = () => Math.floor(Date.now() / 1000);
const ev = (p: Partial<Event> & { t: number }): Event => ({ id: `e${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`, section: "co", level: "B1", type: "answer", qid: "q1", key: "B", right: true, ...p });
const sync = (events: unknown, c = cookie, extra: Record<string, unknown> = {}) => qa.call("/api/sync", { body: { events, ...extra }, cookie: c });
const stored = (section = "co", level = "B1") => { const r = qa.raw.prepare("SELECT data FROM progress WHERE user_id = ? AND section = ? AND level = ?").get(qa.userId("a@b.com"), section, level) as Row | undefined; return r ? JSON.parse(r.data) : null; };

describe("malformed bundles", () => {
  it("missing fields, wrong types, huge t, negative dt, a 1970 stamp: dropped one by one, the good ones still applied", async () => {
    const t = now() - 50;
    const r = await sync([
      {}, null, 7, "x", [],
      { ...ev({ t }), id: undefined }, { ...ev({ t }), t: "soon" }, { ...ev({ t }), t: -5 }, { ...ev({ t }), t: Number.POSITIVE_INFINITY }, { ...ev({ t }), t: Number.NaN },
      { ...ev({ t, qid: "q-old" }), t: 1 }, { ...ev({ t, qid: "q-1999" }), t: 915_148_800 },
      { ...ev({ t, qid: "neg" }), dt: -40 }, { ...ev({ t, qid: "nan" }), dt: Number.NaN }, { ...ev({ t, qid: "big" }), dt: 1e9 },
      { ...ev({ t, qid: "k" }), key: "Z" }, { ...ev({ t, qid: "k2" }), right: "yes" }, { ...ev({ t, qid: "x".repeat(65) }) },
      ev({ t: t + 1, qid: "good", right: false, dt: 12 }),
    ]);
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ ok: true, applied: 4 }); // neg, nan, big, good
    const s = stored();
    expect(Object.keys(s.q).sort()).toEqual(["big", "good", "nan", "neg"]);
    expect(s.q["q-old"]).toBeUndefined();
    const days = qa.raw.prepare("SELECT day, answered, wrong, seconds FROM practice_days").all() as Row[];
    expect(days.length).toBe(1); // no 1970 or 1999 practice day
    expect(days[0]).toMatchObject({ answered: 4, wrong: 1, seconds: 120 + 12 });
  });

  it("a bundle stamped far ahead is moved back as a whole; one poisoned with 1e300 cannot plant far-future entries", async () => {
    const ahead = now() + 7 * 86400;
    expect((await sync([ev({ t: ahead, qid: "a" }), ev({ t: ahead + 10, qid: "b" })])).data.applied).toBe(2);
    const s = stored();
    expect(s.q.b.t).toBeLessThanOrEqual(now() + 61);
    expect(s.q.b.t - s.q.a.t).toBe(10);
    const p = await sync([ev({ t: 1e300, qid: "poison" }), ev({ t: now(), qid: "c" })]);
    expect(p.status).toBe(200);
    const s2 = stored();
    for (const e of Object.values(s2.q) as Row[]) { expect(Number.isFinite(e.t)).toBe(true); expect(e.t).toBeLessThanOrEqual(now() + 61); expect(e.t).toBeGreaterThan(1_600_000_000); }
    expect(JSON.stringify(s2)).not.toContain("e+");
  });

  it("the same id twice, 501 events, a 300 KB body, events that are not an array, no body", async () => {
    const t = now() - 10;
    const one = ev({ t, qid: "dup" });
    expect((await sync([one, one, { ...one }])).data.applied).toBe(1);
    const many = Array.from({ length: 501 }, (_, i) => ev({ t: t - 600 + i, qid: `m${i}` }));
    expect((await sync(many)).data.applied).toBe(500);
    expect(Object.keys(stored().q).length).toBe(501);
    const big = await qa.call("/api/sync", { raw: JSON.stringify({ events: [ev({ t })], pad: "x".repeat(300 * 1024) }), headers: { "content-type": "application/json" }, cookie });
    expect(big.status).toBe(413);
    expect(big.headers.get("content-type")).toContain("json");
    for (const events of [{}, "x", 1, null]) expect((await sync(events)).status, JSON.stringify(events)).toBe(400);
    expect((await qa.call("/api/sync", { raw: "", headers: { "content-type": "application/json" }, cookie })).status).toBe(400);
    expect((await qa.call("/api/sync", { method: "GET", cookie })).status).toBe(405);
  });

  it("a qid that is nobody's question lands only in the sender's own row, and a row cannot grow without end", async () => {
    const t = now() - 100;
    const other = await qa.signUp("o@b.com");
    await sync([ev({ t, qid: "somebody-elses-question" })], other);
    expect((await qa.call("/api/progress?section=co", { cookie })).data.levels.B1.q).toEqual({});
    expect((await qa.call("/api/progress?section=co", { cookie: other })).data.levels.B1.q["somebody-elses-question"].s).toBe("green");
    // 2 000 entries fill a level; a 2 001st made-up question is ignored, an answer to a known one still counts
    for (let b = 0; b < 4; b++) await sync(Array.from({ length: 500 }, (_, i) => ev({ t: t + b * 500 + i, qid: `fake${b * 500 + i}` })));
    expect(Object.keys(stored().q).length).toBe(2000);
    expect((await sync([ev({ t: t + 5000, qid: "fake-more" }), ev({ t: t + 5001, qid: "fake1", type: "reset" })])).data.applied).toBe(1);
    expect(stored().q["fake-more"]).toBeUndefined();
    expect(stored().q.fake1).toBeUndefined();
    expect(JSON.stringify(stored()).length).toBeLessThan(200_000);
  });
});

describe("replays and two devices", () => {
  it("an old bundle replayed after a reset does not bring the question back (server and browser rules alike)", async () => {
    const t = now() - 100;
    const first = [ev({ t, qid: "q1", right: true })];
    expect((await sync(first)).data.applied).toBe(1);
    expect((await sync([ev({ t: t + 10, qid: "q1", type: "reset" })])).data.applied).toBe(1);
    expect(stored().q.q1).toBeUndefined();
    // the phone that answered at t comes back online and sends its bundle again
    expect((await sync(first)).data.applied).toBe(0);
    expect(stored().q.q1).toBeUndefined();
    expect((await qa.call("/api/progress?section=co", { cookie })).data.levels.B1.q.q1).toBeUndefined();
    // a later answer counts again, and clears the memory of the reset
    expect((await sync([ev({ t: t + 20, qid: "q1", right: false })])).data.applied).toBe(1);
    expect(stored().q.q1).toMatchObject({ s: "red", t: t + 20 });
    expect(stored().x?.q1).toBeUndefined();
    // the pure rules say the same
    let s = apply(emptyState(), first[0]);
    s = apply(s, ev({ t: t + 10, qid: "q1", type: "reset" }));
    expect(apply(s, first[0])).toBe(s);
    expect(apply(s, ev({ t: t + 10, qid: "q1", right: true }))).toBe(s); // the same second as the reset: not later
    expect(apply(s, ev({ t: t + 11, qid: "q1", right: true })).q.q1.s).toBe("green");
  });

  it("two devices: the strictly later event wins whichever arrives first; a replay of either changes nothing", async () => {
    const t = now() - 100;
    const phone = ev({ t: t + 5, qid: "q1", right: false, key: "C" });
    const laptop = ev({ t: t + 9, qid: "q1", right: false, key: "D" });
    expect((await sync([laptop])).data.applied).toBe(1);
    expect((await sync([phone])).data.applied).toBe(0);
    expect(stored().q.q1).toEqual({ s: "red", t: t + 9, a: "D" });
    expect((await sync([laptop, phone])).data.applied).toBe(0);
    // a mark from the laptop at t+9 again (same second) is not later: ignored; at t+10 on red: ignored by the rule
    expect((await sync([ev({ t: t + 9, qid: "q1", type: "mark", s: "green" }), ev({ t: t + 10, qid: "q1", type: "mark", s: "green" })])).data.applied).toBe(0);
    // pos: the latest wins too, and a repeat is free
    await sync([ev({ t: t + 1, type: "pos", n: 4 }), ev({ t: t + 2, type: "pos", n: 7 })]);
    expect(stored().pos).toBe(7);
    expect(qa.count("SELECT COUNT(*) n FROM practice_days")).toBe(1);
    expect((qa.raw.prepare("SELECT answered a, wrong w FROM practice_days").get() as Row)).toEqual({ a: 1, w: 1 });
  });

  it("practice_days: a day per (day, section, level), only answers that changed something, dt capped at 120", async () => {
    const t = now() - 3 * 86400;
    await sync([ev({ t, qid: "a", dt: 30 }), ev({ t: t + 1, qid: "b", section: "ce", dt: 999 }), ev({ t: t + 2, qid: "c", level: "A1", right: false }), ev({ t: t + 86400, qid: "d", dt: 1 })]);
    const rows = qa.raw.prepare("SELECT day, section, level, answered, wrong, seconds FROM practice_days ORDER BY day, section, level").all() as Row[];
    expect(rows.length).toBe(4);
    expect(rows.map((r) => [r.section, r.level, r.answered, r.wrong, r.seconds])).toEqual([["ce", "B1", 1, 0, 120], ["co", "A1", 1, 1, 0], ["co", "B1", 1, 0, 30], ["co", "B1", 1, 0, 1]]);
    // the same answer once more, later, on a green question: nothing changes, nothing is counted
    expect((await sync([ev({ t: t + 99, qid: "a", dt: 50 })])).data.applied).toBe(0);
    expect(qa.count("SELECT SUM(answered) n FROM practice_days")).toBe(4);
  });
});

describe("the budget", () => {
  it("{ hold } at exactly BUDGET_HOLD, nothing written, and the queue is accepted again once the day turns", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
    qa.raw.prepare("INSERT INTO budget (day, writes) VALUES (?, 59999)").run(today);
    expect((await sync([ev({ t: now() - 5, qid: "a" })])).data).toEqual({ ok: true, applied: 1 });
    expect(qa.count("SELECT writes n FROM budget")).toBe(59999 + 2);
    const held = await sync([ev({ t: now() - 4, qid: "b" })]);
    expect(held.status).toBe(200);
    expect(held.data).toEqual({ hold: true });
    expect(stored().q.b).toBeUndefined();
    expect(qa.count("SELECT writes n FROM budget")).toBe(60001);
    qa.raw.prepare("UPDATE budget SET day = '2000-01-01'").run();
    expect((await sync([ev({ t: now() - 4, qid: "b" })])).data.applied).toBe(1);
  });
});
