/** What an API route answers when a call failed. */
export type ApiFailure = { error?: string; code?: string; retryInS?: number };
export type Failure = { message: string; /** when the page may try again by itself */ retryInS: number; /** Google's side (overloaded, quota), not ours */ google: boolean; /** the person's key is the problem: the profile is the way out */ key?: boolean; /** the work is on another device: nothing to retry here */ away?: boolean };

const MIN = (s: number) => Math.max(1, Math.round(s / 60));

/**
 * The honest message for a scoring that did not come through: what happened, what is kept, the one thing to do.
 * Google's free access refuses or stays silent now and then; the person is told that it is Google and when to retry.
 */
export function explainFailure(e: unknown, lang: "fr" | "en" = "fr"): Failure {
  const d = (e && typeof e === "object" ? e : {}) as ApiFailure & { name?: string; message?: string };
  const code = d.code ?? "";
  const retryInS = Math.min(600, Math.max(60, Number(d.retryInS) || 180));
  // Google refused the stored key (the server's own line is bilingual and long): one plain sentence, and the profile
  if (code === "unauthorized") {
    return {
      google: false, key: true, retryInS: 600,
      message: lang === "fr"
        ? "Google refuse votre clé Gemini. Votre travail est enregistré : remplacez la clé dans le profil, puis réessayez."
        : "Google refuses your Gemini key. Your work is saved: replace the key in your profile, then retry.",
    };
  }
  const google = code === "overloaded" || code === "rate_limited" || code === "model_missing";
  if (google) {
    const m = MIN(retryInS);
    return {
      google: true,
      retryInS,
      message:
        lang === "fr"
          ? `Google (Gemini) est surchargé en ce moment. Votre travail est enregistré : la correction sera relancée dans ${m} minute${m > 1 ? "s" : ""}, ou tout de suite si vous le demandez.`
          : `Google (Gemini) is overloaded right now. Your work is saved: the marking will be tried again in ${m} minute${m > 1 ? "s" : ""}, or right away if you ask.`,
    };
  }
  const timeout = d.name === "TimeoutError" || d.name === "AbortError" || /Failed to fetch|NetworkError|Load failed/i.test(d.message ?? "");
  if (timeout) {
    return {
      google: false,
      retryInS: 120,
      message: lang === "fr" ? "Le serveur n'a pas répondu à temps. Votre travail est enregistré : la correction sera relancée dans 2 minutes." : "The server did not answer in time. Your work is saved: the marking will be tried again in 2 minutes.",
    };
  }
  const detail = (d.error ?? d.message ?? "").slice(0, 200);
  return {
    google: false,
    retryInS,
    message: lang === "fr" ? `La correction n'a pas abouti${detail ? ` (${detail})` : ""}. Votre travail est enregistré : réessayez dans un instant.` : `The marking did not come through${detail ? ` (${detail})` : ""}. Your work is saved: try again in a moment.`,
  };
}

/** Reads a failed answer of an API route into a Failure (the body when it is JSON, the network error otherwise). */
export async function failureOf(r: Response | null, e?: unknown, lang: "fr" | "en" = "fr"): Promise<Failure> {
  if (r) {
    const body = (await r.json().catch(() => ({}))) as ApiFailure;
    return explainFailure({ ...body, code: body.code ?? (r.status === 503 ? "overloaded" : r.status === 429 ? "rate_limited" : "") }, lang);
  }
  return explainFailure(e, lang);
}

/** every scoring request ends, whatever the network does: the page never waits forever */
export const SCORING_TIMEOUT_MS = 150_000;
export const LISTENING_TIMEOUT_MS = 200_000;
