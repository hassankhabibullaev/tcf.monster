import { Button, Sheet } from "../../ui/ui";
import { useSimWords } from "./words";
import type { Lang } from "../i18n";

/**
 * « Arrêter la tâche ? » as a sheet: the page behind is blocked and the clock is stopped by the caller. « Reprendre »
 * (the safe way, left; Escape and the backdrop do the same); « Arrêter ici et être évalué » ends the task now and
 * what was said is marked; « Abandonner » gives the session up, nothing is scored or kept. Before anything was said
 * there is nothing to mark, so only Abandon is offered.
 */
export function StopDialog({ open, canScore, onResume, onStop, onAbandon, lang }: { open: boolean; canScore: boolean; onResume: () => void; onStop: () => void; onAbandon: () => void; lang: Lang }) {
  const w = useSimWords(lang);
  return (
    <Sheet
      open={open}
      title={w.stopTitle}
      onClose={onResume}
      actions={
        <>
          <Button onClick={onResume} autoFocus>{w.resume}</Button>
          <span className="sim-acts">
            <Button kind="danger" onClick={onAbandon}>{w.abandon}</Button>
            {canScore && <Button kind="primary" onClick={onStop}>{w.stopAndScore}</Button>}
          </span>
        </>
      }
    >
      <p>{canScore ? w.stopBodyScore : w.stopBodyNone}</p>
    </Sheet>
  );
}
