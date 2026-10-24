import { describe, it, expect } from "vitest";
import { followUpPrompt, pickFollowUps, topUp, type FollowUpPlan } from "../../worker/sim/interview.ts";
import { isRepeat } from "../../worker/sim/asked.ts";
import { isPersonalQuestion } from "../../worker/sim/util.ts";
import { T1_BANK, T1_TOPICS, topicOf } from "../../worker/sim/oral-bank.ts";
import { TIMING, canAsk, cutAt, followUpsOwed, introCut, questionDeservesAnswer, timeIsUp } from "../../worker/sim/timing.ts";

const q = (theme: string, question: string, preuve = "") => ({ theme, question, preuve, dejaRepondu: preuve.length > 0 });
const opts = { valid: isPersonalQuestion, isRepeat, asked: [] as string[] };

describe("Tâche 1 follow-ups: never what the candidate has just said", () => {
  it("the planner is given the presentation, the six topics and the rule", () => {
    const p = followUpPrompt({ opening: "Pour commencer, pouvez-vous vous présenter ?", intro: "Je suis développeur, j'adore mon travail parce que je résous des problèmes.", asked: ["Où habitez-vous ?"] });
    expect(p).toContain("j'adore mon travail parce que je résous des problèmes");
    expect(p).toContain("Ne demande JAMAIS une information ou une raison qu'il a déjà donnée");
    for (const k of T1_TOPICS) expect(p).toContain(T1_BANK[k].core[0]);
    expect(p).toContain("Où habitez-vous ?");
  });
  it("drops every question the presentation already answers", () => {
    const plan: FollowUpPlan = {
      dejaDit: ["métier : développeur", "ce qu'il aime dans son travail : résoudre des problèmes"],
      questions: [
        q("travail", "Qu'est-ce que vous préférez dans votre travail ?", "j'adore mon travail parce que je résous des problèmes"),
        q("ville", "Parlez-moi de votre ville."),
        // the model forgot the flag but quoted the passage: still dropped
        { theme: "travail", question: "Pourquoi avez-vous choisi ce métier ?", preuve: "j'ai choisi ce métier parce que", dejaRepondu: false },
        q("loisirs", "Quel voyage vous a le plus marqué ?"),
        q("francais", "Comment apprenez-vous le français ?"),
      ],
    };
    expect(pickFollowUps(plan, opts)).toEqual(["Parlez-moi de votre ville.", "Quel voyage vous a le plus marqué ?", "Comment apprenez-vous le français ?"]);
  });
  it("keeps the two guaranteed questions on different topics, at most two per topic, one about Canada", () => {
    const plan: FollowUpPlan = {
      dejaDit: [],
      questions: [q("travail", "Travaillez-vous seul ou en équipe ?"), q("travail", "Comment se passe une journée de travail pour vous ?"), q("travail", "Qu'est-ce qui est difficile dans votre travail ?"), q("projets", "Pourquoi avez-vous choisi le Canada ?"), q("projets", "Dans quelle ville du Canada aimeriez-vous vivre ?"), q("famille", "Parlez-moi de votre famille.")],
    };
    const out = pickFollowUps(plan, opts);
    expect(topicOf(out[0])).not.toBe(topicOf(out[1]));
    expect(out.filter((x) => topicOf(x) === "travail")).toHaveLength(2);
    expect(out.filter((x) => /canada/i.test(x))).toHaveLength(1);
  });
  it("rejects opinion questions, repeats of earlier sessions and things that are not questions", () => {
    const plan: FollowUpPlan = { dejaDit: [], questions: [q("travail", "Pensez-vous que le télétravail soit une bonne chose ?"), q("ville", "Où habitez-vous ?"), q("loisirs", "Vos loisirs"), q("famille", "Parlez-moi de votre famille.")] };
    expect(pickFollowUps(plan, { ...opts, asked: ["Où habitez-vous ?"] })).toEqual(["Parlez-moi de votre famille."]);
    expect(pickFollowUps(null, opts)).toEqual([]);
  });
  it("tops a short plan up with questions that go past the usual facts, on other topics", () => {
    const core = T1_TOPICS.flatMap((k) => T1_BANK[k].core);
    for (let i = 0; i < 20; i++) {
      const out = topUp(["Parlez-moi de votre ville."], { isRepeat, asked: [], min: 4 });
      expect(out).toHaveLength(4);
      expect(new Set(out.map(topicOf)).size).toBe(4);
      for (const x of out.slice(1)) expect(core).not.toContain(x);
    }
  });
});

