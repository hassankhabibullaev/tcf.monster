// The admin's second lock (worker/access.ts): Cloudflare Access's signed token, checked by the Worker itself.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { passedAccess, resetAccessKeys } from "../worker/access.ts";
import type { Env } from "../worker/util.ts";

const TEAM = "team.cloudflareaccess.com", AUD = "aud-tag";
const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
let pair: CryptoKeyPair, other: CryptoKeyPair, certCalls = 0;
const env = { OWNER_EMAIL: "owner@example.com", ACCESS_TEAM: TEAM, ACCESS_AUD: AUD } as unknown as Env;

async function token(claims: Record<string, unknown>, key = pair.privateKey, kid = "k1") {
  const h = enc({ alg: "RS256", kid }), p = enc({ aud: [AUD], iss: `https://${TEAM}`, exp: Date.now() / 1000 + 600, email: "owner@example.com", ...claims });
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${p}`)));
  return `${h}.${p}.${btoa(String.fromCharCode(...sig)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
}
const req = (t?: string) => new Request("https://admin.tcf.monster/api/admin/overview", { headers: t ? { "cf-access-jwt-assertion": t } : {} });

beforeEach(async () => {
  resetAccessKeys(); certCalls = 0;
  const gen = () => crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;
  pair = await gen(); other = await gen();
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1", alg: "RS256" };
  vi.stubGlobal("fetch", async (url: string) => { expect(url).toBe(`https://${TEAM}/cdn-cgi/access/certs`); certCalls++; return Response.json({ keys: [jwk] }); });
});
afterEach(() => vi.unstubAllGlobals());

describe("Cloudflare Access's token", () => {
  it("the owner through Access: in; the team's keys are fetched once an hour, not per request", async () => {
    expect(await passedAccess(env, req(await token({})))).toBe(true);
    expect(await passedAccess(env, req(await token({ email: " Owner@Example.com " })))).toBe(true);
    expect(certCalls).toBe(1);
  });
  it("no token, a forged signature, another app, another team, expired, someone else: shut", async () => {
    expect(await passedAccess(env, req())).toBe(false);
    expect(await passedAccess(env, req("a.b.c"))).toBe(false);
    expect(await passedAccess(env, req(await token({}, other.privateKey)))).toBe(false);
    expect(await passedAccess(env, req(await token({}, pair.privateKey, "unknown")))).toBe(false);
    expect(await passedAccess(env, req(await token({ aud: ["another-app"] })))).toBe(false);
    expect(await passedAccess(env, req(await token({ iss: "https://evil.cloudflareaccess.com" })))).toBe(false);
    expect(await passedAccess(env, req(await token({ exp: Date.now() / 1000 - 1 })))).toBe(false);
    expect(await passedAccess(env, req(await token({ email: "someone@example.com" })))).toBe(false);
  });
  it("the keys cannot be fetched: shut (fails closed)", async () => {
    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
    expect(await passedAccess(env, req(await token({})))).toBe(false);
  });
  it("not configured (tests, this Mac): the owner's session alone, as before", async () => {
    expect(await passedAccess({ OWNER_EMAIL: "owner@example.com" } as unknown as Env, req())).toBe(true);
  });
});
