// /media/* against a pretend R2 that knows ranges: the whole file, a slice of it (audio seeking), a missing file.
import { describe, it, expect } from "vitest";
import { handleMedia } from "../../worker/media.ts";
import type { Env } from "../../worker/util.ts";

type Range = { offset?: number; length?: number; suffix?: number };
type Stored = { bytes: Uint8Array; contentType?: string };

/** the part of R2 the route uses: head, and get with a range the way R2 answers it (object.range says what was cut) */
function fakeR2(files: Record<string, Stored>) {
  const meta = (key: string, f: Stored) => ({
    key, size: f.bytes.length, httpEtag: `"etag-${key.length}-${f.bytes.length}"`, etag: `etag-${key}`,
    httpMetadata: f.contentType ? { contentType: f.contentType } : undefined,
    writeHttpMetadata: () => {},
  });
  const gets: { key: string; range?: Range }[] = [];
  return {
    gets,
    head: async (key: string) => (files[key] ? meta(key, files[key]) : null),
    get: async (key: string, o?: { range?: Range }) => {
      gets.push({ key, range: o?.range });
      const f = files[key];
      if (!f) return null;
      let offset = 0, length = f.bytes.length;
      if (o?.range) {
        const r = o.range;
        if (r.suffix != null) { offset = Math.max(0, f.bytes.length - r.suffix); length = f.bytes.length - offset; }
        else { offset = r.offset ?? 0; length = r.length ?? f.bytes.length - offset; }
        if (offset >= f.bytes.length) throw new Error("R2 error: range not satisfiable");
        length = Math.min(length, f.bytes.length - offset);
      }
      const slice = f.bytes.slice(offset, offset + length);
      return {
        ...meta(key, f),
        range: o?.range ? { offset, length } : undefined,
        body: new Blob([slice]).stream(),
        arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength),
      };
    },
  };
}

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251);
const audio = bytes(1000);
const r2 = fakeR2({
  "media/co/abc123.mp3": { bytes: audio, contentType: "audio/mpeg" },
  "media/ce/pic.webp": { bytes: bytes(40) },
});
const env = { FILES: r2 } as unknown as Env;
const get = (key: string, headers: Record<string, string> = {}, method = "GET") =>
  handleMedia(new Request(`https://app.tcf.monster/${key}`, { method, headers }), env, key);

describe("/media/*", () => {
  it("sends the whole file with its type, a year of cache and an etag", async () => {
    const r = await get("media/co/abc123.mp3");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(r.headers.get("content-length")).toBe("1000");
    expect(r.headers.get("etag")).toMatch(/^"etag-/);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(audio);
  });

  it("guesses the type from the name when R2 kept none", async () => {
    const r = await get("media/ce/pic.webp");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/webp");
    expect(r.headers.get("content-length")).toBe("40");
  });

  it("answers a Range with 206 and only that slice", async () => {
    const r = await get("media/co/abc123.mp3", { range: "bytes=100-199" });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(r.headers.get("content-length")).toBe("100");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(audio.slice(100, 200));
    expect(r2.gets.at(-1)?.range).toEqual({ offset: 100, length: 100 });

    const open = await get("media/co/abc123.mp3", { range: "bytes=900-" });
    expect(open.status).toBe(206);
    expect(open.headers.get("content-range")).toBe("bytes 900-999/1000");
    expect((await open.arrayBuffer()).byteLength).toBe(100);

    const tail = await get("media/co/abc123.mp3", { range: "bytes=-50" });
    expect(tail.status).toBe(206);
    expect(tail.headers.get("content-range")).toBe("bytes 950-999/1000");
  });

  it("clamps a range that runs past the end and refuses one that starts past it", async () => {
    const r = await get("media/co/abc123.mp3", { range: "bytes=950-5000" });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 950-999/1000");
    const bad = await get("media/co/abc123.mp3", { range: "bytes=5000-" });
    expect(bad.status).toBe(416);
    expect(bad.headers.get("content-range")).toBe("bytes */1000");
  });

  it("HEAD gives the headers without the body", async () => {
    const r = await get("media/co/abc123.mp3", {}, "HEAD");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-length")).toBe("1000");
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(await r.text()).toBe("");
  });

  it("304 when the browser already has this etag", async () => {
    const first = await get("media/co/abc123.mp3");
    const r = await get("media/co/abc123.mp3", { "if-none-match": first.headers.get("etag")! });
    expect(r.status).toBe(304);
  });

  it("404 in plain text for a missing file or a key outside media/co|ce", async () => {
    for (const key of ["media/co/nothing.mp3", "backups/2026-10-17/users-0000.json", "media/co/../x", "media/xx/a.mp3", "media/co/"]) {
      const r = await get(key);
      expect(r.status, key).toBe(404);
      expect(r.headers.get("content-type")).toContain("text/plain");
      expect(await r.text()).toBe("not found");
    }
    expect(r2.gets.some((g) => g.key.startsWith("backups/"))).toBe(false);
  });

  it("only GET and HEAD", async () => {
    const r = await get("media/co/abc123.mp3", {}, "POST");
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("GET, HEAD");
  });
});
