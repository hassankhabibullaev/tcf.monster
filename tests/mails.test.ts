// The e-mails on the real Worker and a real SQLite: the four code mails, the welcome (once, within the day's room), the
// exam mails on each person's own day, the stop link and its one-click headers, the last mail after a deletion.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../worker/index.ts";
import { runJob } from "../worker/jobs.ts";
import { makeEnv } from "../scripts/local-env.ts";
import { renderMail, type MailId } from "../worker/mails.ts";
import type { Env } from "../worker/util.ts";

type Row = Record<string, any>;
type Sent = { to: string; subject: string; text: string; html: string; headers?: Record<string, string> };
let env: Env, raw: ReturnType<typeof makeEnv>["raw"], mails: Sent[] = [];

beforeEach(() => {
  const e = makeEnv();
  env = e.env as unknown as Env;
  raw = e.raw;
  Object.assign(env, { RESEND_API_KEY: "test-key", APP_OPEN: "1", PASSWORD_PEPPER: "pepper" });
  mails = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (String(url).startsWith("https://api.resend.com")) {
      const b = JSON.parse(String(init.body));
      mails.push({ to: b.to[0], subject: b.subject, text: b.text, html: b.html, headers: b.headers });
      return new Response("{}", { status: 200 });
    }
    throw new Error("unexpected fetch " + url);
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function call(path: string, body?: unknown, o: { cookie?: string; method?: string; form?: boolean } = {}) {
  const r = await worker.fetch(new Request(`https://tcf.monster/api${path}`, {
    method: o.method ?? (body === undefined ? "GET" : "POST"),
    headers: { ...(body !== undefined ? { "content-type": o.form ? "application/x-www-form-urlencoded" : "application/json" } : {}), ...(o.cookie ? { cookie: o.cookie } : {}) },
    body: body === undefined ? undefined : o.form ? String(body) : JSON.stringify(body),
  }), env);
  const text = await r.text();
  let data: any = {}; try { data = JSON.parse(text); } catch { /* a page */ }
  return { status: r.status, data, text, headers: r.headers, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] };
}
const lastCode = () => mails[mails.length - 1].text.match(/Your code is (\d{6})|Votre code est (\d{6})/)!.slice(1).find(Boolean)!;
const user = (email: string) => raw.prepare("SELECT * FROM users WHERE email = ?").get(email) as Row;

async function signUp(email: string, lang = "en") {
  await call("/auth/code", { email, lang });
  const v = await call("/auth/verify", { email, code: lastCode() });
  const p = await call("/auth/password", { email, proof: v.data.proof, password: "A".repeat(43), terms: true, lang });
  return p.cookie;
}
const at = (iso: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(iso)); };

describe("the four code mails", () => {
  it("a new address gets the sign-up code, an account the sign-in or the new-password code, deletion its own", async () => {
    const c = await signUp("lea@example.com");
    expect(mails[0].subject).toBe("Your tcf.monster sign-up code");
    expect(mails[0].text).toMatch(/\nYour code is \d{6}\n/);
    expect(mails[0].subject).not.toMatch(/\d{6}/);
    await new Promise((r) => setTimeout(r, 0));
    raw.prepare("DELETE FROM codes").run();
    await call("/auth/code", { email: "lea@example.com", lang: "en", why: "signin" });
    expect(mails.at(-1)!.subject).toBe("Your tcf.monster sign-in code");
    raw.prepare("DELETE FROM codes").run();
    await call("/auth/code", { email: "lea@example.com", lang: "en", why: "reset" });
    expect(mails.at(-1)!.subject).toBe("Code to set a new tcf.monster password");
    raw.prepare("DELETE FROM codes").run();
    await call("/auth/code", { email: "lea@example.com", lang: "en", why: "password" });
    expect(mails.at(-1)!.subject).toBe("Code to set a new tcf.monster password");
    await call("/me/delete/code", {}, { cookie: c });
    expect(mails.at(-1)!.subject).toBe("Code to delete your tcf.monster account");
    expect(mails.at(-1)!.html).toContain("Keep my account");
    // codes never carry the stop link or the unsubscribe headers
    expect(mails.every((m) => !m.headers && !m.text.includes("/api/mail/stop"))).toBe(true);
    expect((raw.prepare("SELECT group_concat(kind) k FROM mail").get() as Row).k).toBe("signup,signin,reset,reset,delete");
  });

  it("each line in the person's language with the other one faint under it", () => {
    const fr = renderMail("signin", { lang: "fr", code: "123456" });
    expect(fr.subject).toBe("Votre code de connexion tcf.monster");
    expect(fr.html).toContain("Votre code de connexion");
    expect(fr.html).toContain('lang="en"');
    expect(fr.html).toContain("Your sign-in code");
    expect(fr.text).toContain("Votre code est 123456");
    expect(fr.text).not.toContain("Your sign-in code"); // the plain text is one language
    for (const id of ["signup", "signin", "password", "delete", "deleted", "welcome", "luck", "after"] as MailId[]) {
      const m = renderMail(id, { lang: "en", name: "<b>Léa</b>", code: "123456", examDate: "2026-10-24", stopUrl: "https://tcf.monster/api/mail/stop?u=x&t=y" });
      expect(m.html).not.toContain("<b>Léa</b>"); // the name is escaped
      expect(m.html).toContain("https://tcf.monster/site/assets/mail-logo.png");
    }
  });
});

