// The terms in force (TERMS_VERSION): a person who accepted an older version is asked the three ticks again, once
// (GET /api/me says terms_ok: false), and POST /api/me { terms: true } records the current version.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setup, teardown, type QA } from "./helpers.ts";
import { TERMS_VERSION } from "../../worker/auth.ts";

let qa: QA;
beforeEach(() => { qa = setup(); });
afterEach(teardown);

describe("terms accepted again", () => {
  it("a new account is on the current terms; an older acceptance asks again, once", async () => {
    const cookie = await qa.signUp("terms@example.com");
    expect((await qa.call("/api/me", { cookie })).data.terms_ok).toBe(true);
    qa.raw.prepare("UPDATE users SET terms_version = '2' WHERE email = ?").run("terms@example.com");
    expect((await qa.call("/api/me", { cookie })).data.terms_ok).toBe(false);
    expect((await qa.call("/api/me", { cookie, body: { terms: false } })).status).toBe(400);
    const r = await qa.call("/api/me", { cookie, body: { terms: true } });
    expect(r.status).toBe(200);
    expect(r.data.terms_ok).toBe(true);
    const row = qa.raw.prepare("SELECT terms_version, terms_at FROM users WHERE email = ?").get("terms@example.com") as { terms_version: string; terms_at: string };
    expect(row.terms_version).toBe(TERMS_VERSION);
    expect(row.terms_at).toBeTruthy();
    expect((await qa.call("/api/me", { cookie })).data).not.toHaveProperty("terms_version");
  });
});
