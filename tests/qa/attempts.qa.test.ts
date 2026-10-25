// Exam attempts under pressure: two starts at once, the daily cap, answers after the end or for another exam, the
// clock, a tampered mode or exam number, and an exam file that is not there.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setup, teardown, examAssets, type QA, type Row } from "./helpers.ts";

let qa: QA, cookie: string;
beforeEach(async () => { qa = setup(); (qa.env as Row).ASSETS = examAssets(39); cookie = await qa.signUp("a@b.com"); });
afterEach(teardown);

const start = (section = "co", exam = 12, extra: Record<string, unknown> = {}, c = cookie) => qa.call("/api/attempts", { body: { section, exam, ...extra }, cookie: c });
const patch = (id: number, answers: Record<string, unknown>, extra: Record<string, unknown> = {}, c = cookie) => qa.call(`/api/attempts/${id}`, { method: "PATCH", body: { answers, ...extra }, cookie: c });
const finish = (id: number, ended = "done", c = cookie) => qa.call(`/api/attempts/${id}/finish`, { body: { ended }, cookie: c });
const age = (id: number, minutes: number, duration = 35) => qa.raw.prepare("UPDATE attempts SET started_at = ?, deadline_at = ? WHERE id = ?")
  .run(new Date(Date.now() - minutes * 60000).toISOString(), new Date(Date.now() - minutes * 60000 + duration * 60000).toISOString(), id);
const row = (id: number) => qa.raw.prepare("SELECT * FROM attempts WHERE id = ?").get(id) as Row;

