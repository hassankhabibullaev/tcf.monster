import { Button } from "../../ui/ui";
import { Hall } from "./hallway";

/**
 * The application is working: the one hall screen with its three breathing dots, the step in progress named under
 * the title. With `error`, the dots stop and a Retry button appears: nothing is lost, the person decides.
 */
export function BusyOverlay({ message, steps, detail, error, onRetry, retryLabel = "Retry", lang }: { message: string | null; steps?: string[]; detail?: string | null; error?: string | null; onRetry?: () => void; retryLabel?: string; lang?: "fr" | "en" }) {
  void steps; void detail;
  if (!message) return null;
  return <Hall title={message} sub={error ?? undefined} busy={!error} actions={error && onRetry ? <Button size="sm" onClick={onRetry}>{retryLabel}</Button> : undefined} lang={lang} />;
}
