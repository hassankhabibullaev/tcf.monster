// The signed-in person's own account: read it, change it (profile, preferences), sign out everywhere, delete it.
import { type Env, json, fail, readJson } from "./util.ts";
import { type Me, sendCode, checkCode, sessionCookie } from "./auth.ts";
import { maybeWelcome } from "./news.ts";
import { runningNow } from "./coce/attempts.ts";
import { sendDesigned } from "./mail.ts";

type Body = Record<string, unknown>;

export async function profile(env: Env, me: Me) {
  // gemini_status: what the person's browser last reported of their key (the key itself never comes here)
  const u = await env.DB.prepare(`SELECT id, email, name, created_at, target_nclc, exam_date, lang, settings, gemini_status
    FROM users WHERE id = ?`).bind(me.id).first<Record<string, unknown>>();
  if (!u) return null;
  let settings = {};
  try { settings = JSON.parse(String(u.settings)); } catch { /* keep {} */ }
  return { ...u, settings, isOwner: String(u.email).toLowerCase() === env.OWNER_EMAIL.toLowerCase() };
}

/** settings are merged one level deep, so two devices changing different switches both win */
function mergeSettings(old: Record<string, unknown>, patch: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...old };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && old[k] && typeof old[k] === "object") out[k] = { ...(old[k] as object), ...(v as object) };
    else out[k] = v;
  }
  return out;
}

export async function handleMe(req: Request, env: Env, me: Me, path: string): Promise<Response> {
  if (path === "/me" && req.method === "GET") {
    const p = await profile(env, me);
    // what runs comes along: the bands on the first screen need no request of their own
    return p ? json({ ...p, running: await runningNow(env, me.id) }) : fail(401, "signed out");
  }
  if (req.method !== "POST") return fail(405, "GET or POST");
  const b = (await readJson<Body>(req)) ?? {};

  if (path === "/me") {
    const sets: string[] = [], args: unknown[] = [];
    if ("name" in b) {
      const name = String(b.name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      if (!name) return fail(400, "name");
      sets.push("name = ?"); args.push(name);
    }
    if ("target_nclc" in b) {
      const n = Number(b.target_nclc);
      if (!Number.isInteger(n) || n < 4 || n > 12) return fail(400, "target_nclc");
      sets.push("target_nclc = ?"); args.push(n);
    }
    if ("exam_date" in b) {
      const d = b.exam_date === null ? null : String(b.exam_date);
      if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return fail(400, "exam_date");
      sets.push("exam_date = ?"); args.push(d);
    }
    if ("lang" in b) {
      if (b.lang !== "fr" && b.lang !== "en") return fail(400, "lang");
      sets.push("lang = ?"); args.push(b.lang);
    }
    if ("settings" in b) {
      if (!b.settings || typeof b.settings !== "object") return fail(400, "settings");
      const row = await env.DB.prepare("SELECT settings FROM users WHERE id = ?").bind(me.id).first<{ settings: string }>();
      let old = {};
      try { old = JSON.parse(row?.settings ?? "{}"); } catch { /* start again */ }
      const merged = JSON.stringify(mergeSettings(old, b.settings as Record<string, unknown>));
      if (merged.length > 4000) return fail(400, "settings too large");
      sets.push("settings = ?"); args.push(merged);
    }
    if (!sets.length) return fail(400, "nothing to change");
    await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...args, me.id).run();
    // the welcome sentence finished (a first name given) is the moment of the welcome mail, once
    if ("name" in b) await maybeWelcome(env, me.id).catch((e) => console.error(e));
    return json(await profile(env, me));
  }

  if (path === "/me/signout-all") {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(me.id).run();
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, "", 0) });
  }

  if (path === "/me/delete/code") {
    const u = await env.DB.prepare("SELECT lang FROM users WHERE id = ?").bind(me.id).first<{ lang: string }>();
    const r = await sendCode(env, me.email, "delete", u?.lang ?? "en");
    return json(r, "error" in r ? (r.error === "mail" ? 502 : 429) : 200);
  }

  if (path === "/me/delete") {
    const r = await checkCode(env, me.email, "delete", String(b.code ?? ""));
    if ("error" in r) return json(r, 400);
    const who = await env.DB.prepare("SELECT lang FROM users WHERE id = ?").bind(me.id).first<{ lang: string }>();
    const d = env.DB;
    await d.batch([d.prepare("DELETE FROM expr_tasks WHERE session_id IN (SELECT id FROM expr_sessions WHERE user_id = ?)").bind(me.id)]
      .concat(["sessions", "progress", "practice_days", "attempts", "expr_sessions", "user_kv", "mocks", "disputes"].map((t) => d.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(me.id)))
      .concat(d.prepare("DELETE FROM codes WHERE email = ?").bind(me.email), d.prepare("DELETE FROM users WHERE id = ?").bind(me.id)));
    // the last mail, once everything is gone (a failed send changes nothing: the account is deleted either way)
    await sendDesigned(env, me.email, "deleted", { lang: who?.lang ?? "en" }).catch((e) => console.error(e));
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, "", 0) });
  }

  return fail(404, "not found");
}
