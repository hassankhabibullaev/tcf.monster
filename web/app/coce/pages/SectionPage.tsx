// A CO / CE section: the head and the Examen | Entraînement tabs (the same as EE / EO), then either the 40 exam tiles
// (/co, the first tab) or the six levels (/co/practice) under a search field: two characters typed load the six level
// files once and list up to twenty questions, each opening the room at that question (`?q=37`).
import { cached } from "../../api-cache.ts";
import { useEffect, useMemo, useState } from "react";
import { Chip, ColourBar, Button, Empty, Icon, SectionHead, Sheet, Tabs, SECTION_NAME } from "../../../ui/ui.tsx";
import { linkProps } from "../../../ui/router.ts";
import type { Lang } from "../../i18n.ts";
import { api } from "../../api.ts";
import { LEVELS, POINTS, EXAM_COUNT, counts, loadLevel, record, useSection, type Level, type Question } from "./deps.ts";
import { WORDS } from "./words.ts";
import { levelSize, useIndex } from "./practice.ts";
import { searchQuestions, type Hit } from "./search.ts";
import { isRunning, latestScore, EXAMS, type AttemptRow, type CoceSection } from "./shared.ts";

export type SectionPageProps = {
  section: CoceSection;
  mode: "examen" | "entrainement";
  lang: Lang;
  /** `me.settings` and its saver: accepted from the integrator, read by nothing here any more */
  settings?: Record<string, unknown> | null;
  onSettings?: (patch: Record<string, unknown>) => void | Promise<void>;
};

export function SectionPage({ section, mode, lang }: SectionPageProps) {
  const w = WORDS[lang];
  // the phone: the search field folds behind one round button in the title row (the laptop shows the field itself)
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { setSearchOpen(false); }, [section, mode]);
  return (
    <div className="section-page cp-page" data-search={searchOpen || undefined}>
      <SectionHead s={section} name={SECTION_NAME[section]} right={mode === "entrainement" ? (
        <button type="button" className="cp-search-btn mob-only" aria-label={w.search} aria-pressed={searchOpen} onClick={() => setSearchOpen((o) => !o)}><Icon name="search" size={16} /></button>
      ) : undefined} />
      <Tabs label={w.modeLabel} items={[
        { label: w.entrainement, current: mode === "entrainement", props: linkProps(`/${section}`) },
        { label: w.examen, current: mode === "examen", props: linkProps(`/${section}/exam`) },
      ]} />
      {mode === "entrainement" ? <Practice section={section} lang={lang} /> : <Exams section={section} lang={lang} />}
    </div>
  );
}

/* ---------- Entraînement: six levels, the legend ---------- */

