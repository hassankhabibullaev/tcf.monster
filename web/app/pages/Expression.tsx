// The EE / EO section: two tabs. Topics (the default): the real topics, newest month first, one Partie or
// Combinaison at a time (one scrolling row of chips), every task named with its tag and a line on what it asks,
// every topic numbered, each with « S'entraîner sur ce sujet avec Monster AI ». Practice with Monster AI: two
// sections — the simulator (the full exam or a single task, each explained in full, one button « Continuer » that
// opens the setup page) and the past sessions (each can be deleted, so it no longer counts on the dashboard). The
// setup page (`?setup=exam` / `?setup=task`): one card per Tâche (what it asks, its time, its topic — drawn at random
// from the newest month's real topics unless one is chosen), the microphone (speaking), then « Lancer la simulation ».
import { cached } from "../api-cache.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Button, Chip, Empty, SectionHead, Tabs, Sheet, BackLink, MonsterAI, TacheTag } from "../../ui/ui.tsx";
import { linkProps, useLocation, setParams, go } from "../../ui/router.ts";
import { useT, longDate, type Lang } from "../i18n.ts";
import { useMe, useToast } from "../main.tsx";
import { api, ApiError } from "../api.ts";
import { startExpr, type Section as S, type TaskNo, type MicMode, type SessionRow } from "../expr.ts";
import { KeySheet } from "./KeySheet.tsx";
import { keyHere } from "../sim/browser-score.ts";
import { dropSessionWork } from "../sim/work.ts";
import { usePhone } from "../coce/room/hooks.ts";

export type TopicRow = { id: number; month: string; part: number; tache: number | null; position: number; title: string; body: Record<string, any> };
export type TopicsAnswer = { months: { month: string; parts: number; n: number }[]; month: string; rows: TopicRow[] };

