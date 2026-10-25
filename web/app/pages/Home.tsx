// Home (the « scoreboard » the owner chose): one greeting sentence above everything — the name, the days left and the
// goal in terracotta —, then the twelve weeks with the facts as tiles, then one card per test with the current level,
// how it stands against the goal, a small trend line and one line of facts (a test never touched shows the same card
// with dashes and says so), then the donation card. "Current" and "typical" are medians, so one odd day does not
// move them.
import { peek, cached, isFresh } from "../api-cache.ts";
import { flush, pendingCount } from "../coce/store.ts";
import { useEffect, useState } from "react";
import { Mark, Icon, Chip, Info, Button, type Section } from "../../ui/ui.tsx";
import { linkProps } from "../../ui/router.ts";
import { useT, longDate, type Lang } from "../i18n.ts";
import { useMe } from "../main.tsx";
import { api, daysTo } from "../api.ts";
import type { Stats, SectionStat } from "../../../worker/stats.ts";
import { DonateCard } from "./Donate.tsx";
import { ChatCard } from "./ChatCard.tsx";
import { MockCard } from "../mock/MockCard.tsx";
import { workedLabel } from "./worked.ts";
import "./home.css";

const SECTIONS: Section[] = ["co", "ce", "ee", "eo"];

/** the dashboard's own words (FR / EN), kept here so the shared dictionary stays untouched */
const HW = {
  fr: {
    hello: "Bonjour", bang: "\u00a0!", days1: "Il vous reste", days: (n: number): string => (n === 1 ? "1 jour" : `${n} jours`), today: "L'examen est aujourd'hui",
    goal1: "pour atteindre votre objectif", goalOnly: "Votre objectif est le", goalNone: "Choisir un objectif", dateNone1: ", et vous n'êtes", dateNone: "pas encore inscrit·e", datePast1: ", et la date de votre examen", datePast: "est passée",
    avgLevel: "Niveau moyen actuel", avgInfo: "La médiane de vos résultats dans cette épreuve : examens et séances. En dessous de 4, l'échelle officielle s'arrête ; nous affichons 3.",
    onTarget: "objectif atteint", below: (n: number): string => (n === 1 ? "1 niveau sous l'objectif" : `${n} niveaux sous l'objectif`), noExam: "pas encore de résultat",
    notYet: "Vous n'avez pas encore travaillé cette épreuve.",
    exams: (n: number): string => (n === 1 ? "examen" : "examens"), sessions: (n: number): string => (n === 1 ? "séance" : "séances"), seen: (n: number): string => (n === 1 ? "question vue" : "questions vues"),
    fSessions: (n: number): string => (n === 1 ? "séance" : "séances"), fMinutes: "min de travail", fHours: (h: number): string => (h > 1 ? "heures de travail" : "heure de travail"), fDays: (n: number): string => (n === 1 ? "jour de pratique" : "jours de pratique"), fStreak: "jours d'affilée",
    goalWord: "objectif", dayWord: "jours", dayWord1: "jour", thisWeek: "cette semaine", sevenDays: "Vos sept derniers jours", inMinutes: "minutes",
    mockPassed: (n: number): string => (n === 1 ? "1 passé" : `${n} passés`), mockLast: "le dernier",
    failed: "Vos chiffres ne sont pas arrivés.", retry: "Réessayer",
  },
  en: {
    hello: "Bonjour", bang: "!", days1: "You have", days: (n: number): string => (n === 1 ? "1 day" : `${n} days`), today: "Your exam is today",
    goal1: "left to reach your goal of", goalOnly: "Your goal is", goalNone: "Choose a goal", dateNone1: ", and you", dateNone: "haven't registered yet", datePast1: ", and your exam date", datePast: "has passed",
    avgLevel: "Current average level", avgInfo: "The median of your results in this test: exams and sessions. Below 4 the official scale stops; we show 3.",
    onTarget: "on target", below: (n: number): string => (n === 1 ? "1 level below target" : `${n} levels below target`), noExam: "no result yet",
    notYet: "You haven't practised this test yet.",
    exams: (n: number): string => (n === 1 ? "exam" : "exams"), sessions: (n: number): string => (n === 1 ? "session" : "sessions"), seen: (n: number): string => (n === 1 ? "question seen" : "questions seen"),
    fSessions: (n: number): string => (n === 1 ? "session" : "sessions"), fMinutes: "min of work", fHours: (h: number): string => (h > 1 ? "hours of work" : "hour of work"), fDays: (n: number): string => (n === 1 ? "day of practice" : "days of practice"), fStreak: "days in a row",
    goalWord: "goal", dayWord: "days", dayWord1: "day", thisWeek: "this week", sevenDays: "Your last seven days", inMinutes: "minutes",
    mockPassed: (n: number): string => (n === 1 ? "1 taken" : `${n} taken`), mockLast: "the last",
    failed: "Your numbers did not arrive.", retry: "Retry",
  },
};
const useHW = () => HW[useT().lang];

