// The app's calls to the Worker, and the password stretch done on this device.

export type Me = {
  id: string; email: string; name: string | null; created_at: string; target_nclc: number | null; exam_date: string | null;
  lang: "fr" | "en"; settings: Record<string, any>; /** on the app's side, the key on THIS device (main.tsx: sim/browser-score.ts keyStatusHere); the server's own copy is what a browser last reported */ gemini_status: string; isOwner: boolean;
  /** false when the terms changed since the person accepted them: the three ticks are asked again, once */ terms_ok?: boolean;
};

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) { super(data?.error ?? `HTTP ${status}`); this.status = status; this.data = data; }
}

/** a 401 on any call means the session is gone: the app shows the door and keeps the place (main.tsx listens) */
export const unauthorized = () => { try { window.dispatchEvent(new Event("tcfm:unauthorized")); } catch { /* no window */ } };

/** GET when no body, POST otherwise; a network failure is ApiError(0, { error: "network" }) */
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api${path}`, body === undefined ? { credentials: "same-origin" } : { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, { error: "network" });
  }
  const data: any = await r.json().catch(() => ({}));
  // a refused Gemini key also comes back as 401 (`{ error: "refused" }`): only the session's own 401 shows the door
  if (r.status === 401 && !path.startsWith("/auth/") && data?.error !== "refused") unauthorized();
  if (!r.ok) throw new ApiError(r.status, data);
  return data as T;
}

/**
 * The password never leaves the device as typed: PBKDF2-SHA256, 210 000 rounds, salted with the e-mail, 32 bytes as
 * base64url (43 characters). The server stores only a keyed hash of that.
 */
export async function stretch(email: string, password: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(`tcf.monster|${email.trim().toLowerCase()}`), iterations: 210000 }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** 0 too short · 1 weak · 2 fair · 3 strong */
export function strength(pw: string) {
  if (pw.length < 8) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const common = /^(password|motdepasse|azerty|qwerty|12345678|123456789|00000000|11111111)/i.test(pw);
  if (common) return 1;
  if (pw.length >= 14 || (pw.length >= 10 && kinds >= 3)) return 3;
  if (pw.length >= 10 || kinds >= 3) return 2;
  return 1;
}

/** days from today to the exam date, or null */
export function daysTo(examDate: string | null) {
  if (!examDate) return null;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  return Math.round((new Date(examDate + "T12:00:00").getTime() - today.getTime()) / 86400000);
}