const MONTHS = {
  fr: ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
export const monthName = (m: string, lang: Lang) => { const [y, mo] = m.split("-").map(Number); return `${MONTHS[lang][mo - 1]} ${y}`; };

/** the section's own words (FR / EN), kept here so the shared dictionary stays untouched */
const XW = {
  fr: {
    what: "Quoi", full: "Examen complet", one: "Une tâche",
    fullSub: (s: S) => `Tâche 1 → 2 → 3 · ${s === "ee" ? "60" : "12"} min · un seul chronomètre`, oneSub: (s: S) => (s === "ee" ? "10, 15 ou 25 min · à choisir" : "2, 5 min 30 ou 4 min 30 · à choisir"),
    fullWhy: (s: S) => s === "ee"
      ? "Les trois tâches à la suite, dans l'ordre et sur un seul chronomètre de 60 minutes, comme le jour de l'examen : un message, puis un article ou un courriel, puis un point de vue à partir de deux documents. Les textes sont rendus ensemble ; Monster AI corrige chacun et donne une note sur 20 et un niveau NCLC pour l'ensemble."
      : "Les trois tâches à la suite avec l'examinatrice, 12 minutes environ, comme le jour de l'examen : l'entretien dirigé (2 min), l'exercice en interaction après 2 minutes de préparation (3 min 30), puis le point de vue (4 min 30). Monster AI mène l'entretien, puis donne une note sur 20 et un niveau NCLC pour l'ensemble.",
    oneWhy: (s: S) => s === "ee"
      ? "Une seule tâche, à choisir à la page suivante, avec son propre temps : 10 minutes pour le message, 15 pour l'article ou le courriel, 25 pour le point de vue. La note et les remarques portent sur ce texte seul — pour travailler un type de texte à la fois."
      : "Une seule tâche, à choisir à la page suivante, avec son propre temps : 2 minutes d'entretien, 5 min 30 d'exercice en interaction (préparation comprise) ou 4 min 30 de point de vue. La note et les remarques portent sur cette tâche seule.",
    simLead: (s: S) => (s === "ee" ? "Le simulateur de l'épreuve écrite : les sujets réels, le temps du vrai examen, et la correction de chaque texte, faute par faute." : "Le simulateur de l'épreuve orale : une examinatrice qui vous parle, les sujets réels, le temps du vrai examen, et la correction de chaque réponse."),
    pastSessions: "Séances passées", continueBtn: "Continuer",
    leadExam: "Chaque Tâche reçoit un sujet tiré au hasard parmi les vrais sujets du dernier mois. Choisissez-en un vous-même là où vous le voulez, puis lancez.",
    leadTask: (s: S) => `Choisissez la Tâche${s === "eo" ? ", le micro" : ""} et, si vous le voulez, son sujet ; sinon il est tiré au hasard parmi les vrais sujets du dernier mois.`,
    taskName: { ee: { 1: "Message", 2: "Article ou courriel", 3: "Point de vue" }, eo: { 1: "Entretien dirigé", 2: "Exercice en interaction", 3: "Point de vue" } } as Record<S, Record<TaskNo, string>>,
    taskWhat: {
      ee: { 1: "Un court message à quelqu'un : décrire, raconter, inviter, demander. 60 à 120 mots.", 2: "Un article, un courriel ou un témoignage pour raconter une expérience. 120 à 150 mots.", 3: "Deux courts documents sur un même thème : vous en rendez compte et donnez votre avis. 120 à 180 mots." },
      eo: { 1: "L'examinatrice vous pose des questions sur vous : votre vie, vos études, vos projets. Sans préparation.", 2: "Vous jouez une situation avec l'examinatrice pour obtenir une information ou un service. 2 minutes de préparation.", 3: "Vous donnez votre point de vue sur une question de société et le défendez. Sans préparation." },
    } as Record<S, Record<TaskNo, string>>,
    taskShort: { ee: { 1: "60–120 mots", 2: "120–150 mots", 3: "120–180 mots" }, eo: { 1: "2 min · pas de sujet, elle vous interroge", 2: "5 min 30 · 2 min de préparation", 3: "4 min 30 · sans préparation" } } as Record<S, Record<TaskNo, string>>,
    fullTile: "1·2·3", oneTile: "1", fullSubShort: (s: S) => `${s === "ee" ? "60" : "12"} min · un chrono · note /20`, oneSubShort: (s: S) => (s === "ee" ? "10, 15 ou 25 min · au choix" : "2, 5 min 30 ou 4 min 30 · au choix"),
    fullLine: "Les trois tâches à la suite, comme le jour J", oneLine: "Une seule, avec son propre temps", moreWhy: "En savoir plus",
    practiseShort: "S'entraîner", chooseShort: "Choisir", changeTopic: "Changer", randomShort: "Sujet au hasard",
    mic: "Microphone", randomTopic: "Sujet tiré au hasard au lancement", noTopicT1: "Pas de sujet : l'examinatrice vous interroge sur vous.", chooseTopic: "Choisir un sujet", randomBtn: "Au hasard", pickTitle: (n: number) => `Sujet de la Tâche ${n}`,
    startSim: "Lancer la simulation", minutes: (m: number) => `${m % 1 ? m.toFixed(1).replace(".", ",") : m} min`,
    practiseThis: "S'entraîner sur ce sujet avec", partie: (n: number) => `Partie ${n}`, combinaison: (n: number) => `Combinaison ${n}`, topicNo: (n: number) => `n° ${n}`,
    deleteOne: "Supprimer cette séance", deleteTitle: "Supprimer cette séance ?", deleteBody: "Elle disparaît de votre historique et de votre tableau de bord. On ne peut pas revenir en arrière.",
  },
  en: {
    what: "What", full: "Full exam", one: "Single task",
    fullSub: (s: S) => `Tâche 1 → 2 → 3 · ${s === "ee" ? "60" : "12"} min · one clock`, oneSub: (s: S) => (s === "ee" ? "10, 15 or 25 min · your pick" : "2, 5½ or 4½ min · your pick"),
    fullWhy: (s: S) => s === "ee"
      ? "The three tasks one after the other, in order and on a single 60-minute clock, as on exam day: a message, then an article or an e-mail, then a point of view built on two documents. The texts are handed in together; Monster AI marks each one and gives a mark out of 20 and an NCLC level for the whole."
      : "The three tasks one after the other with the examiner, about 12 minutes, as on exam day: the guided interview (2 min), the interaction exercise after 2 minutes of preparation (3 min 30), then the point of view (4 min 30). Monster AI leads the interview, then gives a mark out of 20 and an NCLC level for the whole.",
    oneWhy: (s: S) => s === "ee"
      ? "One task only, picked on the next page, with its own time: 10 minutes for the message, 15 for the article or e-mail, 25 for the point of view. The mark and the remarks are for that text alone — the way to work on one kind of text at a time."
      : "One task only, picked on the next page, with its own time: a 2-minute interview, 5 min 30 of interaction exercise (preparation included) or 4 min 30 of point of view. The mark and the remarks are for that task alone.",
    simLead: (s: S) => (s === "ee" ? "The writing test's simulator: the real topics, the real exam's time, and every text marked mistake by mistake." : "The speaking test's simulator: an examiner who talks with you, the real topics, the real exam's time, and every answer marked."),
    pastSessions: "Past sessions", continueBtn: "Continue",
    leadExam: "Each Tâche gets a topic drawn at random from the newest month's real topics. Choose one yourself where you like, then start.",
    leadTask: (s: S) => `Pick the Tâche${s === "eo" ? ", the microphone" : ""} and, if you like, its topic; otherwise it is drawn at random from the newest month's real topics.`,
    taskName: { ee: { 1: "Message", 2: "Article or e-mail", 3: "Point of view" }, eo: { 1: "Guided interview", 2: "Interaction exercise", 3: "Point of view" } },
    taskWhat: {
      ee: { 1: "A short message to someone: describe, tell, invite, ask. 60 to 120 words.", 2: "An article, an e-mail or a testimony telling an experience. 120 to 150 words.", 3: "Two short documents on one theme: you sum them up and give your own view. 120 to 180 words." },
      eo: { 1: "The examiner asks about you: your life, your studies, your plans. No preparation.", 2: "You play a situation with the examiner to get information or a service. 2 minutes of preparation.", 3: "You give your point of view on a question of society and defend it. No preparation." },
    },
    taskShort: { ee: { 1: "60–120 words", 2: "120–150 words", 3: "120–180 words" }, eo: { 1: "2 min · no topic, she asks about you", 2: "5 min 30 · 2 min of preparation", 3: "4 min 30 · no preparation" } },
    fullTile: "1·2·3", oneTile: "1", fullSubShort: (s: S) => `${s === "ee" ? "60" : "12"} min · one clock · mark /20`, oneSubShort: (s: S) => (s === "ee" ? "10, 15 or 25 min · your pick" : "2, 5½ or 4½ min · your pick"),
    fullLine: "The three tasks in a row, as on the day", oneLine: "One only, with its own time", moreWhy: "More",
    practiseShort: "Practise", chooseShort: "Choose", changeTopic: "Change", randomShort: "Random topic",
    mic: "Microphone", randomTopic: "Topic drawn at random at the start", noTopicT1: "No topic: the examiner asks about you.", chooseTopic: "Choose a topic", randomBtn: "Random", pickTitle: (n: number) => `Topic of Tâche ${n}`,
    startSim: "Start the simulation", minutes: (m: number) => `${m} min`,
    practiseThis: "Practise this topic with", partie: (n: number) => `Partie ${n}`, combinaison: (n: number) => `Combinaison ${n}`, topicNo: (n: number) => `no. ${n}`,
    deleteOne: "Delete this session", deleteTitle: "Delete this session?", deleteBody: "It disappears from your history and your dashboard. This cannot be undone.",
  },
};

/** one hook for every Start: the key sheet opens when there is no key, and the start goes on after */
export function useStart(s: S) {
  const say = useToast();
  const { t } = useT();
  const [keyOpen, setKeyOpen] = useState(false);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  async function start(o: { kind: "practice" | "exam"; taches: TaskNo[]; topicIds?: Partial<Record<TaskNo, number>>; mode?: MicMode | null }) {
    // the key is on this device or nowhere: without it the sheet opens, and the start goes on after
    if (!keyHere()) { setRetry(() => () => start(o)); setKeyOpen(true); return; }
    setBusy(true);
    try {
      const started = await startExpr({ section: s, ...o });
      go(`/${s}/room/${started.sessionId}`);
    } catch (e) {
      const d = e instanceof ApiError ? e.data : {};
      if (d.error === "hold") say(t.hold, "bad");
      else if (d.error === "mock_running") say(t.mockRunning, "bad");
      else say(d.error === "network" ? t.networkError : t.serverError, "bad");
    } finally { setBusy(false); }
  }
  const sheet = <KeySheet open={keyOpen} onClose={() => setKeyOpen(false)} onSaved={() => { const r = retry; setRetry(null); r?.(); }} />;
  return { start, busy, sheet };
}

export function Expression({ s, tab }: { s: S; tab: "practice" | "topics" }) {
  const { t, lang } = useT();
  const { params } = useLocation();
  const setup = params.get("setup");
  // the phone: the topics' search folds behind one round button in the title row (the laptop shows the field itself)
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { setSearchOpen(false); }, [s, tab]);
  if (tab === "practice" && (setup === "exam" || setup === "task")) return <div className="section-page"><Setup s={s} way={setup} /></div>;
  return (
    <div className="section-page" data-search={searchOpen || undefined}>
      <SectionHead s={s} name={t.sectionNames[s]} right={tab === "topics" ? (
        <button type="button" className="cp-search-btn mob-only" aria-label={t.searchTopics} aria-pressed={searchOpen} onClick={() => setSearchOpen((o) => !o)}><Icon name="search" size={16} /></button>
      ) : undefined} />
      <Tabs label={t.sectionNames[s]} items={[
        { label: t.tabTopics, current: tab === "topics", props: linkProps(`/${s}`) },
        { label: <><Icon name="spark" size={14} className="icon-fill x-spark" />{lang === "fr" ? <>{t.tabSimulator}&nbsp;<MonsterAI /></> : <><MonsterAI />&nbsp;{t.tabSimulator}</>}</>, current: tab === "practice", props: linkProps(`/${s}/practice`) },
      ]} />
      {tab === "practice" ? <Practice s={s} /> : <Topics s={s} />}
    </div>
  );
}