describe("the welcome", () => {
  it("goes once, when the first name is given, with the stop link and the one-click headers", async () => {
    const c = await signUp("lea@example.com", "fr");
    await call("/me", { name: "Léa", target_nclc: 7, exam_date: null }, { cookie: c });
    const w = mails.at(-1)!;
    expect(w.subject).toBe("Bienvenue sur tcf.monster, Léa");
    expect(w.html).toContain("https://t.me/tcfmonster");
    expect(w.html).toContain("https://tcf.monster/about#don");
    expect(w.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(w.headers!["List-Unsubscribe"]).toMatch(/^<https:\/\/tcf\.monster\/api\/mail\/stop\?u=.+&t=[0-9a-f]{32}>$/);
    await call("/me", { name: "Léa B" }, { cookie: c });
    expect(mails.filter((m) => m.subject.startsWith("Bienvenue")).length).toBe(1);
  });

  it("waits for the night when the day's room is used up", async () => {
    const c = await signUp("lea@example.com");
    const now = new Date().toISOString();
    for (let i = 0; i < 80; i++) raw.prepare("INSERT INTO mail (at, email, kind, ok) VALUES (?, 'x@example.com', 'signup', 1)").run(now);
    await call("/me", { name: "Léa" }, { cookie: c });
    expect(mails.some((m) => m.subject.startsWith("Welcome"))).toBe(false);
    expect(user("lea@example.com").welcomed_at).toBeNull();
    raw.prepare("DELETE FROM mail").run();
    expect((await runJob(env, "mails")).detail).toContain("1 welcome");
    expect(mails.at(-1)!.subject).toBe("Welcome to tcf.monster, Léa");
  });
});

describe("the exam mails", () => {
  async function person(email: string, exam: string, tz: string) {
    const c = await signUp(email);
    await call("/me", { name: email.split("@")[0], exam_date: exam, settings: { tz } }, { cookie: c });
    return c;
  }
  it("good luck the day before and how did it go the day after, on each person's own day, once per exam date", async () => {
    at("2026-10-20T10:00:00Z");
    await person("toronto@example.com", "2026-10-24", "America/Toronto");
    await person("tashkent@example.com", "2026-10-25", "Asia/Tashkent");
    mails = [];
    at("2026-10-23T22:00:00Z"); // 18:00 on the 23rd in Toronto, 03:00 on the 24th in Tashkent
    await runJob(env, "mails");
    expect(mails.map((m) => `${m.to} ${m.subject}`).sort()).toEqual(["tashkent@example.com Good luck tomorrow, tashkent", "toronto@example.com Good luck tomorrow, toronto"]);
    expect(mails[0].html).toMatch(/Your TCF Canada is on (Saturday 24|Sunday 25) October/);
    await runJob(env, "mails"); // the same night again: nothing
    expect(mails.length).toBe(2);
    at("2026-10-25T22:00:00Z");
    mails = [];
    await runJob(env, "mails");
    // 18:00 on the 25th in Toronto (exam yesterday), 03:00 on the 26th in Tashkent (exam yesterday too)
    expect(mails.map((m) => `${m.to} ${m.subject}`).sort()).toEqual(["tashkent@example.com How did it go, tashkent?", "toronto@example.com How did it go, toronto?"]);
    at("2026-10-26T22:00:00Z");
    mails = [];
    await runJob(env, "mails");
    expect(mails).toEqual([]);
  });

  it("a new exam date gets its own pair", async () => {
    at("2026-10-20T10:00:00Z");
    const c = await person("lea@example.com", "2026-10-24", "America/Toronto");
    at("2026-10-23T22:00:00Z");
    await runJob(env, "mails");
    await call("/me", { exam_date: "2026-11-07" }, { cookie: c });
    mails = [];
    at("2026-11-06T22:00:00Z");
    await runJob(env, "mails");
    expect(mails.map((m) => m.subject)).toEqual(["Good luck tomorrow, lea"]);
  });
});

describe("the stop link", () => {
  it("a visit shows one button and stops nothing; the button (or the one-click post) stops the welcome and exam mails", async () => {
    at("2026-10-20T10:00:00Z");
    const c = await signUp("lea@example.com");
    await call("/me", { name: "Léa", exam_date: "2026-10-24", settings: { tz: "America/Toronto" } }, { cookie: c });
    const link = mails.at(-1)!.headers!["List-Unsubscribe"].slice(1, -1).replace("https://tcf.monster/api", "");
    const page = await call(link);
    expect(page.status).toBe(200);
    expect(page.text).toContain('<form method="post"');
    expect(page.headers.get("content-security-policy")).toContain("style-src 'unsafe-inline'");
    expect(user("lea@example.com").settings).not.toContain('"mails":false');
    expect((await call(link.replace(/t=[0-9a-f]+/, "t=" + "0".repeat(32)), "List-Unsubscribe=One-Click", { form: true })).status).toBe(404);
    const done = await call(link, "List-Unsubscribe=One-Click", { form: true });
    expect(done.status).toBe(200);
    expect(JSON.parse(user("lea@example.com").settings)).toMatchObject({ mails: false, tz: "America/Toronto" });
    mails = [];
    at("2026-10-23T22:00:00Z");
    await runJob(env, "mails");
    expect(mails).toEqual([]);
    expect((await call("/me", undefined, { cookie: c })).data.settings.mails).toBe(false);
  });
});

describe("deleting the account", () => {
  it("sends the last mail once everything is gone", async () => {
    const c = await signUp("lea@example.com", "fr");
    await call("/me/delete/code", {}, { cookie: c });
    expect((await call("/me/delete", { code: lastCode() }, { cookie: c })).status).toBe(200);
    expect(user("lea@example.com")).toBeUndefined();
    expect(mails.at(-1)!.subject).toBe("Votre compte tcf.monster est supprimé");
    expect(mails.at(-1)!.headers).toBeUndefined();
  });
});

describe("the backup sender", () => {
  function stub(resendStatus: number) {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      if (String(url).startsWith("https://api.resend.com")) { calls.push("resend"); if (resendStatus === 200) mails.push({ to: b.to[0], subject: b.subject, text: b.text, html: b.html }); return new Response("{}", { status: resendStatus }); }
      if (String(url) === "https://api.brevo.com/v3/smtp/email") {
        calls.push("brevo");
        expect((init.headers as Record<string, string>)["api-key"]).toBe("brevo-key");
        expect(b.sender).toEqual({ name: "tcf.monster", email: "test@example.com" });
        mails.push({ to: b.to[0].email, subject: b.subject, text: b.textContent, html: b.htmlContent, headers: b.headers });
        return new Response("{}", { status: 201 });
      }
      throw new Error("unexpected fetch " + url);
    });
    return calls;
  }
  it("Resend refusing (its month used up) hands the mail to Brevo; without a Brevo key the code fails as before", async () => {
    const calls = stub(429);
    expect((await call("/auth/code", { email: "lea@example.com", lang: "en" })).status).toBe(502);
    Object.assign(env, { BREVO_API_KEY: "brevo-key" });
    raw.prepare("DELETE FROM codes").run();
    expect((await call("/auth/code", { email: "lea@example.com", lang: "en" })).status).toBe(200);
    expect(calls).toEqual(["resend", "resend", "brevo"]);
    expect(mails.at(-1)!.text).toMatch(/Your code is \d{6}/);
    expect((raw.prepare("SELECT ok, detail FROM mail ORDER BY rowid DESC").get() as Row)).toEqual({ ok: 1, detail: "brevo" });
  });
  it("after Resend's 100 today, mails go straight to Brevo", async () => {
    Object.assign(env, { BREVO_API_KEY: "brevo-key" });
    const calls = stub(200);
    const now = new Date().toISOString();
    for (let i = 0; i < 100; i++) raw.prepare("INSERT INTO mail (at, email, kind, ok) VALUES (?, 'x@example.com', 'signin', 1)").run(now);
    expect((await call("/auth/code", { email: "lea@example.com", lang: "en" })).status).toBe(200);
    expect(calls).toEqual(["brevo"]);
  });
});

