// /media/* — the recordings and pictures of the question bank. On Cloudflare they are plain files (dist/media, under
// names only the signed-in bank files carry: scripts/copy-media.mjs) served before the Worker runs; a name that reaches
// the Worker is not one of them (an old, guessable name included) and is a 404. On this Mac (LOCAL_DEV) the build keeps
// the export's names and the recordings are read from R2's local folder (.dev/files/media/<co|ce>/<file>), Range
// honoured so the player can seek. GET and HEAD only; everything else is a plain 404 / 405.
import type { Env } from "./util.ts";

/** a key as the uploader writes them: a short name, no slash, no dot segment (R2 refuses anything past 1 024 bytes) */
const KEY = /^media\/(co|ce)\/[\w.-]{1,200}$/;
const IMMUTABLE = "public, max-age=31536000, immutable";
const TYPES: Record<string, string> = {
  mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav",
  webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml",
};

const plain = (status: number, text: string, headers: Record<string, string> = {}) =>
  new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...headers } });

function contentType(key: string, meta?: R2HTTPMetadata) {
  if (meta?.contentType) return meta.contentType;
  const ext = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  return TYPES[ext] ?? "application/octet-stream";
}

/** "bytes=a-b" | "bytes=a-" | "bytes=-n" → an R2 range, or null when absent or not understood (then the whole file is sent) */
function parseRange(header: string | null): R2Range | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") return { suffix: Number(m[2]) };
  const offset = Number(m[1]);
  if (m[2] === "") return { offset };
  const end = Number(m[2]);
  if (end < offset) return null;
  return { offset, length: end - offset + 1 };
}

function headers(key: string, obj: R2Object) {
  return new Headers({
    "content-type": contentType(key, obj.httpMetadata),
    "cache-control": IMMUTABLE,
    "accept-ranges": "bytes",
    etag: obj.httpEtag,
    // a recording or a picture is never sniffed into something else, and an SVG opened on its own runs nothing
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
}

export async function handleMedia(req: Request, env: Env, key: string): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return plain(405, "method not allowed", { allow: "GET, HEAD" });
  if (!KEY.test(key) || env.LOCAL_DEV !== "1") return plain(404, "not found");
  // this Mac after a full build: the hidden names are files beside the pages, as on Cloudflare
  const built = await env.ASSETS?.fetch(new Request(new URL(`/${key}`, "https://assets"), { method: req.method, headers: req.headers.has("range") ? { range: req.headers.get("range")! } : {} })).catch(() => null);
  if (built?.ok) return built;

  if (req.method === "HEAD") {
    const head = await env.FILES.head(key).catch(() => null);
    if (!head) return plain(404, "not found");
    const h = headers(key, head);
    h.set("content-length", String(head.size));
    return new Response(null, { status: 200, headers: h });
  }

  const range = parseRange(req.headers.get("range"));
  let obj: R2ObjectBody | null;
  try {
    obj = await env.FILES.get(key, range ? { range } : undefined);
  } catch {
    // R2 refuses a range that starts past the end: say how long the file is, or that it does not exist
    const head = await env.FILES.head(key).catch(() => null);
    if (!head) return plain(404, "not found");
    return plain(416, "range not satisfiable", { "content-range": `bytes */${head.size}` });
  }
  if (!obj) return plain(404, "not found");

  const h = headers(key, obj);
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((t) => t.trim() === obj!.httpEtag)) return new Response(null, { status: 304, headers: h });

  if (range && obj.range) {
    const r = obj.range as { offset?: number; length?: number; suffix?: number };
    const offset = r.suffix != null ? Math.max(0, obj.size - r.suffix) : r.offset ?? 0;
    const length = r.suffix != null ? Math.min(r.suffix, obj.size) : r.length ?? obj.size - offset;
    if (offset >= obj.size || length <= 0) return plain(416, "range not satisfiable", { "content-range": `bytes */${obj.size}` });
    h.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    h.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set("content-length", String(obj.size));
  return new Response(obj.body, { status: 200, headers: h });
}
