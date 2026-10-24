// web/app/guard-fetch.ts: every call to our own server that meets the guard's human check shows one Turnstile box,
// whatever is waiting on it, and goes again with its token; a block sends the page to the door; others' calls untouched.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const humanToken = vi.fn(async () => "tok");
vi.mock("../../web/app/turnstile.ts", () => ({ humanToken }));

let passed = false;
let sent: { path: string; token: string | null }[] = [];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const replace = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  humanToken.mockClear(); replace.mockClear();
  passed = false; sent = [];
  vi.stubGlobal("document", { documentElement: { lang: "fr" } });
  vi.stubGlobal("location", { origin: "https://tcf.monster", pathname: "/co", search: "", replace });
  const plain = async (path: string, init?: RequestInit) => {
    const token = new Headers(init?.headers).get("x-turnstile");
    sent.push({ path, token });
    if (path === "/api/blocked") return json({ error: "blocked" }, 403);
    if (path.startsWith("https://other")) return json({ error: "human", turnstile: "x" }, 429);
    if (token === "tok") passed = true;
    return passed ? json([{ id: path }]) : json({ error: "human", turnstile: "site-key" }, 429);
  };
  vi.stubGlobal("window", { fetch: plain });
  vi.stubGlobal("fetch", plain);
  const { installGuardFetch } = await import("../../web/app/guard-fetch.ts");
  installGuardFetch();
});
afterEach(() => vi.unstubAllGlobals());

describe("the guard's answers in the browser", () => {
  it("requests asked together share one check; each goes again with its token and arrives", async () => {
    const all = await Promise.all(["/data/co-A1.json", "/data/co-A2.json", "/api/me"].map((p) => window.fetch(p)));
    expect(all.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(humanToken).toHaveBeenCalledTimes(1);
    expect(humanToken).toHaveBeenCalledWith("site-key", "human", "fr");
  });

  it("a check that never passes ends in the server's answer, not a loop", async () => {
    humanToken.mockImplementation(async () => "wrong");
    const r = await window.fetch("/api/me");
    expect(r.status).toBe(429);
    expect(sent.length).toBe(2);
  });

  it("blocked: the door says why; another site's answers are left alone; sign-in calls are never retried", async () => {
    await window.fetch("/api/blocked");
    expect(replace).toHaveBeenCalledWith("/sign-in?blocked");
    expect((await window.fetch("https://other.example/api/x")).status).toBe(429);
    expect((await window.fetch("/api/auth/login")).status).toBe(429);
    expect(humanToken).not.toHaveBeenCalled();
  });
});
