// The mails that are not codes: the welcome (once, when the welcome sentence is finished), the « good luck » mail the
// day before the exam date and the « how did it go » mail the day after (from the nightly job), and the stop link.
// Each goes at most once (a column remembers it), never past newsCap() mails today (the last 50 are for codes), never
// after the person stopped them. A mail that found no room goes on a later night while it still makes sense: « good
// luck » on the exam's own morning (before 8:00 where the person lives, worded « today »), « how did it go » up to four
// days after. One nightly run sends at most NIGHT_MAX: the free plan allows 50 outside calls per run.
import { type Env, nowIso, day } from "./util.ts";
import { sendDesigned, sentToday, newsCap, mailsOff, stopToken } from "./mail.ts";
import { esc, SITE } from "./mails.ts";
import { same } from "./auth.ts";

type U = { id: string; email: string; name: string | null; lang: string; settings: string; exam_date: string | null; luck_for: string | null; after_for: string | null };

/** the welcome, if this person has a name, was never welcomed and today's mails leave room; claimed before sending */
export async function maybeWelcome(env: Env, userId: string) {
  const u = await env.DB.prepare("SELECT id, email, name, lang, settings FROM users WHERE id = ? AND name IS NOT NULL AND welcomed_at IS NULL").bind(userId).first<U>();
  if (!u || mailsOff(u.settings) || (await sentToday(env)) >= (await newsCap(env))) return false;
  const claim = await env.DB.prepare("UPDATE users SET welcomed_at = ? WHERE id = ? AND welcomed_at IS NULL").bind(nowIso(), u.id).run();
  if (!claim.meta.changes) return false;
  await sendDesigned(env, u.email, "welcome", { lang: u.lang, userId: u.id, name: u.name });
  return true;
}

/** the person's own calendar day: the time zone their browser gave (settings.tz), else the app's */
function localDay(env: Env, settings: string) {
  let tz = env.APP_TZ;
  try { const s = JSON.parse(settings); if (typeof s.tz === "string" && s.tz.length < 60) tz = s.tz; } catch { /* the app's */ }
  try { return day(tz); } catch { return day(env.APP_TZ); }
}
const shift = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
/** the hour (0–23) where the person lives */
function localHour(env: Env, settings: string, at = new Date()) {
  let tz = env.APP_TZ;
  try { const s = JSON.parse(settings); if (typeof s.tz === "string" && s.tz.length < 60) tz = s.tz; } catch { /* the app's */ }
  const h = (z: string) => Number(hourFormat(z).format(at));
  try { return h(tz); } catch { return h(env.APP_TZ); }
}
const hourFormats = new Map<string, Intl.DateTimeFormat>();
/** one formatter per time zone, kept for the night (making one per person cost the nightly run its CPU time) */
function hourFormat(z: string) {
  let f = hourFormats.get(z);
  if (!f) { f = new Intl.DateTimeFormat("en-GB", { timeZone: z, hour: "2-digit", hourCycle: "h23" }); if (hourFormats.size < 500) hourFormats.set(z, f); }
  return f;
}
export const NIGHT_MAX = 25;
const AFTER_DAYS = 4;

/** the nightly job (22:00 UTC: the evening before in the Americas, the small hours of the next day in Asia, so « the day
 *  before » is each person's own day): good luck, how did it go, and any welcome that waited for room */
