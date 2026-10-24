// The CO player, one look everywhere (practice, the exam, the review, laptop and phone): a dark pill — the round play
// button in the accent (pause while playing), the thin progress line in the sun (a scrubber in practice, a plain line in
// the strict exam), the two times in small mono type, « 0:20 / 0:53 ». No plays count is shown; the limit exists only
// where the room asks for it (the strict exam: one play). A recording that fails to load becomes « Audio indisponible »
// + Réessayer in the pill. The live transcript lives in Transcript.tsx and talks to the player through its handle.
// The recordings (/media/…) are plain files Cloudflare serves without the Worker, and those answers ignore byte ranges,
// which Safari needs to play and seek a file it streams. So a recording is fetched whole (at most a few MB, kept a year
// in the browser's cache) and played from memory, where seeking always works. Fetched at once, or at the first press
// when preload is "none".
import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from "react";
import { Button, Icon } from "../../../ui/ui.tsx";
import type { Lang } from "../../i18n.ts";
import { useRoomWords } from "./words.ts";
import { fmtTime } from "./hooks.ts";

export type PlayerHandle = {
  audio: HTMLAudioElement | null;
  /** jump to a second and (by default) play from there; a function gets the recording's length once it is known */
  seek: (t: number | ((duration: number) => number), play?: boolean) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
};

export type PlayerProps = {
  src: string;
  /** the player starts over (plays count, position) when this changes */
  resetKey: string;
  /** how many full plays are allowed; null = as many as wanted */
  maxPlays: number | null;
  scrubber: boolean;
  autoplay: boolean;
  lang: Lang;
  /** the exam room: nothing but the one play, no pause either */
  locked?: boolean;
  onEnded?: () => void;
  onError?: () => void;
  onPlays?: (n: number) => void;
  /** `none` on a page with many players (the review): the file is fetched at the first press */
  preload?: "auto" | "none";
  ref?: Ref<PlayerHandle>;
};

export function Player({ src, resetKey, maxPlays, scrubber, autoplay, lang, locked = false, onEnded, onError, onPlays, preload = "auto", ref }: PlayerProps) {
  const w = useRoomWords(lang);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [plays, setPlays] = useState(0);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const cb = useRef({ onEnded, onError, onPlays });
  cb.current = { onEnded, onError, onPlays };

  // the playable address: the recording held in memory, or the address itself for anything else
  const whole = src.startsWith("/media/");
  const [url, setUrl] = useState<string | null>(whole ? null : src);
  const [want, setWant] = useState(preload !== "none");
  const pending = useRef<null | (() => void)>(null); // a press that came before the file
  useEffect(() => { setWant(preload !== "none"); pending.current = null; }, [src, preload]);
  useEffect(() => {
    if (!whole) { setUrl(src); return; }
    setUrl(null);
    if (!want) return;
    let gone = false, made = "";
    fetch(src)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then((b) => { if (gone) return; made = URL.createObjectURL(b); setUrl(made); })
      .catch(() => { if (!gone) setUrl(src); }); // the element tries the address itself and says if it fails
    return () => { gone = true; if (made) URL.revokeObjectURL(made); };
  }, [src, whole, want, tries]);
  /** run now if the file is here, else fetch it and run once it is */
  const whenReady = (fn: () => void) => { if (url) fn(); else { pending.current = fn; setWant(true); } };

  const exhausted = maxPlays !== null && plays >= maxPlays && !playing && (ended || t === 0);

  // a new recording: everything back to the start
  useEffect(() => {
    setPlaying(false); setT(0); setDur(0); setPlays(0); setEnded(false); setFailed(false);
    audio.current?.pause();
  }, [resetKey, tries]);
  // the file is here: load it; Autoplay presses play, or the press that came before the file goes through
  useEffect(() => {
    const a = audio.current;
    if (!a || !url) return;
    a.load();
    const go = pending.current;
    pending.current = null;
    if (go) { a.addEventListener("loadedmetadata", go, { once: true }); return () => a.removeEventListener("loadedmetadata", go); }
    if (!autoplay) return;
    const id = setTimeout(() => { a.play().catch(() => { /* the browser wants a press first */ }); }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, resetKey]);

  // the time follows every frame while playing (timeupdate alone steps ~4 times a second)
  useEffect(() => {
    const a = audio.current;
    if (!a || !playing) return;
    let raf = 0;
    const tick = () => { setT(a.currentTime); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // the sound stops when the tab goes away or the question leaves
  useEffect(() => {
    const stop = () => audio.current?.pause();
    const onVis = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", stop);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", stop); stop(); };
  }, []);

  const play = () => { const a = audio.current; if (!a || failed || exhausted) return; whenReady(() => { a.play().catch(() => {}); }); };
  const pause = () => { if (locked) return; audio.current?.pause(); };
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) play(); else pause(); };
  const seek = (to: number | ((duration: number) => number), go = true) => {
    const a = audio.current;
    if (!a || failed) return;
    const run = () => {
      const at = typeof to === "function" ? to(Number.isFinite(a.duration) ? a.duration : 0) : to;
      a.currentTime = Math.max(0, at); setT(a.currentTime); if (go) a.play().catch(() => {});
    };
    if (!url) { whenReady(run); return; }
    if (a.readyState >= 1) run(); else { a.addEventListener("loadedmetadata", run, { once: true }); a.load(); }
  };
  useImperativeHandle(ref, () => ({ get audio() { return audio.current; }, seek, toggle, play, pause }));

  const pct = dur > 0 ? Math.min(100, (t / dur) * 100) : 0;
  const fill = { "--p": `${pct}%` } as CSSProperties;

  return (
    <div className="cr-player" data-locked={locked || undefined} data-failed={failed || undefined}>
      <audio
        ref={audio}
        src={url ?? undefined}
        preload={preload}
        onPlay={(e) => {
          setPlaying(true); setEnded(false);
          const a = e.currentTarget;
          // a fresh start counts as a play; resuming after a pause does not
          if (a.currentTime < 0.3) setPlays((n) => { cb.current.onPlays?.(n + 1); return n + 1; });
          document.querySelectorAll("audio").forEach((x) => { if (x !== a) x.pause(); });
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onDurationChange={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setEnded(true); cb.current.onEnded?.(); }}
        onError={() => { setFailed(true); setPlaying(false); cb.current.onError?.(); }}
      />
      <div className="cr-pill">
        {failed ? (
          <div className="cr-player-failed" role="status">
            <span>{w.audioUnavailable}</span>
            <Button size="sm" icon="refresh" onClick={() => setTries((n) => n + 1)}>{w.retry}</Button>
          </div>
        ) : (
          <>
            <button type="button" className="cr-play" onClick={toggle} disabled={(locked && playing) || exhausted} aria-label={playing ? w.pause : w.play} aria-pressed={playing}>
              <Icon name={playing ? "pause" : "play"} size={16} className="icon-fill" />
            </button>
            {scrubber ? (
              <input type="range" className="cr-scrub" style={fill} min={0} max={dur > 0 ? dur : Math.max(t, 1)} step="any" value={dur > 0 ? Math.min(t, dur) : t} aria-label={w.position}
                onChange={(e) => seek(Number(e.target.value), playing)} />
            ) : (
              <div className="cr-progress" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
            )}
            <span className="cr-player-times num">{fmtTime(t)} / {fmtTime(dur)}</span>
          </>
        )}
      </div>
    </div>
  );
}
