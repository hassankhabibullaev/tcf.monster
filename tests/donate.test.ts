// Donations: the handler alone (worker/index.ts wires it as `if (path === "/donate") return handleDonate(req, env)`
// before the same-origin check). Stripe is a fake fetch; without a key the answer is the Ko-fi link.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleDonate, resetLimits, allow, parse, cancelUrl } from "../worker/donate.ts";
import type { Env } from "../worker/util.ts";

const env = (extra: Partial<Env> = {}) => ({ APP_TZ: "Asia/Tashkent", ...extra }) as unknown as Env;
const URL_ = "https://app.tcf.monster/api/donate";
let stripeCalls: { auth: string | null; form: URLSearchParams }[] = [];

function post(body: unknown, headers: Record<string, string> = {}, ip = "1.2.3.4") {
  return new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  resetLimits();
  stripeCalls = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (String(url) === "https://api.stripe.com/v1/checkout/sessions") {
      stripeCalls.push({ auth: new Headers(init.headers).get("authorization"), form: new URLSearchParams(String(init.body)) });
      return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }), { status: 200 });
    }
    throw new Error("unexpected fetch " + url);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("without a Stripe key", () => {
  it("answers the Ko-fi page (its address ignores an amount), and never calls Stripe", async () => {
    const r = await handleDonate(post({ amount: 10, kind: "once" }), env());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ url: "https://ko-fi.com/tcfmonster" });
    expect(stripeCalls).toHaveLength(0);
  });
});

describe("with a Stripe key", () => {
  it("creates a Checkout Session (form-encoded, cents, donate) and answers its url", async () => {
    const r = await handleDonate(post({ amount: 20, currency: "eur", kind: "once", lang: "en" }, { referer: "https://tcf.monster/#don" }), env({ STRIPE_SECRET_KEY: "rk_test_abc" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    expect(stripeCalls).toHaveLength(1);
    const { auth, form } = stripeCalls[0];
    expect(auth).toBe("Bearer rk_test_abc");
    expect(form.get("mode")).toBe("payment");
    expect(form.get("submit_type")).toBe("donate");
    expect(form.get("line_items[0][quantity]")).toBe("1");
    expect(form.get("line_items[0][price_data][currency]")).toBe("eur");
    expect(form.get("line_items[0][price_data][custom_unit_amount][enabled]")).toBe("true");
    expect(form.get("line_items[0][price_data][custom_unit_amount][preset]")).toBe("2000");
    expect(form.get("line_items[0][price_data][product_data][name]")).toBe("Don à tcf.monster");
    expect(form.get("success_url")).toBe("https://tcf.monster/thanks");
    expect(form.get("cancel_url")).toBe("https://tcf.monster/");
    expect(form.get("locale")).toBe("en");
  });

  it("defaults to USD, and the cancel page is the referer when it is ours, else the site", async () => {
    await handleDonate(post({ amount: 5, kind: "once" }, { referer: "https://app.tcf.monster/accueil?x=1" }), env({ STRIPE_SECRET_KEY: "k" }));
    expect(stripeCalls[0].form.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(stripeCalls[0].form.get("line_items[0][price_data][custom_unit_amount][preset]")).toBe("500");
    expect(stripeCalls[0].form.get("cancel_url")).toBe("https://app.tcf.monster/accueil");
    expect(stripeCalls[0].form.has("locale")).toBe(false);
    expect(cancelUrl("https://evil.example/steal")).toBe("https://tcf.monster/");
    expect(cancelUrl(null)).toBe("https://tcf.monster/");
    expect(cancelUrl("http://localhost:8080/")).toBe("http://localhost:8080/");
  });

  it("answers 502 when Stripe fails or the network is down, without leaking anything", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await handleDonate(post({ amount: 50, kind: "once" }), env({ STRIPE_SECRET_KEY: "bad" }));
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: "payment unavailable" });
    expect(err).toHaveBeenCalledWith("stripe", 401);
    expect(JSON.stringify(err.mock.calls)).not.toContain("50");
    vi.stubGlobal("fetch", async () => { throw new Error("offline"); });
    expect((await handleDonate(post({ amount: 50, kind: "once" }), env({ STRIPE_SECRET_KEY: "k" }))).status).toBe(502);
    err.mockRestore();
  });
});

describe("validation", () => {
  const bad = [
    ["not json", "{", "bad request"],
    ["no kind", { amount: 5 }, "bad kind"],
    ["monthly", { amount: 5, kind: "monthly" }, "bad kind"],
    ["too small", { amount: 1, kind: "once" }, "bad amount"],
    ["too big", { amount: 501, kind: "once" }, "bad amount"],
    ["cents", { amount: 5.5, kind: "once" }, "bad amount"],
    ["a string", { amount: "10", kind: "once" }, "bad amount"],
    ["NaN (null once serialised)", { amount: Number.NaN, kind: "once" }, "bad amount"],
    ["unknown currency", { amount: 5, currency: "gbp", kind: "once" }, "bad currency"],
    ["upper-case currency", { amount: 5, currency: "CAD", kind: "once" }, "bad currency"],
  ] as const;
  for (const [name, body, error] of bad) {
    it(`refuses ${name}`, async () => {
      const r = await handleDonate(post(body as never), env({ STRIPE_SECRET_KEY: "k" }));
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error });
      expect(stripeCalls).toHaveLength(0);
    });
  }
  it("accepts the edges, 2 and 500, and ignores an unknown lang", () => {
    expect(parse({ amount: 2, kind: "once" })).toEqual({ amount: 2, currency: "usd", lang: null });
    expect(parse({ amount: 500, kind: "once", currency: "cad", lang: "de" })).toEqual({ amount: 500, currency: "cad", lang: null });
  });
  it("refuses GET", async () => {
    expect((await handleDonate(new Request(URL_), env())).status).toBe(405);
  });
});

