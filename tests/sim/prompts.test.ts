// The subjects come from the topics table: newest month, never hidden or gone, one Partie / one Combinaison per
// session; and a session's rows are written the way the routes and the browser expect them.
import { describe, it, expect, beforeEach } from "vitest";
import { makeEnv } from "../../scripts/local-env.ts";
import type { Env } from "../../worker/util.ts";
import { withCtx } from "../../worker/sim/ctx.ts";
import { pickTopics, promptFor, promptFromTopic, relationOf, topicText, type TopicRow } from "../../worker/sim/prompts.ts";
import { getSession, listSessions, startSession } from "../../worker/sim/session.ts";

type Row = Record<string, any>;
let env: Env, raw: ReturnType<typeof makeEnv>["raw"];
const USER = "u-test";
const inCtx = <T>(fn: () => Promise<T>) => withCtx({ env, user: { id: USER, email: "t@example.com" }, lang: "fr" }, fn);

/** an EO topic row (tache 2 or 3) or an EE combinaison (tache null) */
function topic(o: { section: "ee" | "eo"; id: number; month: string; part: number; tache?: number | null; title: string; body?: Record<string, unknown>; hidden?: number; gone?: boolean; position?: number }) {
  raw.prepare("INSERT INTO topics (section, id, month, part, part_id, tache, position, title, body, first_seen, last_seen, gone_at, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 't', 't', ?, ?)")
    .run(o.section, o.id, o.month, o.part, o.part * 100 + Number(o.month.slice(-2)), o.tache ?? null, o.position ?? 0, o.title, JSON.stringify(o.body ?? {}), o.gone ? "t" : null, o.hidden ?? 0);
}

beforeEach(() => {
  const e = makeEnv();
  env = e.env as unknown as Env; raw = e.raw;
  raw.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, 't')").run(USER, "t@example.com");
  // EO: an old month, and the newest month with two Parties; one hidden row, one gone row
  topic({ section: "eo", id: 1, month: "2026-09", part: 1, tache: 2, title: "Je suis votre voisine et je vends mon vélo. Vous me posez des questions (prix, état, etc.)." });
  topic({ section: "eo", id: 2, month: "2026-09", part: 1, tache: 3, title: "Faut-il interdire les voitures en ville ?" });
  topic({ section: "eo", id: 11, month: "2026-10", part: 1, tache: 2, title: "Je travaille à la bibliothèque municipale. Vous voulez vous inscrire et vous me posez des questions (horaires, conditions, etc.)." });
  topic({ section: "eo", id: 12, month: "2026-10", part: 1, tache: 3, title: "#1", body: { description: "Selon vous, le télétravail est-il une bonne chose ?" } });
  topic({ section: "eo", id: 21, month: "2026-10", part: 2, tache: 2, title: "Je suis votre collègue et j'organise une sortie. Vous me posez des questions." });
  topic({ section: "eo", id: 22, month: "2026-10", part: 2, tache: 3, title: "Les réseaux sociaux rapprochent-ils les gens ?" });
  topic({ section: "eo", id: 31, month: "2026-10", part: 3, tache: 2, title: "Sujet caché", hidden: 1 });
  topic({ section: "eo", id: 32, month: "2026-10", part: 3, tache: 3, title: "Sujet retiré", gone: true });
  // EE: two combinaisons in the newest month, one in an older one
  const comb = (n: number) => ({ tache1: `Message T1 de la combinaison ${n}.`, tache2: `Article T2 de la combinaison ${n}.`, tache3: { title: `Titre T3 ${n}`, document1: `Document un de ${n}, pour.`, document2: `Document deux de ${n}, contre.` } });
  topic({ section: "ee", id: 101, month: "2026-10", part: 1, title: "Combinaison 1", body: comb(1) });
  topic({ section: "ee", id: 102, month: "2026-10", part: 2, title: "Combinaison 2", body: comb(2) });
  topic({ section: "ee", id: 90, month: "2026-09", part: 1, title: "Combinaison 1", body: comb(9) });
});

