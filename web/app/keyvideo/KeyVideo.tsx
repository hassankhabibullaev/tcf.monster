// The Gemini key video (docs/KEY-VIDEO.md): the real way to a key, replayed in code instead of recorded. Four
// versions — laptop or phone (by the viewer's screen), French or English — in the viewer's theme. It starts on the
// page the viewer is on, zooms where something happens, and clicks and types with soft sounds. A click on it plays or
// pauses; the only other control is the sound.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../../ui/ui.tsx";
import { useT } from "../i18n.ts";
import { audio, makeEngine, play } from "./engine.ts";
import { Laptop, LAPTOP, Phone, PHONE } from "./scenes.tsx";
import { WORDS } from "./words.ts";
import "./keyvideo.css";

const PHONE_QUERY = "(max-width: 760px)";
const SOUND_KEY = "tcfm.keyvideo.sound";

function usePhone() {
  const [phone, setPhone] = useState(() => matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const m = matchMedia(PHONE_QUERY);
    const on = () => setPhone(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

export function KeyVideo() {
  const { t, lang } = useT();
  const w = WORDS[lang];
  const phone = usePhone();
  const script = phone ? PHONE : LAPTOP;
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const engine = useRef<ReturnType<typeof makeEngine> | null>(null);
  const time = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [edge, setEdge] = useState<"start" | "middle" | "end">("start");
  const [sound, setSound] = useState(() => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } });
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const show = useCallback((ms: number) => {
    time.current = ms;
    engine.current?.paint(ms);
    setEdge(ms <= 0 ? "start" : ms >= script.len ? "end" : "middle");
  }, [script.len]);

  // the stage fits its frame; the engine is rebuilt when the words or the version change, from the first moment
  useLayoutEffect(() => {
    if (!stage.current || !world.current || !cursor.current || !frame.current) return;
    const f = frame.current;
    // the targets are measured again whenever the frame gets a size: inside a sheet the first measure happens while
    // everything is still display: none, and the pointer would sit in the top left corner
    const fit = () => { f.style.setProperty("--k", String(f.clientWidth / script.w)); engine.current?.measure(); engine.current?.paint(time.current); };
    fit();
    engine.current = makeEngine(stage.current, world.current, cursor.current, script);
    setPlaying(false);
    show(0);
    // a way in for checking a moment by hand (the browser console): frame.kvSeek(ms)
    (f as HTMLElement & { kvSeek?: (ms: number) => void }).kvSeek = (ms) => { setPlaying(false); show(ms); };
    const ro = new ResizeObserver(fit);
    ro.observe(f);
    return () => ro.disconnect();
  }, [lang, script, show]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (n: number) => {
      const from = time.current, next = Math.min(script.len, from + (n - last));
      last = n;
      if (soundRef.current && engine.current) for (const s of engine.current.soundsBetween(from, next)) play(s);
      show(next);
      if (next >= script.len) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, script.len, show]);

  const toggle = () => {
    audio();
    engine.current?.measure();
    if (!playing && time.current >= script.len) show(0);
    setPlaying((p) => !p);
  };
  const flipSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !sound;
    setSound(next);
    if (next) audio();
    try { localStorage.setItem(SOUND_KEY, next ? "on" : "off"); } catch { /* the choice lasts this visit */ }
  };

  return (
    <figure className={`kv kv-${phone ? "m" : "d"}`} aria-label={w.video}>
      <div className="kv-frame" ref={frame} onClick={toggle} role="button" tabIndex={0} aria-label={playing ? w.pause : edge === "end" ? w.replay : w.play}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } }}>
        <div className="kv-stage" ref={stage} aria-hidden="true">
          <div className="kv-world" ref={world}>
            {phone ? <Phone t={t} w={w} /> : <Laptop t={t} w={w} />}
            <div className="kv-cursor" ref={cursor}><svg viewBox="0 0 24 24"><path d="M5 3l14 8.2-6.3 1.4 3.6 6.7-2.6 1.4-3.6-6.8L5 18.3z" /></svg><i /></div>
          </div>
        </div>
        {!playing && edge !== "middle" && <span className="kv-big" aria-hidden="true"><Icon name={edge === "end" ? "refresh" : "play"} size={28} /></span>}
        <button type="button" className="kv-sound" onClick={flipSound} aria-pressed={sound} aria-label={sound ? w.soundOff : w.soundOn}><Icon name={sound ? "volume" : "mute"} size={16} /></button>
      </div>
    </figure>
  );
}