describe("sign-up codes share the day's e-mails", () => {
  it("a new address gets no code once today's mails reach the limit minus the reserve; an account still does", async () => {
    await signUp("lea@example.com");
    const now = new Date().toISOString();
    for (let i = 0; i < 85; i++) raw.prepare("INSERT INTO mail (at, email, kind, ok) VALUES (?, 'x@example.com', 'welcome', 1)").run(now);
    const r = await call("/auth/code", { email: "new@example.com", lang: "en" });
    expect(r.status).toBe(429);
    expect(r.data.error).toBe("busy");
    raw.prepare("DELETE FROM codes").run();
    expect((await call("/auth/code", { email: "lea@example.com", lang: "en", why: "signin" })).status).toBe(200);
  });
  it("at most 30 sign-up codes an hour, site-wide", async () => {
    const now = new Date().toISOString();
    for (let i = 0; i < 30; i++) raw.prepare("INSERT INTO mail (at, email, kind, ok) VALUES (?, ?, 'signup', 1)").run(now, `p${i}@example.com`);
    expect((await call("/auth/code", { email: "new@example.com", lang: "en" })).data.error).toBe("busy");
  });
  it("with Turnstile on, the e-mail step, every code and every password need a good answer for that action and address", async () => {
    Object.assign(env, { TURNSTILE_SITEKEY: "0xSITE", TURNSTILE_SECRET: "0xSECRET" });
    let answer: Record<string, unknown> = { success: true, action: "door", hostname: "tcf.monster" };
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (String(url).includes("turnstile/v0/siteverify")) { expect(String(init.body)).toContain("secret=0xSECRET"); return Response.json(answer); }
      const b = JSON.parse(String(init.body)); mails.push({ to: b.to[0], subject: b.subject, text: b.text, html: b.html }); return new Response("{}");
    });
    // the e-mail step: without a token the page gets the key, and nothing about the address
    expect((await call("/auth/exists", { email: "new@example.com" })).data).toEqual({ error: "bot", turnstile: "0xSITE" });
    expect((await call("/auth/exists", { email: "new@example.com", turnstile: "tok" })).data).toEqual({ exists: false });
    // codes: the same answer for a new address and an existing one
    expect((await call("/auth/code", { email: "new@example.com", lang: "en" })).data.error).toBe("bot");
    answer = { success: true, action: "login", hostname: "tcf.monster" };
    expect((await call("/auth/code", { email: "new@example.com", lang: "en", turnstile: "tok" })).data.error).toBe("bot");
    answer = { success: true, action: "code", hostname: "evil.example" };
    expect((await call("/auth/code", { email: "new@example.com", lang: "en", turnstile: "tok" })).data.error).toBe("bot");
    answer = { success: true, action: "code", hostname: "tcf.monster" };
    expect((await call("/auth/code", { email: "new@example.com", lang: "en", turnstile: "tok" })).status).toBe(200);
    // a password tried without a check is not even looked at
    answer = { success: false };
    const r = await call("/auth/login", { email: "new@example.com", password: "a".repeat(43) });
    expect(r.data).toEqual({ error: "bot", turnstile: "0xSITE" });
  });
});

