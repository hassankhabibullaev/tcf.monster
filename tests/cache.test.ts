// The EE/EO topics answer is the same for everyone: the second request comes from Cloudflare's cache, not the database.
import { describe, it, expect, afterEach, vi } from "vitest";
import worker from "../worker/index.ts";
import { makeEnv } from "../scripts/local-env.ts";
import type { Env } from "../worker/util.ts";

afterEach(() => { vi.unstubAllGlobals(); });

describe("topics cache", () => {
  it("one database read for many people, until the copy expires", async () => {
    const e = makeEnv();
    const env = e.env as unknown as Env;
    e.raw.prepare("INSERT INTO users (id, email, password, created_at) VALUES ('u1', 'a@example.com', 'x', '2026-10-01')").run();
    e.raw.prepare("INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at) VALUES (?, 'u1', ?, ?, '2099-01-01')").run(
      await sha("tok"), new Date().toISOString(), new Date().toISOString());
    const store = new Map<string, Response>();
    vi.stubGlobal("caches", { default: {
      match: async (k: Request) => store.get(k.url)?.clone(),
      put: async (k: Request, r: Response) => { expect(r.headers.get("cache-control")).toBe("public, max-age=600"); store.set(k.url, r.clone()); },
    } });
    let reads = 0;
    const prep = env.DB.prepare.bind(env.DB);
    (env.DB as unknown as { prepare: (s: string) => unknown }).prepare = (sql: string) => { if (/FROM topics/.test(sql)) reads++; return prep(sql); };
    const get = () => worker.fetch(new Request("https://tcf.monster/api/topics?section=eo", { headers: { cookie: "tcfm_session=tok" } }), env);
    const a = await get(), b = await get();
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await b.json()).toEqual(await a.json());
    expect(b.headers.get("cache-control")).toBe("private, max-age=300");
    expect(reads).toBe(2); // the months and the rows, once
  });
});

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
