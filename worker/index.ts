// The tcf.monster Worker: tcf.monster (the public site and the application, one address) and admin.tcf.monster (the
// owner's tool), one database (D1) and one bucket (R2). Pages are static files from dist/ (vite build; the public
// site is copied to dist/site/); the Worker answers /api/* and picks the page for each address:
//   tcf.monster/          the public site for a visitor, the dashboard for a signed-in person
//   tcf.monster/about     the public site, always (the app's wordmark leads there)
//   /terms /privacy /thanks /changes  the site's pages (/changes: every release); any other address is the application
//   app.tcf.monster, www.tcf.monster  the same path on tcf.monster, for good (301; 308 for a write)
import { type Env, fail, json, holdReached, addWrites } from "./util.ts";
import { handleAdmin } from "./admin.ts";
import { handleAuth, currentUser, type Me } from "./auth.ts";
import { handleMe } from "./me.ts";
import { handleStats } from "./stats.ts";
import { handleMedia } from "./media.ts";
import { handleDonate } from "./donate.ts";
import { handleProgress, handleSync } from "./coce/progress.ts";
import { handleAttempts } from "./coce/attempts.ts";
import { handleDisputes } from "./coce/disputes.ts";
import { handleData } from "./coce/guard.ts";
import { guardRequest, quietHeaders, trapped, TRAPS } from "./guard.ts";
import { handleExpr, handleKey } from "./expr.ts";
import { handleMock } from "./mock/index.ts";
import { handleTopics } from "./content.ts";
import { runJob } from "./jobs.ts";
import { BACKED_UP } from "./backup.ts";
import { pepper, same } from "./auth.ts";
import { handleStop } from "./news.ts";

/** the one address of the application and the public site */
export const HOME = "https://tcf.monster";

const SECURITY: Record<string, string> = {
  "content-security-policy": "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=()",
  // once on https, the browser never tries http again for a year (the sign-in needs https)
  "strict-transport-security": "max-age=63072000; includeSubDomains",
};

function withHeaders(res: Response, extra: Record<string, string> = {}) {
  const out = new Response(res.body, res);
  // a page that brings its own policy keeps it (the mail stop page: inline styles only, no script)
  for (const [k, v] of Object.entries({ ...SECURITY, ...extra })) if (!(k === "content-security-policy" && res.headers.has(k))) out.headers.set(k, v);
  return out;
}

/** which front door: admin.* is the admin; the old app.tcf.monster and www.tcf.monster move to the bare domain; every
 *  other host — tcf.monster, and this Mac's app.localhost — is the application */
export const door = (host: string): "app" | "admin" | "moved" =>
  host.startsWith("admin.") ? "admin" : host === "app.tcf.monster" || host === "www.tcf.monster" ? "moved" : "app";

/** /.well-known/security.txt: renew `Expires` before October 2027 */
const SECURITY_TXT = `Contact: mailto:bonjour@tcf.monster
Expires: 2027-10-24T00:00:00.000Z
Policy: https://github.com/hassankhabibullaev/tcf.monster/blob/main/SECURITY.md
Preferred-Languages: en, fr
Canonical: https://tcf.monster/.well-known/security.txt
`;

/** the public site's pages (dist/site/), by address; `/` only for a visitor */
const SITE_PAGES: Record<string, string> = { "/about": "/site/", "/terms": "/site/terms", "/privacy": "/site/privacy", "/thanks": "/site/thanks", "/changes": "/site/changes", "/robots.txt": "/site/robots.txt" };
/** the site's old French addresses, still in e-mails and bookmarks */
const MOVED: Record<string, string> = { "/conditions": "/terms", "/confidentialite": "/privacy", "/merci": "/thanks" };

/** a site page; for a signed-in person the page carries `data-signed-in`, so its bar offers « Mon tableau de bord » */
async function sitePage(req: Request, env: Env, url: URL, file: string, signedIn: boolean): Promise<Response> {
  const res = await env.ASSETS.fetch(new Request(new URL(file, url), req));
  const extra: Record<string, string> = { "cache-control": "no-cache" };
  if (!signedIn || !(res.headers.get("content-type") ?? "").includes("text/html")) return withHeaders(res, extra);
  const html = (await res.text()).replace(/<html([^>]*)>/, "<html$1 data-signed-in>");
  return withHeaders(new Response(html, { status: res.status, headers: res.headers }), extra);
}

/** a path as a file server may read it: decoded (until it no longer changes), slashes folded, dot segments resolved */
function canonical(path: string) {
  let p = path;
  for (let i = 0; i < 3; i++) {
    let d: string;
    try { d = decodeURIComponent(p); } catch { break; }
    if (d === p) break;
    p = d;
  }
  p = p.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  try { return new URL(p, "https://x").pathname.replace(/\/{2,}/g, "/"); } catch { return p; }
}

