// The mock exam on the real Worker (docs/MOCK-EXAM.md): the lock, the paper and its no-repeat, the stage clock and
// the breaks, the answers, abandon, delete, the daily cap, the owner's skip, the refusals both ways, the results and
// the certificate, the nightly close.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setup, teardown, type QA, type Row } from "./helpers.ts";
import { finalizeStaleMocks } from "../../worker/mock/index.ts";
import { PENDING_S, QUOTA } from "../../worker/mock/types.ts";
import { LEVELS } from "../../shared/progress.ts";

const T0 = Date.parse("2026-10-19T08:00:00.000Z");
const min = (n: number) => n * 60_000;
let qa: QA, cookie: string, owner: string;

/** ASSETS that serves the two key files: `per` questions of every level per section */
function keyAssets(per = 2) {
  const file = (s: string) => LEVELS.flatMap((lv) => Array.from({ length: QUOTA[lv] * per }, (_, i) => ({ id: `${s}-${lv}-${i + 1}`, level: lv, answer: "A" })));
  return { fetch: async (req: Request | string) => {
    const p = new URL(typeof req === "string" ? req : req.url).pathname;
    const m = p.match(/^\/data\/key-(co|ce)\.json$/);
    return m ? new Response(JSON.stringify(file(m[1])), { headers: { "content-type": "application/json" } }) : new Response("not found", { status: 404 });
  } };
}

beforeEach(async () => {
  qa = setup({ OWNER_EMAIL: "owner@tcf.monster", ADMIN_OPEN: "0" });
  (qa.env as Row).ASSETS = keyAssets();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(T0));
  qa.raw.prepare("INSERT INTO topics (section, id, month, part, part_id, tache, position, title, body, first_seen, last_seen) VALUES ('ee', 1, '2026-10', 1, 10, NULL, 0, 'Combinaison 1', '{\"tache1\":\"Écrivez.\",\"tache2\":\"Racontez.\",\"tache3\":{\"title\":\"Pour ou contre ?\",\"document1\":\"D1\",\"document2\":\"D2\"}}', 't', 't'), ('ee', 4, '2026-09', 1, 12, NULL, 0, 'Combinaison 1', '{\"tache1\":\"Écrivez encore.\",\"tache2\":\"Racontez encore.\",\"tache3\":{\"title\":\"Pour ?\",\"document1\":\"D1\",\"document2\":\"D2\"}}', 't', 't')").run();
  qa.raw.prepare("INSERT INTO topics (section, id, month, part, part_id, tache, position, title, body, first_seen, last_seen) VALUES ('eo', 2, '2026-10', 1, 11, 2, 0, 'Je travaille à la piscine.', '{}', 't', 't'), ('eo', 3, '2026-10', 1, 11, 3, 1, 'Faut-il nager ?', '{}', 't', 't'), ('eo', 5, '2026-09', 1, 13, 2, 0, 'Je cherche un vélo.', '{}', 't', 't'), ('eo', 6, '2026-09', 1, 13, 3, 1, 'Faut-il rouler ?', '{}', 't', 't')").run();
  cookie = await qa.signUp("a@b.com");
  owner = await qa.signUp("owner@tcf.monster");
});
afterEach(teardown);

