// The Gemini key: pasted once per device, checked at once with Google from this browser, kept on this device only (it
// never reaches our server: sim/browser-score.ts). The same form lives in two places: the profile's key section and
// the sheet opened when a session finds no key here. One sentence says what to do, the video shows it (keyvideo/),
// the field takes the key; nothing else is written.
import { saveKeyHere } from "../sim/browser-score.ts";
import { useState } from "react";
import { Button, Sheet, MonsterAI } from "../../ui/ui.tsx";
import { useT } from "../i18n.ts";
import { KeyVideo } from "../keyvideo/KeyVideo.tsx";

function useKeyCheck(onSaved?: () => void) {
  const { t } = useT();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function check() {
    if (!key.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await saveKeyHere(key);
      if (!r.ok) { setError(r.error === "shape" ? t.keyShape : r.error === "refused" ? t.keyRefused : t.keyUnreachable); return; }
      setKey("");
      onSaved?.();
    } catch {
      setError(t.keyUnreachable);
    } finally { setBusy(false); }
  }
  return { key, setKey, busy, error, check };
}

function Field({ k, error }: { k: ReturnType<typeof useKeyCheck>; error: string | null }) {
  const { t } = useT();
  return (
    <>
      <label className="field">
        <span>{t.keyField}</span>
        <input value={k.key} onChange={(e) => k.setKey(e.target.value)} autoComplete="off" spellCheck={false} autoCapitalize="off" placeholder="AQ.Ab…" aria-invalid={!!error || undefined} onKeyDown={(e) => { if (e.key === "Enter") k.check(); }} />
      </label>
      {error && <p className="bad-text" role="alert">{error}</p>}
    </>
  );
}


/** the one sentence above the video: what Monster AI runs on, and what to do */
function Lead() {
  const { t } = useT();
  return <p className="key-lead"><MonsterAI />{t.keyPanelLead2}</p>;
}

/** the panel wherever the key is asked for: the sentence, the video, the field with Check beside it */
export function KeyPanel({ onSaved }: { onSaved?: () => void }) {
  const { t } = useT();
  const k = useKeyCheck(onSaved);
  return (
    <div className="key-panel">
      <Lead />
      <div className="key-panel-row">
        <Field k={k} error={k.error} />
        <Button kind="primary" busy={k.busy} disabled={!k.key.trim()} onClick={k.check}>{t.keyCheck}</Button>
      </div>
      <KeyVideo />
    </div>
  );
}

export function KeySheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: () => void }) {
  const { t } = useT();
  const k = useKeyCheck(() => { onClose(); onSaved?.(); });
  return (
    <Sheet open={open} title={t.keyTitle} onClose={onClose} actions={<>
      <Button onClick={onClose}>{t.cancel}</Button>
      <Button kind="primary" busy={k.busy} disabled={!k.key.trim()} onClick={k.check}>{t.keyCheck}</Button>
    </>}>
      <Lead />
      <KeyVideo />
      <Field k={k} error={k.error} />
    </Sheet>
  );
}
