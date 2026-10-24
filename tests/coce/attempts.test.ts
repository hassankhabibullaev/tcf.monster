// Exam attempts on a real SQLite, the exam file served by a pretend ASSETS.
import { describe, it, expect, beforeEach } from "vitest";
import { makeEnv } from "../../scripts/local-env.ts";
import type { Env } from "../../worker/util.ts";
import type { Me } from "../../worker/auth.ts";
import { levelOfPosition } from "../../shared/progress.ts";
import { handleAttempts, finalizeStale, scoreAnswers, nclcOf, type Answers } from "../../worker/coce/attempts.ts";

type Row = Record<string, any>;
let env: Env, raw: ReturnType<typeof makeEnv>["raw"];
const me: Me = { id: "u1", email: "u1@example.com", sid: "s1" };
const other: Me = { id: "u2", email: "u2@example.com", sid: "s2" };
let stmts = 0, assetReads = 0;

/** an exam of 39: placements CO-12-01 … 39, the level of the position, the answer always A */
const exam = (section: string, n: number) => Array.from({ length: 39 }, (_, i) => ({
  id: `q${i + 1}`, placement: `${section.toUpperCase()}-${String(n).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  position: i + 1, level: levelOfPosition(i + 1), answer: "A", stem: "…", options: [],
}));
const placement = (section: string, n: number, pos: number) => `${section.toUpperCase()}-${String(n).padStart(2, "0")}-${String(pos).padStart(2, "0")}`;

beforeEach(() => {
  const e = makeEnv();
  env = e.env as unknown as Env; raw = e.raw;
  raw.prepare("INSERT INTO users (id, email, created_at) VALUES ('u1', 'u1@example.com', 'x'), ('u2', 'u2@example.com', 'x')").run();
  assetReads = 0;
  (env as Row).ASSETS = {
    fetch: async (req: Request) => {
      assetReads++;
      const m = new URL(req.url).pathname.match(/^\/data\/exam-(co|ce)-(\d\d)\.json$/);
      if (!m || Number(m[2]) > 40) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(exam(m[1], Number(m[2]))), { headers: { "content-type": "application/json" } });
    },
  };
  stmts = 0;
  const db = env.DB as any;
  const prepare = db.prepare.bind(db), batch = db.batch.bind(db);
  db.prepare = (sql: string) => {
    const wrap = (st: any): any => ({ ...st, bind: (...a: unknown[]) => wrap(st.bind(...a)), run: () => (stmts++, st.run()), first: () => (stmts++, st.first()), all: () => (stmts++, st.all()) });
    return wrap(prepare(sql));
  };
  db.batch = (list: any[]) => { stmts += list.length; return batch(list); };
});

const count = (sql: string, ...a: unknown[]) => Number((raw.prepare(sql).get(...(a as never[])) as Row).n);
const call = async (path: string, o: { method?: string; body?: unknown; who?: Me } = {}) => {
  const method = o.method ?? (o.body !== undefined ? "POST" : "GET");
  const url = new URL(`https://app.tcf.monster/api${path}`);
  const r = await handleAttempts(new Request(url, { method, headers: { "content-type": "application/json" }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }), env, o.who ?? me, url.pathname.slice(4), url);
  return { status: r.status, data: (await r.json()) as Row };
};
const start = (section = "co", n = 12, who = me, mode?: string) => call("/attempts", { body: mode ? { section, exam: n, mode } : { section, exam: n }, who });
/** move an attempt's clock back by `minutes` */
const age = (id: number, minutes: number) => {
  raw.prepare("UPDATE attempts SET started_at = ?, deadline_at = ? WHERE id = ?")
    .run(new Date(Date.now() - minutes * 60000).toISOString(), new Date(Date.now() - minutes * 60000 + 35 * 60000).toISOString(), id);
  // the daily cap counts the starts (deleting an attempt does not give its start back): the n-th start ages with it
  raw.prepare("UPDATE starts SET at = ? WHERE rowid = ?").run(new Date(Date.now() - minutes * 60000).toISOString(), id);
};

describe("scoring", () => {
  it("points by level, no floor (the real sum), NCLC from the IRCC ranges, blank = missing or skipped", () => {
    const qs = exam("co", 1) as any[];
    const right = (positions: number[]): Answers => Object.fromEntries(positions.map((p) => [placement("co", 1, p), "A" as const]));
    expect(scoreAnswers("co", qs, {})).toMatchObject({ score: 0, nclc: null, right: 0, wrong: 0, blank: 39 });
    const all = scoreAnswers("co", qs, right(Array.from({ length: 39 }, (_, i) => i + 1)));
    expect(all).toMatchObject({ score: 699, nclc: 10, right: 39, wrong: 0, blank: 0 });
    expect(all.byLevel).toEqual({ A1: { right: 4, of: 4 }, A2: { right: 6, of: 6 }, B1: { right: 9, of: 9 }, B2: { right: 10, of: 10 }, C1: { right: 6, of: 6 }, C2: { right: 4, of: 4 } });
    // A1 + A2 + B1 + B2 right (411), one C1 wrong, one C1 skipped, the rest blank
    const mid = scoreAnswers("co", qs, { ...right(Array.from({ length: 29 }, (_, i) => i + 1)), [placement("co", 1, 30)]: "B" as const, [placement("co", 1, 31)]: "-" as const });
    expect(mid).toMatchObject({ score: 4 * 3 + 6 * 9 + 9 * 15 + 10 * 21, nclc: 6, right: 29, wrong: 1, blank: 9 });
    expect(mid.byLevel.C1).toEqual({ right: 0, of: 6 });
    expect(scoreAnswers("ce", qs, right(Array.from({ length: 29 }, (_, i) => i + 1))).nclc).toBe(6);
    expect(nclcOf("co", 330)).toBeNull(); expect(nclcOf("co", 331)).toBe(4); expect(nclcOf("ce", 341)).toBeNull(); expect(nclcOf("ce", 342)).toBe(4);
    expect(nclcOf("co", 502)).toBe(7); expect(nclcOf("co", 503)).toBe(8); expect(nclcOf("ce", 498)).toBe(7); expect(nclcOf("ce", 499)).toBe(8);
    expect(nclcOf("co", 548)).toBe(9); expect(nclcOf("co", 549)).toBe(10); expect(nclcOf("ce", 699)).toBe(10);
  });
});

describe("the attempts routes", () => {
  it("creates an attempt with the server's deadline; a second one is refused with the running one", async () => {
    stmts = 0;
    const r = await start("co", 12);
    expect(r.status).toBe(201);
    expect(r.data.attempt).toMatchObject({ id: 1, section: "co", exam: 12, mode: "exam", finishedAt: null, ended: null, score: null, answers: {} });
    expect(Date.parse(r.data.attempt.deadlineAt) - Date.parse(r.data.attempt.startedAt)).toBe(35 * 60000);
    expect(r.data.attempt.byLevel).toBeUndefined();
    expect(stmts).toBeLessThanOrEqual(9); // the running attempt, the mock running (docs/MOCK-EXAM.md §7), the budget (twice: the router's hold line), the day's starts, the insert, the start counted, the read-back
    expect(count("SELECT writes n FROM budget")).toBe(2); // the attempt and its start
    const again = await start("ce", 3);
    expect(again.status).toBe(409);
    expect(again.data.running.id).toBe(1);
    expect(count("SELECT COUNT(*) n FROM attempts")).toBe(1);
    expect((await call("/attempts/running")).data.attempt.id).toBe(1);
    // CE lasts 60 minutes
    await call("/attempts/1/finish", { body: { ended: "abandon" } });
    const ce = await start("ce", 3);
    expect(Date.parse(ce.data.attempt.deadlineAt) - Date.parse(ce.data.attempt.startedAt)).toBe(60 * 60000);
  });

  it("stores the mode: training when asked, exam by default, anything else refused", async () => {
    const t = await start("ce", 4, me, "training");
    expect(t.status).toBe(201);
    expect(t.data.attempt.mode).toBe("training");
    expect(raw.prepare("SELECT mode FROM attempts WHERE id = 1").get()).toEqual({ mode: "training" });
    expect((await call("/attempts/running")).data.attempt.mode).toBe("training");
    expect((await call("/attempts/1")).data.attempt.mode).toBe("training");
    await call("/attempts/1/finish", { body: { ended: "done" } });
    expect((await start("ce", 4, me, "exam")).data.attempt.mode).toBe("exam");
    await call("/attempts/2/finish", { body: { ended: "done" } });
    expect((await start("ce", 4)).data.attempt.mode).toBe("exam");
    await call("/attempts/3/finish", { body: { ended: "done" } });
    expect((await start("ce", 4, me, "free")).status).toBe(400);
    expect((await start("ce", 4, me, "")).status).toBe(201); // an empty string is "not given"
    const list = (await call("/attempts?section=ce")).data.attempts;
    expect(list.map((a: Row) => a.mode)).toEqual(["exam", "exam", "exam", "training"]);
    // a row from before the column existed reads as exam
    raw.prepare("UPDATE attempts SET mode = 'odd' WHERE id = 2").run();
    expect((await call("/attempts/2")).data.attempt.mode).toBe("exam");
  });

  it("refuses a bad section or exam, holds past the budget, and has no daily quota", async () => {
    expect((await call("/attempts", { body: { section: "xx", exam: 1 } })).status).toBe(400);
    expect((await call("/attempts", { body: { section: "co", exam: 41 } })).status).toBe(400);
    expect((await call("/attempts", { body: { section: "co", exam: 0 } })).status).toBe(400);
    // no daily quota: someone may sit every exam in a day (the guard watches only what no person does)
    for (let i = 1; i <= 7; i++) {
      expect((await start("co", i)).status).toBe(201);
      await call(`/attempts/${i}/finish`, { body: { ended: "done" } });
    }
    raw.prepare("UPDATE budget SET writes = 50000").run();
    const held = await start("co", 8);
    expect(held.status).toBe(503);
    expect(held.data).toEqual({ error: "hold" });
  });

  it("PATCH merges answers by placement, one row write when something changed", async () => {
    await start("co", 12);
    stmts = 0;
    const p1 = await call("/attempts/1", { method: "PATCH", body: { answers: { "CO-12-01": "A", "CO-12-02": "B" }, at: Date.now() } });
    expect(p1.status).toBe(200);
    expect(p1.data.attempt.answers).toEqual({ "CO-12-01": "A", "CO-12-02": "B" });
    expect(stmts).toBe(3); // read, write, budget
    const p2 = await call("/attempts/1", { method: "PATCH", body: { answers: { "CO-12-02": "C", "CO-12-03": "-", "bad key": "A", "CO-12-04": "E" } } });
    expect(p2.data.attempt.answers).toEqual({ "CO-12-01": "A", "CO-12-02": "C", "CO-12-03": "-" });
    expect(count("SELECT writes n FROM budget")).toBe(4);
    stmts = 0;
    await call("/attempts/1", { method: "PATCH", body: { answers: { "CO-12-01": "A" } } });
    expect(stmts).toBe(1); // nothing changed: nothing written
    expect(count("SELECT writes n FROM budget")).toBe(4);
    expect((await call("/attempts/1", { method: "PATCH", body: {} })).status).toBe(400);
    expect((await call("/attempts/1")).data.attempt.answers["CO-12-02"]).toBe("C");
  });

  it("a late PATCH is refused and the attempt is closed on time; inside the grace it is taken", async () => {
    await start("co", 12);
    // 36 minutes in: one minute past the deadline, inside the grace
    age(1, 36);
    const ok = await call("/attempts/1", { method: "PATCH", body: { answers: { "CO-12-01": "A" }, at: Date.now() - 2 * 60000 } });
    expect(ok.status).toBe(200);
    // the same, stamped after the deadline: refused
    const stamped = await call("/attempts/1", { method: "PATCH", body: { answers: { "CO-12-02": "A" }, at: Date.now() } });
    expect(stamped.status).toBe(409);
    expect(stamped.data.error).toBe("late");
    expect((await call("/attempts/1")).data.attempt.finishedAt).toBeNull();
    // 40 minutes in: past the grace
    age(1, 40);
    const late = await call("/attempts/1", { method: "PATCH", body: { answers: { "CO-12-02": "A" } } });
    expect(late.status).toBe(409);
    expect(late.data.error).toBe("late");
    expect(late.data.attempt).toMatchObject({ ended: "time", right: 1, score: 3 });
    expect(late.data.attempt.answers).toEqual({ "CO-12-01": "A" });
    expect((await call("/attempts/1", { method: "PATCH", body: { answers: { "CO-12-03": "A" } } })).data.error).toBe("finished");
  });

  it("the last answers ride with the finish: scored and stored by the finishing write alone", async () => {
    await start("ce", 7);
    const answers: Record<string, string> = {};
    for (let p = 1; p <= 29; p++) answers[placement("ce", 7, p)] = "A";
    answers[placement("ce", 7, 30)] = "B";
    answers["CO-01-01"] = "A"; // another exam's placement: ignored
    const before = count("SELECT writes n FROM budget");
    const r = await call("/attempts/1/finish", { body: { ended: "done", answers, at: new Date().toISOString() } });
    expect(r.data.attempt).toMatchObject({ ended: "done", score: 411, right: 29, wrong: 1 });
    expect(count("SELECT writes n FROM budget")).toBe(before + 1); // one write: the finishing UPDATE
    const stored = JSON.parse((raw.prepare("SELECT answers FROM attempts WHERE id = 1").get() as Row).answers);
    expect(Object.keys(stored)).toHaveLength(30);
    expect(stored["CO-01-01"]).toBeUndefined();
  });

  it("finish scores from the exam file: a known score and NCLC, the counts, byLevel", async () => {
    await start("ce", 7);
    const answers: Record<string, string> = {};
    for (let p = 1; p <= 29; p++) answers[placement("ce", 7, p)] = "A"; // A1…B2 right = 411
    answers[placement("ce", 7, 30)] = "B"; // wrong
    answers[placement("ce", 7, 31)] = "-"; // skipped
    await call("/attempts/1", { method: "PATCH", body: { answers } });
    stmts = 0; assetReads = 0;
    const r = await call("/attempts/1/finish", { body: { ended: "done" } });
    expect(r.status).toBe(200);
    expect(r.data.attempt).toMatchObject({ ended: "done", score: 411, nclc: 6, right: 29, wrong: 1, blank: 9 });
    expect(r.data.attempt.byLevel).toEqual({ A1: { right: 4, of: 4 }, A2: { right: 6, of: 6 }, B1: { right: 9, of: 9 }, B2: { right: 10, of: 10 }, C1: { right: 0, of: 6 }, C2: { right: 0, of: 4 } });
    expect(typeof r.data.attempt.finishedAt).toBe("string");
    expect(assetReads).toBe(1);
    expect(stmts).toBeLessThanOrEqual(4); // read, write, budget, read back
    expect(count("SELECT writes n FROM budget")).toBe(4); // start (the attempt and its start), patch, finish
    expect((await call("/attempts/1/finish", { body: { ended: "done" } })).status).toBe(409);
    expect((await call("/attempts/running")).data.attempt).toBeNull();
    // the row in the database carries the same numbers
    expect(raw.prepare("SELECT score, nclc, right_count, wrong_count, blank_count FROM attempts WHERE id = 1").get()).toEqual({ score: 411, nclc: 6, right_count: 29, wrong_count: 1, blank_count: 9 });
    // the list, without answers, newest first
    await start("ce", 8);
    const list = await call("/attempts?section=ce");
    expect(list.data.attempts.map((a: Row) => a.id)).toEqual([2, 1]);
    expect(list.data.attempts[1]).toEqual({ id: 1, section: "ce", exam: 7, mode: "exam", startedAt: expect.any(String), deadlineAt: expect.any(String), finishedAt: expect.any(String), ended: "done", score: 411, nclc: 6, right: 29, wrong: 1, blank: 9 });
    expect((await call("/attempts?section=co")).data.attempts).toEqual([]);
    expect((await call("/attempts?section=")).status).toBe(400);
    // finishing past the grace is recorded as time, whatever the browser says
    age(2, 40);
    expect((await call("/attempts/2/finish", { body: { ended: "done" } })).data.attempt.ended).toBe("time");
  });

  it("a running attempt past its deadline is finalised by any GET that meets it, and by the nightly job", async () => {
    await start("co", 12);
    await call("/attempts/1", { method: "PATCH", body: { answers: { "CO-12-01": "A", "CO-12-02": "A", "CO-12-05": "A", "CO-12-06": "B" } } });
    age(1, 40);
    const band = await call("/attempts/running");
    expect(band.data.attempt).toBeNull();
    const row = (await call("/attempts/1")).data.attempt;
    expect(row).toMatchObject({ ended: "time", nclc: null, right: 3, wrong: 1, blank: 35 });
    expect(row.score).toBe(Object.entries(row.byLevel as Record<string, { right: number }>).reduce((a, [l, b]) => a + b.right * ({ A1: 3, A2: 9, B1: 15, B2: 21, C1: 26, C2: 33 } as Record<string, number>)[l], 0));
    expect(row.byLevel.A1).toEqual({ right: 2, of: 4 });
    expect((await start("co", 13)).status).toBe(201);

    // the nightly job: two people, three stale attempts in all, the live one left alone
    age(2, 50);
    await start("ce", 1, other);
    age(3, 70);
    raw.prepare("INSERT INTO attempts (user_id, section, exam, started_at, deadline_at) VALUES ('u2', 'co', 2, ?, ?)").run(new Date(Date.now() - 3600000).toISOString(), new Date(Date.now() - 1800000).toISOString());
    raw.prepare("INSERT INTO attempts (user_id, section, exam, started_at, deadline_at) VALUES ('u2', 'co', 3, ?, ?)").run(new Date().toISOString(), new Date(Date.now() + 1800000).toISOString());
    const before = count("SELECT writes n FROM budget");
    expect(await finalizeStale(env)).toBe(3);
    expect(count("SELECT COUNT(*) n FROM attempts WHERE finished_at IS NULL")).toBe(1);
    expect(count("SELECT COUNT(*) n FROM attempts WHERE ended = 'time'")).toBe(4);
    expect(count("SELECT writes n FROM budget")).toBe(before + 3);
    expect(await finalizeStale(env)).toBe(0);
  });

  it("a person sees only their own attempts", async () => {
    await start("co", 12);
    expect((await call("/attempts/1", { who: other })).status).toBe(404);
    expect((await call("/attempts/1", { who: other, method: "PATCH", body: { answers: { "CO-12-01": "A" } } })).status).toBe(404);
    expect((await call("/attempts/1/finish", { who: other, body: { ended: "done" } })).status).toBe(404);
    expect((await call("/attempts/running", { who: other })).data.attempt).toBeNull();
    expect((await call("/attempts?section=co", { who: other })).data.attempts).toEqual([]);
    expect((await start("co", 1, other)).status).toBe(201);
    expect((await call("/attempts/99")).status).toBe(404);
    expect((await call("/attempts/abc")).status).toBe(404);
  });
});
