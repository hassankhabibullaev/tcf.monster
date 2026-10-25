// The guard tells a program from a fast person by technical signs only (worker/guard.ts, worker/networks.ts):
// hidden traps and canaries block at once; Cloudflare's invisible check once a day a session; an even beat and the
// browser's own clues raise a score that asks the human check and blocks only when signs of a machine add up; failing
// the check never blocks; ignoring it while hammering does. A blocked bot's network is strict at the door for a few
// days, several close sign-ups from it for a week, and both end by themselves. The owner is never touched.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setup, teardown, PW, ADMIN, examAssets, type QA, type Row } from "./helpers.ts";
import { QUIET_GRACE, RHYTHM, SIGNS, scoreOf, BLOCK_AT, ASK_AT, type Sign } from "../../worker/guard.ts";
import { NET } from "../../worker/networks.ts";
import { netPart } from "../../worker/auth.ts";
import { day, resetLimits } from "../../worker/util.ts";
import { runJob } from "../../worker/jobs.ts";

const CANARY_ID = "4b1c2d3e-aaaa-4bbb-8ccc-0123456789ab";
const CANARY_MEDIA = "/media/co/0123456789abcdef0123456789abcdef.mp3";
const IP = "203.0.113.7";

let qa: QA;
let cookie = "";
beforeEach(async () => {
  qa = setup({ OWNER_EMAIL: "owner@tcf.monster", ADMIN_OPEN: "0" });
  (qa.env as Row).ASSETS = examAssets();
  await qa.r2.put("private/canary.json", JSON.stringify({ ids: [CANARY_ID], media: [CANARY_MEDIA] }));
  cookie = await qa.signUp("student@example.com", PW, { ip: IP });
});
afterEach(teardown);

/** Turnstile on, with a pretend siteverify: "ok:<action>" passes for that action, "down" is Cloudflare out of reach,
 *  anything else fails ("good" is the human check's pass) */
function turnstile() {
  Object.assign(qa.env, { TURNSTILE_SITEKEY: "site-key", TURNSTILE_SECRET: "secret" });
  const prev = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes("turnstile/v0/siteverify")) return prev(input, init);
    const token = new URLSearchParams(String(init?.body)).get("response") ?? "";
    if (token === "down") return new Response("busy", { status: 503 });
    const action = token === "good" ? "human" : token.startsWith("ok:") ? token.slice(3) : null;
    return new Response(JSON.stringify(action ? { success: true, action, hostname: "tcf.monster" } : { success: false }), { status: 200 });
  });
}
const limiter = (n: number) => { const m = new Map<string, number>(); return { limit: async ({ key }: { key: string }) => { const c = (m.get(key) ?? 0) + 1; m.set(key, c); return { success: c <= n }; } }; };
const id = () => qa.userId("student@example.com");
const student = () => qa.raw.prepare("SELECT blocked_at, blocked_reason, human_needed_at, human_until, human_fails, guard_signs FROM users WHERE email = ?").get("student@example.com") as Row;
const signs = (): Sign[] => Object.keys(JSON.parse(String(student().guard_signs ?? "{}"))).sort() as Sign[];
const events = () => (qa.raw.prepare("SELECT kind, detail FROM guard_events WHERE user_id = ? ORDER BY at").all(id()) as Row[]);
const network = () => qa.raw.prepare("SELECT * FROM guard_networks").get() as Row | undefined;
const blockedNow = (r: { status: number; data: Row }) => r.status === 403 && r.data.error === "blocked";
const answer = (qid: string, t: number) => ({ id: `e${Math.random().toString(36).slice(2, 12)}`, section: "co", level: "B1", type: "answer", qid, key: "B", right: true, t });
/** answers `gaps` apart (seconds), sent in bundles of ten as the room does */
async function answers(gaps: number[], c = cookie) {
  let t = Date.now() / 1000 - gaps.reduce((a, b) => a + b, 0) - 5;
  const all = [answer("q0", t), ...gaps.map((g, i) => answer(`q${i + 1}`, (t += g)))];
  let last: Awaited<ReturnType<QA["call"]>> | null = null;
  for (let i = 0; i < all.length; i += 10) last = await qa.call("/api/sync", { body: { events: all.slice(i, i + 10) }, cookie: c });
  return last!;
}

