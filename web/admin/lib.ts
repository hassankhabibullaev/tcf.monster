// The admin's data access and formatting.
import { useCallback, useEffect, useState } from "react";

export { go, useLocation, setParams, linkProps } from "../ui/router.ts";

// ---- API ----
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/admin${path}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", "x-admin": "1" }, body: JSON.stringify(body) });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data.detail || data.error || `HTTP ${r.status}`);
  return data as T;
}

export function useApi<T = any>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api<T>(path).then((data) => live && setState({ data, loading: false })).catch((e) => live && setState((s) => ({ ...s, error: e.message, loading: false })));
    return () => { live = false; };
  }, [path, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { ...state, reload };
}

/** the content summary shipped with the deploy (public/data/summary.json) */
export function useSummary() {
  const [s, setS] = useState<Summary | null | undefined>(undefined);
  useEffect(() => { fetch("/data/summary.json").then((r) => (r.ok ? (r.json() as Promise<Summary>) : null)).then(setS).catch(() => setS(null)); }, []);
  return s;
}
export type LevelStats = { questions: number; audio: number; image: number; transcript: number; timing: number; english: number; hint: number; disputed: number; missing_files: number };
export type Summary = {
  generated_at: string;
  bank: Record<"co" | "ce", Record<string, LevelStats>>;
  extract: { exams: number; placements: number; audio: number; images: number; bytes: number; ocr_flagged: number; source_issues: Record<string, number>; spoken_only: number; valid: boolean } | null;
  dedupe: Record<string, { placements: number; bank: number; groups: number; sure: number; review: number; new: number; orphan: number; chosen: number; at: string }>;
  problems: { what: string; where: string; id: string; detail: string }[];
};

// ---- formatting (thin space for thousands, as the design system says) ----
export const num = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-US").replaceAll(",", " "));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function date(iso?: string | null, withYear = false) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return `${d.getDate()} ${MON[d.getMonth()]}${withYear || d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ""}`;
}
export const time = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
export function when(iso?: string | null) {
  if (!iso) return "never";
  const d = new Date(iso), now = new Date();
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days <= 0) return `today ${time(iso)}`;
  if (days === 1) return `yesterday ${time(iso)}`;
  if (days < 7) return `${days} d ago`;
  return date(iso);
}
export function daysLeft(examDate?: string | null) {
  if (!examDate) return null;
  return Math.ceil((new Date(examDate + "T12:00:00").getTime() - Date.now()) / 86400000);
}
export const minutes = (s?: number | null) => (s == null ? "—" : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`);
export const plural = (n: number, one: string, many = one + "s") => `${num(n)} ${n === 1 ? one : many}`;
