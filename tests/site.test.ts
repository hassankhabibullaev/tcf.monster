// The public site's English: the dictionary runs, and every text the French page marks for translation has its
// English (a broken dictionary leaves the whole page in French while the switch says EN).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (p: string) => readFileSync(new URL(`../site/${p}`, import.meta.url), "utf8");

describe("the public site's English", () => {
  it("runs, and covers every marked text of the home page", () => {
    const window: { EN?: Record<string, string> } = {};
    runInNewContext(read("i18n.js"), { window });
    const EN = window.EN!;
    expect(EN).toBeTruthy();
    const keys = [...read("index.html").matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map((m) => m[1]);
    const attrs = [...read("index.html").matchAll(/data-i18n-attr="[^:"]+:([^"]+)"/g)].map((m) => m[1]);
    const missing = [...new Set([...keys, ...attrs])].filter((k) => !(k in EN));
    expect(missing).toEqual([]);
  });
});

// One look everywhere (the owner's rule, 2026-10-19): the theme switch, the language pill, the wordmark and its lockup,
// Monster AI, the buttons and the examiner are drawn by one block of rules in the app; the public site carries exact
// copies of those blocks.
describe("the public site and the app share their pieces", () => {
  const block = (css: string, name: string) => {
    const start = css.indexOf(`/* shared:${name} —`);
    const end = css.indexOf(`/* shared:${name} end */`);
    expect(start, `shared:${name} start`).toBeGreaterThanOrEqual(0);
    expect(end, `shared:${name} end`).toBeGreaterThan(start);
    return css.slice(start, end);
  };
  const app = (p: string) => readFileSync(new URL(`../web/${p}`, import.meta.url), "utf8");
  it("the theme switch and the language pill", () => {
    expect(block(read("styles.css"), "switches")).toBe(block(app("ui/base.css"), "switches"));
  });
  it("the wordmark and the lockup, on laptop and on a phone", () => {
    expect(block(read("styles.css"), "brand")).toBe(block(app("ui/base.css"), "brand"));
    expect(block(read("styles.css"), "brand-phone")).toBe(block(app("ui/base.css"), "brand-phone"));
  });
  it("Monster AI", () => {
    expect(block(read("styles.css"), "mai")).toBe(block(app("ui/base.css"), "mai"));
  });
  it("the buttons", () => {
    expect(block(read("styles.css"), "buttons")).toBe(block(app("ui/base.css"), "buttons"));
  });
  it("the examiner", () => {
    expect(block(read("styles.css"), "examiner")).toBe(block(app("app/sim/sim.css"), "examiner"));
  });
  it("every page of the site loads our own scrollbars and the shared theme switch", () => {
    for (const page of ["index.html", "terms.html", "privacy.html", "404.html", "thanks.html"]) {
      const html = read(page);
      expect(html, page).toContain("/scrollbars.css");
      if (html.includes("data-theme-switch")) expect(html, page).toContain('class="theme-switch"');
    }
  });
});

describe("https only", () => {
  it("plain http moves to https (a write keeps its method); https answers carry HSTS; this Mac's localhost stays as it is", async () => {
    const { default: worker } = await import("../worker/index.ts");
    const { makeEnv } = await import("../scripts/local-env.ts");
    const env = makeEnv().env as never;
    const get = await worker.fetch(new Request("http://tcf.monster/sign-in?x=1"), env);
    expect(get.status).toBe(301);
    expect(get.headers.get("location")).toBe("https://tcf.monster/sign-in?x=1");
    const post = await worker.fetch(new Request("http://tcf.monster/api/auth/login", { method: "POST", body: "{}" }), env);
    expect(post.status).toBe(308);
    const api = await worker.fetch(new Request("https://tcf.monster/api/me"), env);
    expect(api.headers.get("strict-transport-security")).toBe("max-age=31536000");
    const local = await worker.fetch(new Request("http://localhost:3204/api/me"), env);
    expect(local.status).toBe(401);
  });
});
