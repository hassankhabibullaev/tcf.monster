// /media/* through the real door: traversal, HEAD, odd ranges, a key that is too long, the admin host, the headers.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.ts";
import { setup, teardown, type QA, type Row } from "./helpers.ts";

let qa: QA;
let cookie = "";
const audio = Array.from({ length: 1000 }, (_, i) => String.fromCharCode(97 + (i % 26))).join("");
beforeEach(async () => {
  qa = setup();
  await qa.r2.put("media/co/abc123.mp3", audio);
  await qa.r2.put("media/ce/pic.svg", "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
  await qa.r2.put("backups/2026-10-17/users-0000.json", "[{\"email\":\"secret@b.com\"}]");
  cookie = await qa.signUp("listener@example.com");
});
afterEach(teardown);
const get = (path: string, o: { method?: string; headers?: Record<string, string>; host?: string } = {}) =>
  worker.fetch(new Request(`https://${o.host ?? "tcf.monster"}${path}`, { method: o.method ?? "GET", headers: { cookie, ...o.headers } }), qa.env);

describe("/media/*", () => {
  it("on Cloudflare a name that reaches the Worker is never a file: the export's old names answer 404, R2 is not read", async () => {
    (qa.env as Row).LOCAL_DEV = "0";
    const reads: string[] = [];
    const g = qa.r2.get.bind(qa.r2);
    (qa.r2 as Row).get = async (k: string, o?: unknown) => { reads.push(k); return g(k, o as never); };
    for (const c of ["", cookie]) {
      for (const m of ["GET", "HEAD"]) {
        const r = await worker.fetch(new Request("https://tcf.monster/media/co/abc123.mp3", { method: m, headers: c ? { cookie: c } : {} }), qa.env);
        expect(r.status, m).toBe(404);
        expect(await r.text()).not.toBe(audio);
      }
    }
    expect(reads).toEqual([]);
  });

  it("no path reaches outside media/co|ce: dot segments (plain or encoded), a backslash, a double slash, an empty name", async () => {
    const gets: string[] = [];
    const g = qa.r2.get.bind(qa.r2);
    (qa.r2 as Row).get = async (k: string, o?: unknown) => { gets.push(k); return g(k, o as never); };
    (qa.r2 as Row).head = async (k: string) => { gets.push(k); return null; };
    for (const p of ["/media/co/%2e%2e/%2e%2e/backups/2026-10-17/users-0000.json", "/media/co/..%2F..%2Fbackups/x", "/media/co/%2e%2e%2fbackups", "/media/..%2fbackups/2026-10-17/users-0000.json", "/media/co/a%00.mp3", "/media/co/", "/media/co//a.mp3", "/media/co/a\\b.mp3", "/media/xx/a.mp3", "/media/co/a.mp3?x=../..", "/media/backups/2026-10-17/users-0000.json"]) {
      const r = await get(p);
      expect(r.status, p).toBeLessThan(500);
      expect(await r.text()).not.toContain("secret@b.com");
    }
    // a plain `..` is folded by the URL itself: it never names a media file
    const folded = await get("/media/co/../../backups/2026-10-17/users-0000.json");
    expect(await folded.text()).not.toContain("secret@b.com");
    expect(gets.every((k) => /^media\/(co|ce)\//.test(k))).toBe(true);
  });

  it("HEAD on a file and on nothing; the admin host has no media", async () => {
    const h = await get("/media/co/abc123.mp3", { method: "HEAD" });
    expect(h.status).toBe(200);
    expect(h.headers.get("content-length")).toBe("1000");
    expect(await h.text()).toBe("");
    expect((await get("/media/co/none.mp3", { method: "HEAD" })).status).toBe(404);
    const admin = await get("/media/co/abc123.mp3", { host: "admin.tcf.monster" });
    expect(admin.status).toBe(404);
    expect(await admin.text()).not.toBe(audio);
    for (const m of ["POST", "PUT", "DELETE"]) expect((await get("/media/co/abc123.mp3", { method: m })).status, m).toBe(405);
  });

  it("ranges: bytes=5-2 → the whole file; bytes=-0 → 416; a multi-range → the whole file; bytes=0-0 → one byte; a range with spaces", async () => {
    const whole = await get("/media/co/abc123.mp3", { headers: { range: "bytes=5-2" } });
    expect(whole.status).toBe(200);
    expect((await whole.text()).length).toBe(1000);
    const zero = await get("/media/co/abc123.mp3", { headers: { range: "bytes=-0" } });
    expect(zero.status).toBe(416);
    expect(zero.headers.get("content-range")).toBe("bytes */1000");
    const multi = await get("/media/co/abc123.mp3", { headers: { range: "bytes=0-1, 5-6" } });
    expect(multi.status).toBe(200);
    const one = await get("/media/co/abc123.mp3", { headers: { range: "bytes=0-0" } });
    expect(one.status).toBe(206);
    expect(one.headers.get("content-range")).toBe("bytes 0-0/1000");
    expect(await one.text()).toBe("a");
    const last = await get("/media/co/abc123.mp3", { headers: { range: "bytes=999-999" } });
    expect(last.status).toBe(206);
    expect((await last.text()).length).toBe(1);
    const past = await get("/media/co/abc123.mp3", { headers: { range: "bytes=1000-" } });
    expect(past.status).toBe(416);
    const spaced = await get("/media/co/abc123.mp3", { headers: { range: " bytes=10-19 " } });
    expect(spaced.status).toBe(206);
    for (const bad of ["bytes=a-b", "items=0-1", "bytes=", "bytes=-", "bytes=1-2-3", "bytes=99999999999999999999-"]) {
      const r = await get("/media/co/abc123.mp3", { headers: { range: bad } });
      expect([200, 416], bad).toContain(r.status);
    }
  });

  it("a very long key, a missing key: 404 in plain text, never a crash", async () => {
    for (const p of [`/media/co/${"a".repeat(5000)}.mp3`, `/media/co/${"a".repeat(1100)}.mp3`, "/media/co/none.mp3", "/media/ce/%41%41.webp"]) {
      const r = await get(p);
      expect(r.status, p.slice(0, 40)).toBe(404);
      expect(r.headers.get("content-type")).toContain("text/plain");
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("the headers: a year of cache, nosniff, and a picture that cannot run a script when opened on its own", async () => {
    const r = await get("/media/co/abc123.mp3");
    expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    const svg = await get("/media/ce/pic.svg");
    expect(svg.status).toBe(200);
    expect(svg.headers.get("content-type")).toBe("image/svg+xml");
    expect(svg.headers.get("content-security-policy")).toContain("default-src 'none'");
  });
});