describe("hidden traps: no person can see or reach them", () => {
  it("the hidden link to the whole bank, signed in: blocked at once, signed out everywhere, the network strict", async () => {
    const r = await qa.call("/data/bank-full.json", { cookie, ip: IP });
    expect(blockedNow(r)).toBe(true);
    expect(student().blocked_reason).toMatch(/^automation: touched a hidden trap/);
    expect(qa.count("SELECT COUNT(*) n FROM sessions")).toBe(0);
    expect(events().map((e) => e.kind).sort()).toEqual(["blocked", "sign"]);
    const n = network()!;
    expect(n.blocks).toBe(1);
    expect(Date.parse(String(n.strict_until))).toBeGreaterThan(Date.now() + (NET.blockDays - 0.1) * 86_400_000);
  });

  it("the app's hidden button: blocked", async () => {
    expect(blockedNow(await qa.call("/api/me/archive", { cookie, body: {} }))).toBe(true);
  });

  it("a browser fetching ahead by itself (prefetch, prerender) is not a visit: nothing happens", async () => {
    for (const h of [{ "sec-purpose": "prefetch" }, { "sec-purpose": "prefetch;prerender" }, { purpose: "prefetch" }] as Record<string, string>[]) expect((await qa.call("/data/bank-full.json", { cookie, headers: h })).status).toBe(404);
    expect(student().blocked_at).toBeNull();
  });

  it("signed out: no account to block; the network is strict for a day, written once an hour at most", async () => {
    for (let i = 0; i < 5; i++) expect((await qa.call("/data/bank-full.json", { ip: "198.51.100.9" })).status).toBe(404);
    const n = network()!;
    expect([n.traps, n.blocks]).toEqual([1, 0]);
    expect(Date.parse(String(n.strict_until))).toBeLessThan(Date.now() + (NET.trapDays + 0.1) * 86_400_000);
    expect(n.closed_until).toBeNull();
    expect(student().blocked_at).toBeNull();
  });
});

describe("canaries: questions and recordings in the bank's files that no page shows", () => {
  it("a practice answer for a canary question: blocked", async () => {
    const r = await qa.call("/api/sync", { body: { events: [answer("q1", Date.now() / 1000 - 9), answer(CANARY_ID, Date.now() / 1000 - 2)] }, cookie });
    expect(blockedNow(r)).toBe(true);
    expect(student().blocked_reason).toMatch(/question no person can see/);
    expect(qa.count("SELECT COUNT(*) n FROM progress")).toBe(0);
  });

  it("an exam answer for the file's hidden position 40: blocked; it is never scored either", async () => {
    const a = await qa.call("/api/attempts", { body: { section: "co", exam: 3 }, cookie });
    expect(a.status).toBe(201);
    const r = await qa.call(`/api/attempts/${a.data.attempt.id}`, { method: "PATCH", body: { answers: { "CO-03-01": "A", "CO-03-40": "A" } }, cookie });
    expect(blockedNow(r)).toBe(true);
  });

  it("a report on a canary question: blocked", async () => {
    expect(blockedNow(await qa.call("/api/disputes", { body: { section: "co", level: "B1", questionId: CANARY_ID, n: 3, message: "faux" }, cookie }))).toBe(true);
  });

  it("a canary recording asked with a session: blocked; without one: the network; an old or a lost name: a plain 404", async () => {
    expect((await qa.call("/media/co/69205b60b0f61d26db49.mp3", { cookie })).status).toBe(404);
    expect((await qa.call("/media/co/ffffffffffffffffffffffffffffffff.mp3", { cookie })).status).toBe(404);
    expect(student().blocked_at).toBeNull();
    expect((await qa.call(CANARY_MEDIA, { ip: "198.51.100.20" })).status).toBe(404);
    expect(network()!.traps).toBe(1);
    expect((await qa.call(CANARY_MEDIA, { cookie })).status).toBe(404);
    expect(student().blocked_reason).toMatch(/^automation:/);
  });

  it("no canary list in R2 (this Mac): nothing is a canary, nothing breaks", async () => {
    await qa.r2.delete("private/canary.json");
    const { resetCanaries } = await import("../../worker/guard.ts");
    resetCanaries();
    expect((await qa.call("/api/sync", { body: { events: [answer(CANARY_ID, Date.now() / 1000 - 2)] }, cookie })).status).toBe(200);
  });
});

