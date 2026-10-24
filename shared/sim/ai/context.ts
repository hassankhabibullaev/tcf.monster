// Who the AI calls are for: the person's own Gemini key, their id (the cooldown memory is per person) and the
// language of the explanations. The Worker answers from its request context (worker/sim/ctx.ts); the browser sets its
// own once the key is known (web/app/sim/browser-ai.ts). The same scoring code runs on both sides.
export type AiContext = { key: string; userId: string; lang: "fr" | "en" };

let current: () => AiContext = () => { throw new Error("no AI context: the Gemini key is not known here"); };

export const setAiContext = (get: () => AiContext) => { current = get; };
export const aiCtx = (): AiContext => current();
