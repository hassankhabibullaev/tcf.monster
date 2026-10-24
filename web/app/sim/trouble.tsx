import { Button, Icon } from "../../ui/ui";
import { useSimWords } from "./words";
import type { Lang } from "../i18n";

/**
 * One calm card for everything that goes wrong in the stations and on the results page: a surface with a hairline,
 * an amber ⚠, one plain sentence (what happened, and that the work is kept), « Réessayer ». While the station
 * retries by itself the card counts down (« Nouvel essai dans 12 s »); after three failures the sentence becomes
 * the final one (Google is not answering; come back later) with « Réessayer » and « Quitter ». No red text anywhere.
 */
export type TroubleProps = {
  /** the sentence; `final` replaces it with the one about Google */
  message: string;
  final?: boolean;
  /** seconds before the next automatic try (the card counts down); none when the person must press */
  retryIn?: number | null;
  onRetry?: () => void;
  onQuit?: () => void;
  /** one more way out, as a link (« Ouvrir le profil ») */
  link?: { label: string; href: string };
  busy?: boolean;
  lang: Lang;
};

export function Trouble({ message, final = false, retryIn = null, onRetry, onQuit, link, busy = false, lang }: TroubleProps) {
  const w = useSimWords(lang);
  return (
    <div className="trouble" role="status" aria-live="polite">
      <Icon name="alert" size={22} />
      <div className="trouble-body">
        <p>{final ? w.troubleGoogle : message}</p>
        {retryIn != null && retryIn > 0 && !final && <p className="trouble-count num">{w.retryingIn(retryIn)}</p>}
        <div className="trouble-acts">
          {link && <a className="btn sm" href={link.href}>{link.label}</a>}
          {(final || !!onQuit) && onQuit && <Button size="sm" kind="quiet" onClick={onQuit}>{w.quit}</Button>}
          {onRetry && <Button size="sm" kind="primary" busy={busy} onClick={onRetry}>{w.retry}</Button>}
        </div>
      </div>
    </div>
  );
}

/** « 5 min 30 » / « 2 min » from seconds, for the interstitial between tasks */
export function minutesLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${String(s).padStart(2, "0")}` : `${m} min`;
}