describe("Cloudflare's invisible check, once a day a session", () => {
  it("a session that has not passed it today is asked (a header, no request of its own); its token passes it for the day", async () => {
    turnstile();
    const first = await qa.call("/api/me", { cookie });
    expect(first.status).toBe(200);
    expect(first.headers.get("x-quiet-check")).toBe("site-key");
    expect((await qa.call("/data/co-A1.json", { cookie })).headers.get("x-quiet-check")).toBe("site-key");
    const ok = await qa.call("/api/me", { cookie, headers: { "x-quiet": "ok:quiet" } });
    expect([ok.status, ok.headers.get("x-quiet-check")]).toEqual([200, null]);
    expect(qa.raw.prepare("SELECT checked_day FROM sessions").get()).toEqual({ checked_day: day(qa.env.APP_TZ) });
    // another server reads it with the session: nothing asked again today
    const { resetGuardCounts } = await import("../../worker/guard.ts");
    resetGuardCounts();
    expect((await qa.call("/api/me", { cookie })).headers.get("x-quiet-check")).toBeNull();
    expect(events()).toEqual([]);
  });

  it("it failed (or the page could not run it): the visible check, then on as usual", async () => {
    turnstile();
    const r = await qa.call("/api/me", { cookie, headers: { "x-quiet": "failed" } });
    expect([r.status, r.data.error]).toEqual([429, "human"]);
    expect(signs()).toEqual(["quiet"]);
    expect((await qa.call("/api/me", { cookie, headers: { "x-turnstile": "good" } })).status).toBe(200);
    expect(qa.raw.prepare("SELECT checked_day FROM sessions").get()).toEqual({ checked_day: day(qa.env.APP_TZ) });
    expect(student().blocked_at).toBeNull();
  });

  it(`never answered within ${QUIET_GRACE} requests: not a browser running the page; the visible check`, async () => {
    turnstile();
    for (let i = 1; i < QUIET_GRACE; i++) expect((await qa.call("/api/me", { cookie })).status).toBe(200);
    expect((await qa.call("/api/me", { cookie })).status).toBe(429);
    expect(signs()).toEqual(["nocheck"]);
    expect(student().blocked_at).toBeNull();
  });

  it("Cloudflare out of reach is nobody's failure", async () => {
    turnstile();
    expect((await qa.call("/api/me", { cookie, headers: { "x-quiet": "down" } })).status).toBe(200);
    expect(signs()).toEqual([]);
  });
});

describe("failing the check never blocks; ignoring it while hammering does", () => {
  it("a check failed again and again: asked again each time, a « failing » sign once, never a block", async () => {
    turnstile();
    (qa.env as Row).USER_PACE = limiter(0);
    await qa.call("/api/me", { cookie });
    for (let i = 0; i < 20; i++) expect((await qa.call("/api/me", { cookie, headers: { "x-turnstile": "bad" } })).status).toBe(429);
    expect(student().blocked_at).toBeNull();
    expect(signs()).toEqual(["failing"]);
    expect(events().filter((e) => e.kind === "sign")).toHaveLength(1);
  });

  it("the check waiting and requests still coming at a machine's pace, unanswered: blocked", async () => {
    turnstile();
    (qa.env as Row).USER_PACE = limiter(0);
    (qa.env as Row).USER_BURST = limiter(5);
    let r = await qa.call("/api/me", { cookie });
    for (let i = 0; i < 10 && !blockedNow(r); i++) r = await qa.call("/api/me", { cookie });
    expect(blockedNow(r)).toBe(true);
    expect(student().blocked_reason).toBe("kept going at a machine's pace without passing the human check");
  });
});

describe("an even beat: answers at a machine's regular pace", () => {
  it(`${RHYTHM.answers} answers exactly 2 s apart: a sign, the check asked, no block`, async () => {
    turnstile();
    const r = await answers(Array(RHYTHM.answers).fill(2), cookie);
    expect([r.status, r.data.error]).toEqual([429, "human"]);
    expect(signs()).toEqual(["rhythm"]);
    expect(student().blocked_at).toBeNull();
  });

  it("a person racing through questions they know (0.6–1.4 s, any order) is never a beat; nor a steady but human hand", async () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    await answers(Array.from({ length: 120 }, () => 0.6 + rand() * 0.8));
    // a very steady person: about 3 s each, a few hundredths either way (well past a machine's evenness)
    await answers(Array.from({ length: 60 }, () => 3 + (rand() - 0.5) * 0.4));
    // answers sent all at once, a millisecond apart (the queue replayed, or several taps at once): speed is not a sign
    await answers(Array(40).fill(0.001));
    expect(signs()).toEqual([]);
  });
});

