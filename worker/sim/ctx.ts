// The request's context for the simulator: who is asking, their language, the bindings. Set once
// per request by worker/expr.ts (`withCtx`), read anywhere below with `ctx()`, so the ported modules keep their
// signatures (they used to read Next's request context the same way).
import { AsyncLocalStorage } from "node:async_hooks";
import type { Env } from "../util.ts";
import { setAiContext } from "../../shared/sim/ai/context.ts";

export type SimCtx = {
  env: Env;
  user: { id: string; email: string };
  /** the Tâche 1 questions already asked, as the person's browser sent them for this request (asked.ts) */
  asked?: string[];
  /** the language of the explanations shown to them (quotes stay French) */
  lang: "fr" | "en";
};

const als = new AsyncLocalStorage<SimCtx>();

export const withCtx = <T>(c: SimCtx, fn: () => Promise<T>): Promise<T> => als.run(c, fn);

export function ctx(): SimCtx {
  const c = als.getStore();
  if (!c) throw new Error("simulator called outside a request context");
  return c;
}

// the Worker never calls Google: the person's key stays in their browser, which runs the shared AI code (shared/sim)
// itself. Here the shared code finds no key, so a call that slipped through fails instead of using anyone's.
setAiContext(() => { const c = ctx(); return { key: "", userId: c.user.id, lang: c.lang }; });

export const dbOf = () => ctx().env.DB;
export const filesOf = () => ctx().env.FILES;
