/**
 * The Tâche 1 questions already asked in the person's previous sessions (shared/sim/asked-core.ts): the browser keeps
 * the list and sends it with the request that needs it (the examiner's script); it is read here from the request's
 * context and never stored.
 */
import { ctx } from "./ctx.ts";
export { isRepeat, normalizeQuestion } from "../../shared/sim/asked-core.ts";

export async function recentAsked(): Promise<string[]> {
  return ctx().asked ?? [];
}