describe("the browser's clues and the score", () => {
  const clue = (c: string, k = cookie) => qa.call("/api/me", { cookie: k, headers: { "x-signs": c } });

  it("one clue alone never blocks; a program's mark asks the check; the same clue again writes nothing", async () => {
    turnstile();
    expect((await clue("u")).status).toBe(200); // 30: below the check
    expect((await clue("u")).status).toBe(200);
    expect(events().filter((e) => e.kind === "sign")).toHaveLength(1);
    expect((await clue("w")).status).toBe(429); // 70: the check
    expect(student().blocked_at).toBeNull();
    expect(signs()).toEqual(["untrusted", "webdriver"]);
  });

  it("everything a person can show at once (events no hand made, no hand, every trouble with the check) stays under the block", async () => {
    turnstile();
    const person: Sign[] = ["untrusted", "noinput", "quiet", "nocheck", "failing"];
    expect(scoreOf(Object.fromEntries(person.map((s) => [s, "x"])))).toBeLessThan(BLOCK_AT);
    await qa.call("/api/me", { cookie, headers: { "x-quiet": "failed" } });
    await clue("u,n");
    for (let i = 0; i < 4; i++) await qa.call("/api/me", { cookie, headers: { "x-turnstile": "bad" } });
    expect(signs()).toEqual(["failing", "noinput", "quiet", "untrusted"]);
    expect(student().blocked_at).toBeNull();
  });

  it("signs of a machine adding up block: webdriver, headless, then an even beat", async () => {
    expect((await clue("w,h")).status).toBe(200); // 80, no Turnstile here: nothing asked
    expect(student().blocked_at).toBeNull();
    const r = await answers(Array(RHYTHM.answers).fill(1.5));
    expect(blockedNow(r)).toBe(true);
    expect(student().blocked_reason).toMatch(/^automation: .*webdriver/);
    // one network, one blocked account so far: strict, not closed
    expect(network()?.closed_until ?? null).toBeNull();
  });

  it("the weights hold the rules: no sign but a trap reaches the block; a program's mark reaches the check", () => {
    for (const [k, s] of Object.entries(SIGNS)) if (k !== "trap" && k !== "canary") expect(s.weight, k).toBeLessThan(BLOCK_AT);
    for (const k of ["webdriver", "headless", "rhythm"] as const) expect(SIGNS[k].weight).toBeGreaterThanOrEqual(ASK_AT);
  });
});

