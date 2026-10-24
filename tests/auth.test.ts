// Accounts on the real Worker and a real SQLite: codes, passwords, sessions, the closed door, the profile, deletion.
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import worker from "../worker/index.ts";
import { makeEnv } from "../scripts/local-env.ts";
import type { Env } from "../worker/util.ts";

type Row = Record<string, any>;
let env: Env, raw: ReturnType<typeof makeEnv>["raw"];
let mails: { to: string; subject: string; text: string }[] = [];

beforeEach(() => {
  const e = makeEnv();
  env = e.env as unknown as Env;
  raw = e.raw;
  Object.assign(env, { RESEND_API_KEY: "test-key", APP_OPEN: "0", TESTERS: "tester@example.com", PASSWORD_PEPPER: "pepper" });
  mails = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (String(url).startsWith("https://api.resend.com")) {
      const b = JSON.parse(String(init.body));
      mails.push({ to: b.to[0], subject: b.subject, text: b.text });
      return new Response("{}", { status: 200 });
    }
    throw new Error("unexpected fetch " + url);
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const PW = "A".repeat(43), PW2 = "B".repeat(43);
async function call(path: string, body?: unknown, o: { cookie?: string; host?: string; origin?: string; ua?: string } = {}) {
  const host = o.host ?? "tcf.monster";
  const r = await worker.fetch(new Request(`https://${host}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body !== undefined ? { "content-type": "application/json", origin: o.origin ?? `https://${host}` } : {}),
      ...(o.cookie ? { cookie: o.cookie } : {}),
      ...(o.ua ? { "user-agent": o.ua } : {}),
      ...(host.startsWith("admin.") && body !== undefined ? { "x-admin": "1" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  const data: any = await r.json().catch(() => ({}));
  const setCookie = r.headers.get("set-cookie") ?? "";
  return { status: r.status, data, setCookie, cookie: setCookie.split(";")[0] };
}
const lastCode = () => mails[mails.length - 1].text.match(/\b(\d{6})\b/)![1];
const count = (sql: string, ...a: unknown[]) => Number((raw.prepare(sql).get(...(a as never[])) as Row).n);

/** the whole sign-up: code, verify, password; returns the session cookie */
async function signUp(email: string, pw = PW, ua?: string) {
  expect((await call("/auth/code", { email, lang: "fr" })).status).toBe(200);
  const v = await call("/auth/verify", { email, code: lastCode() });
  expect(v.status).toBe(200);
  const p = await call("/auth/password", { email, proof: v.data.proof, password: pw, terms: true, lang: "fr" }, { ua });
  expect(p.status).toBe(200);
  return p.cookie;
}

describe("sign-up", () => {
  it("e-mail → code → password: an account, a 30-day cookie for every tcf.monster address, the profile", async () => {
    const r1 = await call("/auth/code", { email: "  Tester@Example.com ", lang: "en" });
    expect(r1.status).toBe(200);
    expect(mails[0].to).toBe("tester@example.com");
    expect(mails[0].subject).toBe("Your tcf.monster sign-up code"); // no code in the subject line
    expect(mails[0].text).toMatch(/\nYour code is \d{6}\n/); // the code alone on its line, for the phones that offer to fill it in
    const v = await call("/auth/verify", { email: "tester@example.com", code: lastCode() });
    expect(v.data.exists).toBe(false);
    const p = await call("/auth/password", { email: "tester@example.com", proof: v.data.proof, password: PW, terms: true, lang: "en" }, { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1" });
    expect(p.data).toEqual({ ok: true, created: true });
    expect(p.setCookie).toMatch(/HttpOnly/);
    expect(p.setCookie).toMatch(/SameSite=Lax/);
    expect(p.setCookie).toMatch(/Secure/);
    expect(p.setCookie).toMatch(/Domain=tcf.monster/);
    expect(p.setCookie).toMatch(/Max-Age=2592000/);
    const me = await call("/me", undefined, { cookie: p.cookie });
    expect(me.data).toMatchObject({ email: "tester@example.com", lang: "en", name: null, isOwner: false });
    const u = raw.prepare("SELECT password, terms_version FROM users").get() as Row;
    expect(u.password).toMatch(/^hmac-sha256\$/);
    expect(u.password).not.toContain(PW);
    expect(u.terms_version).toBe("3");
    expect((raw.prepare("SELECT device FROM sessions").get() as Row).device).toBe("iPhone · Safari");
    expect(count("SELECT COUNT(*) n FROM codes")).toBe(0); // the proof is spent
  });

  it("before the opening only the owner and the testers may join; anyone else hears it is closed and gets no e-mail", async () => {
    expect((await call("/auth/code", { email: "stranger@example.com" })).data.error).toBe("closed");
    expect(mails.length).toBe(0);
    await signUp("owner@example.com");
    (env as Row).APP_OPEN = "1";
    await signUp("stranger@example.com");
    expect(count("SELECT COUNT(*) n FROM users")).toBe(2);
  });

  it("the terms must be accepted; a proof works once; a bad password shape is refused", async () => {
    await call("/auth/code", { email: "tester@example.com" });
    const v = await call("/auth/verify", { email: "tester@example.com", code: lastCode() });
    expect((await call("/auth/password", { email: "tester@example.com", proof: v.data.proof, password: "short" })).status).toBe(400);
    expect((await call("/auth/password", { email: "tester@example.com", proof: v.data.proof, password: PW })).data.error).toBe("terms");
    expect(count("SELECT COUNT(*) n FROM users")).toBe(0);
    const again = await call("/auth/password", { email: "tester@example.com", proof: v.data.proof, password: PW, terms: true });
    expect(again.data.error).toBe("expired"); // the failed try above spent the proof
  });

  it("five wrong codes and the code is dead, even the right one", async () => {
    await call("/auth/code", { email: "tester@example.com" });
    const right = lastCode(), wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) expect((await call("/auth/verify", { email: "tester@example.com", code: wrong })).data.error).toBe("wrong");
    expect((await call("/auth/verify", { email: "tester@example.com", code: wrong })).data.error).toBe("expired");
    expect((await call("/auth/verify", { email: "tester@example.com", code: right })).data.error).toBe("expired");
  });

  it("a code lasts 5 minutes; a new one needs 30 s; five an hour at most", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
    await call("/auth/code", { email: "tester@example.com" });
    const first = lastCode();
    expect((await call("/auth/code", { email: "tester@example.com" })).data).toMatchObject({ error: "wait" });
    vi.setSystemTime(new Date("2026-10-18T10:04:30Z"));
    expect((await call("/auth/verify", { email: "tester@example.com", code: "000000" })).data.error).toBe("wrong"); // still alive
    vi.setSystemTime(new Date("2026-10-18T10:05:30Z"));
    expect((await call("/auth/verify", { email: "tester@example.com", code: first })).data.error).toBe("expired");
    for (let i = 0; i < 4; i++) { vi.setSystemTime(new Date(Date.parse("2026-10-18T10:05:30Z") + i * 40000)); expect((await call("/auth/code", { email: "tester@example.com" })).status).toBe(200); }
    vi.setSystemTime(new Date("2026-10-18T10:15:00Z"));
    expect((await call("/auth/code", { email: "tester@example.com" })).data.error).toBe("too_many");
    vi.setSystemTime(new Date("2026-10-18T11:12:00Z"));
    expect((await call("/auth/code", { email: "tester@example.com" })).status).toBe(200);
  });

  it("a failed e-mail says so and is logged", async () => {
    vi.stubGlobal("fetch", async () => new Response("bad sender", { status: 422 }));
    const r = await call("/auth/code", { email: "tester@example.com" });
    expect(r.status).toBe(502);
    expect(r.data.error).toBe("mail");
    expect(raw.prepare("SELECT ok, kind FROM mail").get()).toEqual({ ok: 0, kind: "signup" });
  });
});


describe("the one door: e-mail first", () => {
  it("/auth/exists says whether the address has an account; a closed door answers closed for strangers", async () => {
    expect((await call("/auth/exists", { email: "tester@example.com" })).data).toEqual({ exists: false });
    expect((await call("/auth/exists", { email: "stranger@example.com" })).data.error).toBe("closed");
    await signUp("tester@example.com");
    expect((await call("/auth/exists", { email: " Tester@Example.com " })).data).toEqual({ exists: true });
    expect((await call("/auth/exists", { email: "not an address" })).status).toBe(400);
    expect(mails.length).toBe(1); // only the sign-up sent an e-mail
  });

  it("sign-in by code: a code, then the six digits open a session; a wrong code, a dead code, an unknown address do not", async () => {
    await signUp("tester@example.com");
    expect((await call("/auth/code", { email: "tester@example.com", lang: "en" })).status).toBe(200);
    const wrong = await call("/auth/signin-code", { email: "tester@example.com", code: "000000" });
    expect(wrong.status).toBe(400);
    expect(wrong.data.error).toBe("wrong");
    expect(wrong.setCookie).toBe("");
    const ok = await call("/auth/signin-code", { email: "tester@example.com", code: lastCode() });
    expect(ok.status).toBe(200);
    expect(ok.setCookie).toMatch(/HttpOnly/);
    expect((await call("/me", undefined, { cookie: ok.cookie })).status).toBe(200);
    // the code is spent
    expect((await call("/auth/signin-code", { email: "tester@example.com", code: lastCode() })).data.error).toBe("expired");
    // an address without an account never gets in, even with a code it could not have
    (env as Row).APP_OPEN = "1";
    await call("/auth/code", { email: "nobody@example.com" });
    const no = await call("/auth/signin-code", { email: "nobody@example.com", code: lastCode() });
    expect(no.status).toBe(400);
    expect(no.setCookie).toBe("");
    expect(count("SELECT COUNT(*) n FROM users")).toBe(1);
  });

  it("the sign-up order of the door: the password is chosen before the code, the code then creates the account", async () => {
    // what the browser does: exists → (false) → password chosen → code asked → verify → password route with the proof
    expect((await call("/auth/exists", { email: "tester@example.com" })).data.exists).toBe(false);
    await call("/auth/code", { email: "tester@example.com", lang: "en" });
    const v = await call("/auth/verify", { email: "tester@example.com", code: lastCode() });
    const p = await call("/auth/password", { email: "tester@example.com", proof: v.data.proof, password: PW, terms: true, lang: "en" });
    expect(p.data).toEqual({ ok: true, created: true });
    expect((await call("/me", undefined, { cookie: p.cookie })).data.lang).toBe("en");
  });

  it("English unless asked otherwise: a code with no language is written in English, an account with no language is English", async () => {
    await call("/auth/code", { email: "tester@example.com" });
    expect(mails[0].subject).toBe("Your tcf.monster sign-up code");
    const v = await call("/auth/verify", { email: "tester@example.com", code: lastCode() });
    const p = await call("/auth/password", { email: "tester@example.com", proof: v.data.proof, password: PW, terms: true });
    expect((await call("/me", undefined, { cookie: p.cookie })).data.lang).toBe("en");
  });
});

describe("sign-in", () => {
  it("right password: in; wrong: the same answer as an unknown address; ten wrong: a 15-minute pause", async () => {
    await signUp("tester@example.com");
    const ok = await call("/auth/login", { email: "TESTER@example.com", password: PW });
    expect(ok.status).toBe(200);
    expect((await call("/me", undefined, { cookie: ok.cookie })).status).toBe(200);
    const wrong = await call("/auth/login", { email: "tester@example.com", password: PW2 });
    const unknown = await call("/auth/login", { email: "nobody@example.com", password: PW2 });
    expect(wrong.data).toEqual(unknown.data);
    expect(wrong.data).toEqual({ error: "wrong" });
    for (let i = 0; i < 8; i++) await call("/auth/login", { email: "tester@example.com", password: PW2 });
    const locked = await call("/auth/login", { email: "tester@example.com", password: PW2 });
    expect(locked.data.error).toBe("locked");
    expect((await call("/auth/login", { email: "tester@example.com", password: PW })).data.error).toBe("locked");
    raw.prepare("UPDATE users SET locked_until = '2000-01-01'").run();
    expect((await call("/auth/login", { email: "tester@example.com", password: PW })).status).toBe(200);
  });

  it("forgotten password: the same code flow sets a new one and signs every device out", async () => {
    const c1 = await signUp("tester@example.com");
    (env as Row).APP_OPEN = "0";
    await call("/auth/code", { email: "tester@example.com" });
    const v = await call("/auth/verify", { email: "tester@example.com", code: lastCode() });
    expect(v.data.exists).toBe(true);
    const p = await call("/auth/password", { email: "tester@example.com", proof: v.data.proof, password: PW2 });
    expect(p.data).toEqual({ ok: true, created: false });
    expect((await call("/me", undefined, { cookie: c1 })).status).toBe(401);
    expect((await call("/me", undefined, { cookie: p.cookie })).status).toBe(200);
    expect((await call("/auth/login", { email: "tester@example.com", password: PW })).status).toBe(400);
    expect((await call("/auth/login", { email: "tester@example.com", password: PW2 })).status).toBe(200);
  });

  it("sign out ends this device only; sign out everywhere ends them all", async () => {
    const a = await signUp("tester@example.com");
    const b = (await call("/auth/login", { email: "tester@example.com", password: PW })).cookie;
    const out = await call("/auth/logout", {}, { cookie: a });
    expect(out.setCookie).toMatch(/Max-Age=0/);
    expect(out.setCookie).toMatch(/Domain=tcf.monster/);
    expect((await call("/me", undefined, { cookie: a })).status).toBe(401);
    expect((await call("/me", undefined, { cookie: b })).status).toBe(200);
    const c = (await call("/auth/login", { email: "tester@example.com", password: PW })).cookie;
    await call("/me/signout-all", {}, { cookie: c });
    expect((await call("/me", undefined, { cookie: b })).status).toBe(401);
    expect((await call("/me", undefined, { cookie: c })).status).toBe(401);
  });

  it("the sign-in is moved forward at most once a day (two writes), not at every visit", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
    const c = await signUp("tester@example.com");
    const seen = () => (raw.prepare("SELECT last_seen_at s FROM sessions").get() as Row).s;
    const first = seen();
    vi.setSystemTime(new Date("2026-10-18T20:00:00Z")); // ten hours later: nothing written
    await call("/me", undefined, { cookie: c });
    expect(seen()).toBe(first);
    vi.setSystemTime(new Date("2026-10-19T11:00:00Z")); // the next day: moved
    await call("/me", undefined, { cookie: c });
    expect(seen()).toBe("2026-10-19T11:00:00.000Z");
  });

  it("a session past 30 days is over; a visit a day later moves it forward", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
    const c = await signUp("tester@example.com");
    vi.setSystemTime(new Date("2026-11-10T10:00:00Z")); // 23 days: still in, and pushed to 30 more
    expect((await call("/me", undefined, { cookie: c })).status).toBe(200);
    vi.setSystemTime(new Date("2026-12-05T10:00:00Z")); // 25 days after that visit
    expect((await call("/me", undefined, { cookie: c })).status).toBe(200);
    vi.setSystemTime(new Date("2027-01-10T10:00:00Z")); // 36 days of silence
    expect((await call("/me", undefined, { cookie: c })).status).toBe(401);
  });

  it("a change sent from another site is refused", async () => {
    const r = await call("/auth/login", { email: "tester@example.com", password: PW }, { origin: "https://evil.example" });
    expect(r.status).toBe(403);
  });
});

describe("profile", () => {
  it("name, target, date, language, settings merged one level deep; bad values refused", async () => {
    const c = await signUp("tester@example.com");
    const r = await call("/me", { name: "  Amina  ", target_nclc: 7, exam_date: "2027-02-18" }, { cookie: c });
    expect(r.data).toMatchObject({ name: "Amina", target_nclc: 7, exam_date: "2027-02-18" });
    await call("/me", { settings: { co: { hint: true }, rail: "collapsed" } }, { cookie: c });
    const s = await call("/me", { settings: { co: { english: true } } }, { cookie: c });
    expect(s.data.settings).toEqual({ co: { hint: true, english: true }, rail: "collapsed" });
    expect((await call("/me", { exam_date: null }, { cookie: c })).data.exam_date).toBeNull();
    for (const bad of [{ name: "  " }, { target_nclc: 3 }, { target_nclc: 7.5 }, { exam_date: "18/02/2027" }, { lang: "de" }, { settings: "x" }, {}])
      expect((await call("/me", bad, { cookie: c })).status).toBe(400);
    expect((await call("/me", { name: "x" })).status).toBe(401);
  });

  it("delete the account: a code by e-mail, then everything goes", async () => {
    const c = await signUp("tester@example.com");
    const id = (raw.prepare("SELECT id FROM users").get() as Row).id;
    raw.prepare("INSERT INTO progress (user_id, section, level, data, updated_at) VALUES (?, 'co', 'A1', '{}', 'x')").run(id);
    raw.prepare("INSERT INTO attempts (user_id, section, exam, started_at, deadline_at) VALUES (?, 'ce', 3, 'x', 'x')").run(id);
    expect((await call("/me/delete", { code: "123456" }, { cookie: c })).data.error).toBe("expired"); // no code asked yet
    await call("/me/delete/code", {}, { cookie: c });
    expect(mails[mails.length - 1].subject).toBe("Code pour supprimer votre compte tcf.monster");
    const d = await call("/me/delete", { code: lastCode() }, { cookie: c });
    expect(d.status).toBe(200);
    for (const t of ["users", "sessions", "progress", "attempts", "codes"]) expect(count(`SELECT COUNT(*) n FROM ${t}`)).toBe(0);
    expect((await call("/me", undefined, { cookie: c })).status).toBe(401);
  });
});

describe("admin, once sign-in exists", () => {
  it("ADMIN_OPEN 0: the owner's session (from tcf.monster) opens the admin; nobody else's does", async () => {
    (env as Row).ADMIN_OPEN = "0";
    const owner = await signUp("owner@example.com");
    const tester = await signUp("tester@example.com");
    expect((await call("/admin/overview", undefined, { host: "admin.tcf.monster" })).status).toBe(403);
    expect((await call("/admin/overview", undefined, { host: "admin.tcf.monster", cookie: tester })).status).toBe(403);
    expect((await call("/admin/overview", undefined, { host: "admin.tcf.monster", cookie: owner })).status).toBe(200);
    expect((await call("/me", undefined, { cookie: owner })).data.isOwner).toBe(true);
  });

  it("the app's API does not answer on the admin address, nor the admin's on the app address", async () => {
    expect((await call("/auth/code", { email: "tester@example.com" }, { host: "admin.tcf.monster" })).status).toBe(404);
    expect((await call("/admin/overview", undefined, { host: "tcf.monster" })).status).toBe(404);
  });
});
