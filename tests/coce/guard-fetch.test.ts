// web/app/guard-fetch.ts: every call to our own server that meets the guard's human check shows one Turnstile box,
// whatever is waiting on it, and goes again with its token; a block sends the page to the door; others' calls untouched.
// The invisible check runs when the server asks for it and its answer rides with the next request; the browser's clues
// (web/app/signs.ts) ride along only when there is something to say, never on another site's calls.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const humanToken = vi.fn(async (..._a: unknown[]) => "tok");
vi.mock("../../web/app/turnstile.ts", () => ({ humanToken }));

let passed = false;
let quietAsk = false;
let sent: { path: string; token: string | null; quiet: string | null; signs: string | null }[] = [];
const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...headers } });
const replace = vi.fn();
let listeners: Record<string, (e: Event) => void> = {};
let nav: { webdriver: boolean; userAgent: string };
/** an event as the page would see it: made by a hand (trusted) or by a script */
const fire = (type: string, isTrusted: boolean) => listeners[type]?.({ type, isTrusted } as Event);

beforeEach(async () => {
  vi.resetModules();
  humanToken.mockReset(); humanToken.mockImplementation(async () => "tok"); replace.mockClear();
  passed = false; quietAsk = false; sent = []; listeners = {};
  nav = { webdriver: false, userAgent: "Mozilla/5.0 (Macintosh) Chrome/130" };
  vi.stubGlobal("document", { documentElement: { lang: "fr" }, addEventListener: (type: string, fn: (e: Event) => void) => { listeners[type] = fn; } });
  vi.stubGlobal("navigator", nav);
  vi.stubGlobal("location", { origin: "https://tcf.monster", pathname: "/co", search: "", replace });
  const plain = async (path: string, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    const token = h.get("x-turnstile");
    sent.push({ path, token, quiet: h.get("x-quiet"), signs: h.get("x-signs") });
    if (path === "/api/blocked") return json({ error: "blocked" }, 403);
    if (path.startsWith("https://other")) return json({ error: "human", turnstile: "x" }, 429);
    // the server asks for the invisible check until a request brings its answer
    if (path === "/api/quiet") { if (h.get("x-quiet")) quietAsk = false; return json({}, 200, quietAsk ? { "x-quiet-check": "site-key" } : {}); }
    if (path === "/api/ok") return json({});
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
  it("requests asked together share one check, shown as a box; each goes again with its token and arrives", async () => {
    const all = await Promise.all(["/data/co-A1.json", "/data/co-A2.json", "/api/me"].map((p) => window.fetch(p)));
    expect(all.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(humanToken).toHaveBeenCalledTimes(1);
    expect(humanToken).toHaveBeenCalledWith("site-key", "human", "fr", null, "always");
  });

  it("a check that never passes ends in the server's answer, not a loop; the next request asks again", async () => {
    humanToken.mockImplementation(async () => "wrong");
    const r = await window.fetch("/api/me");
    expect(r.status).toBe(429);
    expect(sent.length).toBe(2);
    await new Promise((r) => setTimeout(r, 0));
    await window.fetch("/api/me");
    expect(humanToken).toHaveBeenCalledTimes(2);
  });

  it("blocked: the door says why; another site's answers are left alone; sign-in calls are never retried", async () => {
    await window.fetch("/api/blocked");
    expect(replace).toHaveBeenCalledWith("/sign-in?blocked");
    expect((await window.fetch("https://other.example/api/x")).status).toBe(429);
    expect((await window.fetch("/api/auth/login")).status).toBe(429);
    expect(humanToken).not.toHaveBeenCalled();
  });
});

describe("the invisible check", () => {
  it("runs once when the server asks, unseen; its token rides with the next request only", async () => {
    quietAsk = true;
    await Promise.all([window.fetch("/api/quiet"), window.fetch("/api/quiet")]); // asked twice at once: run once
    await new Promise((r) => setTimeout(r, 0));
    expect(humanToken).toHaveBeenCalledTimes(1);
    expect(humanToken).toHaveBeenCalledWith("site-key", "quiet", "fr", null, "interaction-only");
    await window.fetch("/api/quiet");
    await window.fetch("/api/quiet");
    expect(sent.map((s) => s.quiet)).toEqual([null, null, "tok", null]);
    expect(humanToken).toHaveBeenCalledTimes(1);
  });

  it("a check that cannot run says « failed » (the server then shows the box)", async () => {
    humanToken.mockImplementation(async () => { throw new Error("turnstile"); });
    quietAsk = true;
    await window.fetch("/api/quiet");
    await new Promise((r) => setTimeout(r, 0));
    quietAsk = false;
    await window.fetch("/api/ok");
    expect(sent.at(-1)!.quiet).toBe("failed");
  });
});

describe("the browser's clues", () => {
  it("nothing to say: no header at all; a browser driven by a program says « w », a headless one « h »", async () => {
    await window.fetch("/api/ok");
    expect(sent.at(-1)!.signs).toBeNull();
    nav.webdriver = true;
    nav.userAgent = "Mozilla/5.0 HeadlessChrome/130";
    await window.fetch("/api/ok");
    expect(sent.at(-1)!.signs).toBe("w,h");
    // never on another site's calls
    await window.fetch("https://other.example/api/x");
    expect(sent.at(-1)!.signs).toBeNull();
  });

  it("presses no hand made: « u » after three; the app's own clicks (a download link) do not count", async () => {
    for (let i = 0; i < 5; i++) fire("click", false);
    fire("keydown", false); fire("pointerdown", false);
    await window.fetch("/api/ok");
    expect(sent.at(-1)!.signs).toBeNull();
    fire("mousedown", false);
    await window.fetch("/api/ok");
    expect(sent.at(-1)!.signs).toBe("u");
  });

  it("thirty changes and not one mouse, touch, key or click: « n »; one real press and it never says so", async () => {
    for (let i = 0; i < 30; i++) await window.fetch("/api/ok", { method: "POST" });
    await window.fetch("/api/ok");
    expect(sent.at(-1)!.signs).toBe("n");
    fire("click", true);
    await window.fetch("/api/ok", { method: "POST" });
    expect(sent.at(-1)!.signs).toBeNull();
  });
});