describe("the network of a blocked bot", () => {
  /** a fresh account from `ip`, signed in, then caught on a trap */
  async function caught(email: string, ip: string) {
    const c = await qa.signUp(email, PW, { ip });
    expect(blockedNow(await qa.call("/data/bank-full.json", { cookie: c, ip }))).toBe(true);
  }

  it("strict for a few days: every step of the door asks the check (shown as a box), tighter code limits", async () => {
    await caught("bot1@example.com", IP);
    turnstile();
    const v = await qa.call("/api/auth/verify", { body: { email: "student@example.com", code: "123456" }, ip: IP });
    expect([v.status, v.data.error, v.data.strict]).toEqual([403, "bot", true]);
    expect((await qa.call("/api/auth/verify", { body: { email: "student@example.com", code: "123456", turnstile: "ok:strict" }, ip: IP })).data.error).toBe("expired");
    expect((await qa.call("/api/auth/exists", { body: { email: "student@example.com", turnstile: "ok:door" }, ip: IP })).data).toEqual({ exists: true, strict: true });
    // another network is untouched
    expect((await qa.call("/api/auth/verify", { body: { email: "student@example.com", code: "123456" }, ip: "192.0.2.50" })).data.error).toBe("expired");
    // five codes a day for the network instead of fifteen (two went already: the student's and the bot's sign-ups)
    expect(qa.count("SELECT COUNT(*) n FROM mail WHERE ip IS NOT NULL")).toBe(2);
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) { resetLimits(); codes.push((await qa.call("/api/auth/code", { body: { email: `p${i}@example.com`, lang: "fr", turnstile: "ok:code" }, ip: IP })).status); }
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });

  it(`${NET.closeAfter} accounts blocked from one network: no new account from it for a week; existing ones still sign in`, async () => {
    // the student's own account was made on this network before; three bots are caught there
    for (let i = 1; i <= NET.closeAfter; i++) await caught(`bot${i}@example.com`, IP);
    resetLimits(); // a minute later
    expect(network()!.blocks).toBe(NET.closeAfter);
    expect(Date.parse(String(network()!.closed_until))).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect((await qa.call("/api/auth/exists", { body: { email: "new@example.com" }, ip: IP })).data).toEqual({ error: "paused", contact: "https://t.me/tcfmonsteradmin" });
    expect((await qa.call("/api/auth/code", { body: { email: "new@example.com", lang: "fr" }, ip: IP })).data.error).toBe("paused");
    expect((await qa.call("/api/auth/login", { body: { email: "student@example.com", password: PW }, ip: IP })).status).toBe(200);
    // elsewhere, sign-ups go on
    expect((await qa.call("/api/auth/code", { body: { email: "new@example.com", lang: "fr" }, ip: "192.0.2.51" })).status).toBe(200);
  });

  it("never for good: past its dates the door is plain again, and the nightly cleanup removes the row", async () => {
    for (let i = 1; i <= NET.closeAfter; i++) await caught(`bot${i}@example.com`, IP);
    qa.raw.prepare("UPDATE guard_networks SET strict_until = '2020-01-01T00:00:00.000Z', closed_until = '2020-01-02T00:00:00.000Z'").run();
    resetLimits();
    turnstile();
    expect((await qa.call("/api/auth/exists", { body: { email: "new@example.com", turnstile: "ok:door" }, ip: IP })).data).toEqual({ exists: false });
    expect((await qa.call("/api/auth/verify", { body: { email: "x@example.com", code: "123456" }, ip: IP })).data.error).toBe("expired");
    await runJob(qa.env, "cleanup");
    expect(network()).toBeUndefined();
  });

  it("the door's hidden field filled in: that network strict for a day, nothing else (no block, no other network)", async () => {
    turnstile();
    const r = await qa.call("/api/auth/exists", { body: { email: "student@example.com", hp: "Jean", turnstile: "ok:door" }, ip: "198.51.100.30" });
    expect(r.data).toEqual({ exists: true, strict: true });
    expect(network()!.traps).toBe(1);
    expect((await qa.call("/api/auth/verify", { body: { email: "student@example.com", code: "123456" }, ip: "198.51.100.30" })).data.error).toBe("bot");
    // the next visitor, elsewhere, finds an ordinary door
    expect((await qa.call("/api/auth/exists", { body: { email: "student@example.com", turnstile: "ok:door" }, ip: "192.0.2.60" })).data).toEqual({ exists: true });
    expect(student().blocked_at).toBeNull();
  });

  it("one IPv6 home or phone is one network (its /64); an IPv4 address is its own", () => {
    expect(netPart("2001:db8:1:2:aaaa::1")).toBe(netPart("2001:0db8:0001:0002:ffff:1:2:3"));
    expect(netPart("2001:db8:1:2::1")).not.toBe(netPart("2001:db8:1:3::1"));
    expect(netPart("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(netPart("203.0.113.7")).toBe("203.0.113.7");
  });
});

describe("the owner is never touched", () => {
  it("traps, canaries, clues and an even beat: nothing noted, nothing blocked", async () => {
    const owner = await qa.signUp("owner@tcf.monster");
    turnstile();
    expect((await qa.call("/data/bank-full.json", { cookie: owner })).status).toBe(404);
    expect((await qa.call("/api/me/archive", { cookie: owner, body: {} })).status).toBe(404);
    expect((await qa.call(CANARY_MEDIA, { cookie: owner })).status).toBe(404);
    expect((await qa.call("/api/me", { cookie: owner, headers: { "x-signs": "w,h,u,n" } })).status).toBe(200);
    expect((await answers(Array(RHYTHM.answers).fill(2), owner)).status).toBe(200);
    const o = qa.raw.prepare("SELECT blocked_at, guard_signs FROM users WHERE email = ?").get("owner@tcf.monster") as Row;
    expect(o).toEqual({ blocked_at: null, guard_signs: null });
    expect(network()).toBeUndefined();
  });
});

describe("the admin's person page", () => {
  it("shows the score, the signs and every step; Unblock clears the signs", async () => {
    await qa.call("/api/me", { cookie, headers: { "x-signs": "w" } });
    const owner = await qa.signUp("owner@tcf.monster");
    const p = await qa.call(`/api/admin/people/${id()}`, { host: ADMIN, cookie: owner });
    expect(p.data.guard).toMatchObject({ score: 40, askAt: ASK_AT, blockAt: BLOCK_AT, signs: [{ sign: "webdriver", weight: 40, label: SIGNS.webdriver.label }] });
    expect(p.data.guard.events.map((e: Row) => e.kind)).toEqual(["sign"]);
    expect(p.data.user.guard_signs).toBeUndefined();
    await qa.call(`/api/admin/people/${id()}/block`, { host: ADMIN, cookie: owner, body: {} });
    await qa.call(`/api/admin/people/${id()}/unblock`, { host: ADMIN, cookie: owner, body: {} });
    expect(student().guard_signs).toBeNull();
  });
});
