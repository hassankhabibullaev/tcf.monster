// The dashboard's time worked, pure: minutes under an hour; from an hour on, hours to the nearest half (« 1,5 heures »).
import type { Lang } from "../i18n.ts";

export function workedLabel(minutes: number, lang: Lang, h: { fMinutes: string; fHours: (n: number) => string }): { n: string; w: string } {
  if (minutes < 60) return { n: String(minutes), w: h.fMinutes };
  const hours = Math.round(minutes / 30) / 2;
  const n = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(".", lang === "fr" ? "," : ".");
  return { n, w: h.fHours(hours) };
}