describe("picking subjects", () => {
  it("draws from the newest month and skips hidden and gone rows", async () => {
    for (let i = 0; i < 25; i++) {
      const t = await inCtx(() => pickTopics("eo", [2, 3]));
      expect([11, 21]).toContain(t[2]!.id);
      expect([12, 22]).toContain(t[3]!.id);
      expect(t[2]!.part_id).toBe(t[3]!.part_id);
      const ee = await inCtx(() => pickTopics("ee", [1, 2, 3]));
      expect([101, 102]).toContain(ee[1]!.id);
      expect(ee[1]!.id).toBe(ee[3]!.id);
    }
  });
  it("a chosen topic fixes the Partie of the other task; a hidden choice falls back to random", async () => {
    const t = await inCtx(() => pickTopics("eo", [2, 3], { 3: 22 }));
    expect(t[3]!.id).toBe(22);
    expect(t[2]!.id).toBe(21);
    const u = await inCtx(() => pickTopics("eo", [2, 3], { 2: 31 }));
    expect([11, 21]).toContain(u[2]!.id);
    const old = await inCtx(() => pickTopics("eo", [2], { 2: 1 }));
    expect(old[2]!.id).toBe(1);
  });
  it("reads « #1 » titles from the description", async () => {
    const row = raw.prepare("SELECT * FROM topics WHERE section = 'eo' AND id = 12").get() as unknown as TopicRow;
    expect(topicText(row)).toBe("Selon vous, le télétravail est-il une bonne chose ?");
    const p = await inCtx(() => promptFor("eo", 3, 12));
    expect(p.consigne).toBe("Selon vous, le télétravail est-il une bonne chose ?");
    expect(p.id).toBe("eo:12:3");
    expect(p.topic).toBe("2026-10 · P1");
    expect(p.timeLimitSeconds).toBe(270);
  });
  it("Tâche 1 oral has no topic; Tâche 2 gets the role-play from the card", async () => {
    const p1 = await inCtx(() => promptFor("eo", 1));
    expect(p1.consigne).toBe("Pour commencer, pouvez-vous vous présenter ?");
    expect(p1.theme).toBe("entretien");
    const p2 = await inCtx(() => promptFor("eo", 2, 11));
    expect(p2.roleplay).toMatchObject({ register: "vous", kind: "professionnel" });
    expect(p2.roleplay!.situation).toBe(p2.consigne);
    expect(p2.prepTimeSeconds).toBe(120);
    const p3 = await inCtx(() => promptFor("eo", 2, 21));
    expect(p3.roleplay).toMatchObject({ register: "tu", kind: "collegue" });
    expect(relationOf("Je suis votre ami et je reviens de voyage.")).toBe("ami");
  });
  it("EE Tâche 3 carries the title, the two documents and the official instruction", async () => {
    const p = await inCtx(() => promptFor("ee", 3, 102));
    expect(p.title).toBe("Titre T3 2");
    expect(p.sourceDocuments!.map((d) => d.author)).toEqual(["Document 1", "Document 2"]);
    expect(p.sourceDocuments![1].text).toBe("Document deux de 2, contre.");
    expect(p.consigne).toContain("40 à 60 mots");
    expect(p.consigne).toContain("80 à 120 mots");
    expect(p.wordCountMin).toBe(120);
    expect(p.wordCountMax).toBe(180);
    expect(p.timeLimitSeconds).toBe(25 * 60);
    const row = raw.prepare("SELECT * FROM topics WHERE section = 'ee' AND id = 101").get() as unknown as TopicRow;
    expect(promptFromTopic("ee", 1, row).consigne).toBe("Message T1 de la combinaison 1.");
  });
});

describe("starting a session", () => {
  it("writes the session and its tasks with their topic, and answers without the examiner's side", async () => {
    const s = await inCtx(() => startSession({ section: "eo", kind: "exam", taches: [2], mode: "live" }));
    expect(s.skill).toBe("speaking");
    expect(s.kind).toBe("exam");
    expect(s.mode).toBe("full");
    expect(s.micMode).toBe("live");
    expect(s.tasks.map((t) => t.taskNo)).toEqual([1, 2, 3]);
    expect(s.totalSeconds).toBe(120 + 120 + 210 + 270);
    const rows = raw.prepare("SELECT task_no, topic_id, prompt_json FROM expr_tasks WHERE session_id = ? ORDER BY task_no").all(s.sessionId) as Row[];
    expect(rows[0].topic_id).toBeNull();
    expect([11, 21]).toContain(rows[1].topic_id);
    expect([12, 22]).toContain(rows[2].topic_id);
    const sess = raw.prepare("SELECT * FROM expr_sessions WHERE id = ?").get(s.sessionId) as Row;
    expect(sess).toMatchObject({ user_id: USER, section: "eo", kind: "exam", taches: "[1,2,3]", mode: "live", status: "in_progress" });
    // the browser gets the situation and the role, nothing more of the examiner's side
    const pub = s.tasks[1].prompt as Row;
    expect(Object.keys(pub.roleplay).sort()).toEqual(["examinerRole", "situation"]);
    expect(pub.examinerPlan).toBeUndefined();
    expect(JSON.stringify(s)).not.toContain("examinerPlan");
  });
  it("practice: one task is a « task » session; the history lists it; it is nobody else's", async () => {
    const s = await inCtx(() => startSession({ section: "ee", kind: "practice", taches: [2], topicIds: { 2: 101 } }));
    expect(s.mode).toBe("task");
    expect(s.micMode).toBeNull();
    expect(s.tasks[0].prompt.consigne).toBe("Article T2 de la combinaison 1.");
    expect(s.totalSeconds).toBe(15 * 60);
    const list = await inCtx(() => listSessions());
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: s.sessionId, section: "ee", kind: "practice", taches: [2], status: "in_progress", summary: null });
    const got = await inCtx(() => getSession(s.sessionId));
    expect(got!.tasks[0]).toMatchObject({ taskNo: 2, topicId: 101, status: "pending" });
    raw.prepare("INSERT INTO users (id, email, created_at) VALUES ('u-other', 'o@example.com', 't')").run();
    const other = await withCtx({ env, user: { id: "u-other", email: "o@example.com" }, lang: "en" }, () => getSession(s.sessionId));
    expect(other).toBeNull();
  });
});