const at = (ms: number) => vi.setSystemTime(new Date(ms));
const start = (c = cookie, body: Record<string, unknown> = { micMode: "live" }) => qa.call("/api/mock", { body, cookie: c });
const get = (id: number, c = cookie) => qa.call(`/api/mock/${id}`, { cookie: c });
const next = (id: number, from: string, how = "done", c = cookie) => qa.call(`/api/mock/${id}/next`, { body: { from, how }, cookie: c });
const begin = (id: number, c = cookie) => qa.call(`/api/mock/${id}/begin`, { body: {}, cookie: c });
/** leave the break and say the room is rendered a second later */
const enterAndBegin = async (id: number, from: string, atMs: number, c = cookie) => { at(atMs); const r = await next(id, from, "done", c); at(atMs + 1000); await begin(id, c); return r; };
const patch = (id: number, stage: string, answers: Record<string, unknown>, c = cookie) => qa.call(`/api/mock/${id}`, { method: "PATCH", body: { stage, answers }, cookie: c });
const row = (id: number) => qa.raw.prepare("SELECT * FROM mocks WHERE id = ?").get(id) as Row;
/** the EE/EO sessions of a mock marked as the simulator would mark them */
const markSessions = (id: number, score20 = 12) => {
  const r = row(id);
  for (const sid of [r.ee_session_id, r.eo_session_id]) {
    if (!sid) continue;
    qa.raw.prepare("UPDATE expr_tasks SET status = 'done', score20 = ?, level = 'B2', nclc = 8 WHERE session_id = ?").run(score20, sid);
    qa.raw.prepare("UPDATE expr_sessions SET status = 'done', finished_at = ?, score = ?, nclc = 8, level = 'B2' WHERE id = ?").run(new Date().toISOString(), score20, sid);
  }
};
/** a whole sitting, the person answering two questions of each paper, through the real routes */
async function walk(c = cookie) {
  const s = await start(c);
  expect(s.status).toBe(201);
  const id = s.data.mock.id as number;
  const paper = s.data.mock.paper;
  await begin(id, c);
  await patch(id, "co", { [paper.co[0].id]: "A", [paper.co[1].id]: "B" }, c);
  at(T0 + min(10)); expect((await next(id, "co", "done", c)).data.mock.stage).toBe("break1");
  expect((await enterAndBegin(id, "break1", T0 + min(11), c)).data.mock.stage).toBe("ce");
  await patch(id, "ce", { [paper.ce[0].id]: "A" }, c);
  at(T0 + min(20)); expect((await next(id, "ce", "done", c)).data.mock.stage).toBe("break2");
  expect((await enterAndBegin(id, "break2", T0 + min(21), c)).data.mock.stage).toBe("ee");
  at(T0 + min(30)); expect((await next(id, "ee", "done", c)).data.mock.stage).toBe("break3");
  expect((await enterAndBegin(id, "break3", T0 + min(32), c)).data.mock.stage).toBe("eo");
  at(T0 + min(40)); expect((await next(id, "eo", "done", c)).data.mock.stage).toBe("marking");
  return id;
}

