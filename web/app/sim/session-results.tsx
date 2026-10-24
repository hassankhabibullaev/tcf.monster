import { markDetail, markRevision, within } from "./browser-score";
import { SCORING_TIMEOUT_MS } from "./scoring-error";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Chip, Icon, MonsterAI } from "../../ui/ui";
import { CEFR_LEVELS, MAX_REVISIONS, WRITING, cefrOf, safeJson, tasksLabel, wordCount, type Correction, type CorrectionKind, type PromptView, type Revision, type SessionSummary, type Skill, type TaskNo, type Tip, type VocabItem } from "./types";
import { ResultCard } from "./result-card";
import { Highlighted } from "./highlighted";
import { Dialogue } from "./dialogue";
import { replayMoment } from "./analysis";
import { BusyOverlay } from "./busy-overlay";
import { Trouble } from "./trouble";
import type { Failure } from "./scoring-error";
import { useSimWords } from "./words";
import type { Lang } from "../i18n";

export type TaskView = {
  taskNo: number;
  sessionId?: string;
  prompt: PromptView;
  responseText?: string | null;
  wordCount?: number | null;
  turns?: { role: string; text: string; clipId?: string }[];
  score20: number | null;
  level: string | null;
  nclc: number | null;
  feedbackJson: string | null;
  detailJson?: string | null;
  /** writing: the versions rewritten after the result (version 1 is responseText) */
  versionsJson?: string | null;
  /** marked, but what was written or said, and its corrections, stayed on the device that did it (work.ts) */
  elsewhere?: boolean;
};
/** the complete proofreading, sentence by sentence (answer by answer for speaking) */
type Detail = { corrections: Correction[] };
type Row = { name: string; score: number; reason?: string };
type Evaluation = { tips?: Tip[]; corrections?: Correction[]; vocabulary?: VocabItem[]; facts?: { copied?: string[] }; stage?: "transcript" | "full"; criteria?: Row[]; locked?: string[]; caps?: string[] };

const KIND_ORDER: CorrectionKind[] = ["grammar", "spelling", "lexis", "register", "task", "pronunciation"];

export type SessionResultsProps = {
  skill: Skill;
  sessionId: string;
  views: TaskView[];
  /** the session's totals once every task is marked */
  summary: SessionSummary | null;
  /** the tasks of the session, in order (a task still being marked has no view yet) */
  selected: TaskNo[];
  pending?: Record<number, "running" | "failed">;
  failures?: Record<number, Failure>;
  onRetry?: (taskNo: TaskNo) => void;
  /** the one button at the end (the page goes back to the section) */
  onExit: () => void;
  lang: Lang;
  /** accepted from the pages, not used here */
  mode?: "task" | "full";
  dateLabel?: string;
};

/**
 * The result of a session: the mark as the hero (NCLC, the A1→C2 bar), one tab per task, the task's card (criteria
 * as levels, three tips), the text with its mistakes underlined and the complete list, or the transcript with
 * replay. Writing: Réessayer rewrites the text and marks it as a new version. Marks are revealed together; a failed
 * marking shows the work, the honest message and Réessayer, and retries by itself.
 */