describe("starting", () => {
  it("two starts at the same instant (a double tap): one attempt, the other answers 409 with it", async () => {
    // the real D1 answers over the network: every statement takes a turn of the event loop, so two requests
    // interleave at each await (the local SQLite answers at once and would hide the race)
    const db = qa.env.DB as Row;
    const prepare = db.prepare.bind(db);
    const slow = <T>(fn: () => Promise<T>) => new Promise<T>((res, rej) => setTimeout(() => fn().then(res, rej), 1));
    db.prepare = (sql: string) => {
      const wrap = (st: Row): Row => ({ ...st, bind: (...a: unknown[]) => wrap(st.bind(...a)), run: () => slow(st.run), first: () => slow(st.first), all: () => slow(st.all) });
      return wrap(prepare(sql));
    };
    const [a, b] = await Promise.all([start("co", 12), start("ce", 3)]);
    const codes = [a.status, b.status].sort();
    expect(codes).toEqual([201, 409]);
    expect(qa.count("SELECT COUNT(*) n FROM attempts")).toBe(1);
    const won = a.status === 201 ? a : b, lost = a.status === 201 ? b : a;
    expect(lost.data.running.id).toBe(won.data.attempt.id);
    expect((await qa.call("/api/attempts/running", { cookie })).data.attempt.id).toBe(won.data.attempt.id);
    // three at once
    await finish(won.data.attempt.id, "abandon");
    const three = await Promise.all([start("co", 1), start("co", 2), start("co", 3)]);
    expect(three.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(qa.count("SELECT COUNT(*) n FROM attempts WHERE finished_at IS NULL")).toBe(1);
  });

  it("no daily quota: twelve exams in a row all start", async () => {
    for (let i = 1; i <= 12; i++) {
      expect((await start("co", i)).status, String(i)).toBe(201);
      await finish(i, i % 2 ? "done" : "abandon");
    }
    expect(qa.count("SELECT COUNT(*) n FROM attempts")).toBe(12);
  });

  it("exam 0, 41, 'abc', 1.5, true-as-1, a missing section, mode tampering: 400 and no row", async () => {
    for (const body of [{ section: "co", exam: 0 }, { section: "co", exam: 41 }, { section: "co", exam: "abc" }, { section: "co", exam: 1.5 }, { section: "co", exam: null }, { exam: 3 }, { section: "CO", exam: 3 }, { section: "co", exam: 3, mode: "free" }, { section: "co", exam: 3, mode: 1 }, { section: "co", exam: 3, mode: ["exam"] }])
      expect((await qa.call("/api/attempts", { body, cookie })).status, JSON.stringify(body)).toBe(400);
    for (const raw of ["[]", "\"x\"", "null", "{"]) expect((await qa.call("/api/attempts", { raw, headers: { "content-type": "application/json" }, cookie })).status, raw).toBe(400);
    expect(qa.count("SELECT COUNT(*) n FROM attempts")).toBe(0);
    // the mode cannot be changed afterwards through PATCH, and the row keeps the one it was started with
    expect((await start("co", 3, { mode: "training" })).data.attempt.mode).toBe("training");
    await patch(1, { "CO-03-01": "A" }, { mode: "exam", section: "ce", exam: 9, deadlineAt: "2999-01-01" });
    expect(row(1)).toMatchObject({ mode: "training", section: "co", exam: 3 });
    expect(Date.parse(row(1).deadline_at)).toBeLessThan(Date.now() + 36 * 60000);
  });
});

describe("answering and finishing", () => {
  it("answers for placements of another exam, another section, a bad position: kept out; good ones merged", async () => {
    await start("co", 12);
    const r = await patch(1, { "CO-12-01": "A", "CO-13-02": "A", "CE-12-03": "A", "CO-12-50": "A", "CO-12-00": "A", "co-12-04": "A", "CO-12-5": "A", "CO-12-06": "a", "CO-12-07": null, "CO-12-08": "-" });
    expect(r.status).toBe(200);
    expect(r.data.attempt.answers).toEqual({ "CO-12-01": "A", "CO-12-08": "-" });
    expect(JSON.parse(row(1).answers)).toEqual({ "CO-12-01": "A", "CO-12-08": "-" });
    // more than 100 keys in one PATCH: the first hundred are looked at
    const many = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`CO-12-${String((i % 39) + 1).padStart(2, "0")}`, "B"]));
    await patch(1, many);
    expect(Object.keys(JSON.parse(row(1).answers)).length).toBeLessThanOrEqual(39);
  });

  it("PATCH after finish: 409 finished with the scored attempt, and nothing changes; finish twice: 409", async () => {
    await start("co", 12);
    await patch(1, { "CO-12-01": "A" });
    const done = await finish(1, "done");
    expect(done.data.attempt).toMatchObject({ ended: "done", right: 1, score: 3 });
    const late = await patch(1, { "CO-12-02": "A" });
    expect(late.status).toBe(409);
    expect(late.data.error).toBe("finished");
    expect(late.data.attempt.right).toBe(1);
    expect(JSON.parse(row(1).answers)).toEqual({ "CO-12-01": "A" });
    const again = await finish(1, "abandon");
    expect(again.status).toBe(409);
    expect(row(1).ended).toBe("done");
    for (const ended of ["time", "", 1, null]) expect((await finish(2 - 1, ended as string)).status).toBe(409);
    await start("co", 13);
    for (const ended of ["time", "", 1, null]) expect((await finish(2, ended as string)).status, String(ended)).toBe(400);
    expect((await qa.call("/api/attempts/2/finish", { method: "GET", cookie })).status).toBe(405);
  });

  it("time: a GET past the deadline + grace closes it as `time`; inside the grace it still runs; the job closes the rest", async () => {
    await start("ce", 5);
    await patch(1, { "CE-05-01": "A", "CE-05-02": "B" });
    age(1, 61, 60); // one minute past the deadline, inside the grace
    expect((await qa.call("/api/attempts/running", { cookie })).data.attempt.id).toBe(1);
    expect((await patch(1, { "CE-05-03": "A" }, { at: Date.now() - 3 * 60000 })).status).toBe(200);
    expect((await patch(1, { "CE-05-04": "A" }, { at: Date.now() })).data.error).toBe("late");
    expect((await patch(1, { "CE-05-04": "A" }, { at: "2099-01-01T00:00:00Z" })).data.error).toBe("late");
    age(1, 63, 60); // past the grace
    const got = await qa.call("/api/attempts/1", { cookie });
    expect(got.status).toBe(200);
    expect(got.data.attempt).toMatchObject({ ended: "time", right: 2, wrong: 1, blank: 36, score: 6 });
    expect(got.data.attempt.byLevel.A1).toEqual({ right: 2, of: 4 });
    expect((await qa.call("/api/attempts/running", { cookie })).data.attempt).toBeNull();
    // a second person's stale attempt is closed by the nightly job, through the job runner
    const other = await qa.signUp("o@b.com");
    await start("co", 2, {}, other);
    age(2, 40);
    const { runJob } = await import("../../worker/jobs.ts");
    const j = await runJob(qa.env, "cleanup");
    expect(j.ok).toBe(true);
    expect(j.detail).toContain("1 exam attempts closed");
    expect(row(2)).toMatchObject({ ended: "time", score: 0 });
  });

  it("another person's attempt: 404 on GET, PATCH and finish; an id that is not a number: 404", async () => {
    await start("co", 12);
    const other = await qa.signUp("o@b.com");
    expect((await qa.call("/api/attempts/1", { cookie: other })).status).toBe(404);
    expect((await patch(1, { "CO-12-01": "A" }, {}, other)).status).toBe(404);
    expect((await finish(1, "done", other)).status).toBe(404);
    for (const id of ["abc", "1e3", "-1", "1.0", "9999999999999", "1;DROP"]) expect((await qa.call(`/api/attempts/${id}`, { cookie })).status, id).toBe(404);
    expect(row(1).finished_at).toBeNull();
    expect(qa.count("SELECT COUNT(*) n FROM attempts")).toBe(1);
  });

  it("an exam file missing from ASSETS: finish is a clean 500, the row is never half-scored, nothing crashes", async () => {
    expect((await start("co", 40)).status).toBe(201); // the pretend ASSETS has 1…39 only
    await patch(1, { "CO-40-01": "A" });
    const r = await finish(1, "done");
    expect(r.status).toBe(500);
    expect(r.headers.get("content-type")).toContain("json");
    expect(r.data).toEqual({ error: "exam file missing" });
    expect(row(1)).toMatchObject({ finished_at: null, ended: null, score: null, nclc: null, right_count: null });
    expect((await qa.call("/api/attempts/1", { cookie })).data.attempt.finishedAt).toBeNull();
    expect((await qa.call("/api/attempts?section=co", { cookie })).status).toBe(200);
    // past the deadline the same: no score invented, the band answers, the job skips it
    age(1, 40);
    expect((await qa.call("/api/attempts/running", { cookie })).status).toBe(200);
    expect((await qa.call("/api/attempts/1", { cookie })).data.attempt.score).toBeNull();
    const { finalizeStale } = await import("../../worker/coce/attempts.ts");
    expect(await finalizeStale(qa.env)).toBe(0);
    expect(row(1).finished_at).toBeNull();
    // a file that is not JSON (a page served by mistake) is the same clean refusal
    (qa.env as Row).ASSETS = examAssets(39, { "/data/exam-ce-40.json": new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) });
    await finish(1, "abandon").catch(() => null);
    const other = await qa.signUp("o@b.com");
    expect((await start("ce", 40, {}, other)).status).toBe(201);
    const bad = await finish(2, "done", other);
    expect(bad.status).toBe(500);
    expect(bad.data).toEqual({ error: "exam file missing" });
    expect(row(2).finished_at).toBeNull();
  });
});