function Practice({ section, lang }: { section: CoceSection; lang: Lang }) {
  const w = WORDS[lang];
  const { levels } = useSection(section);
  const index = useIndex();
  // « Recommencer »: the level whose confirmation is open
  const [restart, setRestart] = useState<Level | null>(null);

  if (!levels || index === undefined) {
    return <div className="cp-levels" aria-busy="true">{LEVELS.map((l) => <div key={l} className="skeleton cp-skel-row" />)}</div>;
  }
  return (
    <>
      <Search section={section} lang={lang} />
      <ul className="cp-levels">
        {LEVELS.map((level) => {
          const n = levelSize(index, section, level);
          const c = counts(levels[level], n);
          return (
            <li key={level} className="card cp-level">
              <span className="cp-level-name">{level}</span>
              <span className="cp-level-meta">
                <strong className="desk-only">{w.questions(n)}</strong>
                <span className="muted small desk-only">{w.levelWorth(POINTS[level], EXAM_COUNT[level], POINTS[level] * EXAM_COUNT[level])}</span>
                <span className="cp-level-m mob-only num"><span>{w.seenOf(c.green + c.amber + c.red, n)}</span><span>{w.pts(POINTS[level])}</span></span>
              </span>
              <span className="cp-bar">
                <ColourBar ok={c.green} amber={c.amber} bad={c.red} total={n} />
                <span className="cp-counts num small">
                  <span className="ok-text"><i className="cp-dot ok" />{c.green}</span>
                  <span className="cp-amber"><i className="cp-dot amber" />{c.amber}</span>
                  <span className="bad-text"><i className="cp-dot bad" />{c.red}</span>
                  <span className="muted"><i className="cp-dot new" />{c.grey}</span>
                </span>
              </span>
              <span className="cp-open cp-acts">
                {c.grey < n && <button type="button" className="btn sm quiet cp-restart" aria-label={w.restartLevel(level)} title={w.restart} onClick={() => setRestart(level)}><Icon name="refresh" size={16} /><span className="desk-only">{w.restart}</span></button>}
                <a className="btn sm" aria-label={w.open} {...linkProps(`/${section}/practice/${level}`)}><span className="desk-only">{w.open}</span><Icon name="chevronRight" size={18} className="mob-only" /></a>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="cp-legend">
        <span><i className="cp-dot new" />{w.legend.grey}</span>
        <span><i className="cp-dot ok" />{w.legend.green}</span>
        <span><i className="cp-dot bad" />{w.legend.red}</span>
        <span><i className="cp-dot amber" />{w.legend.amber}</span>
      </p>
      <Sheet open={restart !== null} title={restart ? w.restartLevel(restart) : ""} onClose={() => setRestart(null)}
        actions={<><Button onClick={() => setRestart(null)}>{w.cancel}</Button><Button kind="danger" onClick={() => { if (restart) record.resetLevel(section, restart); setRestart(null); }}>{w.restart}</Button></>}>
        <p>{w.restartBody}</p>
      </Sheet>
    </>
  );
}

/* ---------- the search: the six level files, loaded once at the first keystroke; up to twenty hits ---------- */

type Bank = Partial<Record<Level, Question[]>>;
const banks: Partial<Record<CoceSection, Promise<Bank>>> = {};
const loadBank = (section: CoceSection) => (banks[section] ??= Promise.all(LEVELS.map((l) => loadLevel(section, l).then((qs) => [l, qs] as const)))
  .then((pairs) => Object.fromEntries(pairs) as Bank)
  .catch((e) => { delete banks[section]; throw e; }));

function Search({ section, lang }: { section: CoceSection; lang: Lang }) {
  const w = WORDS[lang];
  const [q, setQ] = useState("");
  const [bank, setBank] = useState<Bank | null | "failed">(null);
  useEffect(() => {
    if (!q || bank) return;
    let live = true;
    loadBank(section).then((b) => live && setBank(b)).catch(() => live && setBank("failed"));
    return () => { live = false; };
  }, [q, bank, section]);
  const query = q.trim();
  const hits = useMemo<Hit[] | null>(() => (query.length >= 2 && bank && bank !== "failed" ? searchQuestions(bank, LEVELS, query) : null), [bank, query]);
  return (
    <div className="cp-search-block">
      <label className="search cp-search">
        <Icon name="search" size={18} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={w.search} aria-label={w.search} />
      </label>
      {query.length >= 2 && bank === "failed" && <p className="cp-search-none">{w.failed}</p>}
      {query.length >= 2 && bank === null && <p className="cp-search-none" aria-busy="true">…</p>}
      {hits && hits.length === 0 && <p className="cp-search-none">{w.noHits}</p>}
      {hits && hits.length > 0 && (
        <ul className="cp-hits">
          {hits.map((h) => (
            <li key={`${h.level}-${h.n}`}>
              <a className="cp-hit" {...linkProps(`/${section}/practice/${h.level}?q=${h.n}`)}>
                <span className="cp-hit-where num">{h.level} · {w.examNo(h.n)}</span>
                <span className="cp-hit-text" lang="fr">{h.snippet}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Examen: 40 tiles, each with its latest score ---------- */

function Exams({ section, lang }: { section: CoceSection; lang: Lang }) {
  const w = WORDS[lang];
  const [rows, setRows] = useState<AttemptRow[] | null | undefined>(undefined);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    setRows(undefined);
    cached<{ attempts: AttemptRow[] }>(`/attempts?section=${section}`).then((d) => live && setRows(d.attempts ?? [])).catch(() => live && setRows(null));
    return () => { live = false; };
  }, [section, tries]);

  const byExam = useMemo(() => {
    const m = new Map<number, AttemptRow[]>();
    for (const a of rows ?? []) { if (a.section !== section) continue; const l = m.get(a.exam) ?? []; l.push(a); m.set(a.exam, l); }
    return m;
  }, [rows, section]);
  const runningExam = (rows ?? []).find(isRunning)?.exam ?? null;
  const order = useMemo(() => { const all = Array.from({ length: EXAMS }, (_, i) => i + 1); return runningExam ? [runningExam, ...all.filter((n) => n !== runningExam)] : all; }, [runningExam]);

  return (
    <>
      {rows === undefined ? (
        <div className="cp-exams" aria-busy="true">{Array.from({ length: 10 }, (_, i) => <div key={i} className="skeleton cp-skel-card" />)}</div>
      ) : rows === null ? (
        <Empty icon={section} title={w.failed}><Button size="sm" icon="refresh" onClick={() => setTries((n) => n + 1)}>{w.retry}</Button></Empty>
      ) : (
        <ul className="cp-exams">
          {order.map((n) => {
            const list = byExam.get(n) ?? [];
            const running = n === runningExam;
            const done = list.some((a) => !isRunning(a));
            const s = latestScore(list);
            const band = s ? (s.nclc != null && s.nclc >= 7 ? "ok" : s.nclc != null && s.nclc >= 5 ? "amber" : "low") : undefined;
            return (
              <li key={n}>
                <a className="card cp-exam" data-state={running ? "running" : done ? "done" : "new"} data-band={band} aria-label={`${w.examTitle(section, n)} · ${running ? w.running : done ? w.done : w.newExam}${s ? ` · ${s.score} / 699` : ""}`} {...linkProps(`/${section}/exam/${n}`)}>
                  <span className="cp-exam-no" aria-hidden="true">{n}</span>
                  <Chip tone={running ? "amber" : done ? "ok" : "new"} dot={running}>{running ? w.running : done ? w.done : w.newExam}</Chip>
                  <span className="cp-exam-score" data-empty={s ? undefined : ""}>
                    <span className="cp-exam-n num">{s ? s.score : 0}</span><span className="cp-exam-of num">/ 699</span>
                    {s && <Nclc n={s.nclc} lang={lang} />}
                  </span>
                  <span className="cp-exam-count muted small">{w.attempts(list.length)}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** the NCLC chip: a number; under the table (`null`) « NCLC 3 », as the dashboard shows it */
export function Nclc({ n, lang }: { n: number | null | undefined; lang: Lang }) {
  const w = WORDS[lang];
  return n == null ? <Chip tone="new">{w.nclcLow}</Chip> : <Chip tone="accent">{w.nclc(n)}</Chip>;
}

export type { Level };
