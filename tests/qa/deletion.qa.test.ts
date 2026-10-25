// Deleting an account (by the person, by the owner) leaves no row with its id in any table: the privacy page says the
// deletion is immediate.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setup, teardown, type QA } from "./helpers.ts";

let qa: QA;
beforeEach(() => { qa = setup(); });
afterEach(teardown);

/** every table that has a user_id column, and how many rows it holds for this person */
function leftovers(id: string) {
  const tables = (qa.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
  const out: Record<string, number> = {};
  for (const t of tables) {
    const cols = (qa.raw.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    const col = cols.includes("user_id") ? "user_id" : t === "users" ? "id" : null;
    if (!col) continue;
    const n = (qa.raw.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${col} = ?`).get(id) as { n: number }).n;
    if (n) out[t] = n;
  }
  return out;
}

describe("account deletion leaves nothing", () => {
  it("by the person, with the code", async () => {
    const cookie = await qa.signUp("gone@example.com");
    const id = qa.userId("gone@example.com");
    qa.raw.prepare("INSERT INTO usage (user_id, day, requests, writes) VALUES (?, '2026-10-25', 5, 1)").run(id);
    qa.raw.prepare("INSERT INTO guard_events (user_id, at, kind, detail) VALUES (?, '2026-10-25T00:00:00Z', 'challenged', 'test')").run(id);
    expect((await qa.call("/api/me/delete/code", { cookie, body: {} })).status).toBe(200);
    expect((await qa.call("/api/me/delete", { cookie, body: { code: qa.lastCode() } })).status).toBe(200);
    expect(leftovers(id)).toEqual({});
  });
});
