// The tcf.monster Worker: tcf.monster (the public site and the application, one address) and admin.tcf.monster (the
// owner's tool), one database (D1) and one bucket (R2). Pages are static files from dist/ (vite build; the public
// site is copied to dist/site/); the Worker answers /api/* and picks the page for each address:
//   tcf.monster/          the public site for a visitor, the dashboard for a signed-in person
//   tcf.monster/about     the public site, always (the app's wordmark leads there)
//   /terms /privacy /thanks  the site's pages; any other address is the application
//   app.tcf.monster, www.tcf.monster  the same path on tcf.monster, for good (301; 308 for a write)
import { type Env, fail, json } from "./util.ts";
import { handleAdmin } from "./admin.ts";
import { handleAuth, currentUser } from "./auth.ts";
import { handleMe } from "./me.ts";
import { handleStats } from "./stats.ts";
import { handleMedia } from "./media.ts";
import { handleDonate } from "./donate.ts";
import { handleProgress, handleSync } from "./coce/progress.ts";
import { handleAttempts } from "./coce/attempts.ts";
import { handleDisputes } from "./coce/disputes.ts";
import { handleExpr, handleKey } from "./expr.ts";
import { handleMock } from "./mock/index.ts";
import { handleTopics } from "./content.ts";
import { runJob } from "./jobs.ts";
import { handleStop } from "./news.ts";

/** the one address of the application and the public site */
export const HOME = "https://tcf.monster";

const SECURITY: Record<string, string> = {
  "content-security-policy": "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=()",
  // once on https, the browser never tries http again for a year (the sign-in needs https)
  "strict-transport-security": "max-age=31536000",
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

/** the public site's pages (dist/site/), by address; `/` only for a visitor */
const SITE_PAGES: Record<string, string> = { "/about": "/site/", "/terms": "/site/terms", "/privacy": "/site/privacy", "/thanks": "/site/thanks", "/robots.txt": "/site/robots.txt" };
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
  if (path.startsWith("/admin/")) return door(url.hostname) === "admin" ? handleAdmin(req, env, url) : fail(404, "not found");
  if (door(url.hostname) !== "app") return fail(404, "not found");
  if (path === "/mail/stop") return handleStop(req, env, url);
  if (path.startsWith("/auth/")) return handleAuth(req, env, path);
  if (path === "/me" || path.startsWith("/me/") || path.startsWith("/expr/") || path === "/topics" || path === "/progress" || path === "/sync" || path === "/disputes" || path === "/attempts" || path.startsWith("/attempts/") || path === "/mock" || path.startsWith("/mock/")) {
    const me = await currentUser(env, req);
    if (!me) return fail(401, "signed out");
    if (path === "/topics") return handleTopics(req, env, url);
    if (path === "/progress") return handleProgress(req, env, me, url);
    if (path === "/sync") return handleSync(req, env, me);
    if (path === "/disputes") return handleDisputes(req, env, me, url);
    if (path === "/attempts" || path.startsWith("/attempts/")) return handleAttempts(req, env, me, path, url);
    if (path === "/me/key") return handleKey(req, env, me);
    if (path === "/me/stats" && req.method === "GET") return handleStats(env, me);
    if (path === "/me" && req.method === "GET" && url.searchParams.has("with")) return withBundle(req, env, url, await handleMe(req, env, me, path));
    if (path.startsWith("/expr/")) return handleExpr(req, env, me, path, url);
    if (path === "/mock" || path.startsWith("/mock/")) return handleMock(req, env, me, path, url);
    return handleMe(req, env, me, path);
  }
  return fail(404, "not found");
}

/** the reads GET /me may bring along (?with=a,b): the browser asks once for what it lacks instead of once per screen */
// the dashboard's numbers stay out: they read the whole history (CPU: the free plan allows 10 ms a request)
const BUNDLE = new Set(["/attempts?section=co", "/attempts?section=ce", "/progress?section=co", "/progress?section=ce", "/expr/sessions", "/mock/list"]);
async function withBundle(req: Request, env: Env, url: URL, base: Response): Promise<Response> {
  if (!base.ok) return base;
  const profile = (await base.json()) as Record<string, unknown>;
  const want = (url.searchParams.get("with") ?? "").split(",").filter((k) => BUNDLE.has(k)).slice(0, BUNDLE.size);
  const extra: Record<string, unknown> = {};
  for (const k of want) {
    // each read through its own route (same checks, same answer), with this request's sign-in
    const sub = new Request(new URL(`/api${k}`, url), { headers: { cookie: req.headers.get("cookie") ?? "" } });
    const r = await api(sub, env, new URL(sub.url)).catch(() => null);
    if (r?.ok) extra[k] = await r.json().catch(() => null);
  }
  return json({ ...profile, extra });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
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
    // recordings and pictures of the question bank, from R2, cached for a year (their names never change)
    if (url.pathname.startsWith("/media/")) return which === "app" ? handleMedia(req, env, url.pathname.slice(1)) : fail(404, "not found");
    const path = url.pathname.replace(/\/+$/, "") || "/";
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
    const monday = new Intl.DateTimeFormat("en-US", { timeZone: env.APP_TZ, weekday: "short" }).format(new Date()) === "Mon";
    ctx.waitUntil((async () => {
      await runJob(env, "mails");
      await runJob(env, "cleanup");
      if (monday) await runJob(env, "topics");
      await runJob(env, "backup");
    })());
  },
};
