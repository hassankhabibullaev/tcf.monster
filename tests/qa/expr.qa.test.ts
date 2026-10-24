// The expression routes: the key never reaches the server, nor what is written or said; somebody else's session,
// bodies that are not objects, the wrong method, past the daily cap; the marks are the only result stored.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setup, teardown, type QA, type Row } from "./helpers.ts";

let qa: QA, cookie: string, googleCalls: number;
const KEY = "AIza" + "x".repeat(35);
beforeEach(async () => {
  qa = setup();
  cookie = await qa.signUp("a@b.com");
  googleCalls = 0;
  qa.google.handler = () => { googleCalls++; return new Response("{}", { status: 500 }); };
  // an EE combinaison and an EO partie so a session can start
  qa.raw.prepare("INSERT INTO topics (section, id, month, part, part_id, tache, position, title, body, first_seen, last_seen) VALUES ('ee', 1, '2026-10', 1, 10, NULL, 0, 'Combinaison 1', '{\"tache1\":\"Écrivez.\",\"tache2\":\"Racontez.\",\"tache3\":{\"title\":\"Pour ou contre ?\",\"document1\":\"D1\",\"document2\":\"D2\"}}', 't', 't')").run();
  qa.raw.prepare("INSERT INTO topics (section, id, month, part, part_id, tache, position, title, body, first_seen, last_seen) VALUES ('eo', 2, '2026-10', 1, 11, 2, 0, 'Je travaille à la piscine.', '{}', 't', 't'), ('eo', 3, '2026-10', 1, 11, 3, 1, 'Faut-il nager ?', '{}', 't', 't')").run();
});
afterEach(teardown);

const post = (path: string, body: unknown, c = cookie) => qa.call(`/api/expr${path}`, { body, cookie: c });
/** everything the database holds, as one string */
const everything = () => JSON.stringify(["users", "expr_sessions", "expr_tasks", "user_kv"].map((t) => qa.raw.prepare(`SELECT * FROM ${t}`).all()));

describe("the key", () => {
  it("stays in the browser: /api/me/key takes how it fares, refuses a key, and has nothing to give back", async () => {
    const r = await qa.call("/api/me/key", { body: { key: KEY }, cookie });
    expect(r.status).toBe(400);
    expect(r.data.error).toBe("key_stays_in_browser");
    expect(everything()).not.toContain(KEY);
    expect((await qa.call("/api/me/key", { cookie })).status).toBe(405);
    expect((await qa.call("/api/me/key", { body: { status: "ok" }, cookie })).status).toBe(200);
    expect((await qa.call("/api/me", { cookie })).data).toMatchObject({ gemini_status: "ok" });
    expect((await qa.call("/api/me", { cookie })).data).not.toHaveProperty("gemini_tag");
    expect((await qa.call("/api/me/key", { body: { status: "error", error: "API key not valid." }, cookie })).status).toBe(200);
    expect(qa.raw.prepare("SELECT gemini_status s, gemini_error e FROM users").get()).toEqual({ s: "error", e: "API key not valid." });
    expect((await qa.call("/api/me/key", { body: { status: "none" }, cookie })).status).toBe(200);
    expect(qa.raw.prepare("SELECT gemini_status s, gemini_error e, gemini_checked_at c FROM users").get()).toEqual({ s: "none", e: null, c: null });
    for (const status of ["yes", 1, null, undefined]) expect((await qa.call("/api/me/key", { body: { status }, cookie })).status, String(status)).toBe(400);
    expect((await qa.call("/api/me/key", { body: { status: "ok" } })).status).toBe(401);
    expect(googleCalls).toBe(0);
  });

  it("the Worker never calls Google: a session starts, her lines and her script come back, with no key anywhere", async () => {
    const s = await post("/start", { section: "eo", kind: "practice", taches: [1], mode: "live" });
    expect(s.status).toBe(200);
    const sid = s.data.sessionId;
    expect((await post("/oral/prepare", { sessionId: sid, taskNo: 1 })).status).toBe(200);
    const live = await post("/oral/realtime", { sessionId: sid, taskNo: 1, asked: ["Quel est votre plat préféré ?", 42] });
    expect(live.status).toBe(200);
    expect(Object.keys(live.data).sort()).toEqual(["instructions", "sessionSeconds"]);
    // the questions the browser remembers shape her script for this answer, and are not kept
    expect(live.data.instructions).toContain("« Quel est votre plat préféré ? »");
    expect(everything()).not.toContain("plat préféré");
    expect(googleCalls).toBe(0);
  });
});

