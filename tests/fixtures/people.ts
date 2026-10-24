// Six made-up people with a month of plausible use, for the admin's tests only (never in a database people use).
// Their e-mails end in @demo.tcf.monster (a domain nobody receives mail at). Deterministic: the same SQL every time
// for the same day.

type P = { name: string; target: number; exam: string | null; key: string; joined: number; seen: number; level: number; busy: number };
const PEOPLE: P[] = [
  { name: "Amina", target: 7, exam: "2027-02-18", key: "ok", joined: 28, seen: 0, level: 4, busy: 1 },
  { name: "Daniyar", target: 5, exam: null, key: "none", joined: 21, seen: 0, level: 2, busy: 0.4 },
  { name: "Sofia", target: 9, exam: "2026-11-30", key: "ok", joined: 19, seen: 1, level: 5, busy: 0.9 },
  { name: "Karim", target: 7, exam: "2027-01-12", key: "error", joined: 12, seen: 3, level: 3, busy: 0.5 },
  { name: "Lin", target: 6, exam: "2026-12-05", key: "ok", joined: 6, seen: 6, level: 3, busy: 0.3 },
  { name: "Olena", target: 8, exam: null, key: "quota", joined: 2, seen: 0, level: 4, busy: 0.6 },
];
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

function rng(seed: number) { return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); }
const q = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
const iso = (daysAgo: number, hour = 10, min = 0) => {
  const d = new Date(Date.now() - daysAgo * 86400000); d.setUTCHours(hour, min, 0, 0);
  // today: never later than now (future days, such as when a sign-in expires, stay as they are)
  return new Date(daysAgo === 0 ? Math.min(d.getTime(), Date.now() - (90 - min) * 60000) : d.getTime()).toISOString();
};

/** score out of 699 → NCLC for CO/CE (the official bands) */
export function nclc(section: "co" | "ce", s: number) {
  const bands = section === "co" ? [[549, 10], [523, 9], [503, 8], [458, 7], [398, 6], [369, 5], [331, 4]] : [[549, 10], [524, 9], [499, 8], [453, 7], [406, 6], [375, 5], [342, 4]];
  for (const [min, n] of bands) if (s >= min) return n;
  return 3;
}

/** /20 → NCLC for expression (the official IRCC table) */
const nclc20 = (s: number) => (s >= 16 ? 10 : s >= 14 ? 9 : s >= 12 ? 8 : s >= 10 ? 7 : s >= 7 ? 6 : s === 6 ? 5 : s >= 4 ? 4 : 3);

