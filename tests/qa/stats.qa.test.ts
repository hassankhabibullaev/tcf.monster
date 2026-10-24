// GET /api/me/stats: a person with nothing, attempts without an NCLC, a mountain of activity, the order of `since`,
// medians of even counts, the eight-point series, and the pure helpers.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setup, teardown, type QA } from "./helpers.ts";
import { median, sectionStat, streakOf } from "../../worker/stats.ts";

let qa: QA, cookie: string, uid: string;
beforeEach(async () => { qa = setup(); cookie = await qa.signUp("a@b.com"); uid = qa.userId("a@b.com"); });
afterEach(teardown);

const stats = async () => { const r = await qa.call("/api/me/stats", { cookie }); expect(r.status).toBe(200); return r.data; };
const attempt = (section: string, exam: number, at: string, score: number | null, nclc: number | null) =>
  qa.raw.prepare("INSERT INTO attempts (user_id, section, exam, started_at, deadline_at, finished_at, ended, score, nclc) VALUES (?, ?, ?, ?, ?, ?, 'done', ?, ?)").run(uid, section, exam, at, at, at, score, nclc);
const session = (id: string, section: string, status: string, startedAt: string, finishedAt: string | null, score: number | null, nclc: number | null, seconds: number) =>
  qa.raw.prepare("INSERT INTO expr_sessions (id, user_id, section, kind, taches, status, started_at, finished_at, score, nclc, seconds) VALUES (?, ?, ?, 'practice', '[2]', ?, ?, ?, ?, ?, ?)").run(id, uid, section, status, startedAt, finishedAt, score, nclc, seconds);
const dayAt = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();

describe("the dashboard's numbers", () => {
  it("a person with nothing: every section empty, the facts at zero, since null, streak 0", async () => {
    const s = await stats();
    for (const k of ["co", "ce", "ee", "eo"]) expect(s.sections[k]).toEqual({ n: 0, best: null, worst: null, typical: null, current: null, last: null, trend: null, series: [] });
    expect(s.facts).toEqual({ sessions: 0, minutes: 0, days: 0, streak: 0, since: null });
    expect(s.recent).toEqual([]);
    expect(s.activity).toEqual({});
    expect(s.practice).toEqual({ co: {}, ce: {} });
    expect(s.exams).toEqual({ co: { taken: 0, distinct: 0, best: null, last: null }, ce: { taken: 0, distinct: 0, best: null, last: null } });
    expect(s.tasks).toEqual({ ee: { sessions: 0, avg20: null, byTask: {} }, eo: { sessions: 0, avg20: null, byTask: {} } });
    expect((await qa.call("/api/me/stats", { body: {}, cookie })).status).not.toBe(200);
    expect((await qa.call("/api/me/stats")).status).toBe(401);
  });

  it("attempts without an NCLC weigh as 3; the series keeps the last eight in time order; medians of even counts round up at .5", async () => {
    const nclcs = [null, 4, 5, 6, 7, 8, 9, 10, 4, 5, 6, 7];
    nclcs.forEach((n, i) => attempt("co", (i % 40) + 1, dayAt(30 - i), n === null ? 100 : 400 + i, n));
    const s = await stats();
    expect(s.sections.co.n).toBe(12);
    expect(s.sections.co.series).toEqual([7, 8, 9, 10, 4, 5, 6, 7]);
    expect(s.sections.co.worst).toBe(3);
    expect(s.sections.co.best).toBe(10);
    expect(s.sections.co.typical).toBe(6); // 12 values → (6 + 6) / 2
    expect(s.sections.co.current).toBe(6); // last five: 10 4 5 6 7
    expect(s.sections.co.trend).toBe("down"); // the five before: 5 6 7 8 9 → 7
    expect(s.exams.co).toEqual({ taken: 12, distinct: 12, best: 411, last: 411 });
    expect(s.recent.length).toBe(8);
    expect(s.recent[0].nclc).toBe(7);
    expect(s.recent.map((r: { at: string }) => r.at)).toEqual([...s.recent.map((r: { at: string }) => r.at)].sort().reverse());
    expect(median([4, 5])).toBe(5);
    expect(median([4, 7])).toBe(6);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBeNull();
    expect(sectionStat([{ nclc: 5, at: "a" }, { nclc: 9, at: "b" }])).toMatchObject({ typical: 7, current: 7, trend: null, series: [5, 9] });
  });

  it("since is the earliest day across practice, exams and the simulator; an in-progress session is not a day", async () => {
    qa.raw.prepare("INSERT INTO practice_days (user_id, day, section, level, answered, wrong, seconds, last_at) VALUES (?, '2026-09-20', 'co', 'A1', 5, 1, 300, 'x'), (?, '2026-10-01', 'ce', 'B1', 0, 0, 0, 'x')").run(uid, uid);
    attempt("ce", 1, "2026-09-25T10:00:00.000Z", 350, 4);
    session("s-old", "ee", "in_progress", "2026-09-01T10:00:00.000Z", null, null, null, 0);
    session("s-done", "eo", "done", "2026-09-22T10:00:00.000Z", "2026-09-22T10:20:00.000Z", 12, 6, 1200);
    const s = await stats();
    expect(s.facts.since).toBe("2026-09-20"); // the day with 0 answered does not count, nor the open session
    expect(s.facts.days).toBe(3);
    expect(s.facts.sessions).toBe(2); // the exam and the finished session
    expect(s.facts.minutes).toBe(25);
    expect(s.sections.eo.n).toBe(1);
    expect(s.sections.ee.n).toBe(0);
  });

  it("a mountain of activity: 3 000 practice days, 400 attempts, 200 sessions — one answer, bounded output", async () => {
    const ins = qa.raw.prepare("INSERT INTO practice_days (user_id, day, section, level, answered, wrong, seconds, last_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'x')");
    for (let i = 0; i < 3000; i++) ins.run(uid, new Date(Date.now() - (i % 3000) * 86400000).toISOString().slice(0, 10), i % 2 ? "co" : "ce", ["A1", "A2", "B1"][i % 3], 7, 2, 60);
    for (let i = 0; i < 400; i++) attempt(i % 2 ? "co" : "ce", (i % 40) + 1, dayAt(i), 300 + (i % 300), 4 + (i % 7));
    for (let i = 0; i < 200; i++) session(`s${i}`, i % 2 ? "ee" : "eo", "done", dayAt(i), dayAt(i), 10 + (i % 10), 5 + (i % 5), 600);
    const t0 = Date.now();
    const s = await stats();
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(s.recent.length).toBe(8);
    expect(Object.keys(s.activity).length).toBeLessThanOrEqual(85);
    for (const k of ["co", "ce", "ee", "eo"]) expect(s.sections[k].series.length).toBe(8);
    expect(s.facts.days).toBeGreaterThan(2900);
    expect(s.facts.streak).toBeGreaterThan(80);
    expect(JSON.stringify(s).length).toBeLessThan(20_000);
  });

  it("streak counts back from today or from yesterday", () => {
    expect(streakOf(new Set(["2026-10-18", "2026-10-17", "2026-10-16", "2026-10-10"]), "2026-10-18")).toBe(3);
    expect(streakOf(new Set(["2026-10-17", "2026-10-16"]), "2026-10-18")).toBe(2);
    expect(streakOf(new Set(["2026-10-16"]), "2026-10-18")).toBe(0);
    expect(streakOf(new Set(), "2026-10-18")).toBe(0);
  });
});