describe("sessions", () => {
  it("13 starts in a day: the 13th is 429 daily_cap; the budget hold is 503", async () => {
    for (let i = 0; i < 12; i++) expect((await post("/start", { section: "ee", kind: "practice", taches: [1] })).status, String(i)).toBe(200);
    const r = await post("/start", { section: "ee", kind: "practice", taches: [1] });
    expect(r.status).toBe(429);
    expect(r.data).toEqual({ error: "daily_cap" });
    expect(qa.count("SELECT COUNT(*) n FROM expr_sessions")).toBe(12);
    qa.raw.prepare("UPDATE expr_sessions SET started_at = '2020-01-01'").run();
    qa.raw.prepare("UPDATE budget SET writes = 60000").run();
    expect((await post("/start", { section: "eo", kind: "exam" })).data).toEqual({ error: "hold" });
  });

  it("her lines, her script, a result for a session that is not mine or does not exist: 404, nothing written", async () => {
    const mine = (await post("/start", { section: "eo", kind: "practice", taches: [2], mode: "live" })).data.sessionId;
    qa.raw.prepare("UPDATE expr_sessions SET started_at = ? WHERE id = ?").run(new Date(Date.now() - 60_000).toISOString(), mine);
    const other = await qa.signUp("o@b.com");
    const checks: [string, string, unknown][] = [
      ["POST", "/oral/prepare", { sessionId: mine, taskNo: 2 }],
      ["POST", "/oral/realtime", { sessionId: mine, taskNo: 2 }],
      ["POST", "/result", { sessionId: mine, taskNo: 2, durationS: 10, score20: 12, marks: { score20: 12 } }],
      ["GET", "/session/" + mine, undefined],
      ["POST", "/oral/prepare", { sessionId: "does-not-exist", taskNo: 1 }],
      ["GET", "/session/does-not-exist", undefined],
    ];
    for (const [method, path, body] of checks) {
      const r = await qa.call(`/api/expr${path}`, { method, body, cookie: other });
      expect(r.status, `${method} ${path}`).toBe(404);
      expect(r.headers.get("content-type")).toContain("json");
    }
    expect((qa.raw.prepare("SELECT status s, score20 m FROM expr_tasks WHERE session_id = ?").get(mine) as Row)).toEqual({ s: "pending", m: null });
    // delete and abandon by somebody else: nothing happens
    expect((await qa.call(`/api/expr/session/${mine}`, { method: "DELETE", cookie: other })).status).toBe(200);
    expect((await qa.call(`/api/expr/session/${mine}`, { method: "PATCH", body: { status: "abandoned" }, cookie: other })).status).toBe(200);
    expect((qa.raw.prepare("SELECT status s FROM expr_sessions WHERE id = ?").get(mine) as Row).s).toBe("in_progress");
    expect((await qa.call(`/api/expr/session/${mine}`, { cookie })).status).toBe(200);
  });

  it("the routes that carried texts, turns and recordings are gone", async () => {
    const sid = (await post("/start", { section: "ee", kind: "practice", taches: [1] })).data.sessionId;
    for (const [method, path] of [["POST", "/oral/segment"], ["POST", "/oral/log"], ["POST", "/oral/chunk"], ["POST", "/oral/finish"], ["POST", "/ecrit/submit"], ["PATCH", "/ecrit/draft"], ["POST", "/detail"], ["POST", "/revise"], ["POST", "/revision"], ["POST", "/detail/store"]] as const) {
      const r = await qa.call(`/api/expr${path}`, { method, body: { sessionId: sid, taskNo: 1, text: "Mon texte secret.", items: [{ examinerText: "x" }] }, cookie });
      expect(r.status, `${method} ${path}`).toBe(404);
    }
    expect(everything()).not.toContain("Mon texte secret.");
  });

  it("bodies that are arrays, strings, null, broken JSON: 400 or 404, never 500 and never an internal message", async () => {
    for (const raw of ["[]", "\"x\"", "null", "{", "[1,2]"]) {
      for (const path of ["/start", "/oral/prepare", "/oral/realtime", "/result"]) {
        const r = await qa.call(`/api/expr${path}`, { raw, headers: { "content-type": "application/json" }, cookie });
        expect([400, 404], `${path} ${raw}: ${r.status} ${r.text}`).toContain(r.status);
        expect(r.text).not.toMatch(/D1_|SQLITE|TypeError|at .*\.ts/);
      }
    }
  });

  it("wrong methods: 405 on a known route, 404 on an unknown one", async () => {
    for (const [method, path] of [["GET", "/start"], ["GET", "/oral/prepare"], ["GET", "/oral/realtime"], ["GET", "/result"], ["POST", "/sessions"], ["PUT", "/session/abc"], ["DELETE", "/start"]] as const) {
      const r = await qa.call(`/api/expr${path}`, { method, body: method === "GET" ? undefined : {}, cookie });
      expect(r.status, `${method} ${path}`).toBe(405);
    }
    expect((await qa.call("/api/expr/nothing", { cookie })).status).toBe(404);
  });
});