export function SessionResults({ skill, sessionId, views, summary, selected, pending = {}, failures = {}, onRetry, onExit, lang }: SessionResultsProps) {
  const w = useSimWords(lang);
  const [tab, setTab] = useState<number>(selected[0] ?? 1);
  const [now, setNow] = useState(() => Date.now());
  const [retryAt, setRetryAt] = useState<Record<number, number>>({});
  // a failed marking is tried again by itself three times (a minute at most between two, the card counts down), and
  // at once when the page comes back; after three failures the person decides (the key refused: never by itself)
  const tries = useRef<Record<number, number>>({});
  useEffect(() => {
    setRetryAt((x) => {
      const next = { ...x };
      for (const n of selected) {
        if (pending[n] === "failed" && onRetry) {
          if (next[n] != null) continue;
          const count = tries.current[n] ?? 0;
          if (count >= 3 || failures[n]?.key) continue;
          next[n] = Date.now() + Math.min(60, failures[n]?.retryInS ?? 60) * 1000;
        } else delete next[n];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, failures]);
  useEffect(() => {
    if (!Object.keys(retryAt).length) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [retryAt]);
  useEffect(() => {
    for (const [k, at] of Object.entries(retryAt)) {
      if (now >= at && pending[Number(k)] === "failed" && onRetry) {
        setRetryAt((x) => {
          const { [Number(k)]: _gone, ...rest } = x;
          void _gone;
          return rest;
        });
        tries.current[Number(k)] = (tries.current[Number(k)] ?? 0) + 1;
        onRetry(Number(k) as TaskNo);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== "visible" || !onRetry) return;
      for (const n of selected) if (pending[n] === "failed") onRetry(n);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, onRetry]);

  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(w.copyFailed);
    }
  }

  // views arrive one by one while the earlier tasks are marked in the background; a later analysis overrides
  const baseEvals = useMemo(() => Object.fromEntries(views.map((v) => [v.taskNo, safeJson<Evaluation>(v.feedbackJson, {})])) as Record<number, Evaluation>, [views]);
  const baseDetails = useMemo(() => Object.fromEntries(views.map((v) => [v.taskNo, safeJson<Detail | null>(v.detailJson, null)])) as Record<number, Detail | null>, [views]);
  const [evalOverrides, setEvals] = useState<Record<number, Evaluation>>({});
  const [detailOverrides, setDetails] = useState<Record<number, Detail | null>>({});
  const evals = { ...baseEvals, ...evalOverrides };
  const details = { ...baseDetails, ...detailOverrides };
  // the complete list of mistakes of a production that does not have it yet (a reading that failed at the end)
  const [proofing, setProofing] = useState<Record<number, boolean>>({});
  const proofTried = useRef(new Set<number>());
  async function proofreadTask(taskNo: number) {
    setProofing((x) => ({ ...x, [taskNo]: true }));
    try {
      const d = (await within(markDetail(sessionId, taskNo as 1 | 2 | 3), SCORING_TIMEOUT_MS)) as unknown as Detail;
      if (Array.isArray(d.corrections)) setDetails((x) => ({ ...x, [taskNo]: d }));
    } catch {
      /* the button stays */
    } finally {
      setProofing((x) => ({ ...x, [taskNo]: false }));
    }
  }
  useEffect(() => {
    if (!selected.every((n) => views.find((v) => v.taskNo === n)?.score20 != null)) return;
    for (const v of views) {
      const said = skill === "speaking" ? (v.turns ?? []).some((u) => u.role !== "examiner" && u.text) : !!(v.responseText ?? "").trim();
      if (proofTried.current.has(v.taskNo) || v.score20 == null || !said || details[v.taskNo]) continue;
      proofTried.current.add(v.taskNo);
      void proofreadTask(v.taskNo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, skill]);

  // writing: the versions rewritten here (version 1 is the text handed in), the one shown, the one being written
  const [revAdded, setRevAdded] = useState<Record<number, Revision[]>>({});
  const [verSel, setVerSel] = useState<Record<number, number>>({});
  const [draft, setDraft] = useState<{ taskNo: number; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [reviseError, setReviseError] = useState<string | null>(null);
  async function checkDraft() {
    if (!draft || checking) return;
    setChecking(true);
    setReviseError(null);
    try {
      const d = (await within(markRevision(sessionId, draft.taskNo as 1 | 2 | 3, draft.text), SCORING_TIMEOUT_MS)) as unknown as { revisions?: Revision[] };
      if (!d.revisions) throw new Error(w.markFailedDefault);
      setRevAdded((x) => ({ ...x, [draft.taskNo]: d.revisions! }));
      setVerSel((x) => ({ ...x, [draft.taskNo]: d.revisions!.length + 1 }));
      setDraft(null);
    } catch (e) {
      setReviseError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  const viewOf = (n: number) => views.find((v) => v.taskNo === n);
  const scoreOf = (n: number) => viewOf(n)?.score20 ?? null;
  const allDone = selected.every((n) => scoreOf(n) != null);
  const waiting = selected.filter((n) => scoreOf(n) == null);
  const failed = waiting.filter((n) => pending[n] === "failed");
  const single = selected.length === 1;
  // nothing is revealed before EVERY task has its mark: one exam, one result (the productions are shown meanwhile)
  const revealed = allDone;
  // a runner marks in the background (it passes onRetry); a past session's page marks nothing: no spinner, no wait
  const live = !!onRetry;
  const marking = live && !revealed && waiting.length > 0 && failed.length === 0;
  const overall = single ? scoreOf(selected[0]) : allDone && summary?.score20 != null ? Math.round(summary.score20) : null;
  const overallNclc = single ? (viewOf(selected[0])?.nclc ?? null) : allDone ? summary?.nclc ?? null : null;
  const level = overall != null ? cefrOf(overall) : null;
  const current = viewOf(tab);
  const ev = evals[tab] ?? {};
  const sc = { score20: scoreOf(tab), nclc: current?.nclc ?? null };
  const detail = details[tab];
  const revs = skill === "writing" ? revAdded[tab] ?? safeJson<Revision[]>(current?.versionsJson, []) : [];
  const ver = Math.min(Math.max(1, verSel[tab] ?? revs.length + 1), revs.length + 1);
  const rev = ver > 1 ? revs[ver - 2] : null;
  const shownEv: Evaluation = rev ? (rev.evaluation as Evaluation) : ev;
  const shownSc = rev ? { score20: rev.score20, nclc: rev.nclc } : sc;
  const shownText = rev ? rev.text : current?.responseText ?? null;
  const shownWords = rev ? rev.wordCount : current?.wordCount ?? null;
  // every mistake when the complete reading came through, the scorer's shorter list otherwise
  const complete = rev ? rev.corrections != null : !!detail;
  const corrections: Correction[] = rev ? rev.corrections ?? (rev.evaluation as Evaluation).corrections ?? [] : detail ? detail.corrections : ev.corrections ?? [];
  const editing = draft != null && draft.taskNo === tab;
  const canRevise = skill === "writing" && !!current && revealed && sc.score20 != null && !!(current.responseText ?? "").trim();
  const range = skill === "writing" ? WRITING.tasks[tab as TaskNo] : null;
  const stateOf = (n: number): "done" | "failed" | "running" => (scoreOf(n) != null ? "done" : pending[n] === "failed" ? "failed" : "running");
  const nextRetryIn = (() => {
    const at = Math.min(...failed.filter((n) => retryAt[n]).map((n) => retryAt[n]));
    return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : null;
  })();
  const givenUp = failed.length > 0 && failed.every((n) => (tries.current[n] ?? 0) >= 3);
  const retryNow = () => {
    for (const n of failed) tries.current[n] = givenUp ? 0 : tries.current[n] ?? 0;
    setRetryAt({});
    failed.forEach((n) => onRetry?.(n));
  };
  const produced = skill === "speaking" ? (current?.turns ?? []).some((u) => u.role !== "examiner" && u.text?.trim()) : !!(shownText ?? "").trim();
  // the subject: open on a laptop, folded on a phone (a Tâche 3 subject is a screen and a half there)
  const [promptOpen, setPromptOpen] = useState(() => typeof window === "undefined" || !window.matchMedia?.("(max-width: 760px)").matches);
  const groups = KIND_ORDER.map((k) => ({ kind: k, items: corrections.filter((c) => c.kind === k) })).filter((g) => g.items.length);
  const vocab = shownEv.vocabulary ?? [];
  const copiedPassages = shownEv.facts?.copied ?? [];

  return (
    <div className="results">
      <BusyOverlay message={marking ? w.marking : null} steps={w.markSteps[skill]} detail={marking && !single ? selected.map((n) => w.taskState(n, stateOf(n))).join(" · ") : null} />

      {/* 1. the session */}
      <div className="results-head">
        <span className="sim-caps">{skill === "writing" ? w.writing : w.speakingSkill} · {single ? w.taskN(selected[0]) : selected.length < 3 ? w.partialTest(tasksLabel(selected)) : w.fullTest}</span>
        <span className="small"><MonsterAI powered lang={lang} /></span>
      </div>
      <div className="rc results-hero">
        <div className="rc-hero">
          <div className="rc-score">
            {overall != null ? (
              <>
                <span className="n">{overall}</span>
                <span className="d"> / 20</span>
              </>
            ) : (
              <span className="d">{!live ? w.noMarks : failed.length ? w.marksPending : w.marking}</span>
            )}
          </div>
          <div className="rc-side">
            <div className="rc-nclc" data-level={level?.id ?? "none"}>{w.nclc(overallNclc)}</div>
            {level && <div className="rc-level">{w.level(level.id)}</div>}
          </div>
        </div>
        {level && (
          <div className="rc-body">
            <div className="rc-row">
              <span className="rc-name">{w.overallLevel}</span>
              <div className="rc-bar">
                <div className="rc-levels">
                  {CEFR_LEVELS.map((l) => (
                    <span key={l.id} data-level={l.id} style={{ flexGrow: l.span }} />
                  ))}
                </div>
                <i className="rc-dot" style={{ left: `${((Math.min(20, Math.max(1, overall!)) - 0.5) / 20) * 100}%` }} />
              </div>
              <span className="rc-pill" data-level={level.id}>{level.id} · {w.levelStatus[level.id]}</span>
            </div>
            <div className="rc-row rc-scale" aria-hidden="true">
              <span />
              <div className="rc-levels">
                {Array.from({ length: 20 }, (_, i) => (
                  <span key={i} data-on={i + 1 === overall} data-near={Math.abs(i + 1 - overall!) === 1}>{i + 1}</span>
                ))}
              </div>
              <span />
            </div>
          </div>
        )}
      </div>

      {/* 2. the tasks */}
      {!single && (
        <div className="results-tabs" role="tablist">
          {selected.map((n) => (
            <button key={n} type="button" role="tab" aria-selected={tab === n} onClick={() => setTab(n)}>
              {w.taskN(n)}
              <small>{revealed ? `${Math.round(scoreOf(n)!)} / 20` : stateOf(n) === "done" ? w.markedTick : stateOf(n) === "failed" ? w.waitingMark : live ? w.markingShort : "—"}</small>
            </button>
          ))}
        </div>
      )}
      {current && (
        <details className="card pad results-prompt" open={promptOpen} onToggle={(e) => setPromptOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>
            <span className="sim-caps">{w.subject}</span>
            <span className="results-prompt-line">{current.prompt.title || current.prompt.consigne}</span>
            <Icon name="chevronDown" size={18} className="results-prompt-chev" />
          </summary>
          {current.prompt.title && <p className="strong">{current.prompt.title}</p>}
          <p>{current.prompt.consigne}</p>
          {current.prompt.sourceDocuments?.map((d, i) => (
            <div key={i} className="ee-doc results-doc">
              <div className="sim-caps">{w.document(i + 1)}{d.author && d.author.trim().toLowerCase() !== w.document(i + 1).toLowerCase() ? ` — ${d.author}` : ""}</div>
              <p>{d.text}</p>
            </div>
          ))}
        </details>
      )}

      {/* 3. the selected task: its result, and what was said or written */}
      <div className="results-panels">
        <section className="card pad results-panel">
          <h3 className="sim-panel-title">{w.result}</h3>
          {canRevise && revs.length > 0 && (
            <div className="results-versions">
              {[null, ...revs].map((r, i) => (
                <button key={i} type="button" className="chip-btn" aria-pressed={ver === i + 1} disabled={editing} onClick={() => setVerSel((x) => ({ ...x, [tab]: i + 1 }))}>
                  {w.version(i + 1)} · {Math.round(r ? r.score20 : sc.score20!)} / 20{i === 0 ? ` · ${w.atTest}` : ""}
                </button>
              ))}
            </div>
          )}
          {!revealed ? (
            <div className="results-pending">
              {failed.length > 0 ? (
                <>
                  <Trouble
                    message={failures[failed[0]]?.key ? w.troubleKey : w.troubleMark}
                    final={givenUp}
                    retryIn={nextRetryIn}
                    onRetry={onRetry ? retryNow : undefined}
                    onQuit={givenUp ? onExit : undefined}
                    link={failures[failed[0]]?.key ? { label: w.openProfile, href: "/profile#key" } : undefined}
                    lang={lang}
                  />
                  {skill === "writing" && current?.responseText && <div className="sim-acts"><Button size="sm" kind="quiet" onClick={() => void copyText(current.responseText!)}>{copied ? w.copied : w.copy}</Button></div>}
                </>
              ) : !live ? (
                <p className="muted">{w.noMarks}</p>
              ) : (
                <p className="muted"><span className="spin" aria-hidden="true" /> {w.marking}</p>
              )}
              {!single && live && (
                <ul className="results-list">
                  {selected.map((n) => (
                    <li key={n}><Chip tone={stateOf(n) === "done" ? "ok" : stateOf(n) === "failed" ? "amber" : "new"} dot>{w.taskState(n, stateOf(n))}</Chip></li>
                  ))}
                </ul>
              )}
            </div>
          ) : current && sc.score20 != null ? (
            <ResultCard
              compact
              score20={shownSc.score20!}
              nclc={shownSc.nclc}
              rows={[...(shownEv.criteria ?? []).map((c) => ({ name: c.name, score: c.score as number | null })), ...(shownEv.locked ?? []).map((name) => ({ name, score: null }))]}
              tips={shownEv.tips ?? []}
              notes={(shownEv.caps ?? []).map((c) => w.capApplied(c))}
              onReplay={skill === "speaking" ? (answer, atS) => replayMoment(current.turns ?? [], answer, atS) : undefined}
              lang={lang}
            />
          ) : null}
          {current && revealed && sc.score20 != null && produced && (
            <div className="results-mistakes">
              <div className="results-mistakes-head">
                <h3 className="sim-panel-title">{w.mistakesTitle}</h3>
                {proofing[tab] && !rev ? (
                  <span className="small muted"><span className="spin" aria-hidden="true" /> {skill === "speaking" ? w.proofingSpeech : w.proofing}</span>
                ) : complete ? (
                  <Chip tone={corrections.length ? "bad" : "ok"}>{w.mistakesN(corrections.length)}</Chip>
                ) : (
                  <span className="sim-row">
                    <Chip tone="amber">{w.mainOnly}</Chip>
                    {!rev && <Button size="sm" kind="quiet" onClick={() => void proofreadTask(tab)}>{w.proofAll}</Button>}
                  </span>
                )}
              </div>
              {copiedPassages.length > 0 && (
                <div className="sim-band amber">
                  <span><b>{w.copiedTitle}</b> — {copiedPassages.map((c) => `« ${c} »`).join(" ; ")}</span>
                </div>
              )}
              {groups.map((g) => (
                <div key={g.kind}>
                  <div className="sim-caps">{w.kinds[g.kind]} — {w.mistakeCount(g.items.length)}</div>
                  <ul className="mistake-list">
                    {g.items.map((c, i) => (
                      <li key={i}>
                        {c.sub && <span className="mistake-sub">{c.sub}</span>}
                        <span className="mistake-bad">{c.excerpt}</span> → <span className="mistake-good">{c.suggestion}</span>
                        <span className="muted"> — {c.tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {vocab.length > 0 && (
                <div>
                  <div className="sim-caps">{w.vocabTitle}</div>
                  <ul className="mistake-list">
                    {vocab.map((v, i) => (
                      <li key={i}>
                        <span className="mistake-used">{v.used}</span> → <span className="mistake-good">{v.better}</span>
                        {v.example && <span className="muted"> — {v.example}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {error && <Trouble message={error} onRetry={() => setError(null)} lang={lang} />}
        </section>

        <section className="card pad results-panel results-side">
          {skill === "speaking" && current && (current.turns ?? []).length > 0 ? (
            <Dialogue sessionId={sessionId} tasks={[{ taskNo: current.taskNo, turns: current.turns ?? [], score20: revealed ? sc.score20 : null, nclc: revealed ? sc.nclc : null, corrections: revealed ? details[tab]?.corrections ?? [] : [] }]} title={w.transcript} lang={lang} />
          ) : (
            <>
              <div className="sim-panel-title sim-panel-title-row">
                <h3>{skill === "writing" ? w.myText : w.transcript}{editing ? ` · ${w.version(revs.length + 2)} · ${w.notChecked}` : revs.length ? ` · ${w.version(ver)}` : ""}</h3>
                {!editing && shownWords != null && <span className="small muted num">{w.words(shownWords)}</span>}
              </div>
              <div className="sim-scroll">
                {editing ? (
                  <div className="results-revise">
                    <span className="small muted num">{w.words(wordCount(draft!.text))}{range ? ` · ${w.wordsExpected(range.wordsMin, range.wordsMax)}` : ""}</span>
                    <textarea className="sim-paper results-area" value={draft!.text} onChange={(e) => setDraft({ taskNo: tab, text: e.target.value })} spellCheck={false} autoCorrect="off" autoCapitalize="off" autoComplete="off" disabled={checking} aria-label={w.myText} />
                    {reviseError && <Trouble message={w.troubleMark} onRetry={() => void checkDraft()} busy={checking} lang={lang} />}
                    <div className="sim-acts">
                      <Button kind="quiet" disabled={checking} onClick={() => setDraft(null)}>{w.cancel}</Button>
                      <Button kind="primary" busy={checking} disabled={!draft!.text.trim()} onClick={() => void checkDraft()}>{w.check}</Button>
                    </div>
                  </div>
                ) : shownText ? (
                  <>
                    <div className="production">{revealed && corrections.length ? <Highlighted text={shownText} corrections={corrections} corrected={false} lang={lang} /> : shownText}</div>
                    {canRevise && revs.length < MAX_REVISIONS && (
                      <div className="results-retry">
                        <Button onClick={() => { setReviseError(null); setDraft({ taskNo: tab, text: shownText }); }}>{w.retry}</Button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="muted">{current?.elsewhere ? (skill === "writing" ? w.elsewhereText : w.elsewhereSpeech) : revealed && sc.score20 != null ? (skill === "writing" ? w.emptyText : w.emptySpeech) : live ? w.marking : w.noMarks}</p>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="results-exit">
        <Button kind="primary" onClick={onExit}>{w.backToSection}</Button>
      </div>
    </div>
  );
}