/** a change must come from our own pages: the browser's Origin header, when sent, names this address */
const sameOrigin = (req: Request, url: URL) => {
  const o = req.headers.get("origin");
  return !o || o === url.origin;
};
/** every method that may change something (POST, PATCH, DELETE, PUT…) */
const writes = (method: string) => method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.slice(4); // after "/api"
  if (path === "/donate") return handleDonate(req, env); // answers the public site too (its own CORS and preflight)
  if (writes(req.method) && !sameOrigin(req, url)) return fail(403, "cross-site");
  // the app's hidden button (no person can see or reach it): a program pressing everything
  if (TRAPS.has(url.pathname)) return trapped(env, req, "the app's hidden button");
  if (path.startsWith("/admin/")) return door(url.hostname) === "admin" ? handleAdmin(req, env, url) : fail(404, "not found");
  if (door(url.hostname) !== "app") return fail(404, "not found");
  if (path === "/mail/stop") return handleStop(req, env, url);
  if (path.startsWith("/auth/")) return handleAuth(req, env, path);
  if (path === "/me" || path.startsWith("/me/") || path.startsWith("/expr/") || path === "/topics" || path === "/progress" || path === "/sync" || path === "/disputes" || path === "/attempts" || path.startsWith("/attempts/") || path === "/mock" || path.startsWith("/mock/")) {
    const me = await currentUser(env, req);
    if (!me) return fail(401, "signed out");
    // pace and volume far beyond a person: the human check, then a block (worker/guard.ts)
    const stopped = await guardRequest(req, env, me, writes(req.method));
    if (stopped) return stopped;
    // past the day's hold line nothing new starts (exams, sessions, mocks, reports); what already runs goes on to its
    // end and its marks, and /sync answers { hold } itself (the browser keeps its queue)
    if (req.method === "POST" && STARTS.has(path) && (await holdReached(env))) return json({ error: "hold" }, 503);
    if (path === "/sync") return withQuiet(await handleSync(req, env, me), env, me);
    const res = await signedIn(req, env, url, path, me);
    // every change counts toward the day's hold line (an estimate: some write a few rows, some none)
    if (writes(req.method) && res.ok) await addWrites(env, 1);
    return withQuiet(res, env, me);
  }
  return fail(404, "not found");
}

/** a response that also asks the page for today's invisible check (worker/guard.ts), while the session has not passed it */
function withQuiet(res: Response, env: Env, me: Me): Response {
  const h = quietHeaders(env, me);
  if (!Object.keys(h).length) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(h)) out.headers.set(k, v);
  return out;
}

/** the POSTs that start something new: refused past the day's hold line */
const STARTS = new Set(["/attempts", "/expr/start", "/mock", "/disputes"]);

/** the routes of a signed-in person, after the checks above */
async function signedIn(req: Request, env: Env, url: URL, path: string, me: Me): Promise<Response> {
  if (path === "/topics") return handleTopics(req, env, url);
  if (path === "/progress") return handleProgress(req, env, me, url);
  if (path === "/disputes") return handleDisputes(req, env, me, url);
  if (path === "/attempts" || path.startsWith("/attempts/")) return handleAttempts(req, env, me, path, url);
  if (path === "/me/key") return handleKey(req, env, me);
  if (path === "/me/stats" && req.method === "GET") return handleStats(env, me);
  if (path === "/me" && req.method === "GET" && url.searchParams.has("with")) return withBundle(req, env, url, me, await handleMe(req, env, me, path));
  if (path.startsWith("/expr/")) return handleExpr(req, env, me, path, url);
  if (path === "/mock" || path.startsWith("/mock/")) return handleMock(req, env, me, path, url);
  return handleMe(req, env, me, path);
}

/** the reads GET /me may bring along (?with=a,b): the browser asks once for what it lacks instead of once per screen */
// the dashboard's numbers stay out: they read the whole history (CPU: the free plan allows 10 ms a request)
const BUNDLE = new Set(["/attempts?section=co", "/attempts?section=ce", "/progress?section=co", "/progress?section=ce", "/expr/sessions", "/mock/list"]);
async function withBundle(req: Request, env: Env, url: URL, me: Me, base: Response): Promise<Response> {
  if (!base.ok) return base;
  const profile = (await base.json()) as Record<string, unknown>;
  const want = (url.searchParams.get("with") ?? "").split(",").filter((k) => BUNDLE.has(k)).slice(0, BUNDLE.size);
  const extra: Record<string, unknown> = {};
  for (const k of want) {
    // each read through its own route (same answer), for the person this request already found and checked: one
    // sign-in read and one pass through the guard for the whole bundle
    const sub = new Request(new URL(`/api${k}`, url), { headers: { cookie: req.headers.get("cookie") ?? "" } });
    const subUrl = new URL(sub.url);
    const r = await signedIn(sub, env, subUrl, subUrl.pathname.slice(4), me).catch(() => null);
    if (r?.ok) extra[k] = await r.json().catch(() => null);
  }
  return json({ ...profile, extra });
}