describe("marks are never lost", () => {
  it("abandoning a session with a task already marked keeps the mark: the session is closed, not erased", async () => {
    const sid = (await post("/start", { section: "eo", kind: "exam" })).data.sessionId;
    qa.raw.prepare("UPDATE expr_tasks SET status = 'done', score20 = 12 WHERE session_id = ? AND task_no = 1").run(sid);
    expect((await qa.call(`/api/expr/session/${sid}`, { method: "DELETE", cookie })).status).toBe(200);
    expect((qa.raw.prepare("SELECT status s FROM expr_sessions WHERE id = ?").get(sid) as Row).s).toBe("abandoned");
    expect(qa.count("SELECT COUNT(*) n FROM expr_tasks WHERE session_id = ? AND score20 = 12", sid)).toBe(1);
    // a session with nothing handed in is erased as before
    const empty = (await post("/start", { section: "eo", kind: "exam" })).data.sessionId;
    expect((await qa.call(`/api/expr/session/${empty}`, { method: "DELETE", cookie })).status).toBe(200);
    expect(qa.count("SELECT COUNT(*) n FROM expr_sessions WHERE id = ?", empty)).toBe(0);
  });

  it("?forget=1 erases a session that is over, marks and all; one in progress is only abandoned; somebody else's stays", async () => {
    const done = (await post("/start", { section: "ee", kind: "practice", taches: [1] })).data.sessionId;
    qa.raw.prepare("UPDATE expr_tasks SET status = 'done', score20 = 15 WHERE session_id = ?").run(done);
    qa.raw.prepare("UPDATE expr_sessions SET status = 'done', finished_at = '2026-10-18T10:00:00.000Z', score = 15 WHERE id = ?").run(done);
    // the plain DELETE keeps it (abandon is a no-op on a done session)
    expect((await qa.call(`/api/expr/session/${done}`, { method: "DELETE", cookie })).status).toBe(200);
    expect(qa.count("SELECT COUNT(*) n FROM expr_sessions WHERE id = ?", done)).toBe(1);
    // somebody else cannot forget it
    const other = await qa.signUp("o@b.com");
    expect((await qa.call(`/api/expr/session/${done}?forget=1`, { method: "DELETE", cookie: other })).status).toBe(200);
    expect(qa.count("SELECT COUNT(*) n FROM expr_sessions WHERE id = ?", done)).toBe(1);
    // its owner can: the session and its tasks go, the history no longer lists it
    expect((await qa.call(`/api/expr/session/${done}?forget=1`, { method: "DELETE", cookie })).status).toBe(200);
    expect(qa.count("SELECT COUNT(*) n FROM expr_sessions WHERE id = ?", done)).toBe(0);
    expect(qa.count("SELECT COUNT(*) n FROM expr_tasks WHERE session_id = ?", done)).toBe(0);
    expect((await qa.call("/api/expr/sessions", { cookie })).data.sessions.map((s: Row) => s.id)).not.toContain(done);
    // an abandoned one goes the same way
    const left = (await post("/start", { section: "eo", kind: "exam" })).data.sessionId;
    qa.raw.prepare("UPDATE expr_tasks SET status = 'done', score20 = 9 WHERE session_id = ? AND task_no = 1").run(left);
    qa.raw.prepare("UPDATE expr_sessions SET status = 'abandoned', finished_at = '2026-10-18T10:00:00.000Z' WHERE id = ?").run(left);
    expect((await qa.call(`/api/expr/session/${left}?forget=1`, { method: "DELETE", cookie })).status).toBe(200);
    expect(qa.count("SELECT COUNT(*) n FROM expr_sessions WHERE id = ?", left)).toBe(0);
    // one still in progress with a mark: ?forget=1 behaves like the plain DELETE — abandoned, the mark kept
    const live = (await post("/start", { section: "eo", kind: "exam" })).data.sessionId;
    qa.raw.prepare("UPDATE expr_tasks SET status = 'done', score20 = 12 WHERE session_id = ? AND task_no = 1").run(live);
    expect((await qa.call(`/api/expr/session/${live}?forget=1`, { method: "DELETE", cookie })).status).toBe(200);
    expect((qa.raw.prepare("SELECT status s FROM expr_sessions WHERE id = ?").get(live) as Row).s).toBe("abandoned");
    expect(qa.count("SELECT COUNT(*) n FROM expr_tasks WHERE session_id = ? AND score20 = 12", live)).toBe(1);
  });
});