/** below NCLC 4 the official table stops: such results count as 3 (worker/stats.ts) and are shown as NCLC 3 */

/* ---------- the greeting ---------- */

function Hello() {
  const h = useHW();
  const { me } = useMe();
  const n = daysTo(me?.exam_date ?? null);
  const target = me?.target_nclc ?? null;
  const hasDate = n !== null && n >= 0;
  const { lang } = useT();
  return (
    <>
      <p className="home-hello desk-only" role="heading" aria-level={1}>
        <span className="home-hello-hi">{h.hello} {me?.name}{h.bang}</span>{" "}
        {hasDate && target ? <>{n === 0 ? h.today : <>{h.days1} <b>{h.days(n!)}</b></>} {h.goal1} <b>NCLC {target}</b></>
          : hasDate ? <>{n === 0 ? h.today : <>{h.days1} <b>{h.days(n!)}</b></>} <a className="home-hello-link" {...linkProps("/profile")}>{h.goalNone}</a></>
          : target ? <>{h.goalOnly} <b>NCLC {target}</b>{n === null ? h.dateNone1 : h.datePast1} <a className="home-hello-date" {...linkProps("/profile")}>{n === null ? h.dateNone : h.datePast}</a>.</>
          : <a className="home-hello-link" {...linkProps("/profile")}>{h.goalNone}</a>}
      </p>
      {/* the phone: the greeting with the goal and the date under it, the days left as one big number at the right */}
      <div className="home-hello-m mob-only">
        <div className="home-hello-m-text">
          <p className="home-hello-m-hi" role="heading" aria-level={1}>{h.hello} {me?.name}</p>
          <a className="home-hello-m-sub" {...linkProps("/profile")}>
            {target ? `${h.goalWord} NCLC ${target}` : h.goalNone}{me?.exam_date ? ` · ${longDate(me.exam_date, lang)}` : ""}
          </a>
        </div>
        {hasDate && <div className="home-hello-m-days"><b className="num">{n}</b><span>{n === 1 ? h.dayWord1 : h.dayWord}</span></div>}
      </div>
    </>
  );
}

/* ---------- one test ---------- */

