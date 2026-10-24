// One address for the site and the application (2026-10-19): tcf.monster/ is the public site for a visitor and the
// dashboard for a signed-in person; /about is the site for everyone (marked for a signed-in person, so its bar offers
// the dashboard); the site's pages and its old French addresses; app.tcf.monster and www.tcf.monster move to the
// bare domain for good, an API write included; the admin keeps its own door.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setup, teardown, type QA } from "./helpers.ts";

const page = (name: string) => new Response(`<!doctype html><html lang="fr"><body>${name}</body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
/** the built pages, the way the asset server answers them: the SPA at /app/, the admin at /admin/, the site at /site/… */
const ASSETS = {
  fetch: async (input: Request | string) => {
    const p = new URL(typeof input === "string" ? input : input.url).pathname;
    const pages: Record<string, string> = { "/app/": "APP", "/admin/": "ADMIN", "/site/": "SITE", "/site/terms": "TERMS", "/site/privacy": "PRIVACY", "/site/thanks": "THANKS" };
    if (pages[p]) return page(pages[p]);
    if (p === "/site/assets/app-icon-96.png") return new Response("png", { headers: { "content-type": "image/png" } });
    return new Response("not found", { status: 404 });
  },
};

let qa: QA;
beforeEach(() => { qa = setup(); (qa.env as unknown as { ASSETS: typeof ASSETS }).ASSETS = ASSETS; });
afterEach(teardown);

describe("tcf.monster, one address", () => {
  it("the root: the site for a visitor (indexable), the dashboard for a signed-in person", async () => {
    const out = await qa.call("/");
    expect(out.text).toContain("SITE");
    expect(out.text).not.toContain("data-signed-in");
    expect(out.headers.get("x-robots-tag")).toBeNull();
    const cookie = await qa.signUp("ana@example.com");
    const inside = await qa.call("/", { cookie });
    expect(inside.text).toContain("APP");
    expect(inside.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("/about is the site for everyone, marked for a signed-in person; the site's pages and old addresses", async () => {
    expect((await qa.call("/about")).text).toContain("SITE");
    const cookie = await qa.signUp("bo@example.com");
    const marked = await qa.call("/about", { cookie });
    expect(marked.text).toContain("SITE");
    expect(marked.text).toContain("<html lang=\"fr\" data-signed-in>");
    expect((await qa.call("/terms")).text).toContain("TERMS");
    expect((await qa.call("/privacy/")).text).toContain("PRIVACY");
    expect((await qa.call("/thanks")).text).toContain("THANKS");
    const old = await qa.call("/conditions");
    expect(old.status).toBe(301);
    expect(old.headers.get("location")).toBe("https://tcf.monster/terms");
    // a signed-out visitor deeper in the app gets the application (its own door asks for the sign-in)
    expect((await qa.call("/co/practice")).text).toContain("APP");
    // the logo the sent e-mails ask for, at its old address
    expect((await qa.call("/assets/app-icon-96.png")).text).toBe("png");
  });

  it("app.tcf.monster and www.tcf.monster go to the same place on tcf.monster; a write keeps its method", async () => {
    const a = await qa.call("/co/exam/3?mode=training", { host: "app.tcf.monster" });
    expect(a.status).toBe(301);
    expect(a.headers.get("location")).toBe("https://tcf.monster/co/exam/3?mode=training");
    const w = await qa.call("/", { host: "www.tcf.monster" });
    expect(w.headers.get("location")).toBe("https://tcf.monster/");
    const post = await qa.call("/api/sync", { host: "app.tcf.monster", body: { events: [] } });
    expect(post.status).toBe(308);
    expect(post.headers.get("location")).toBe("https://tcf.monster/api/sync");
  });

  it("the admin keeps its door; the app's API answers on the bare domain", async () => {
    expect((await qa.call("/", { host: "admin.tcf.monster" })).text).toContain("ADMIN");
    expect((await qa.call("/api/me")).status).toBe(401);
    const cookie = await qa.signUp("cy@example.com");
    expect((await qa.call("/api/me", { cookie })).status).toBe(200);
  });
});
