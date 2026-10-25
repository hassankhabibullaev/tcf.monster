// What every QA scenario needs: the real Worker on a fresh SQLite, a pretend Resend (codes are read from the mail),
// a pretend Google and Stripe when a test asks for them, and a person signed up through the real flow.
import { expect, vi } from "vitest";
import worker from "../../worker/index.ts";
import { makeEnv } from "../../scripts/local-env.ts";
import { resetLimits } from "../../worker/util.ts";
import { resetGuardCounts, resetCanaries } from "../../worker/guard.ts";
import { resetNetworks } from "../../worker/networks.ts";
import type { Env } from "../../worker/util.ts";

export type Row = Record<string, any>;
export const PW = "A".repeat(43);
export const PW2 = "B".repeat(43);
export const APP = "tcf.monster";
export const ADMIN = "admin.tcf.monster";

export type Call = { status: number; data: any; text: string; headers: Headers; setCookie: string; cookie: string };
export type CallOpts = { method?: string; body?: unknown; raw?: BodyInit; cookie?: string; host?: string; origin?: string | null; headers?: Record<string, string>; ip?: string };

export function setup(extra: Partial<Env> = {}) {
  const e = makeEnv();
  const env = e.env as unknown as Env;
  Object.assign(env, { RESEND_API_KEY: "test-key", APP_OPEN: "1", ADMIN_OPEN: "0", PASSWORD_PEPPER: "pepper", ...extra });
  const mails: { to: string; subject: string; text: string }[] = [];
  /** what Google answers to the simulator and the key check; a test replaces it */
  const google = { handler: (_url: string, _init?: RequestInit): Response | Promise<Response> => new Response(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash" }] }), { status: 200, headers: { "content-type": "application/json" } }) };
  const stripe = { handler: (_init?: RequestInit): Response | Promise<Response> => new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" }), { status: 200 }) };
  resetLimits(); resetGuardCounts(); resetCanaries(); resetNetworks();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.resend.com")) {
      const b = JSON.parse(String(init?.body));
      mails.push({ to: b.to[0], subject: b.subject, text: b.text });
      return new Response("{}", { status: 200 });
    }
    if (url.includes("generativelanguage.googleapis.com")) return google.handler(url, init);
    if (url.startsWith("https://api.stripe.com")) return stripe.handler(init);
    throw new Error("unexpected fetch " + url);
  });

  const call = async (path: string, o: CallOpts = {}): Promise<Call> => {
    const host = o.host ?? APP;
    const method = o.method ?? (o.body !== undefined || o.raw !== undefined ? "POST" : "GET");
    const headers: Record<string, string> = { ...(o.headers ?? {}) };
    if (o.body !== undefined && !headers["content-type"]) headers["content-type"] = "application/json";
    if (method !== "GET" && method !== "HEAD" && o.origin !== null) headers.origin = o.origin ?? `https://${host}`;
    if (o.cookie) headers.cookie = o.cookie;
    if (o.ip) headers["cf-connecting-ip"] = o.ip;
    if (host.startsWith("admin.") && method === "POST" && !("x-admin" in headers)) headers["x-admin"] = "1";
    const r = await worker.fetch(new Request(`https://${host}${path}`, { method, headers, body: o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined) }), env);
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = null; }
    const setCookie = r.headers.get("set-cookie") ?? "";
    return { status: r.status, data, text, headers: r.headers, setCookie, cookie: setCookie.split(";")[0] };
  };
  const lastCode = () => mails[mails.length - 1].text.match(/\b(\d{6})\b/)![1];
  const count = (sql: string, ...a: unknown[]) => Number((e.raw.prepare(sql).get(...(a as never[])) as Row).n);
  /** the whole sign-up through the real routes; returns the session cookie */
  const signUp = async (email: string, pw = PW, o: { ip?: string } = {}) => {
    expect((await call("/api/auth/code", { body: { email, lang: "fr" }, ip: o.ip })).status).toBe(200);
    const v = await call("/api/auth/verify", { body: { email, code: lastCode() }, ip: o.ip });
    expect(v.status).toBe(200);
    const p = await call("/api/auth/password", { body: { email, proof: v.data.proof, password: pw, terms: true, lang: "fr" }, ip: o.ip });
    expect(p.status).toBe(200);
    return p.cookie;
  };
  const userId = (email: string) => String((e.raw.prepare("SELECT id FROM users WHERE email = ?").get(email) as Row).id);
  return { env, raw: e.raw, r2: e.r2, mails, google, stripe, call, lastCode, count, signUp, userId };
}
export type QA = ReturnType<typeof setup>;

export const teardown = () => { vi.unstubAllGlobals(); vi.useRealTimers(); };

/** a 39-question exam file the way bank-export writes it, every answer A */
export function examFile(section: string, n: number) {
  const lv = (p: number) => (p <= 4 ? "A1" : p <= 10 ? "A2" : p <= 19 ? "B1" : p <= 29 ? "B2" : p <= 35 ? "C1" : "C2");
  return Array.from({ length: 39 }, (_, i) => ({ id: `q${i + 1}`, placement: `${section.toUpperCase()}-${String(n).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`, position: i + 1, level: lv(i + 1), answer: "A", stem: "…", options: [] }));
}
/** ASSETS that serves exam files 1…`upTo` and nothing else */
export function examAssets(upTo = 40, extra: Record<string, Response> = {}) {
  return {
    fetch: async (req: Request | string) => {
      const p = new URL(typeof req === "string" ? req : req.url).pathname;
      if (extra[p]) return extra[p].clone();
      const m = p.match(/^\/data\/exam-(co|ce)-(\d\d)\.json$/);
      if (!m || Number(m[2]) > upTo) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(examFile(m[1], Number(m[2]))), { headers: { "content-type": "application/json" } });
    },
  };
}
