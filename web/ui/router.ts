// The address bar as the pages' router, shared by the admin and the app.
import { useSyncExternalStore, type MouseEvent } from "react";

const listeners = new Set<() => void>();
window.addEventListener("popstate", () => listeners.forEach((l) => l()));
export function go(to: string) {
  if (to === location.pathname + location.search) return;
  history.pushState(null, "", to);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}
export function useLocation() {
  const href = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => location.pathname + location.search);
  const url = new URL(href, location.origin);
  return { path: url.pathname.replace(/\/+$/, "") || "/", params: url.searchParams };
}
/** change the query string without a new history entry (filters, search) */
export function setParams(next: Record<string, string | null>) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(next)) if (v === null || v === "") url.searchParams.delete(k); else url.searchParams.set(k, v);
  history.replaceState(null, "", url.pathname + url.search);
  listeners.forEach((l) => l());
}
/** a link that stays in the page */
export const linkProps = (to: string) => ({
  href: to,
  onClick: (e: MouseEvent) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); go(to); },
});

/** go somewhere without leaving the current address in the history (redirects) */
export function replace(to: string) {
  history.replaceState(null, "", to);
  listeners.forEach((l) => l());
}