function Spark({ series, target }: { series: number[]; target: number | null }) {
  if (series.length < 2) return null;
  const w = 120, hgt = 36, lo = 3, hi = 10;
  const y = (v: number) => hgt - 4 - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (hgt - 8);
  const step = w / (series.length - 1);
  const pts = series.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = series[series.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${hgt}`} width={w} height={hgt} aria-hidden="true">
      {target && <line className="spark-target" x1="0" x2={w} y1={y(target)} y2={y(target)} />}
      <polyline className="spark-line" points={pts} />
      <circle className="spark-dot" cx={(series.length - 1) * step} cy={y(last)} r="3.5" />
    </svg>
  );
}

/** how the current level stands against the goal, and where it is heading */
function Standing({ st, target }: { st: SectionStat; target: number | null }) {
  const { t } = useT();
  const h = useHW();
  if (!st.n) return <Chip tone="muted">{h.noExam}</Chip>;
  const gap = target && st.current !== null ? target - Math.max(3, st.current) : null;
  return (
    <span className="home-chips">
      {gap !== null && <Chip tone={gap <= 0 ? "ok" : "sun"} dot>{gap <= 0 ? h.onTarget : h.below(gap)}</Chip>}
      {st.trend && <Chip tone={st.trend === "up" ? "ok" : st.trend === "down" ? "amber" : "muted"}>{st.trend === "up" ? t.trendUp : st.trend === "down" ? t.trendDown : t.trendFlat}</Chip>}
    </span>
  );
}

/** what the person did in a test, in a few words: « 20 exams · best 512 / 699 · 1 230 questions seen » */
function Line({ s, stats }: { s: Section; stats: Stats }) {
  const { t } = useT();
  const h = useHW();
  if (s === "co" || s === "ce") {
    const ex = stats.exams[s];
    const seen = Object.values(stats.practice[s]).reduce((a, c) => a + c.green + c.red + c.amber, 0);
    return <p className="ha-sub"><b>{ex.taken}</b> {h.exams(ex.taken)}{ex.best !== null && <> · {t.best.toLowerCase()} <b>{ex.best}</b> / 699</>} · <b>{seen}</b> {h.seen(seen)}</p>;
  }
  const tk = stats.tasks[s];
  return <p className="ha-sub"><b>{tk.sessions}</b> {h.sessions(tk.sessions)}{tk.avg20 !== null && <> · {t.average.toLowerCase()} <b>{tk.avg20}</b> / 20</>}</p>;
}

const hasAnything = (s: Section, stats: Stats) =>
  stats.sections[s].n > 0 || (s === "ee" || s === "eo" ? stats.tasks[s].sessions > 0 : stats.exams[s].taken > 0 || Object.values(stats.practice[s]).some((c) => c.green + c.red + c.amber > 0));

function Card({ s, stats, target }: { s: Section; stats: Stats; target: number | null }) {
  const { t } = useT();
  const h = useHW();
  const st = stats.sections[s];
  const empty = !hasAnything(s, stats);
  return (
    <a className="card ha-card" aria-label={t.sectionNames[s]} data-empty={empty || undefined} {...linkProps(`/${s}`)}>
      <span className="ha-tile mob-only" aria-hidden="true">{s.toUpperCase()}</span>
      <div className="ha-card-head">
        <h2><Mark s={s} big iconOnly />{t.sectionNames[s]}</h2>
      </div>
      <div className="ha-main">
        <div className="ha-big"><small>{h.avgLevel}<Info text={h.avgInfo} /></small>{st.n ? <><span className="desk-only">NCLC </span>{Math.max(3, st.current ?? 3)}</> : "—"}</div>
        <Spark series={st.series} target={target} />
      </div>
      {empty ? <p className="ha-sub ha-notyet">{h.notYet}</p> : <Standing st={st} target={target} />}
      <div className="ha-foot"><Line s={s} stats={stats} /></div>
      <Icon name="chevronRight" size={18} className="ha-chev mob-only" />
    </a>
  );
}

/* ---------- the twelve weeks ---------- */

function Weeks({ activity, work, lang }: { activity: Record<string, number>; work?: Record<string, number>; lang: Lang }) {
  const { t } = useT();
  const days: { d: string; n: number }[] = [];
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7;
  const start = new Date(today.getTime() - (dow + 11 * 7) * 86400000);
  for (let i = 0; i < 84; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ d: key, n: d > today ? -1 : activity[key] ?? 0 });
  }
  const max = Math.max(1, ...days.map((x) => x.n));
  const level = (n: number) => (n < 0 ? "future" : n === 0 ? "0" : n < max * 0.25 ? "1" : n < max * 0.5 ? "2" : n < max * 0.75 ? "3" : "4");
  // the phone: the last seven days, today last, each bar the minutes worked that day, its date as dd/mm under it
  const seven = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(today.getTime() - (6 - k) * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { key, n: work?.[key] ?? 0, label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` };
  });
  const smax = Math.max(1, ...seven.map((x) => x.n));
  return (
    <>
      <div className="weeks desk-only" role="img" aria-label={t.activityTitle}>
        {days.map((x) => <i key={x.d} data-l={level(x.n)} title={x.n > 0 ? `${longDate(x.d, lang)} · ${x.n}` : undefined} />)}
      </div>
      <div className="weeks-bars mob-only" role="img" aria-label={t.activityTitle}>
        {seven.map((x, k) => (
          <span key={x.key} className="weeks-bar" title={`${x.label} · ${x.n} min`}>
            <b className="num">{x.n ? x.n : ""}</b>
            <i data-now={k === 6 || undefined} data-l={x.n === 0 ? "0" : x.n < smax * 0.34 ? "1" : x.n < smax * 0.67 ? "2" : "3"} style={{ height: `${Math.max(0, (x.n / smax) * 100)}%` }} />
            <small className="num">{x.label}</small>
          </span>
        ))}
      </div>
    </>
  );
}