describe("starting", () => {
  it("needs a mic mode (the key is the browser's to check); the paper follows the quotas; another may start once one ends", async () => {
    expect((await start(cookie, {})).status).toBe(400);
    expect((await start(cookie, { micMode: "loud" })).status).toBe(400);
    const r = await start();
    expect(r.status).toBe(201);
    const m = r.data.mock;
    // entered pending: the clock starts when the room says it is rendered, at the latest in 90 s
    expect(m).toMatchObject({ stage: "co", status: "running", micMode: "live", pending: true, stageStartedAt: null, stageEndsAt: null, breakUntil: new Date(T0 + PENDING_S * 1000).toISOString() });
    at(T0 + 4000);
    const b = await begin(m.id);
    expect(b.data.mock).toMatchObject({ pending: false, stageStartedAt: new Date(T0 + 4000).toISOString(), stageEndsAt: new Date(T0 + 4000 + min(35)).toISOString() });
    expect((await begin(m.id)).data.mock.stageStartedAt).toBe(new Date(T0 + 4000).toISOString());
    at(T0);
    for (const s of ["co", "ce"]) {
      expect(m.paper[s]).toHaveLength(39);
      for (const lv of LEVELS) expect(m.paper[s].filter((q: Row) => q.level === lv)).toHaveLength(QUOTA[lv]);
      expect(new Set(m.paper[s].map((q: Row) => q.id)).size).toBe(39);
      // the answers stay on the server: the browser's copy is ids and levels only
      expect(m.paper[s].some((q: Row) => "answer" in q)).toBe(false);
      expect(b.data.mock.paper[s].some((q: Row) => "answer" in q)).toBe(false);
    }
    // the topics: the newest month's combinaison and partie
    expect(JSON.parse(row(m.id).topics_json)).toEqual({ ee: 1, eo: { partId: 11, t2: 2, t3: 3 } });
    // a second start: the running one comes back (409); once it ends another may start the same day (no quota)
    expect((await start()).status).toBe(409);
    expect((await start()).data.error).toBe("running");
    expect((await qa.call(`/api/mock/${m.id}/abandon`, { body: {}, cookie })).status).toBe(200);
    const again = await start();
    expect(again.status).toBe(201);
    await qa.call(`/api/mock/${again.data.mock.id}/abandon`, { body: {}, cookie });
    at(T0);
    expect((await start(owner)).status).toBe(201);
    await qa.call(`/api/mock/${(await qa.call("/api/mock/running", { cookie: owner })).data.mock.id}/abandon`, { body: {}, cookie: owner });
    expect((await start(owner)).status).toBe(201);
  });

  it("reads the answer keys from R2's private folder: the site's files no longer carry them (scripts/copy-media.mjs)", async () => {
    for (const s of ["co", "ce"]) {
      const rows = (await (await keyAssets().fetch(`https://assets/data/key-${s}.json`)).json()) as Row[];
      await qa.r2.put(`private/key-${s}.json`, JSON.stringify(rows.map((q) => ({ ...q, id: `r2-${q.id}` }))));
    }
    (qa.env as Row).ASSETS = { fetch: async () => new Response("not found", { status: 404 }) };
    const r = await start();
    expect(r.status).toBe(201);
    expect(r.data.mock.paper.co.every((q: Row) => String(q.id).startsWith("r2-"))).toBe(true);
  });

  it("never repeats a question or a topic of a previous mock while there are fresh ones", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 2; i++) {
      at(T0 + i * min(24 * 60 + 1));
      const r = await start();
      expect(r.status).toBe(201);
      for (const s of ["co", "ce"]) for (const q of r.data.mock.paper[s]) { expect(ids.has(q.id), q.id).toBe(false); ids.add(q.id); }
      await qa.call(`/api/mock/${r.data.mock.id}/abandon`, { body: {}, cookie });
    }
    expect(ids.size).toBe(156);
    // the second mock took the other month's topics; the third, every month had, takes any
    const topics = (qa.raw.prepare("SELECT topics_json FROM mocks ORDER BY id").all() as Row[]).map((r) => JSON.parse(r.topics_json));
    expect(topics[0]).toEqual({ ee: 1, eo: { partId: 11, t2: 2, t3: 3 } });
    expect(topics[1]).toEqual({ ee: 4, eo: { partId: 13, t2: 5, t3: 6 } });
    at(T0 + 2 * min(24 * 60 + 1));
    const third = await start();
    expect(third.status).toBe(201);
    expect(third.data.mock.paper.co).toHaveLength(39);
    expect(third.data.mock.paper.co.every((q: Row) => ids.has(q.id))).toBe(true);
  });

  it("refuses while an exam attempt or a fresh simulator session runs, and those refuse while a mock runs", async () => {
    (qa.env as Row).ASSETS = { fetch: async (req: Request | string) => { const p = new URL(typeof req === "string" ? req : req.url).pathname; return keyAssets().fetch(req) .then((r) => (r.status === 404 && /exam-/.test(p) ? new Response(JSON.stringify(Array.from({ length: 39 }, (_, i) => ({ placement: `CO-01-${String(i + 1).padStart(2, "0")}`, level: "A1", answer: "A" }))), { headers: { "content-type": "application/json" } }) : r)); } };
    const a = await qa.call("/api/attempts", { body: { section: "co", exam: 1 }, cookie });
    expect(a.status).toBe(201);
    const r1 = await start();
    expect(r1.status).toBe(409);
    expect(r1.data.error).toBe("attempt_running");
    await qa.call(`/api/attempts/${a.data.attempt.id}/finish`, { body: { ended: "abandon" }, cookie });
    const s = await qa.call("/api/expr/start", { body: { section: "ee", kind: "practice", taches: [1] }, cookie });
    expect(s.status).toBe(200);
    const r2 = await start();
    expect(r2.status).toBe(409);
    expect(r2.data.error).toBe("session_running");
    // a session left behind three hours ago no longer blocks
    qa.raw.prepare("UPDATE expr_sessions SET started_at = ? WHERE id = ?").run(new Date(T0 - min(181)).toISOString(), s.data.sessionId);
    const r3 = await start();
    expect(r3.status).toBe(201);
    const b = await qa.call("/api/attempts", { body: { section: "co", exam: 2 }, cookie });
    expect(b.status).toBe(409);
    expect(b.data.error).toBe("mock_running");
    const e = await qa.call("/api/expr/start", { body: { section: "ee", kind: "practice", taches: [1] }, cookie });
    expect(e.status).toBe(409);
    expect(e.data.error).toBe("mock_running");
  });
});