describe("CORS", () => {
  it("echoes the public site and localhost, nothing else", async () => {
    const ok = await handleDonate(post({ amount: 5, kind: "once" }, { origin: "https://tcf.monster" }), env());
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://tcf.monster");
    expect(ok.headers.get("vary")).toBe("origin");
    const dev = await handleDonate(post({ amount: 5, kind: "once" }, { origin: "http://localhost:3000" }), env());
    expect(dev.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    const own = await handleDonate(post({ amount: 5, kind: "once" }, { origin: "https://app.tcf.monster" }), env());
    expect(own.status).toBe(200);
    expect(own.headers.get("access-control-allow-origin")).toBeNull();
    const other = await handleDonate(post({ amount: 5, kind: "once" }, { origin: "https://evil.example" }), env());
    expect(other.status).toBe(403);
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    const www = await handleDonate(post({ amount: 5, kind: "once" }, { origin: "https://www.tcf.monster" }), env());
    expect(www.status).toBe(403);
  });
  it("answers the preflight", async () => {
    const r = await handleDonate(new Request(URL_, { method: "OPTIONS", headers: { origin: "https://tcf.monster", "access-control-request-method": "POST" } }), env());
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("https://tcf.monster");
    expect(r.headers.get("access-control-allow-methods")).toContain("POST");
    expect(r.headers.get("access-control-allow-headers")).toContain("content-type");
    const no = await handleDonate(new Request(URL_, { method: "OPTIONS", headers: { origin: "https://evil.example" } }), env());
    expect(no.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("rate limit", () => {
  it("allows 10 a minute per address, then 429, then again after a minute", async () => {
    for (let i = 0; i < 10; i++) expect((await handleDonate(post({ amount: 5, kind: "once" }), env())).status).toBe(200);
    const r = await handleDonate(post({ amount: 5, kind: "once" }), env());
    expect(r.status).toBe(429);
    expect((await handleDonate(post({ amount: 5, kind: "once" }, {}, "9.9.9.9"), env())).status).toBe(200);
    const t0 = Date.now();
    expect(allow("1.2.3.4", t0)).toBe(false);
    expect(allow("1.2.3.4", t0 + 61_000)).toBe(true);
  });
});
