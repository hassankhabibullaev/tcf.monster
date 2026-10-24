// Donations: POST /api/donate { amount, currency?, kind } answers { url }, the page to open.
// With STRIPE_SECRET_KEY set, that page is a Stripe Checkout Session (hosted by Stripe; no card data touches us);
// without it, the plain Ko-fi page, so the form works before the Stripe account exists.
// The public site is on the same address as the app now (tcf.monster); the CORS answer stays for pages still open on
// the old site address. It must be
// wired BEFORE the Worker's same-origin check. Nothing is stored and nothing personal is logged.
import { type Env, json, fail, readJson } from "./util.ts";

export const CURRENCIES = ["cad", "usd", "eur"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const MIN = 2, MAX = 500;
const KOFI = "https://ko-fi.com/tcfmonster";
const SITE = "https://tcf.monster";
const PRODUCT = "Don à tcf.monster";

/** the origins allowed to post from another site: the public site, and this Mac while developing */
export const allowedOrigin = (o: string | null) => !!o && (o === SITE || /^http:\/\/localhost(:\d+)?$/.test(o));

function cors(origin: string | null): Record<string, string> {
  return allowedOrigin(origin) ? { "access-control-allow-origin": origin!, vary: "origin" } : { vary: "origin" };
}

/* ---------- rate limit: 10 requests a minute per address, in this isolate's memory ---------- */
const WINDOW = 60_000, LIMIT = 10;
const hits = new Map<string, number[]>();
export function allow(ip: string, now = Date.now()) {
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
  if (list.length >= LIMIT) { hits.set(ip, list); return false; }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - (v[v.length - 1] ?? 0) >= WINDOW) hits.delete(k);
  return true;
}
export const resetLimits = () => hits.clear();

/* ---------- the request ---------- */
type Body = { amount?: unknown; currency?: unknown; kind?: unknown; lang?: unknown };

/** a clean { amount, currency, lang } or the reason it is refused */
export function parse(b: Body | null): { amount: number; currency: Currency; lang: "fr" | "en" | null } | string {
  if (!b || typeof b !== "object") return "bad request";
  if (b.kind !== "once") return "bad kind";
  if (typeof b.amount !== "number" || !Number.isInteger(b.amount) || b.amount < MIN || b.amount > MAX) return "bad amount";
  const currency = b.currency === undefined ? "usd" : b.currency;
  if (!(CURRENCIES as readonly unknown[]).includes(currency)) return "bad currency";
  const lang = b.lang === "fr" || b.lang === "en" ? b.lang : null;
  return { amount: b.amount, currency: currency as Currency, lang };
}

/** where Stripe sends people who close the payment page: the page they came from, when it is ours */
export function cancelUrl(referer: string | null) {
  try {
    const u = new URL(referer ?? "");
    if (u.origin === SITE || u.origin === "https://app.tcf.monster" || /^http:\/\/(app\.)?localhost(:\d+)?$/.test(u.origin)) return u.origin + u.pathname;
  } catch { /* no or odd referer */ }
  return SITE + "/";
}

export async function handleDonate(req: Request, env: Env): Promise<Response> {
  const origin = req.headers.get("origin");
  const h = cors(origin);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...h, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" } });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405, h);
  // a browser on another site: only the public site may post here
  if (origin && origin !== new URL(req.url).origin && !allowedOrigin(origin)) return json({ error: "cross-site" }, 403, h);
  const ip = req.headers.get("cf-connecting-ip") ?? "?";
  if (!allow(ip)) return json({ error: "slow down" }, 429, h);
  // the same address on every Cloudflare server at once (the count above is one server's)
  if (ip !== "?" && env.AUTH_LIMIT && !(await env.AUTH_LIMIT.limit({ key: `donate:${ip}` })).success) return json({ error: "slow down" }, 429, h);

  const p = parse(await readJson<Body>(req));
  if (typeof p === "string") return json({ error: p }, 400, h);

  // Ko-fi's page ignores an amount in the address: the plain page, where the person picks it
  if (!env.STRIPE_SECRET_KEY) return json({ url: KOFI }, 200, h);

  const form = new URLSearchParams({
    mode: "payment",
    submit_type: "donate",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": p.currency,
    // the person types the amount on Stripe's page; what the app sends is only the first proposal
    "line_items[0][price_data][custom_unit_amount][enabled]": "true",
    "line_items[0][price_data][custom_unit_amount][preset]": String(p.amount * 100),
    "line_items[0][price_data][custom_unit_amount][minimum]": "100",
    "line_items[0][price_data][product_data][name]": PRODUCT,
    success_url: `${SITE}/thanks`,
    cancel_url: cancelUrl(req.headers.get("referer")),
  });
  if (p.lang) form.set("locale", p.lang);
  let r: Response;
  try {
    r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch {
    return json({ error: "payment unavailable" }, 502, h);
  }
  const data = (await r.json().catch(() => null)) as { url?: unknown } | null;
  if (!r.ok || typeof data?.url !== "string") {
    console.error("stripe", r.status); // the status only: never the amount, the address or the session
    return json({ error: "payment unavailable" }, 502, h);
  }
  return json({ url: data.url }, 200, h);
}
