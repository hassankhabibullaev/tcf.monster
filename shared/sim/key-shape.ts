// What a Google AI key looks like (AIza…, or the newer AQ.… ones): no space, at least 30 characters. The key itself
// lives only in the person's browser (web/app/sim/browser-score.ts).
export const looksLikeKey = (k: string) => /^(AIza|AQ\.)/.test(k) && !/\s/.test(k) && k.length >= 30;