describe("marks computed in the browser", () => {
  const evalOf = (score20: number) => ({ score20, criteria: [{ name: "Grammar", score: score20, reason: "« Bonjour madame »" }], tips: [{ text: "Écrivez « merci »." }], version: "x" });
  const age = (sid: string) => qa.raw.prepare("UPDATE expr_sessions SET started_at = ? WHERE id = ?").run(new Date(Date.now() - 60_000).toISOString(), sid);

  it("writing: the marks and the length are stored, never the text; level and NCLC worked out here; no words is 0/20; never twice", async () => {
    const sid = (await post("/start", { section: "ee", kind: "practice", taches: [1, 2] })).data.sessionId;
    expect((await post("/result", { sessionId: sid, taskNo: 1, wordCount: 5, elapsedS: 300, score20: 12, marks: evalOf(12) })).status).toBe(400); // too soon
    age(sid);
    const r = await post("/result", { sessionId: sid, taskNo: 1, wordCount: 5, elapsedS: 300, score20: 12, marks: evalOf(12), text: "Bonjour madame, je vous écris." });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ score20: 12, level: expect.any(String), nclc: expect.any(Number) });
    const t = qa.raw.prepare("SELECT status, score20, word_count, marks_json FROM expr_tasks WHERE session_id = ? AND task_no = 1").get(sid) as Row;
    expect(t).toMatchObject({ status: "done", score20: 12, word_count: 5 });
    expect(JSON.parse(t.marks_json).criteria).toEqual([{ name: "Grammar", score: 12 }]);
    expect(everything()).not.toMatch(/Bonjour madame|merci/);
    expect((await post("/result", { sessionId: sid, taskNo: 1, wordCount: 1, elapsedS: 1, score20: 20, marks: evalOf(20) })).status).toBe(409);
    // impossible marks and lengths
    for (const score20 of [21, -1, 12.5, "12"]) expect((await post("/result", { sessionId: sid, taskNo: 2, wordCount: 2, elapsedS: 1, score20, marks: evalOf(12) })).status, String(score20)).toBe(400);
    for (const wordCount of [-1, 3.5, "x", 5000, undefined]) expect((await post("/result", { sessionId: sid, taskNo: 2, wordCount, elapsedS: 1, score20: 12, marks: evalOf(12) })).status, String(wordCount)).toBe(400);
    expect((await post("/result", { sessionId: sid, taskNo: 2, wordCount: 2, elapsedS: 1, score20: 15, marks: evalOf(9) })).status).toBe(400); // mark and evaluation disagree
    // no words: 0/20 whatever the browser says
    const z = await post("/result", { sessionId: sid, taskNo: 2, wordCount: 0, elapsedS: 1, score20: 18, marks: evalOf(18) });
    expect(z.data).toMatchObject({ score20: 0, nclc: 0, finished: true });
  });

  it("speaking: the marks are stored; turns and questions sent along are not", async () => {
    const sid = (await post("/start", { section: "eo", kind: "practice", taches: [1] })).data.sessionId;
    age(sid);
    const turns = [{ role: "candidate", text: "Je m'appelle Léa.", t: 5, clipId: "c1", durationS: 3 }];
    const r = await post("/result", { sessionId: sid, taskNo: 1, turns, durationS: 120, score20: 10, marks: evalOf(10), asked: ["Quel est votre métier ?"] });
    expect(r.status).toBe(200);
    const t = qa.raw.prepare("SELECT status, score20, duration_s FROM expr_tasks WHERE session_id = ?").get(sid) as Row;
    expect(t).toEqual({ status: "done", score20: 10, duration_s: 120 });
    expect(everything()).not.toMatch(/Léa|métier/);
    expect(qa.count("SELECT COUNT(*) n FROM user_kv")).toBe(0);
  });

  it("somebody else's session is 404", async () => {
    const sid = (await post("/start", { section: "ee", kind: "practice", taches: [1] })).data.sessionId;
    age(sid);
    const other = await qa.signUp("o@b.com");
    expect((await post("/result", { sessionId: sid, taskNo: 1, wordCount: 1, elapsedS: 1, score20: 1, marks: evalOf(1) }, other)).status).toBe(404);
  });
});