describe("timing: the clock never cuts the candidate, the examiner does", () => {
  const t = TIMING[1];
  const c = (elapsed: number, asked: number, questionEndAt = 0, introDone = true, turnStartAt = 0) => ({ elapsed, introDone, asked, questionEndAt, turnStartAt });
  it("Tâche 1: the presentation is cut at 1 min 30, or a little before at a pause", () => {
    expect(introCut(t, 60, 1)).toBe(false);
    expect(introCut(t, 86, 0.2)).toBe(false);
    expect(introCut(t, 86, 0.6)).toBe(true);
    expect(introCut(t, 90, 0)).toBe(true);
    expect(introCut(TIMING[3], 200, 3)).toBe(false);
    for (const n of [1, 2, 3] as const) expect(TIMING[n].tailS).toBeGreaterThanOrEqual(2);
  });
  it("Tâche 1: the two follow-ups are owed whatever the clock says; after them she asks while ten seconds remain", () => {
    expect(followUpsOwed(t, c(125, 1))).toBe(true);
    expect(canAsk(t, c(125, 1))).toBe(true);
    expect(timeIsUp(t, { ...c(125, 1), midAnswer: false })).toBe(false);
    expect(canAsk(t, c(111, 2))).toBe(false);
    expect(canAsk(t, c(110, 2))).toBe(true);
    expect(followUpsOwed(t, c(125, 0, 0, false))).toBe(false);
    expect(followUpsOwed(t, c(t.speakS + t.overrunS + 1, 1))).toBe(false);
  });
  it("a candidate answering at zero gets the grace from the end of her question, then she interrupts", () => {
    // a question that ended at 118: the answer is protected until 128
    expect(cutAt(t, c(120, 2, 118))).toBe(125);
    expect(timeIsUp(t, { ...c(123, 2, 118), midAnswer: true })).toBe(false);
    expect(timeIsUp(t, { ...c(125, 2, 118), midAnswer: true })).toBe(true);
    // a question asked late (owed), ended at 135: the answer keeps its five seconds from there
    expect(cutAt(t, c(136, 2, 135))).toBe(140);
    // the ceiling wins over everything
    expect(timeIsUp(t, { ...c(t.speakS + t.overrunS, 1, 149), midAnswer: true })).toBe(true);
    // silent at zero with the floor: a couple of seconds, then the close
    expect(timeIsUp(t, { ...c(123, 2), midAnswer: false, idle: true })).toBe(false);
    expect(timeIsUp(t, { ...c(124.5, 2), midAnswer: false, idle: true })).toBe(true);
    // her question ended two seconds before zero: the candidate still has the idle window after zero
    expect(timeIsUp(t, { ...c(121, 2, 118), midAnswer: false, idle: true })).toBe(false);
    // her late (owed) question ended at 126: the window counts from there
    expect(timeIsUp(t, { ...c(129, 2, 126), midAnswer: false, idle: true })).toBe(false);
    expect(timeIsUp(t, { ...c(130.5, 2, 126), midAnswer: false, idle: true })).toBe(true);
  });
  it("Tâche 2: a question started with ten seconds left is answered; her turn with less than ten left closes", () => {
    const t2 = TIMING[2];
    expect(questionDeservesAnswer(t2, c(t2.speakS + 3, 0, 0, true, t2.speakS - 10))).toBe(true);
    expect(questionDeservesAnswer(t2, c(t2.speakS + 3, 0, 0, true, t2.speakS - 9))).toBe(false);
    expect(canAsk(t2, c(t2.speakS - 9, 0))).toBe(false);
    expect(canAsk(t2, c(t2.speakS - 10, 0))).toBe(true);
    expect(timeIsUp(t2, { ...c(t2.speakS - 1, 0), midAnswer: false })).toBe(false);
    expect(timeIsUp(t2, { ...c(t2.speakS, 0), midAnswer: false })).toBe(true);
    expect(timeIsUp(t2, { ...c(t2.speakS + 4, 0), midAnswer: true })).toBe(false);
    expect(timeIsUp(t2, { ...c(t2.speakS + 5, 0), midAnswer: true })).toBe(true);
  });
  it("Tâche 3: she stops the candidate at the official time exactly", () => {
    const t3 = TIMING[3];
    expect(t3.graceS).toBe(0);
    expect(timeIsUp(t3, { ...c(t3.speakS - 0.2, 3), midAnswer: true })).toBe(false);
    expect(timeIsUp(t3, { ...c(t3.speakS, 3), midAnswer: true })).toBe(true);
    expect(canAsk(t3, c(t3.speakS - 9, 3))).toBe(false);
  });
});