describe("deleting", () => {
  it("DELETE: somebody else's attempt is 404, a running one 409, a finished one goes and the dashboard forgets it", async () => {
    await start("co", 12);
    await patch(1, { "CO-12-01": "A", "CO-12-02": "A" });
    const other = await qa.signUp("o@b.com");
    expect((await qa.call("/api/attempts/1", { method: "DELETE", cookie: other })).status).toBe(404);
    const running = await qa.call("/api/attempts/1", { method: "DELETE", cookie });
    expect(running.status).toBe(409);
    expect(running.data.error).toBe("running");
    expect(qa.count("SELECT COUNT(*) n FROM attempts")).toBe(1);
    await finish(1, "done");
    expect((await qa.call("/api/me/stats", { cookie })).data.exams.co.taken).toBe(1);
    const writes = qa.count("SELECT COALESCE(SUM(writes), 0) n FROM budget");
    const gone = await qa.call("/api/attempts/1", { method: "DELETE", cookie });
    expect(gone.status).toBe(200);
    expect(gone.data).toEqual({ ok: true });
    expect(qa.count("SELECT COUNT(*) n FROM attempts")).toBe(0);
    expect(qa.count("SELECT COALESCE(SUM(writes), 0) n FROM budget")).toBe(writes + 2); // the delete, and the router's one per change
    const stats = (await qa.call("/api/me/stats", { cookie })).data;
    expect(stats.exams.co.taken).toBe(0);
    expect(stats.sections.co.n).toBe(0);
    expect((await qa.call("/api/attempts?section=co", { cookie })).data.attempts).toEqual([]);
    // twice: the second is 404; an id that is not a number: 404
    expect((await qa.call("/api/attempts/1", { method: "DELETE", cookie })).status).toBe(404);
    expect((await qa.call("/api/attempts/abc", { method: "DELETE", cookie })).status).toBe(404);
  });
});
