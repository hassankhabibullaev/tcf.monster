// The progress rules (shared/progress.ts) and the sync route, on a real SQLite.
import { describe, it, expect, beforeEach } from "vitest";
import { makeEnv } from "../../scripts/local-env.ts";
import type { Env } from "../../worker/util.ts";
import type { Me } from "../../worker/auth.ts";
import { apply, counts, emptyState, levelOfPosition, POINTS, LEVELS, type Event, type State } from "../../shared/progress.ts";
import { handleProgress, handleSync, cleanEvent, shiftBundle } from "../../worker/coce/progress.ts";

type Row = Record<string, any>;
let env: Env, raw: ReturnType<typeof makeEnv>["raw"];
const me: Me = { id: "u1", email: "u1@example.com", sid: "s1" };
const other: Me = { id: "u2", email: "u2@example.com", sid: "s2" };
let stmts = 0;

beforeEach(() => {
  const e = makeEnv();
  env = e.env as unknown as Env; raw = e.raw;
  raw.prepare("INSERT INTO users (id, email, created_at) VALUES ('u1', 'u1@example.com', 'x'), ('u2', 'u2@example.com', 'x')").run();
  // count every statement sent to D1 (a batch counts its statements), to measure a request's cost
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
const ev = (p: Partial<Event> & { t: number }): Event => ({ id: `id-${p.t}-${p.qid ?? "p"}`, section: "co", level: "B1", type: "answer", qid: "q1", key: "B", right: true, ...p });

const sync = async (events: unknown[], who = me) => {
  const r = await handleSync(new Request("https://app.tcf.monster/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events }) }), env, who);
  return { status: r.status, data: (await r.json()) as Row };
};
const progress = async (section = "co", who = me) => {
  const url = new URL(`https://app.tcf.monster/api/progress?section=${section}`);
  const r = await handleProgress(new Request(url), env, who, url);
  return { status: r.status, data: (await r.json()) as Row };
};

describe("apply: the rules of docs/COCE.md §2", () => {
  it("grey → green or red; red + right → amber; red + wrong → red; green and amber ignore answers", () => {
    let s = emptyState();
    s = apply(s, ev({ t: 10, right: false }));
    expect(s.q.q1).toEqual({ s: "red", t: 10, a: "B" });
    s = apply(s, ev({ t: 11, right: false, key: "C" }));
    expect(s.q.q1).toEqual({ s: "red", t: 11, a: "C" });
    s = apply(s, ev({ t: 12, right: true, key: "A" }));
    expect(s.q.q1).toEqual({ s: "amber", t: 12, a: "A" });
    const before = s;
    expect(apply(s, ev({ t: 13, right: false }))).toBe(before);
    expect(apply(s, ev({ t: 14, right: true }))).toBe(before);
    const g = apply(emptyState(), ev({ t: 1, qid: "q9", right: true }));
    expect(g.q.q9.s).toBe("green");
    expect(apply(g, ev({ t: 2, qid: "q9", right: false }))).toBe(g);
  });

  it("an event applies only when strictly later than the entry; the same bundle twice changes nothing", () => {
    const bundle: Event[] = [ev({ t: 10, right: false }), ev({ t: 20, right: true }), ev({ t: 30, qid: "q2", right: true }), ev({ t: 31, type: "pos", n: 7 })];
    const once = bundle.reduce(apply, emptyState());
    expect(once.q.q1).toEqual({ s: "amber", t: 20, a: "B" });
    expect(once.pos).toBe(7);
    const twice = bundle.reduce(apply, once);
    expect(twice).toBe(once);
    // an older event, arriving late, does nothing; the same second does nothing either
    expect(apply(once, ev({ t: 15, right: false }))).toBe(once);
    expect(apply(once, ev({ t: 20, right: false }))).toBe(once);
    // the state object is never changed in place
    expect(once.q.q1.t).toBe(20);
  });

  it("mark only on green or amber; reset removes; pos remembers", () => {
    let s = apply(emptyState(), ev({ t: 1, right: true }));
    s = apply(s, ev({ t: 2, type: "mark", s: "amber" }));
    expect(s.q.q1).toEqual({ s: "amber", t: 2, a: "B" });
    s = apply(s, ev({ t: 3, type: "mark", s: "green" }));
    expect(s.q.q1.s).toBe("green");
    const red = apply(emptyState(), ev({ t: 1, right: false }));
    expect(apply(red, ev({ t: 2, type: "mark", s: "green" }))).toBe(red);
    expect(apply(emptyState(), ev({ t: 2, type: "mark", s: "green" }))).toEqual(emptyState());
    const gone = apply(s, ev({ t: 4, type: "reset" }));
    expect(gone.q.q1).toBeUndefined();
    expect(apply(gone, ev({ t: 5, type: "reset" }))).toBe(gone);
    expect(apply(s, ev({ t: 3, type: "reset" }))).toBe(s); // not strictly later
    const p = apply(s, ev({ t: 9, type: "pos", n: 12 }));
    expect(p.pos).toBe(12);
    expect(p.q).toBe(s.q);
    expect(apply(p, ev({ t: 10, type: "pos", n: 12 }))).toBe(p);
  });

  it("counts, levels, points, positions", () => {
    let s: State = emptyState();
    s = apply(s, ev({ t: 1, qid: "a", right: true }));
    s = apply(s, ev({ t: 1, qid: "b", right: false }));
    s = apply(s, ev({ t: 1, qid: "c", right: false }));
    s = apply(s, ev({ t: 2, qid: "c", right: true }));
    expect(counts(s, 10)).toEqual({ green: 1, red: 1, amber: 1, grey: 7 });
    expect(LEVELS.reduce((n, l) => n + POINTS[l] * ({ A1: 4, A2: 6, B1: 9, B2: 10, C1: 6, C2: 4 } as Row)[l], 0)).toBe(699);
    expect([1, 4, 5, 10, 11, 19, 20, 29, 30, 35, 36, 39].map(levelOfPosition)).toEqual(["A1", "A1", "A2", "A2", "B1", "B1", "B2", "B2", "C1", "C1", "C2", "C2"]);
  });
});

describe("the sync route", () => {
  it("validates events: bad ones are dropped, good ones trimmed", () => {
    const T = 1_760_000_000; // a real stamp (2025-10): anything before 2025 is not an event of this app
    expect(cleanEvent(ev({ t: T }))).toMatchObject({ type: "answer", qid: "q1", key: "B", right: true });
    expect(cleanEvent({ ...ev({ t: T }), extra: 1, dt: 500 })).toEqual({ id: `id-${T}-p`, section: "co", level: "B1", t: T, type: "answer", qid: "q1", key: "B", right: true, dt: 120 });
    expect(cleanEvent(ev({ t: 1 }))).toBeNull();
    expect(cleanEvent(ev({ t: T, key: "E" as any }))).toBeNull();
    expect(cleanEvent(ev({ t: T, section: "xx" as any }))).toBeNull();
    expect(cleanEvent(ev({ t: T, level: "B3" as any }))).toBeNull();
    expect(cleanEvent(ev({ t: T, id: "x".repeat(41) }))).toBeNull();
    expect(cleanEvent(ev({ t: T, qid: "x".repeat(65) }))).toBeNull();
    expect(cleanEvent(ev({ t: "1" as any }))).toBeNull();
    expect(cleanEvent(ev({ t: T, type: "mark", s: "red" as any }))).toBeNull();
    expect(cleanEvent(ev({ t: T, type: "pos", n: 0 }))).toBeNull();
    expect(cleanEvent({ ...ev({ t: T, type: "reset" }), qid: undefined })).toBeNull();
    expect(cleanEvent(ev({ t: T, type: "other" as any }))).toBeNull();
    expect(shiftBundle([{ t: 1000 }, { t: 1100 }], 1000)).toEqual([{ t: 960 }, { t: 1060 }]);
    expect(shiftBundle([{ t: 1000 }], 1000)[0].t).toBe(1000);
  });

  it("writes one row per level touched, upkeeps practice_days, counts the writes; a resent bundle adds nothing", async () => {
    const t0 = Math.floor(Date.now() / 1000) - 100;
    const bundle = [
      ev({ t: t0, right: false, dt: 30 }), ev({ t: t0 + 1, right: true, dt: 200 }),
      ev({ t: t0 + 2, qid: "q2", right: true, level: "A1" }), ev({ t: t0 + 3, qid: "q3", right: false, section: "ce" }),
      ev({ t: t0 + 4, type: "pos", n: 3 }), { bad: true },
    ];
    stmts = 0;
    const r = await sync(bundle);
    expect(r.data).toEqual({ ok: true, applied: 5 });
    const perSync = stmts;
    expect(count("SELECT COUNT(*) n FROM progress WHERE user_id = 'u1'")).toBe(3);
    expect(JSON.parse((raw.prepare("SELECT data FROM progress WHERE user_id = 'u1' AND section = 'co' AND level = 'B1'").get() as Row).data))
      .toEqual({ v: 1, q: { q1: { s: "amber", t: t0 + 1, a: "B" } }, pos: 3 });
    const days = raw.prepare("SELECT section, level, answered, wrong, seconds FROM practice_days WHERE user_id = 'u1' ORDER BY section, level").all() as Row[];
    expect(days).toEqual([
      { section: "ce", level: "B1", answered: 1, wrong: 1, seconds: 0 },
      { section: "co", level: "A1", answered: 1, wrong: 0, seconds: 0 },
      { section: "co", level: "B1", answered: 2, wrong: 1, seconds: 150 },
    ]);
    const writes = count("SELECT writes n FROM budget");
    expect(writes).toBe(6); // 3 progress rows + 3 practice days
    expect(perSync).toBeLessThanOrEqual(9); // budget check + read + 6 in one batch + the budget upkeep

    stmts = 0;
    expect((await sync(bundle)).data).toEqual({ ok: true, applied: 0 });
    expect(count("SELECT writes n FROM budget")).toBe(writes);
    expect(stmts).toBe(2); // budget check + read; nothing written
    expect(count("SELECT answered n FROM practice_days WHERE section = 'co' AND level = 'B1'")).toBe(2);

    // a later answer on another question: one row written for that level, the rest untouched
    expect((await sync([ev({ t: t0 + 10, qid: "q5", right: true })])).data.applied).toBe(1);
    expect(count("SELECT writes n FROM budget")).toBe(writes + 2);
  });

  it("GET gives the six levels, empty when missing, and the person's own rows only", async () => {
    const t = Math.floor(Date.now() / 1000);
    await sync([ev({ t, qid: "q1", right: true })]);
    const { status, data } = await progress("co");
    expect(status).toBe(200);
    expect(Object.keys(data.levels)).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
    expect(data.levels.B1.q.q1.s).toBe("green");
    expect(data.levels.A1).toEqual(emptyState());
    expect(typeof data.updatedAt).toBe("string");
    expect((await progress("ce")).data.updatedAt).toBeNull();
    expect((await progress("co", other)).data.levels.B1).toEqual(emptyState());
    expect((await progress("xx")).status).toBe(400);
  });

  it("holds past the day's budget, before writing anything", async () => {
    raw.prepare("INSERT INTO budget (day, writes) VALUES (?, 60000)").run(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date()));
    const r = await sync([ev({ t: Math.floor(Date.now() / 1000) })]);
    expect(r.data).toEqual({ hold: true });
    expect(count("SELECT COUNT(*) n FROM progress")).toBe(0);
    expect(count("SELECT writes n FROM budget")).toBe(60000);
  });

  it("refuses what is not a bundle; caps the bundle; a clock ahead is moved back", async () => {
    expect((await sync("x" as any)).status).toBe(400);
    const r = await handleSync(new Request("https://app.tcf.monster/api/sync", { method: "POST", body: "{" }), env, me);
    expect(r.status).toBe(400);
    const big = new Request("https://app.tcf.monster/api/sync", { method: "POST", body: JSON.stringify({ events: [], pad: "x".repeat(300 * 1024) }) });
    expect((await handleSync(big, env, me)).status).toBe(413);
    const many = Array.from({ length: 600 }, (_, i) => ev({ t: 1_760_000_000 + i, qid: `q${i}` }));
    expect((await sync(many)).data.applied).toBe(500);
    const ahead = Math.floor(Date.now() / 1000) + 3600;
    await sync([ev({ t: ahead, qid: "late", right: true })]);
    const t = JSON.parse((raw.prepare("SELECT data FROM progress WHERE level = 'B1' AND section = 'co'").get() as Row).data).q.late.t;
    expect(t).toBeLessThanOrEqual(Date.now() / 1000 + 61);
  });
});