export async function newsJob(env: Env) {
  let room = Math.min(NIGHT_MAX, (await newsCap(env)) - (await sentToday(env)));
  const today = nowIso().slice(0, 10);
  const rows = (await env.DB.prepare(`SELECT id, email, name, lang, settings, exam_date, luck_for, after_for FROM users
    WHERE password IS NOT NULL AND exam_date BETWEEN ? AND ?`).bind(shift(today, -(AFTER_DAYS + 2)), shift(today, 2)).all<U>()).results;
  // what is due, the most pressing first: good luck (tomorrow, or this morning), then how did it go (oldest first)
  type Due = { u: U; which: "luck" | "after"; today?: boolean; rank: number };
  const due: Due[] = [];
  for (const u of rows) {
    if (mailsOff(u.settings) || !u.exam_date) continue;
    const mine = localDay(env, u.settings);
    if (u.luck_for !== u.exam_date) {
      if (u.exam_date === shift(mine, 1)) { due.push({ u, which: "luck", rank: 0 }); continue; }
      if (u.exam_date === mine && localHour(env, u.settings) < 8) { due.push({ u, which: "luck", today: true, rank: 0 }); continue; }
    }
    if (u.after_for !== u.exam_date && u.exam_date < mine && u.exam_date >= shift(mine, -AFTER_DAYS)) due.push({ u, which: "after", rank: 1 + (u.exam_date === shift(mine, -AFTER_DAYS) ? 0 : 1) });
  }
  due.sort((a, b) => a.rank - b.rank);
  let luck = 0, after = 0, welcome = 0, skipped = 0;
  for (const { u, which, today: onTheDay } of due) {
    if (room <= 0) { skipped++; continue; }
    const col = which === "luck" ? "luck_for" : "after_for";
    const claim = await env.DB.prepare(`UPDATE users SET ${col} = ?1 WHERE id = ?2 AND (${col} IS NULL OR ${col} != ?1)`).bind(u.exam_date, u.id).run();
    if (!claim.meta.changes) continue;
    await sendDesigned(env, u.email, which, { lang: u.lang, userId: u.id, name: u.name, examDate: u.exam_date!, examToday: onTheDay });
    room--; if (which === "luck") luck++; else after++;
  }
  const waiting = (await env.DB.prepare("SELECT id FROM users WHERE name IS NOT NULL AND welcomed_at IS NULL AND password IS NOT NULL LIMIT 50").all<{ id: string }>()).results;
  for (const w of waiting) {
    if (room <= 0) { skipped++; continue; }
    if (await maybeWelcome(env, w.id)) { welcome++; room--; }
  }
  return { ok: true, detail: `${luck} good luck, ${after} how did it go, ${welcome} welcome${skipped ? `, ${skipped} waiting for room` : ""}` };
}

/* ---------- the stop link: a page with one button (mail scanners open links, so a visit alone stops nothing);
   the one-click unsubscribe of Gmail and Apple Mail posts straight to it ---------- */
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src https://tcf.monster 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>
<body style="margin:0;background:#fffbf2;color:#23201c;font-family:Nunito,'Segoe UI',Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box">
<main style="max-width:420px;width:100%;background:#fff;border:2px solid #23201c;border-radius:22px;padding:28px;text-align:center">
<img src="${SITE}/site/assets/mail-logo.png" width="56" height="56" alt="tcf.monster" style="display:block;margin:0 auto 16px">${body}</main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": PAGE_CSP } });
}
const H = (en: string, fr: string, size = 22) => `<h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:${size}px">${esc(en)}</h1><p style="margin:0 0 18px;color:#8a8580;font-weight:600">${esc(fr)}</p>`;

export async function handleStop(req: Request, env: Env, url: URL) {
  const id = url.searchParams.get("u") ?? "", t = url.searchParams.get("t") ?? "";
  const u = id ? await env.DB.prepare("SELECT id, settings FROM users WHERE id = ?").bind(id).first<{ id: string; settings: string }>() : null;
  if (!u || !same(t, await stopToken(env, id))) return page("tcf.monster", H("This link is no longer valid", "Ce lien n'est plus valable") + `<a href="${SITE}" style="color:#23201c;font-weight:800">tcf.monster</a>`, 404);
  if (req.method === "POST") {
    let s: Record<string, unknown> = {};
    try { s = JSON.parse(u.settings); } catch { /* start again */ }
    s.mails = false;
    await env.DB.prepare("UPDATE users SET settings = ? WHERE id = ?").bind(JSON.stringify(s), u.id).run();
    return page("tcf.monster", H("Done: no more of these e-mails", "C'est fait : vous ne recevrez plus ces e-mails") + `<p style="margin:0 0 18px;font-size:14px;color:#6e665c">Codes still arrive when you ask for one.<br><span style="color:#afaaa3">Les codes arrivent toujours quand vous en demandez un.</span></p><a href="${SITE}" style="display:inline-block;background:#fff;color:#23201c;border:2px solid #23201c;border-radius:999px;padding:11px 22px;font-weight:800;text-decoration:none">tcf.monster</a>`);
  }
  return page("tcf.monster", H("Stop the welcome and exam e-mails?", "Ne plus recevoir les e-mails de bienvenue et d'examen ?") +
    `<form method="post" action="/api/mail/stop?u=${encodeURIComponent(id)}&amp;t=${esc(t)}"><button type="submit" style="font:inherit;font-weight:800;font-size:15px;background:#ff6b4a;color:#23201c;border:2px solid #23201c;border-radius:999px;padding:12px 24px;cursor:pointer">Stop · Arrêter</button></form>`);
}