/** the one card shown while there is no key: the whole page says what opens it */
export function Locked() {
  const { t } = useT();
  return (
    <div className="locked-note" role="status">
      <span className="locked-icon"><Icon name="lock" size={30} /></span>
      <p className="locked-line"><MonsterAI /> {t.lockedUntilKey}</p>
      <a className="btn primary md" {...linkProps("/profile#key")}>{t.seeInstructions}</a>
    </div>
  );
}

/* ---------- the practice tab: the simulator (two ways, explained, one button), then the past sessions ---------- */

const WRITING_MIN: Record<TaskNo, number> = { 1: 10, 2: 15, 3: 25 };
const SPEAKING_MIN: Record<TaskNo, number> = { 1: 2, 2: 5.5, 3: 4.5 };

/** the text of a topic row for a given Tâche (EO rows are one Tâche each; EE rows hold the three) */
function topicText(s: S, r: TopicRow, n: TaskNo): string | null {
  if (s === "eo") return r.tache === n ? r.title : null;
  const v = n === 3 ? r.body?.tache3?.title : r.body?.[`tache${n}`];
  return typeof v === "string" ? v : null;
}

function Practice({ s }: { s: S }) {
  const { t, lang } = useT();
  const w = XW[lang];
  const { me } = useMe();
  const say = useToast();
  const [way, setWay] = useState<null | "exam" | "task">(null);
  // the phone: the full explanation of a way folds behind one « ⌄ » line
  const [opened, setOpened] = useState<null | "exam" | "task">(null);

  // the past sessions
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [all, setAll] = useState(false);
  const [del, setDel] = useState<SessionRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { cached<{ sessions: SessionRow[] }>("/expr/sessions").then((d) => setSessions(d.sessions.filter((x) => x.section === s))).catch(() => setSessions([])); }, [s]);
  const shown = all ? sessions ?? [] : (sessions ?? []).slice(0, 6);
  /** a session leaves the history and the dashboard for good: one that is over is forgotten (?forget=1, marks and
   *  all); one still running is dropped the plain way (erased, or closed as abandoned when a task was handed in) */
  async function deleteSession() {
    if (!del) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/expr/session/${del.id}${del.status === "in_progress" ? "" : "?forget=1"}`, { method: "DELETE", credentials: "same-origin" });
      if (!r.ok) throw new Error(String(r.status));
      // what this device kept of it goes with it (a session closed as abandoned keeps its marks, and its work here)
      if (del.status !== "in_progress") void dropSessionWork(del.id);
      setSessions((list) => (list ?? []).filter((x) => x.id !== del.id));
      setDel(null);
    } catch { say(t.networkError, "bad"); }
    finally { setDeleting(false); }
  }

  // no key on this device: the simulator is locked, the past sessions (their marks) stay readable
  return (
    <div className="x-stack">
      {me?.gemini_status === "none" ? <Locked /> : <section className="card pad setup-block x-sim">
        <div className="card-head"><h2 className="x-sim-title"><MonsterAI powered lang={lang} /></h2></div>
        <p className="x-lead">{w.simLead(s)}</p>
        <div className="picks x-ways" role="radiogroup" aria-label={w.what}>
          {(["exam", "task"] as const).map((k) => (
            <div key={k} className="pick x-way" role="radio" aria-checked={way === k} aria-label={k === "exam" ? w.full : w.one} tabIndex={0} data-open={opened === k || undefined} onClick={() => setWay(k)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setWay(k); } }}>
              <span className="x-way-tile mob-only num" aria-hidden="true">{k === "exam" ? w.fullTile : w.oneTile}</span>
              <span className="x-way-text">
                <b>{k === "exam" ? w.full : w.one}</b>
                <span className="desk-only">{k === "exam" ? w.fullSub(s) : w.oneSub(s)}</span>
                <span className="mob-only x-way-sub">{k === "exam" ? w.fullSubShort(s) : w.oneSubShort(s)}</span>
                <button type="button" className="x-way-more mob-only" aria-expanded={opened === k} onClick={(e) => { e.stopPropagation(); setOpened((o) => (o === k ? null : k)); }}>{k === "exam" ? w.fullLine : w.oneLine}<Icon name="chevronDown" size={14} /></button>
                <p>{k === "exam" ? w.fullWhy(s) : w.oneWhy(s)}</p>
              </span>
              <span className="x-way-check mob-only" aria-hidden="true">{way === k && <Icon name="check" size={13} />}</span>
            </div>
          ))}
        </div>
        <div className="x-choose">
          <Button kind="primary" disabled={!way} onClick={() => go(`/${s}/practice?setup=${way}`)}>{w.continueBtn}<Icon name="chevronRight" size={18} className="mob-only" /></Button>
        </div>
      </section>}

      <section className="history">
        <div className="card-head"><h2>{w.pastSessions}</h2>{sessions && <span className="muted">{sessions.length}</span>}</div>
        {sessions === null ? <div className="skeleton" /> : !sessions.length ? <Empty icon={s} title={t.sessionsEmpty} /> : (
          <ul className="hist">
            {shown.map((x) => (
              <li key={x.id} className="hist-item">
                <a className="card hist-row" {...linkProps(x.status === "in_progress" ? `/${s}/room/${x.id}` : `/${s}/result/${x.id}`)}>
                  <span className="hist-main">
                    <strong>{x.kind === "exam" ? w.full : x.taches.map((n) => t.tache(n)).join(" · ")}</strong>
                    <span className="muted small">{longDate(x.startedAt.slice(0, 10), lang)}{s === "eo" && x.mode ? ` · ${x.mode === "live" ? t.live : t.ptt}` : ""}</span>
                  </span>
                  {x.status === "done" && x.score != null ? <span className="hist-score num">{t.scoreOf20(Math.round(x.score))}</span> : <Chip tone={x.status === "abandoned" ? "bad" : "amber"}>{x.status === "abandoned" ? t.abandoned : t.inProgress}</Chip>}
                  <Icon name="arrowRight" size={16} className="muted" />
                </a>
                <button type="button" className="hist-del" aria-label={w.deleteOne} title={w.deleteOne} onClick={() => setDel(x)}><Icon name="x" size={16} /></button>
              </li>
            ))}
          </ul>
        )}
        {sessions && sessions.length > 6 && !all && <button type="button" className="linklike" onClick={() => setAll(true)}>{t.allSessions(sessions.length)}</button>}
      </section>

      <Sheet open={del !== null} title={w.deleteTitle} onClose={() => setDel(null)} actions={<>
        <Button onClick={() => setDel(null)}>{t.cancel}</Button>
        <Button kind="danger" busy={deleting} onClick={() => void deleteSession()}>{w.deleteOne}</Button>
      </>}><p>{w.deleteBody}</p></Sheet>
    </div>
  );
}

/* ---------- the setup page: one card per Tâche (what it asks, its time, its topic), the microphone (speaking), Start ---------- */

function Setup({ s, way }: { s: S; way: "exam" | "task" }) {
  const { t, lang } = useT();
  const w = XW[lang];
  const { me, update } = useMe();
  const { start, busy, sheet } = useStart(s);

  const [task, setTask] = useState<TaskNo | null>(null);
  const taches = useMemo<TaskNo[]>(() => (way === "exam" ? [1, 2, 3] : task ? [task] : []), [way, task]);
  const ready = taches.length > 0;
  // the three writing tasks together keep the official 60 min (one clock); otherwise the tasks' own times add up
  const mins = s === "ee" && taches.length === 3 ? 60 : taches.reduce((a, n) => a + (s === "ee" ? WRITING_MIN[n] : SPEAKING_MIN[n]), 0);

  const savedMode = (me?.settings?.eo?.mode === "ptt" ? "ptt" : "live") as MicMode;
  const [mode, setMode] = useState<MicMode>(savedMode);
  const pickMode = (m: MicMode) => { setMode(m); void update({ settings: { eo: { ...(me?.settings?.eo ?? {}), mode: m } } }); };

  // the topics: random from the newest month unless one is chosen in the picker
  const [picked, setPicked] = useState<Partial<Record<TaskNo, { id: number; text: string }>>>({});
  const [pickFor, setPickFor] = useState<TaskNo | null>(null);
  const [pMonth, setPMonth] = useState("");
  const [pq, setPq] = useState("");
  const [pdata, setPdata] = useState<TopicsAnswer | null>(null);
  useEffect(() => {
    if (pickFor === null) return;
    let live = true;
    const qs = new URLSearchParams({ section: s }); if (pMonth) qs.set("month", pMonth); if (pq.trim()) qs.set("q", pq.trim());
    const id = setTimeout(() => { (pq.trim() ? api<TopicsAnswer>(`/topics?${qs}`) : cached<TopicsAnswer>(`/topics?${qs}`, 3600_000)).then((d) => live && setPdata(d)).catch(() => live && setPdata({ months: [], month: "", rows: [] })); }, pq ? 250 : 0);
    return () => { live = false; clearTimeout(id); };
  }, [pickFor, s, pMonth, pq]);
  const options = useMemo(() => (pickFor === null || !pdata ? [] : pdata.rows.map((r) => ({ id: r.id, month: r.month, part: r.part, text: topicText(s, r, pickFor) })).filter((x): x is { id: number; month: string; part: number; text: string } => !!x.text)), [pdata, pickFor, s]);
  const topicIds = Object.fromEntries(Object.entries(picked).filter(([k]) => taches.includes(Number(k) as TaskNo)).map(([k, v]) => [k, v!.id])) as Partial<Record<TaskNo, number>>;
  const openPicker = (n: TaskNo) => { setPickFor(n); setPMonth(""); setPq(""); setPdata(null); };
  /** the phone shows no topic row on Tâche 1 of the speaking test (its line already says there is no topic) */
  const phoneLike = usePhone();

  if (me?.gemini_status === "none") return <Locked />;
  return (
    <div className="setup-page">
      <div className="setup-top">
        <BackLink to={`/${s}/practice`} label={t.tabPractice} />
        <div className="setup-head">
          <h1 className="setup-title">{way === "exam" ? w.full : w.one}</h1>
          <p className="setup-sub mob-only num"><b>{s.toUpperCase()}</b> · <MonsterAI /> · {way === "exam" || task ? w.minutes(mins) : "—"}</p>
          <p className="setup-brand desk-only"><MonsterAI powered lang={lang} /></p>
          <p className="x-lead desk-only">{way === "exam" ? w.leadExam : w.leadTask(s)}</p>
        </div>
      </div>

      <div className="setup-tasks" role={way === "task" ? "radiogroup" : undefined} aria-label={way === "task" ? w.one : undefined}>
        {([1, 2, 3] as TaskNo[]).map((n) => {
          const on = way === "exam" || task === n;
          const p = picked[n];
          const noTopic = s === "eo" && n === 1;
          const body = (
            <>
              <header className="setup-task-head">
                <TacheTag n={n} />
                <span className="setup-task-name">
                  <b>{w.taskName[s][n]}</b>
                  <span className="setup-task-short mob-only">{w.taskShort[s][n]}</span>
                </span>
                <span className="muted small num desk-only">{w.minutes(s === "ee" ? WRITING_MIN[n] : SPEAKING_MIN[n])}</span>
              </header>
              <p className="setup-task-what desk-only">{w.taskWhat[s][n]}</p>
              {on && !(noTopic && phoneLike) && (
                <div className="setup-task-topic" data-chosen={!!p || undefined}>
                  <span className="setup-task-text">{noTopic ? <span className="muted">{w.noTopicT1}</span> : p ? p.text : <span className="muted"><span className="desk-only">{w.randomTopic}</span><span className="mob-only setup-random"><Icon name="shuffle" size={14} />{w.randomShort}</span></span>}</span>
                  {!noTopic && (
                    <span className="setup-task-acts">
                      {p && <Button size="sm" kind="quiet" className="setup-shuffle" aria-label={w.randomBtn} onClick={(e) => { e.stopPropagation(); setPicked((x) => { const y = { ...x }; delete y[n]; return y; }); }}><span className="desk-only">{w.randomBtn}</span><Icon name="shuffle" size={14} className="mob-only" /></Button>}
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); openPicker(n); }}><span className="desk-only">{w.chooseTopic}</span><span className="mob-only">{p ? w.changeTopic : <>{w.chooseShort}<Icon name="chevronRight" size={14} /></>}</span></Button>
                    </span>
                  )}
                </div>
              )}
            </>
          );
          return way === "task" ? (
            <div key={n} className="card setup-task" role="radio" aria-checked={on} aria-label={`Tâche ${n} · ${w.taskName[s][n]}`} tabIndex={0} onClick={() => setTask(n)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTask(n); } }}>{body}</div>
          ) : (
            <div key={n} className="card setup-task" data-on="">{body}</div>
          );
        })}
      </div>

      {s === "eo" && (
        <section className="card pad setup-block setup-mic">
          <h2 className="desk-only">{w.mic}</h2>
          <div className="picks setup-mic-picks" role="group" aria-label={w.mic}>
            <button type="button" className="pick" aria-pressed={mode === "live"} onClick={() => pickMode("live")}><b><Icon name="eo" size={14} className="mob-only" />{t.live}</b><span>{t.liveSub}</span></button>
            <button type="button" className="pick" aria-pressed={mode === "ptt"} onClick={() => pickMode("ptt")}><b>{t.ptt}</b><span>{t.pttSub}</span></button>
          </div>
        </section>
      )}

      <div className="setup-start">
        <Button kind="primary" busy={busy} disabled={!ready} onClick={() => start({ kind: way === "exam" ? "exam" : "practice", taches, topicIds, mode: s === "eo" ? mode : null })}>{w.startSim}</Button>
        {ready && <span className="muted small desk-only">{taches.map((n) => t.tache(n)).join(" → ")} · {w.minutes(mins)}</span>}
      </div>

      <Sheet open={pickFor !== null} title={pickFor ? w.pickTitle(pickFor) : ""} onClose={() => setPickFor(null)} actions={<Button onClick={() => setPickFor(null)}>{t.cancel}</Button>}>
        <div className="setup-pick-tools">
          <label className="select" aria-label={t.month}>
            <select value={pdata?.month ?? pMonth} onChange={(e) => setPMonth(e.target.value)} disabled={!!pq.trim()}>
              {(pdata?.months ?? []).map((m) => <option key={m.month} value={m.month}>{monthName(m.month, lang)}</option>)}
            </select>
          </label>
          <label className="search">
            <Icon name="search" size={18} />
            <input type="search" value={pq} onChange={(e) => setPq(e.target.value)} placeholder={t.searchTopics} aria-label={t.searchTopics} />
          </label>
        </div>
        {!pdata ? <div className="skeleton" style={{ height: 160 }} /> : !options.length ? <p className="muted small">{t.noTopics}</p> : (
          <ul className="setup-pick-list">
            {options.map((o, i) => (
              <li key={`${o.id}-${o.part}`}>
                <button type="button" className="setup-pick-row" onClick={() => { setPicked((x) => ({ ...x, [pickFor!]: { id: o.id, text: o.text } })); setPickFor(null); }}>
                  <span className="setup-pick-tags"><span className="topic-no num">{i + 1}</span><span className="topic-tag">{s === "eo" ? w.partie(o.part) : w.combinaison(o.part)}{pq.trim() ? ` · ${monthName(o.month, lang)}` : ""}</span></span>
                  <span>{o.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      {sheet}
    </div>
  );
}

/* ---------- the topics ---------- */

/** the Partie / Combinaison chips on one row that scrolls sideways; a fade at the right says there is more */
function PartChips({ parts, part, headOf, label }: { parts: number[]; part: number; headOf: (p: number) => string; label: string }) {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<"" | "right" | "left" | "both">("");
  const measure = () => {
    const el = row.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setMore(left && right ? "both" : right ? "right" : left ? "left" : "");
  };
  useEffect(() => {
    measure();
    const el = row.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [parts.length]);
  return (
    <div className="x-parts-wrap" data-more={more || undefined}>
      <div ref={row} className="chips x-parts" role="group" aria-label={label} onScroll={measure}>
        {parts.map((p) => <button key={p} type="button" className="chip-btn" aria-pressed={p === part} onClick={() => setParams({ part: String(p) })}>{headOf(p)}</button>)}
      </div>
    </div>
  );
}

function Topics({ s }: { s: S }) {
  const { t, lang } = useT();
  const w = XW[lang];
  const { me } = useMe();
  const { params } = useLocation();
  const { start, busy, sheet } = useStart(s);
  const month = params.get("month") ?? "";
  const [q, setQ] = useState(params.get("q") ?? "");
  useEffect(() => { const id = setTimeout(() => setParams({ q: q.trim() || null }), 250); return () => clearTimeout(id); }, [q]);
  const query = params.get("q") ?? "";
  const [data, setData] = useState<TopicsAnswer | null>(null);
  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams({ section: s }); if (month) qs.set("month", month); if (query) qs.set("q", query);
    (query ? api<TopicsAnswer>(`/topics?${qs}`) : cached<TopicsAnswer>(`/topics?${qs}`, 3600_000)).then((d) => live && setData(d)).catch(() => live && setData({ months: [], month: "", rows: [] }));
    return () => { live = false; };
  }, [s, month, query]);
  const parts = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.part))].sort((a, b) => a - b), [data]);
  const part = Number(params.get("part")) || parts[0] || 0;
  const mode = (me?.settings?.eo?.mode === "ptt" ? "ptt" : "live") as MicMode;

  if (!data) return <div className="skeleton tall" />;
  if (!data.months.length) return <Empty icon={s} title={t.noTopics} />;
  const rows = data.rows;
  const practise = (r: TopicRow, n: TaskNo) => start({ kind: "practice", taches: [n], topicIds: { [n]: r.id }, mode: s === "eo" ? mode : null });
  const headOf = (p: number) => (s === "eo" ? w.partie(p) : w.combinaison(p));
  const practiseBtn = (r: TopicRow, n: TaskNo) => <Button size="sm" busy={busy} className="topic-go" onClick={() => practise(r, n)}><Icon name="spark" size={14} className="mob-only icon-fill x-spark" /><span className="desk-only">{w.practiseThis} <MonsterAI /></span><span className="mob-only">{w.practiseShort}</span></Button>;
  /** the task's tag, its name and what it asks: the same line in both tests (on phones the words range instead) */
  const taskHead = (n: TaskNo) => (
    <div className="task-head">
      <TacheTag n={n} /><b>{w.taskName[s][n]}</b><span className="muted small desk-only">{w.taskWhat[s][n]}</span><span className="muted small mob-only task-short">{w.taskShort[s][n]}</span>
    </div>
  );

  /** EO: one Partie's topics by Tâche, numbered; EE: one Combinaison's three tâches */
  const Part = ({ list, head }: { list: TopicRow[]; head: string }) => (
    <section className="card pad part">
      <div className="card-head"><h2>{head}</h2></div>
      {s === "eo" ? (
        [2, 3].map((n) => {
          const of = list.filter((r) => r.tache === n);
          return of.length ? (
            <div key={n} className="tache-block">
              {taskHead(n as TaskNo)}
              <ol className="topic-list">{of.map((r, i) => <li key={r.id}><span className="topic-no num">{i + 1}</span><p>{r.title}</p>{practiseBtn(r, n as TaskNo)}</li>)}</ol>
            </div>
          ) : null;
        })
      ) : (
        list.map((r) => (
          <div key={r.id} className="tache-blocks">
            {([1, 2, 3] as TaskNo[]).map((n) => {
              const text = n === 3 ? r.body.tache3?.title : r.body[`tache${n}`];
              return (
                <div key={n} className="tache-block">
                  {taskHead(n)}
                  <ol className="topic-list"><li><p>{text}</p>{practiseBtn(r, n)}</li></ol>
                </div>
              );
            })}
          </div>
        ))
      )}
    </section>
  );

  return (
    <>
      <div className="toolbar">
        <label className="select" aria-label={t.month}>
          <select value={data.month} onChange={(e) => setParams({ month: e.target.value, part: null })} disabled={!!query}>
            {data.months.map((m) => <option key={m.month} value={m.month}>{monthName(m.month, lang)}</option>)}
          </select>
        </label>
        {!query && parts.length > 1 && <PartChips parts={parts} part={part} headOf={headOf} label={s === "eo" ? t.part : t.combination} />}
        <label className="search toolbar-search">
          <Icon name="search" size={18} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchTopics} aria-label={t.searchTopics} />
        </label>
      </div>
      {!rows.length ? <Empty icon="search" title={t.noTopics} /> : query ? (
        // every month: grouped by month and part
        [...new Map(rows.map((r) => [`${r.month}/${r.part}`, r])).keys()].map((k) => {
          const list = rows.filter((r) => `${r.month}/${r.part}` === k);
          return <Part key={k} list={list} head={`${headOf(list[0].part)} · ${monthName(list[0].month, lang)}`} />;
        })
      ) : (
        <Part list={rows.filter((r) => r.part === part)} head={`${headOf(part)} · ${monthName(data.month, lang)}`} />
      )}
      {sheet}
    </>
  );
}