/** the facts as tiles: the number big, its word under it; the tiles stand as tall as the twelve weeks beside them */
function Facts({ f }: { f: Stats["facts"] }) {
  const h = useHW();
  const { lang } = useT();
  const worked = workedLabel(f.minutes, lang, h);
  const tiles: { icon: "activity" | "clock" | "calendar" | "flame"; n: string; w: string; hot?: boolean }[] = [
    { icon: "activity", n: String(f.sessions), w: h.fSessions(f.sessions) },
    { icon: "clock", n: worked.n, w: worked.w },
    { icon: "calendar", n: String(f.days), w: h.fDays(f.days) },
  ];
  if (f.streak >= 2) tiles.push({ icon: "flame", n: String(f.streak), w: h.fStreak, hot: true });
  return (
    <ul className="facts">
      {tiles.map((x) => <li key={x.w} className={x.hot ? "hot" : undefined}><Icon name={x.icon} size={18} /><b className="num">{x.n}</b><span>{x.w}</span></li>)}
    </ul>
  );
}

/* ---------- the page ---------- */

export function Home() {
  const { t, lang } = useT();
  const h = useHW();
  const { me } = useMe();
  // the numbers kept in this browser show at once; the server is asked only when they may be out of date
  const [stats, setStats] = useState<Stats | null>(() => peek<Stats>("/me/stats"));
  // the numbers could not be had and none were kept: one line and Réessayer instead of grey blocks for ever
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!me) return;
    // practice answers still waiting in this browser go first, so the numbers count them
    if (isFresh("/me/stats") && !pendingCount()) return;
    setFailed(false);
    (pendingCount() ? flush().catch(() => null) : Promise.resolve())
      .then(() => cached<Stats>("/me/stats"))
      .then(setStats)
      .catch(() => setFailed(true));
  }, [me?.id, tries]); // eslint-disable-line react-hooks/exhaustive-deps
  const lost = failed && !stats;
  const target = me?.target_nclc ?? null;
  return (
    <div className="home">
      <Hello />
      <section className="card ha-weeks">
        <h2><span className="desk-only">{t.activityTitle}</span><span className="mob-only">{h.sevenDays}</span><span className="ha-weeks-now mob-only">{h.inMinutes}</span></h2>
        {stats ? <div className="weeks-row"><Weeks activity={stats.activity} work={stats.work} lang={lang} /><Facts f={stats.facts} /></div>
          : lost ? <div className="ha-failed" role="alert"><span>{h.failed}</span><Button size="sm" icon="refresh" onClick={() => setTries((n) => n + 1)}>{h.retry}</Button></div>
          : <div className="skeleton" style={{ height: 100 }} />}
      </section>
      <div className="ha-grid">
        {!stats ? (lost ? null : [0, 1, 2, 3].map((i) => <div key={i} className="skeleton ha-skel" />)) : SECTIONS.map((s) => <Card key={s} s={s} stats={stats} target={target} />)}
      </div>
      {stats && <MockCard mocks={stats.mocks} />}
      <DonateCard />
      <ChatCard />
    </div>
  );
}
