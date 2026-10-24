/**
 * Which Gemini models to leave alone for a while, and why. Google's free tier counts requests per model and per
 * day, answers 503 « high demand » on some models for hours, and a live model can close every session with
 * « Internal error encountered ». Once a model has answered that way for a person's key, their next calls skip it
 * until the time Google gave (or a short while), instead of paying a failed call, a wait and a fallback each time.
 * Every key is the person's own, so the memory is per person: one Map in the Worker instance, keyed by
 * `${userId}:${model}` (an instance that restarts simply forgets; nothing is stored).
 */
import { aiCtx } from "./context.ts";

export type Cooldowns = Record<string, number>;

/** `${userId}:${model}` → time (ms since epoch) until which the model is left alone for that person */
const until = new Map<string, number>();

/** the person's cooldowns: model → time (ms since epoch) */
export function cooldowns(now = Date.now(), userId = aiCtx().userId): Cooldowns {
  const map: Cooldowns = {};
  for (const [k, t] of until) {
    if (!k.startsWith(`${userId}:`)) continue;
    if (t > now) map[k.slice(userId.length + 1)] = t;
    else until.delete(k);
  }
  return map;
}

/** Leaves a model alone for the person until `untilMs`. Never throws (a failed note must not fail the call it was noted on). */
export function setCooldown(model: string, untilMs: number, reason: string, userId?: string): void {
  try {
    const id = userId ?? aiCtx().userId;
    until.set(`${id}:${model}`, untilMs);
    console.warn(`${model} set aside until ${new Date(untilMs).toISOString()} (${reason.slice(0, 120)})`);
  } catch {
    /* outside a request: nothing to note */
  }
}

/** The chain without the models set aside. When every model is set aside, the whole chain is kept (better to try). */
export function filterChain(models: string[], cool: Cooldowns, now = Date.now(), avoid: string[] = []): string[] {
  const kept = models.filter((m) => !(cool[m] && cool[m] > now) && !avoid.includes(m));
  if (kept.length) return kept;
  const notAvoided = models.filter((m) => !avoid.includes(m));
  return notAvoided.length ? notAvoided : models;
}

/** Google's « retry in » figure, from the JSON details (`retryDelay: "34649s"`) or the text (« retry in 9h57m5s »). */
export function retryAfterMs(text: string): number | null {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text);
  if (m) return Math.round(Number(m[1]) * 1000);
  const t = /retry in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?/i.exec(text);
  if (t && (t[1] || t[2] || t[3])) return (Number(t[1] ?? 0) * 3600 + Number(t[2] ?? 0) * 60 + Number(t[3] ?? 0)) * 1000;
  return null;
}

/** How long to set a model aside after an answer: a daily cap until it resets, a per-minute cap or an overload briefly; null = not at all. */
export function cooldownFor(status: number, text: string, now = Date.now()): number | null {
  if (status === 429) {
    const daily = /per day|daily|PerDay/i.test(text);
    const wait = retryAfterMs(text);
    if (daily) return now + Math.min(26 * 3600_000, wait ?? 6 * 3600_000);
    return now + Math.min(5 * 60_000, Math.max(30_000, wait ?? 60_000));
  }
  if (status === 503) return now + 90_000;
  return null;
}
