// The admin's second lock. Cloudflare Access stands in front of admin.tcf.monster (the owner's e-mail, a one-time code)
// and signs every request it lets through (Cf-Access-Jwt-Assertion, RS256, the team's keys at /cdn-cgi/access/certs).
// The Worker checks that signature, the admin application's audience tag, the expiry and the e-mail: a request that
// reached the Worker without passing Access finds the admin shut even with the owner's session cookie. Off where
// ACCESS_TEAM and ACCESS_AUD are not set (tests, this Mac).
import { type Env } from "./util.ts";

let cache: { team: string; at: number; keys: Map<string, CryptoKey> } | null = null;
async function keysOf(team: string): Promise<Map<string, CryptoKey>> {
  if (cache && cache.team === team && Date.now() - cache.at < 3_600_000) return cache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`access certs ${r.status}`);
  const d = (await r.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
  const keys = new Map<string, CryptoKey>();
  for (const k of d.keys ?? []) if (k.kid && k.kty === "RSA") keys.set(k.kid, await crypto.subtle.importKey("jwk", k, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
  cache = { team, at: Date.now(), keys };
  return keys;
}
export const resetAccessKeys = () => { cache = null; };

const bytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const part = (s: string) => { try { return JSON.parse(new TextDecoder().decode(bytes(s))) as Record<string, unknown>; } catch { return null; } };

/** did this request come through Cloudflare Access, signed in as the owner? (fails closed) */
export async function passedAccess(env: Env, req: Request): Promise<boolean> {
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) return true;
  const token = req.headers.get("cf-access-jwt-assertion") ?? "";
  const [h, p, sig] = token.split(".");
  if (!h || !p || !sig || token.length > 8192) return false;
  const head = part(h), body = part(p);
  if (!head || !body || head.alg !== "RS256" || typeof head.kid !== "string") return false;
  try {
    const key = (await keysOf(env.ACCESS_TEAM)).get(head.kid);
    if (!key || !(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bytes(sig), new TextEncoder().encode(`${h}.${p}`)))) return false;
  } catch { return false; }
  const aud = Array.isArray(body.aud) ? body.aud : [body.aud];
  const now = Date.now() / 1000;
  return aud.includes(env.ACCESS_AUD) && body.iss === `https://${env.ACCESS_TEAM}` && typeof body.exp === "number" && body.exp > now
    && typeof body.email === "string" && isOwnerEmail(env, body.email);
}

/** the owner's address, however it is typed (case, spaces) */
export const isOwnerEmail = (env: Env, email: string) => !!env.OWNER_EMAIL && email.trim().toLowerCase() === env.OWNER_EMAIL.trim().toLowerCase();