/** the nightly run's own calls: signed with the pepper, so no visitor can start a job */
async function jobKey(env: Env) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("tcf.monster nightly job")))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/__job/")) {
      const given = req.headers.get("x-job") ?? "";
      if (req.method !== "POST" || !given || !same(given, await jobKey(env))) return fail(404, "not found");
      const r = await runJob(env, url.pathname.slice(7));
      return json(r, r.ok ? 200 : 500);
    }
    // plain http is never served: the password is stretched with the browser's crypto, which only exists on https
    // (an http page threw « TypeError » at sign-in); a GET moves for good, a write keeps its method (308)
    if (url.protocol === "http:" && !/^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/.test(url.hostname)) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), req.method === "GET" || req.method === "HEAD" ? 301 : 308);
    }
    const which = door(url.hostname);
    // the old addresses of the application and the site: the same path on the bare domain, for good (an API call too:
    // a tab left open on app.tcf.monster keeps working, the cookie covers both)
    if (which === "moved") return Response.redirect(HOME + url.pathname + url.search, req.method === "GET" || req.method === "HEAD" ? 301 : 308);
    if (url.pathname.startsWith("/api/")) {
      // every API answer is personal or changes by the minute: no index, no cache (even the ones not made by json())
      let res: Response;
      try {
        res = await api(req, env, url);
      } catch (e) {
        console.error(e);
        res = fail(500, "server error");
      }
      return withHeaders(res, { "x-robots-tag": "noindex", ...(res.headers.has("cache-control") ? {} : { "cache-control": "no-store" }) });
    }
    // the question bank's folders under any other spelling (/%64ata/…, //data/…, /DATA/…) are not files: the asset
    // server would decode them and hand the bank out past the guard
    if (!url.pathname.startsWith("/data/") && !url.pathname.startsWith("/media/") && /^\/(data|media)(\/|$)/i.test(canonical(url.pathname))) return fail(404, "not found");
    // the question bank: recordings and pictures from R2, the files from the built pages; signed-in people only
    if (url.pathname.startsWith("/media/")) return which === "app" ? handleMedia(req, env, url.pathname.slice(1)) : fail(404, "not found");
    if (url.pathname.startsWith("/data/")) return withHeaders(await handleData(req, env, url, which === "admin"), { "x-robots-tag": "noindex" });
    const path = url.pathname.replace(/\/+$/, "") || "/";
    // how to report a security problem (RFC 9116), on every address
    if (path === "/.well-known/security.txt") return new Response(SECURITY_TXT, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
    if (which === "app") {
      if (MOVED[path]) return Response.redirect(new URL(MOVED[path] + url.search, url).toString(), 301);
      // the public site: its own pages, and `/` for whoever is not signed in (one session read, only on these pages)
      if (SITE_PAGES[path] || path === "/") {
        const signedIn = !!(await currentUser(env, req).catch(() => null));
        if (path !== "/" || !signedIn) return sitePage(req, env, url, SITE_PAGES[path] ?? "/site/", signedIn);
      }
    }
    // files as they are; every other address is the page itself (its own router shows the screen)
    const isFile = /\.[a-z0-9]+$/i.test(url.pathname) && !url.pathname.endsWith(".html");
    let asset = isFile ? await env.ASSETS.fetch(req) : await env.ASSETS.fetch(new Request(new URL(`/${which}/`, url), req));
    // the logo the e-mails already sent ask for (tcf.monster/assets/app-icon-96.png) lives with the site's files now
    if (isFile && asset.status === 404 && url.pathname.startsWith("/assets/")) asset = await env.ASSETS.fetch(new Request(new URL(`/site${url.pathname}`, url), req));
    return withHeaders(asset, { "x-robots-tag": "noindex", ...(isFile ? {} : { "cache-control": "no-cache" }) });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    // One nightly run, 22:00 UTC = 03:00 in Tashkent (the free plan's 5 schedules are shared by the whole account):
    // the welcome and exam mails, cleanup, on Monday nights the topics sync, and the backup last: it is the one that
    // grows with the number of people, and a run cut short must not take the others with it.
    // Each job is its own call to this Worker (the SELF binding): its own CPU time on the free plan, so one heavy job
    // cannot cut the next short. The backup goes a table a call.
    const monday = new Intl.DateTimeFormat("en-US", { timeZone: env.APP_TZ, weekday: "short" }).format(new Date()) === "Mon";
    const names = ["mails", "cleanup", ...(monday ? ["topics"] : []), ...BACKED_UP.map((t) => `backup:${t}`), "backup:prune"];
    ctx.waitUntil((async () => {
      const key = await jobKey(env);
      for (const name of names) {
        if (env.SELF) await env.SELF.fetch(new Request(`https://jobs.tcf.monster/__job/${name}`, { method: "POST", headers: { "x-job": key } })).catch((e) => console.error("job", name, e));
        else await runJob(env, name);
      }
    })());
  },
};
