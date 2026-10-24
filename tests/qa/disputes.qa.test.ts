// « Signaler un problème »: POST /api/disputes and the GET of one's own reports per level, the guards (signed in,
// fields, 2 000 characters, 20 a day, the hold line, another site), and the admin's side (list, resolve, reopen, the
// Overview's count, a deleted person takes their reports along).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setup, teardown, ADMIN, type QA } from "./helpers.ts";
import { BUDGET_HOLD, day } from "../../worker/util.ts";

let qa: QA, cookie: string, owner: string;
beforeEach(async () => {
  qa = setup({ OWNER_EMAIL: "owner@tcf.monster", ADMIN_OPEN: "0" });
  cookie = await qa.signUp("a@b.com");
  owner = await qa.signUp("owner@tcf.monster");
});
afterEach(teardown);

const report = (body: Record<string, unknown>, c = cookie) =>
  qa.call("/api/disputes", { body: { section: "co", level: "B1", questionId: "q-12", n: 12, message: "La réponse B est aussi juste.", ...body }, cookie: c });
const admin = (path: string, body?: unknown) => qa.call(`/api/admin${path}`, { host: ADMIN, cookie: owner, body });

describe("a person's report", () => {
  it("is stored once, with the person's words, and listed for its level only", async () => {
    const r = await report({});
    expect(r.status).toBe(201);
    const row = qa.raw.prepare("SELECT * FROM disputes").get() as Record<string, unknown>;
    expect(row).toMatchObject({ user_id: qa.userId("a@b.com"), section: "co", level: "B1", question_id: "q-12", n: 12, message: "La réponse B est aussi juste.", status: "open", resolved_at: null });
    expect((await qa.call("/api/disputes?section=co&level=B1", { cookie })).data).toEqual({ ids: ["q-12"] });
    expect((await qa.call("/api/disputes?section=co&level=B2", { cookie })).data).toEqual({ ids: [] });
    expect((await qa.call("/api/disputes?section=ce&level=B1", { cookie })).data).toEqual({ ids: [] });
    // someone else sees none of it
    expect((await qa.call("/api/disputes?section=co&level=B1", { cookie: owner })).data).toEqual({ ids: [] });
    // a second report on the same question is a second row, listed once
    await report({ message: "Et l'audio coupe." });
    expect((await qa.call("/api/disputes?section=co&level=B1", { cookie })).data).toEqual({ ids: ["q-12"] });
    expect(qa.count("SELECT COUNT(*) n FROM disputes")).toBe(2);
    expect(qa.count("SELECT writes n FROM budget WHERE day = ?", day("Asia/Tashkent"))).toBeGreaterThanOrEqual(2);
  });

  it("refuses what is not a report", async () => {
    expect((await qa.call("/api/disputes", { body: { section: "co" } })).status).toBe(401);
    expect((await qa.call("/api/disputes?section=co&level=B1")).status).toBe(401);
    expect((await report({ section: "ee" })).status).toBe(400);
    expect((await report({ level: "D1" })).status).toBe(400);
    expect((await report({ questionId: "a b" })).status).toBe(400);
    expect((await report({ questionId: 7 })).status).toBe(400);
    expect((await report({ n: 0 })).status).toBe(400);
    expect((await report({ n: 1.5 })).status).toBe(400);
    expect((await report({ message: "   " })).status).toBe(400);
    expect((await report({ message: 5 })).status).toBe(400);
    expect((await report({ message: "x".repeat(2001) })).data.error).toBe("too_long");
    expect((await report({ message: "x".repeat(2000) })).status).toBe(201);
    expect((await qa.call("/api/disputes?section=xx&level=B1", { cookie })).status).toBe(400);
    expect((await qa.call("/api/disputes", { raw: "not json", cookie, headers: { "content-type": "application/json" } })).status).toBe(400);
    expect((await qa.call("/api/disputes", { method: "PUT", body: {}, cookie })).status).toBe(405);
    // from another site
    expect((await qa.call("/api/disputes", { body: { section: "co" }, cookie, origin: "https://evil.example" })).status).toBe(403);
    expect(qa.count("SELECT COUNT(*) n FROM disputes")).toBe(1);
  });

  it("at most 20 a person a day; none past the hold line", async () => {
    for (let i = 0; i < 20; i++) expect((await report({ n: i + 1 })).status).toBe(201);
    const over = await report({ n: 21 });
    expect(over.status).toBe(429);
    expect(over.data.error).toBe("daily_cap");
    expect((await report({}, owner)).status).toBe(201); // another person is not held back
    // a day later the person may write again
    qa.raw.prepare("UPDATE disputes SET created_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await report({ n: 22 })).status).toBe(201);
    qa.raw.prepare("INSERT INTO budget (day, writes) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET writes = excluded.writes").run(day("Asia/Tashkent"), BUDGET_HOLD);
    const held = await report({ n: 23 });
    expect(held.status).toBe(503);
    expect(held.data.error).toBe("hold");
  });
});

describe("the admin's Disputes page", () => {
  it("lists newest first with who sent it, resolves and reopens, and the Overview counts the open ones", async () => {
    await report({ n: 3, message: "first" });
    await report({ section: "ce", level: "C1", questionId: "ce-9", n: 9, message: "second" });
    expect((await admin("/overview")).data.disputesOpen).toBe(2);
    const list = (await admin("/disputes")).data;
    expect(list.rows.map((r: Record<string, unknown>) => r.message)).toEqual(["second", "first"]);
    expect(list.rows[0]).toMatchObject({ email: "a@b.com", section: "ce", level: "C1", question_id: "ce-9", n: 9, status: "open" });
    expect([list.open, list.resolved]).toEqual([2, 0]);

    const id = list.rows[1].id;
    expect((await admin(`/disputes/${id}/resolve`, {})).status).toBe(200);
    expect((await admin("/overview")).data.disputesOpen).toBe(1);
    expect((await admin("/disputes")).data.rows.map((r: Record<string, unknown>) => r.message)).toEqual(["second"]);
    const resolved = (await admin("/disputes?status=resolved")).data.rows;
    expect(resolved.length).toBe(1);
    expect(resolved[0].resolved_at).toBeTruthy();
    expect((await admin("/disputes?status=all")).data.rows.length).toBe(2);

    expect((await admin(`/disputes/${id}/reopen`, {})).status).toBe(200);
    expect(qa.raw.prepare("SELECT status, resolved_at FROM disputes WHERE id = ?").get(id)).toEqual({ status: "open", resolved_at: null });
    expect((await admin("/disputes/999/resolve", {})).status).toBe(404);
    expect((await admin(`/disputes/${id}/shred`, {})).status).toBe(404);
  });

  it("is the owner's only, and a write needs the x-admin header", async () => {
    await report({});
    expect((await qa.call("/api/admin/disputes", { host: ADMIN, cookie })).status).toBe(403);
    expect((await qa.call("/api/admin/disputes", { host: ADMIN })).status).toBe(403);
    const id = (await admin("/disputes")).data.rows[0].id;
    expect((await qa.call(`/api/admin/disputes/${id}/resolve`, { host: ADMIN, cookie: owner, body: {}, headers: { "x-admin": "0" } })).status).toBe(403);
    // the app's door has no admin
    expect((await qa.call("/api/admin/disputes", { cookie: owner })).status).toBe(404);
  });

  it("a deleted person's reports go with them", async () => {
    await report({});
    const id = qa.userId("a@b.com");
    expect((await admin(`/people/${id}/delete`, {})).status).toBe(200);
    expect(qa.count("SELECT COUNT(*) n FROM disputes")).toBe(0);
  });
});