import { CLIP_ID } from "../../worker/sim/oral.ts";
import { storeSpeakingResult, storeWritingResult } from "../../worker/sim/results.ts";

describe("nothing the candidate wrote or said is stored", () => {
  it("a clip id is a short opaque string", () => {
    expect(CLIP_ID.test("c-01_a.b")).toBe(true);
    expect(CLIP_ID.test("")).toBe(false);
    expect(CLIP_ID.test("a".repeat(65))).toBe(false);
    expect(CLIP_ID.test("has space")).toBe(false);
  });
  it("the task table has no column for a text, a transcript, a correction, nor the account for a key", () => {
    const cols = (t: string) => (raw.prepare(`PRAGMA table_info(${t})`).all() as Row[]).map((c) => c.name);
    for (const c of ["response_text", "transcript", "turns_json", "feedback_json", "detail_json", "versions_json"]) expect(cols("expr_tasks")).not.toContain(c);
    expect(cols("expr_tasks")).toContain("marks_json");
    expect(cols("users")).not.toContain("gemini_key");
  });
  it("a result keeps the grid's rows and numbers only: reasons, tips, quotes and unknown rows are dropped", async () => {
    const s = await inCtx(() => startSession({ section: "ee", kind: "practice", taches: [2], topicIds: { 2: 101 } }));
    raw.prepare("UPDATE expr_sessions SET started_at = ? WHERE id = ?").run(new Date(Date.now() - 60_000).toISOString(), s.sessionId);
    const evaluation = {
      score20: 12, stage: "transcript", taskScore: 3.6, taskScoreMax: 6, locked: [],
      criteria: [{ name: "Grammar", score: 11, reason: "« je suis allé à la piscine avec ma fille Amina »" }, { name: "Mon secret : 0612345678", score: 3 }],
      tips: [{ text: "Vous avez écrit « Amina »" }], corrections: [{ excerpt: "ma fille Amina" }],
    };
    const r = await inCtx(() => storeWritingResult({ sessionId: s.sessionId, taskNo: 2, wordCount: 140, elapsedS: 600, score20: 12, marks: evaluation }));
    expect(r).toMatchObject({ score20: 12, finished: true });
    const row = raw.prepare("SELECT * FROM expr_tasks WHERE session_id = ?").get(s.sessionId) as Row;
    expect(JSON.parse(row.marks_json)).toEqual({ stage: "transcript", score20: 12, taskScore: 3.6, taskScoreMax: 6, criteria: [{ name: "Grammar", score: 11 }], locked: [] });
    expect(JSON.stringify(row)).not.toMatch(/Amina|0612345678|piscine/);
    expect(row.word_count).toBe(140);
  });
  it("an empty text scores 0; a mark that is not the evaluation's is refused", async () => {
    const s = await inCtx(() => startSession({ section: "eo", kind: "practice", taches: [3], topicIds: { 3: 12 } }));
    raw.prepare("UPDATE expr_sessions SET started_at = ? WHERE id = ?").run(new Date(Date.now() - 60_000).toISOString(), s.sessionId);
    await expect(inCtx(() => storeSpeakingResult({ sessionId: s.sessionId, taskNo: 3, durationS: 200, score20: 9, marks: { score20: 10 } }))).rejects.toMatchObject({ status: 400 });
    const w = await inCtx(() => startSession({ section: "ee", kind: "practice", taches: [1], topicIds: { 1: 101 } }));
    raw.prepare("UPDATE expr_sessions SET started_at = ? WHERE id = ?").run(new Date(Date.now() - 60_000).toISOString(), w.sessionId);
    expect(await inCtx(() => storeWritingResult({ sessionId: w.sessionId, taskNo: 1, wordCount: 0, elapsedS: 600, score20: 15, marks: { score20: 15 } }))).toMatchObject({ score20: 0 });
  });
});