describe("when the day's e-mails run short", () => {
  async function person(email: string, exam: string, tz: string) {
    const c = await signUp(email);
    await call("/me", { name: email.split("@")[0], exam_date: exam, settings: { tz } }, { cookie: c });
    return c;
  }
  const fill = (n: number) => { const now = new Date().toISOString(); for (let i = 0; i < n; i++) raw.prepare("INSERT INTO mail (at, email, kind, ok) VALUES (?, 'x@example.com', 'signin', 1)").run(now); };

  it("the last 50 of the day are for codes: welcome and exam mails wait; good luck still goes on the exam morning, worded « today »", async () => {
    at("2026-10-20T10:00:00Z");
    await person("tashkent@example.com", "2026-10-25", "Asia/Tashkent");
    mails = [];
    at("2026-10-23T22:00:00Z"); // 03:00 on the 24th in Tashkent: the night before
    raw.prepare("DELETE FROM mail").run(); fill(50); // Resend only: 100 a day, 50 left
    await runJob(env, "mails");
    expect(mails).toEqual([]);
    at("2026-10-24T22:00:00Z"); // 03:00 on the exam's own morning
    raw.prepare("DELETE FROM mail").run();
    await runJob(env, "mails");
    expect(mails.map((m) => m.subject)).toEqual(["Good luck today, tashkent"]);
    expect(mails[0].html).toContain("Today, trust what you practised");
  });

  it("how did it go waits up to four days, and names the date", async () => {
    at("2026-10-20T10:00:00Z");
    await person("toronto@example.com", "2026-10-24", "America/Toronto");
    raw.prepare("UPDATE users SET luck_for = exam_date").run();
    mails = [];
    for (const night of ["2026-10-25", "2026-10-26"]) { at(`${night}T22:00:00Z`); raw.prepare("DELETE FROM mail").run(); fill(60); await runJob(env, "mails"); }
    expect(mails).toEqual([]);
    at("2026-10-27T22:00:00Z"); raw.prepare("DELETE FROM mail").run();
    await runJob(env, "mails");
    expect(mails.map((m) => m.subject)).toEqual(["How did it go, toronto?"]);
    expect(mails[0].html).toContain("Your TCF Canada was on Saturday 24 October");
    at("2026-10-29T22:00:00Z"); await runJob(env, "mails"); // never twice
    expect(mails.length).toBe(1);
  });

  it("one night sends at most 25 (the free plan allows 50 outside calls per run); the rest go the next night", async () => {
    at("2026-10-20T10:00:00Z");
    for (let i = 0; i < 30; i++) await person(`p${i}@example.com`, "2026-10-24", "America/Toronto");
    raw.prepare("UPDATE users SET welcomed_at = '2026-10-20'").run();
    raw.prepare("DELETE FROM mail").run(); raw.prepare("DELETE FROM codes").run();
    mails = [];
    Object.assign(env, { BREVO_API_KEY: "brevo-key" });
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => { const b = JSON.parse(String(init.body)); mails.push({ to: b.to[0], subject: b.subject, text: b.text, html: b.html }); return new Response("{}"); });
    at("2026-10-23T22:00:00Z");
    expect((await runJob(env, "mails")).detail).toContain("25 good luck");
    expect(mails.length).toBe(25);
  });
});

describe("one request for a person's reads", () => {
  it("GET /me?with=… brings the asked lists along, through their own routes; unknown names are ignored", async () => {
    const c = await signUp("lea@example.com");
    await call("/me", { name: "Léa" }, { cookie: c });
    const r = await call("/me?with=" + encodeURIComponent("/me/stats,/attempts?section=co,/progress?section=ce,/mock/list,/admin/people"), undefined, { cookie: c });
    expect(r.status).toBe(200);
    expect(r.data.email).toBe("lea@example.com");
    expect(r.data.running).toEqual({ attempt: null, mock: null });
    expect(Object.keys(r.data.extra).sort()).toEqual(["/attempts?section=co", "/mock/list", "/progress?section=ce"]); // the numbers never ride along (CPU)
    expect(r.data.extra["/attempts?section=co"]).toEqual({ attempts: [] });
    expect((await call("/me?with=/me/stats")).status).toBe(401); // signed out: nothing
  });
});