export function demoSql() {
  const out: string[] = [];
  PEOPLE.forEach((p, i) => {
    const r = rng(i + 7);
    const id = `demo-${i + 1}`;
    const email = `${p.name.toLowerCase()}@demo.tcf.monster`;
    out.push(`INSERT INTO users (id, email, name, password, created_at, last_seen_at, target_nclc, exam_date, lang, settings, terms_version, terms_at, gemini_status, gemini_checked_at, gemini_error) VALUES (${[
      id, email, p.name, "demo", iso(p.joined, 8), iso(p.seen, 18, 20), p.target, p.exam, i % 3 === 2 ? "en" : "fr",
      JSON.stringify({ co: { hint: i % 2 === 0, transcript: true, english: false, autoplay: false }, ce: { hint: true, english: i % 2 === 1 }, score: ["latest", "best", "average"][i % 3] }),
      "1", iso(p.joined, 8), p.key, p.key === "none" ? null : iso(p.seen, 9), p.key === "error" ? "API key not valid" : p.key === "quota" ? "free limit reached for today" : null,
    ].map(q).join(", ")});`);
    out.push(`INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, device) VALUES (${[`demo-s-${i}-1`, id, iso(p.joined), iso(p.seen, 18), iso(p.seen - 30), ["iPhone · Safari", "Android · Chrome", "Mac · Safari"][i % 3]].map(q).join(", ")});`);
    if (i % 2 === 0) out.push(`INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, device) VALUES (${[`demo-s-${i}-2`, id, iso(p.joined), iso(p.seen + 2, 20), iso(p.seen + 2 - 30), "Windows · Chrome"].map(q).join(", ")});`);
    // practice: a few levels around the person's level, a blob of question colours, and the days that made it
    for (const section of ["co", "ce"] as const) {
      for (let l = Math.max(0, p.level - 2); l <= Math.min(5, p.level); l++) {
        const n = Math.floor((40 + r() * 80) * p.busy);
        const blob: { v: 1; q: Record<string, { s: string; a: string; t: number }>; pos: null } = { v: 1, q: {}, pos: null };
        let wrong = 0;
        for (let k = 1; k <= n; k++) {
          const x = r();
          const s = x < 0.62 - (l - p.level + 2) * 0.05 ? "green" : x < 0.8 ? "amber" : "red";
          if (s !== "green") wrong++;
          blob.q[`${section}-${LEVELS[l].toLowerCase()}-${k}`] = { s, a: "ABCD"[Math.floor(r() * 4)], t: Math.floor(Date.now() / 1000) - Math.floor(r() * p.joined * 86400) };
        }
        if (!n) continue;
        out.push(`INSERT INTO progress (user_id, section, level, data, updated_at) VALUES (${[id, section, LEVELS[l], JSON.stringify(blob), iso(p.seen)].map(q).join(", ")});`);
        const days = Math.max(1, Math.min(p.joined, Math.ceil(n / 25)));
        for (let d = 0; d < days; d++) {
          const ago = Math.min(p.joined, p.seen + Math.floor(r() * (p.joined - p.seen + 1)));
          const dayStr = iso(ago).slice(0, 10);
          const a = Math.ceil(n / days);
          out.push(`INSERT INTO practice_days (user_id, day, section, level, answered, wrong, seconds, last_at) VALUES (${[id, dayStr, section, LEVELS[l], a, Math.round((wrong / n) * a), a * (section === "co" ? 70 : 95), iso(ago, 19, d)].map(q).join(", ")}) ON CONFLICT DO UPDATE SET answered = answered + excluded.answered, wrong = wrong + excluded.wrong, seconds = seconds + excluded.seconds;`);
        }
      }
      // exams
      const exams = Math.floor(p.busy * 5);
      for (let e = 0; e < exams; e++) {
        const ago = p.seen + Math.floor(r() * (p.joined - p.seen));
        const ended = e === exams - 1 && i === 3 ? "abandon" : r() < 0.15 ? "time" : "done";
        const blank = ended === "abandon" ? 14 : ended === "time" ? 1 + Math.floor(r() * 3) : 0;
        const right = Math.min(39 - blank, Math.round(((240 + p.level * 55 + r() * 70) / 600) * 39) - (ended === "abandon" ? 10 : 0));
        const score = Math.round(100 + (right / 39) * 599);
        const start = iso(ago, 9 + e, 5);
        const mins = section === "co" ? 35 : 60;
        out.push(`INSERT INTO attempts (user_id, section, exam, started_at, deadline_at, finished_at, ended, answers, score, nclc, right_count, wrong_count, blank_count) VALUES (${[id, section, 1 + Math.floor(r() * 40), start, new Date(Date.parse(start) + mins * 60000).toISOString(), new Date(Date.parse(start) + (mins - (ended === "done" ? Math.floor(r() * 12) : 0)) * 60000).toISOString(), ended, "{}", score, nclc(section, score), right, 39 - right - blank, blank].map(q).join(", ")});`);
      }
    }
    // writing and speaking
    if (p.key !== "none") {
      const n = Math.floor(p.busy * 9);
      for (let e = 0; e < n; e++) {
        const section = e % 3 === 2 ? "eo" : "ee";
        const exam = e % 4 === 3;
        const ago = p.seen + Math.floor(r() * (p.joined - p.seen));
        const start = iso(ago, 20, e);
        const dropped = section === "eo" && r() < 0.15;
        const tache = 1 + Math.floor(r() * 3);
        const score = dropped ? null : Math.round(8 + p.level * 1.3 + r() * 4);
        out.push(`INSERT INTO expr_sessions (id, user_id, section, kind, taches, mode, status, started_at, finished_at, score, nclc, seconds) VALUES (${[`demo-x-${i}-${e}`, id, section, exam ? "exam" : "practice", exam ? "[1,2,3]" : `[${tache}]`, section === "eo" ? (r() < 0.6 ? "live" : "ptt") : null, dropped ? "abandoned" : "done", start, new Date(Date.parse(start) + 25 * 60000).toISOString(), score, score == null ? null : nclc20(score), exam ? (section === "ee" ? 3600 : 720) : 600 + Math.floor(r() * 1200)].map(q).join(", ")});`);
      }
    }
  });
  return out.join("\n");
}

