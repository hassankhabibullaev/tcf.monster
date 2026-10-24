import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../ui/ui";
import type { Correction } from "./types";
import { Highlighted } from "./highlighted";
import { buildInterviewWav, hasClipId, loadClip, saveBlob, type AudioTurn } from "./interview-audio";
import { presentClips } from "./clips";
import { Trouble } from "./trouble";
import { useSimWords } from "./words";
import type { Lang } from "../i18n";

export type DialogueTask = { taskNo: number; turns: AudioTurn[]; score20: number | null; nclc: number | null; corrections: Correction[] };

const PlayIcon = ({ playing }: { playing: boolean }) =>
  playing ? (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="currentColor" /><rect x="14" y="5" width="4" height="14" fill="currentColor" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" /><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
  );

/** The interview as a chat: a play button on every answer, play-all, single-file download, the mistakes underlined. */
export function Dialogue({ sessionId, tasks, title, lang }: { sessionId: string; tasks: DialogueTask[]; title: string; lang: Lang }) {
  const w = useSimWords(lang);
  const flat = useMemo(() => tasks.flatMap((t) => t.turns.map((u, i) => ({ ...u, id: `${t.taskNo}-${i}`, taskNo: t.taskNo }))), [tasks]);
  // a play button only where this device still has the recording; elsewhere the transcript alone
  const [here, setHere] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    void presentClips(flat.filter(hasClipId).map((t) => t.clipId!)).then((s) => alive && setHere(s));
    return () => {
      alive = false;
    };
  }, [flat]);
  const hasAudio = (t: AudioTurn) => hasClipId(t) && here.has(t.clipId!);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [playAll, setPlayAll] = useState(false);
  const [dl, setDl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, string>());
  const allRef = useRef(false);
  allRef.current = playAll;

  useEffect(() => {
    const map = urls.current;
    return () => {
      audio.current?.pause();
      map.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  function stop() {
    audio.current?.pause();
    setCurrent(null);
    setPlayAll(false);
  }

  async function play(id: string) {
    const turn = flat.find((t) => t.id === id);
    if (!turn) return;
    setError(null);
    audio.current?.pause();
    let url = urls.current.get(id);
    if (!url) {
      setLoading(id);
      const clip = await loadClip(turn);
      setLoading(null);
      if (!clip) {
        setError(w.noAudio);
        return next(id);
      }
      url = URL.createObjectURL(new Blob([clip.data], { type: clip.type }));
      urls.current.set(id, url);
    }
    const el = (audio.current ??= new Audio());
    el.src = url;
    el.onended = () => next(id);
    el.onerror = () => next(id);
    setCurrent(id);
    document.getElementById(`turn-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    await el.play().catch(() => setCurrent(null));
  }

  function next(id: string) {
    if (!allRef.current) return setCurrent(null);
    const i = flat.findIndex((t) => t.id === id);
    const n = flat.slice(i + 1).find(hasAudio);
    if (n) void play(n.id);
    else stop();
  }

  async function download() {
    setError(null);
    try {
      const { blob, skipped } = await buildInterviewWav(flat.filter(hasAudio), (d, n) => setDl(w.assembling(d, n)));
      saveBlob(blob, `tcf-monster-eo-${new Date().toISOString().slice(0, 10)}-${sessionId.slice(0, 6)}.wav`);
      setDl(skipped ? `${w.downloaded} (${w.missing(skipped)})` : w.downloaded);
    } catch {
      setError(w.noAudioSession);
      setDl(null);
      return;
    }
    setTimeout(() => setDl(null), 4000);
  }

  if (!flat.length) return null;
  const first = flat.find(hasAudio);
  const busyDl = !!dl && dl.startsWith(w.assembling(0, 0).slice(0, 6));
  return (
    <section className="dialogue">
      <div className="sim-panel-title sim-panel-title-row">
        <h3>{title}</h3>
        <div className="sim-row">
          {first && <Button size="sm" onClick={() => (playAll || current ? stop() : (setPlayAll(true), (allRef.current = true), void play(first.id)))}>{playAll || current ? w.stop : w.playAll}</Button>}
          {first && <Button size="sm" kind="quiet" onClick={download} disabled={busyDl}>{dl ?? w.download}</Button>}
        </div>
      </div>
      {error && <Trouble message={error} onRetry={() => setError(null)} lang={lang} />}
      <div className="sim-scroll">
        {tasks.map((t) => (
          <div key={t.taskNo} className="chat">
            {t.turns.map((u, i) => {
              const id = `${t.taskNo}-${i}`;
              const me = u.role !== "examiner";
              if (!u.text || u.text === "(inaudible)") return null; // a button pressed by mistake
              return (
                <div key={id} id={`turn-${id}`} className="msg" data-me={me} data-playing={current === id}>
                  {!me && <div className="msg-avatar" aria-hidden="true">E</div>}
                  <div className="bubble">
                    <div className="bubble-who">{me ? w.me : w.examiner}</div>
                    <div className="bubble-text">{me && t.corrections.length ? <Highlighted text={u.text} corrections={t.corrections} corrected={false} lang={lang} /> : u.text}</div>
                    {hasAudio(u) && (
                      <button type="button" className="bubble-play" onClick={() => (current === id ? stop() : (setPlayAll(false), (allRef.current = false), void play(id)))} aria-label={current === id ? w.stop : w.play}>
                        {loading === id ? <span className="spin" aria-hidden="true" /> : <PlayIcon playing={current === id} />}
                        <span>{current === id ? w.playing : w.play}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