describe("the sitting", () => {
  it("answers of the paper only, the clock closes CO at 35:00 and opens CE at 40:00 by itself; EO waits", async () => {
    const m = (await start()).data.mock;
    const q = m.paper.co;
    // no answers while the room is not rendered
    expect((await patch(m.id, "co", { [q[0].id]: "A" })).status).toBe(409);
    await begin(m.id);
    const r = await patch(m.id, "co", { [q[0].id]: "A", [q[1].id]: "x", "nope": "A", [q[2].id]: "-", [m.paper.ce[0].id]: "A" });
    expect(r.status).toBe(200);
    expect(r.data.mock.answers.co).toEqual({ [q[0].id]: "A", [q[2].id]: "-" });
    expect((await patch(m.id, "ce", { [m.paper.ce[0].id]: "A" })).status).toBe(409);
    expect((await patch(m.id, "co", { [q[3].id]: "A" })).status).toBe(200);
    // 41 minutes later, without a word from the browser: CO closed as time at 35:00, scored; CE entered at 40:00 and
    // running by itself since 41:30 (nobody said the room was rendered)
    at(T0 + min(41));
    expect((await get(m.id)).data.mock).toMatchObject({ stage: "ce", pending: true, breakUntil: new Date(T0 + min(40) + PENDING_S * 1000).toISOString() });
    at(T0 + min(42));
    const g = await get(m.id);
    expect(g.data.mock).toMatchObject({ stage: "ce", pending: false, stageStartedAt: new Date(T0 + min(40) + PENDING_S * 1000).toISOString(), ended: { co: "time" } });
    expect(g.data.mock.coResult).toMatchObject({ score: 6, right: 2, blank: 37, wrong: 0, ended: "time", at: new Date(T0 + min(35)).toISOString() });
    // a late CO answer is refused; a CE one is taken
    expect((await patch(m.id, "co", { [q[4].id]: "A" })).status).toBe(409);
    expect((await patch(m.id, "ce", { [m.paper.ce[0].id]: "A" })).status).toBe(200);
    // the band: the running mock, advanced
    expect((await qa.call("/api/mock/running", { cookie })).data.mock.stage).toBe("ce");
    // the whole afternoon away: CE and EE ran out, the writing session exists, EO waits in its break
    at(T0 + min(600));
    const w = await get(m.id);
    expect(w.data.mock.stage).toBe("break3");
    expect(w.data.mock.ended).toEqual({ co: "time", ce: "time", ee: "time" });
    expect(w.data.mock.eeSessionId).toBeTruthy();
    expect(w.data.mock.eoSessionId).toBeNull();
    expect(row(m.id).ee_session_id).toBe(w.data.mock.eeSessionId);
    expect((qa.raw.prepare("SELECT * FROM expr_sessions WHERE id = ?").get(w.data.mock.eeSessionId) as Row)).toMatchObject({ mock_id: m.id, kind: "exam", seconds: 3600, started_at: new Date(T0 + min(105) + PENDING_S * 1000).toISOString() });
    // the press, 7 hours late: EO is entered now, the lateness is written down; the station says when it is ready
    const p = await next(m.id, "break3");
    expect(p.data.mock.stage).toBe("eo");
    expect(p.data.mock.pending).toBe(true);
    expect(p.data.mock.ended.eoLateS).toBeGreaterThan(300);
    at(T0 + min(600) + 8000);
    expect((await begin(m.id)).data.mock.stageStartedAt).toBe(new Date(T0 + min(600) + 8000).toISOString());
    expect((qa.raw.prepare("SELECT * FROM expr_sessions WHERE id = ?").get(p.data.mock.eoSessionId) as Row)).toMatchObject({ mock_id: m.id, mode: "live" });
    // the mock's sessions are not in the EE/EO history
    expect((await qa.call("/api/expr/sessions", { cookie })).data.sessions).toEqual([]);
  });

  it("Terminer moves to the break now; « Continuer maintenant » enters CE now and begin starts it; a repeated call changes nothing", async () => {
    const m = (await start()).data.mock;
    await begin(m.id);
    at(T0 + min(12));
    const r = await next(m.id, "co");
    expect(r.data.mock).toMatchObject({ stage: "break1", breakUntil: new Date(T0 + min(17)).toISOString(), ended: { co: "done" } });
    expect(r.data.mock.coResult.ended).toBe("done");
    expect((await next(m.id, "co")).data.mock.stage).toBe("break1");
    at(T0 + min(14));
    const e = await next(m.id, "break1");
    expect(e.data.mock).toMatchObject({ stage: "ce", pending: true, breakUntil: new Date(T0 + min(14) + PENDING_S * 1000).toISOString() });
    at(T0 + min(14) + 3000);
    const c = await begin(m.id);
    expect(c.data.mock).toMatchObject({ stage: "ce", pending: false, stageStartedAt: new Date(T0 + min(14) + 3000).toISOString(), stageEndsAt: new Date(T0 + min(74) + 3000).toISOString() });
    expect((await next(m.id, "nope")).data.mock.stage).toBe("ce");
    expect((await qa.call(`/api/mock/${m.id}/next`, { body: {}, cookie })).status).toBe(400);
  });

  it("a whole sitting: marking, then done with the results, the overall and the certificate", async () => {
    const id = await walk();
    let g = await get(id);
    expect(g.data.mock.status).toBe("marking");
    expect(g.data.mock.result).toBeNull();
    markSessions(id);
    g = await get(id);
    expect(g.data.mock.status).toBe("done");
    expect(g.data.mock.stage).toBe("over");
    expect(g.data.mock.result.co).toMatchObject({ right: 1, wrong: 1 });
    expect(g.data.mock.result.ee).toMatchObject({ score20: 12, nclc: 8, marked: 3, of: 3 });
    expect(g.data.mock.result.overall).toBe(3); // CO and CE under NCLC 4 → 3, the lowest of the four
    expect(g.data.mock.certificate).toBe(true);
    expect(g.data.mock.ended).toEqual({ co: "done", ce: "done", ee: "done", eo: "done", eoLateS: 0 });
    // the list and the dashboard's numbers
    const list = await qa.call("/api/mock/list", { cookie });
    expect(list.data.mocks).toHaveLength(1);
    expect(list.data.mocks[0]).not.toHaveProperty("paper");
    const stats = await qa.call("/api/me/stats", { cookie });
    expect(stats.data.mocks).toMatchObject({ count: 1, best: 3, last: { id, nclc: { co: null, ce: null, ee: 8, eo: 8 }, overall: 3 } });
    expect(stats.data.sections.co.n).toBe(1);
    expect(stats.data.sections.ee.n).toBe(1);
    expect(stats.data.recent.some((r: Row) => r.href === `/mock/${id}/result` && r.label === "blanc")).toBe(true);
    // finished: no more moves, no more answers
    expect((await next(id, "eo")).status).toBe(409);
    expect((await patch(id, "co", {})).status).toBe(409);
    // delete: the mock and its sessions go
    expect((await qa.call(`/api/mock/${id}`, { method: "DELETE", cookie: owner })).status).toBe(404);
    expect((await qa.call(`/api/mock/${id}`, { method: "DELETE", cookie })).status).toBe(200);
    expect(qa.count("SELECT COUNT(*) n FROM mocks")).toBe(0);
    expect(qa.count("SELECT COUNT(*) n FROM expr_sessions")).toBe(0);
    expect(qa.count("SELECT COUNT(*) n FROM expr_tasks")).toBe(0);
  });

  it("no certificate after an abandon, a late press, or a blank stage", async () => {
    // abandon in CE
    let m = (await start()).data.mock;
    await begin(m.id);
    at(T0 + min(10)); await next(m.id, "co"); await enterAndBegin(m.id, "break1", T0 + min(11));
    const ab = await qa.call(`/api/mock/${m.id}/abandon`, { body: {}, cookie });
    expect(ab.data.mock).toMatchObject({ status: "abandoned", stage: "over", certificate: false, ended: { co: "done", ce: "abandon" } });
    expect(ab.data.mock.result.ce).toMatchObject({ ended: "abandon" });
    expect(ab.data.mock.result.ee).toBeNull();
    expect(ab.data.mock.result.overall).toBeNull();
    expect((await qa.call(`/api/mock/${m.id}`, { method: "DELETE", cookie })).status).toBe(200);
    // the press 6 minutes late
    at(T0 + min(24 * 60 + 1));
    const T1 = T0 + min(24 * 60 + 1);
    m = (await start()).data.mock;
    const p = m.paper;
    await begin(m.id);
    await patch(m.id, "co", { [p.co[0].id]: "A" });
    at(T1 + min(10)); await next(m.id, "co"); await enterAndBegin(m.id, "break1", T1 + min(11));
    await patch(m.id, "ce", { [p.ce[0].id]: "A" });
    at(T1 + min(20)); await next(m.id, "ce"); await enterAndBegin(m.id, "break2", T1 + min(21));
    at(T1 + min(30)); await next(m.id, "ee"); // break3 until 45
    await enterAndBegin(m.id, "break3", T1 + min(51));
    at(T1 + min(60)); await next(m.id, "eo");
    markSessions(m.id);
    let g = await get(m.id);
    expect(g.data.mock.status).toBe("done");
    expect(g.data.mock.ended.eoLateS).toBe(360);
    expect(g.data.mock.certificate).toBe(false);
    // a blank CO
    at(T1 + min(24 * 60 + 1));
    const id = await walk();
    qa.raw.prepare("UPDATE mocks SET co_result = json_set(co_result, '$.right', 0, '$.wrong', 0) WHERE id = ?").run(id);
    markSessions(id);
    g = await get(id);
    expect(g.data.mock.status).toBe("done");
    expect(g.data.mock.certificate).toBe(false);
  });

  it("the owner's skip ends the stage or the break now; anyone else is refused", async () => {
    const m = (await start()).data.mock;
    expect((await qa.call(`/api/mock/${m.id}/skip`, { body: {}, cookie })).status).toBe(403);
    expect(row(m.id).stage).toBe("co");
    const o = (await start(owner)).data.mock;
    await begin(o.id, owner);
    at(T0 + min(2));
    let r = await qa.call(`/api/mock/${o.id}/skip`, { body: {}, cookie: owner });
    expect(r.data.mock).toMatchObject({ stage: "break1", ended: { co: "time" }, breakUntil: new Date(T0 + min(7)).toISOString() });
    r = await qa.call(`/api/mock/${o.id}/skip`, { body: {}, cookie: owner });
    expect(r.data.mock).toMatchObject({ stage: "ce", pending: true });
    r = await begin(o.id, owner);
    expect(r.data.mock).toMatchObject({ stage: "ce", stageStartedAt: new Date(T0 + min(2)).toISOString() });
    for (const s of ["ce", "break2", "ee"]) { r = await qa.call(`/api/mock/${o.id}/skip`, { body: {}, cookie: owner }); void s; }
    expect(r.data.mock.stage).toBe("break3");
    r = await qa.call(`/api/mock/${o.id}/skip`, { body: {}, cookie: owner });
    expect(r.data.mock.stage).toBe("break3"); // the speaking stage still waits for its press
    expect(r.data.mock.breakUntil).toBe(new Date(T0 + min(2)).toISOString());
    r = await next(o.id, "break3", "done", owner);
    expect(r.data.mock.stage).toBe("eo");
    r = await qa.call(`/api/mock/${o.id}/skip`, { body: {}, cookie: owner });
    expect(r.data.mock.stage).toBe("marking");
  });

  it("the nightly job closes a sitting nobody moved for twelve hours, and a marking never finished", async () => {
    const m = (await start()).data.mock;
    await begin(m.id);
    at(T0 + min(10)); await next(m.id, "co"); await enterAndBegin(m.id, "break1", T0 + min(11));
    at(T0 + min(600));
    expect(await finalizeStaleMocks(qa.env)).toBe(0); // the last move (the break's end at 106.5) is under twelve hours old
    at(T0 + min(110 + 13 * 60));
    expect(await finalizeStaleMocks(qa.env)).toBe(1);
    const r = row(m.id);
    expect(r.status).toBe("abandoned");
    expect(JSON.parse(r.ended_json)).toMatchObject({ co: "done", ce: "time", ee: "time", eo: "stale" });
    expect(r.certificate).toBe(0);
    // a marking left for a day closes as done with what exists, no certificate
    at(T0 + min(48 * 60));
    const T2 = T0 + min(48 * 60);
    const o = (await start(owner)).data.mock;
    for (const s of ["co", "break1", "ce", "break2", "ee"]) { await qa.call(`/api/mock/${o.id}/skip`, { body: {}, cookie: owner }); void s; }
    await next(o.id, "break3", "done", owner);
    await qa.call(`/api/mock/${o.id}/skip`, { body: {}, cookie: owner });
    expect(row(o.id).status).toBe("marking");
    at(T2 + min(13 * 60));
    expect(await finalizeStaleMocks(qa.env)).toBe(1);
    expect(row(o.id)).toMatchObject({ status: "done", certificate: 0 });
  });
});
