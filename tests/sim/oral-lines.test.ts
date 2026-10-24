// The examiner's script: the practice lines adapt to the tasks chosen; the exam says the official words.
import { describe, expect, it } from "vitest";
import { CLOSE, EXAM_OPENING, EXAM_RULES, FAREWELL, isScriptLine, opening, rules } from "../../worker/sim/oral-lines.ts";
import { byTime, examinerPreamble } from "../../worker/sim/oral.ts";

describe("practice: the script adapts to the tasks of the session", () => {
  it("names the tasks chosen, and the last one as such", () => {
    expect(opening({ tasks: [1, 2, 3] })).toContain("trois tâches");
    expect(opening({ tasks: [1, 3] })).toContain("deux tâches, la première et la troisième");
    expect(opening({ tasks: [2] })).toContain("une seule tâche, la deuxième");
    expect(rules(1, { tasks: [1, 3] }, true)).toMatch(/^Commençons par la première tâche/);
    expect(rules(3, { tasks: [1, 3] }, false)).toMatch(/^Passons à la troisième et dernière tâche/);
    expect(rules(2, { tasks: [1, 2, 3] }, false)).toMatch(/^Passons à la deuxième tâche/);
    expect(rules(2, { tasks: [2] }, true)).toMatch(/^Commençons par la deuxième tâche/);
  });
  it("has no name step and no recording notice", () => {
    expect(opening({ tasks: [1, 2, 3] })).not.toContain("prénom et nom");
    expect(opening({ tasks: [1, 2, 3] })).not.toContain("enregistré");
  });
});

describe("exam: the official script with TCF Canada's durations", () => {
  const shape = { tasks: [1, 2, 3] as (1 | 2 | 3)[] };
  it("welcomes, states the rules, asks for the name", () => {
    const o = opening(shape, { exam: true });
    expect(o).toBe(EXAM_OPENING);
    expect(o).toMatch(/^Bonjour\. Bienvenue à l'épreuve d'expression orale du TCF Canada\./);
    expect(o).toContain("environ douze minutes");
    expect(o).toContain("L'entretien est enregistré");
    expect(o).toMatch(/dites-moi vos prénom et nom, s'il vous plaît\.$/);
  });
  it("announces each task in the official words", () => {
    expect(rules(1, shape, true, { exam: true })).toBe("Voici la première tâche. Cette partie de l'épreuve dure deux minutes. Est-ce que vous pouvez vous présenter ?");
    expect(rules(2, shape, false, { exam: true })).toMatch(/^Nous passons à la deuxième tâche\. Elle dure trois minutes trente\./);
    expect(rules(2, shape, false, { exam: true })).toMatch(/Voici la situation\.$/);
    expect(rules(3, shape, false, { exam: true })).toMatch(/^Pour finir, voici la troisième tâche\. Elle dure quatre minutes trente\./);
    expect(rules(3, shape, false, { exam: true })).toBe(EXAM_RULES[3]);
  });
  it("tells the live examiner to repeat the name, then say the first task's line herself (only on the exam's first task)", () => {
    const pre = examinerPreamble(shape, 1, "", { exam: true });
    expect(pre).toContain("tu répètes son prénom et son nom");
    expect(pre).toContain(`"${EXAM_RULES[1]}"`);
    expect(examinerPreamble(shape, 2, "", { exam: true })).not.toContain("prénom et nom");
    expect(examinerPreamble(shape, 1, "")).not.toContain("prénom et nom");
  });
});

describe("the script's lines are told from the examiner's own", () => {
  it("in both scripts", () => {
    expect(isScriptLine(opening({ tasks: [1] }))).toBe(true);
    expect(isScriptLine(rules(3, { tasks: [3] }, true))).toBe(true);
    expect(isScriptLine(EXAM_OPENING)).toBe(true);
    for (const n of [1, 2, 3] as const) expect(isScriptLine(EXAM_RULES[n])).toBe(true);
    expect(isScriptLine(CLOSE.cut[2][0])).toBe(true);
    expect(isScriptLine(FAREWELL)).toBe(true);
    expect(isScriptLine("Quels sont vos loisirs ?")).toBe(false);
    expect(isScriptLine("Merci, Amina Rahimi.")).toBe(false);
  });
});

describe("the transcript keeps the order things were said in", () => {
  it("two lines of hers at the same instant stay in the order they were logged", () => {
    const turns = [
      { role: "examiner" as const, text: "Bonjour, bienvenue…", t: 0 },
      { role: "examiner" as const, text: "La préparation est terminée.", t: 0 },
      { role: "candidate" as const, text: "Bonjour.", t: 0 },
      { role: "examiner" as const, text: "Oui ?", t: 4 },
    ];
    expect([...turns].sort(byTime).map((u) => u.text)).toEqual(["Bonjour, bienvenue…", "La préparation est terminée.", "Bonjour.", "Oui ?"]);
  });
});
