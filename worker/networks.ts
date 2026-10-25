// Networks a bot was caught on (worker/guard.ts). A network is a keyed hash of the visitor's address (auth.ts
// networkOf: never the address itself; IPv6 by its /64, which one device or one bot owns whole). Many people can share
// one (a phone carrier, a university), so nothing here is permanent and nothing here blocks an account:
//   - an account blocked by the guard, or a hidden trap touched without an account, makes the network strict for a
//     few days: at the door every step asks Cloudflare's human check, and the per-network limits are tighter;
//   - CLOSE_AFTER accounts blocked from it while strict close new sign-ups from it for CLOSED_DAYS; existing accounts
//     still sign in.
// Read only by the door's requests (one row by its key); written only when a bot is caught.
import { type Env, nowIso } from "./util.ts";
import { networkOf } from "./auth.ts";

export const NET = { blockDays: 3, trapDays: 1, closeAfter: 3, closedDays: 7 } as const;

export type NetState = { strict: boolean; closed: boolean };

/** the door's view of a network: strict (the check at every step, tighter limits), closed (no new account) */
export async function networkState(env: Env, net: string | null): Promise<NetState> {
  if (!net) return { strict: false, closed: false };
  const r = await env.DB.prepare("SELECT strict_until, closed_until FROM guard_networks WHERE net = ?").bind(net)
    .first<{ strict_until: string | null; closed_until: string | null }>().catch(() => null);
  if (!r) return { strict: false, closed: false };
  const now = Date.now();
  const closed = !!r.closed_until && Date.parse(r.closed_until) > now;
  return { strict: closed || (!!r.strict_until && Date.parse(r.strict_until) > now), closed };
}

/** a trap touched without an account, once an hour per network and server (a bot hammering it writes nothing more) */
const recent = new Map<string, number>();
export const resetNetworks = () => recent.clear();

/** note a network: "block" (an account the guard blocked) or "trap" (a hidden trap, no account) */
export async function markNetwork(env: Env, req: Request, why: "block" | "trap"): Promise<void> {
  const net = await networkOf(env, req).catch(() => null);
  if (!net) return;
  if (why === "trap") {
    const last = recent.get(net) ?? 0;
    if (Date.now() - last < 3_600_000) return;
    recent.set(net, Date.now());
    if (recent.size > 5000) recent.clear();
  }
  const now = nowIso();
  const strict = new Date(Date.now() + (why === "block" ? NET.blockDays : NET.trapDays) * 86_400_000).toISOString();
  const closed = new Date(Date.now() + NET.closedDays * 86_400_000).toISOString();
  // blocks count while the network is strict; a strict date never moves back; CLOSE_AFTER blocks close sign-ups
  await env.DB.prepare(`INSERT INTO guard_networks (net, blocks, traps, strict_until, closed_until, last_at) VALUES (?1, ?2, ?3, ?4, NULL, ?5)
    ON CONFLICT(net) DO UPDATE SET
      blocks = CASE WHEN ?2 = 0 THEN blocks WHEN strict_until > ?5 THEN blocks + 1 ELSE 1 END,
      traps = traps + ?3,
      strict_until = max(coalesce(strict_until, ''), ?4),
      closed_until = CASE WHEN ?2 = 1 AND strict_until > ?5 AND blocks + 1 >= ?6 THEN ?7 ELSE closed_until END,
      last_at = ?5`)
    .bind(net, why === "block" ? 1 : 0, why === "trap" ? 1 : 0, strict, now, NET.closeAfter, closed).run();
}
