import { describe, it, expect } from "vitest";
import { maxPoints, nclcFor, normalizeTasks, speakingTotalSeconds, tasksLabel, writingTotalSeconds } from "../../worker/sim/config.ts";

describe("task selection", () => {
  it("normalizes to ascending unique tasks and falls back to all three", () => {
    expect(normalizeTasks([3, 1, 3])).toEqual([1, 3]);
    expect(normalizeTasks(["2"])).toEqual([2]);
    expect(normalizeTasks([])).toEqual([1, 2, 3]);
    expect(normalizeTasks(null)).toEqual([1, 2, 3]);
    expect(normalizeTasks([7])).toEqual([1, 2, 3]);
  });
  it("labels subsets", () => {
    expect(tasksLabel([1, 2, 3])).toBe("Tâches 1, 2 et 3");
    expect(tasksLabel([1, 2])).toBe("Tâches 1 et 2");
    expect(tasksLabel([3])).toBe("Tâche 3");
  });
});

describe("timing adjusts to the subset", () => {
  it("writing: 10, 15 and 25 minutes per task, 50 for all three", () => {
    expect(writingTotalSeconds([1, 2, 3])).toBe(50 * 60);
    expect(writingTotalSeconds([1, 2])).toBe(25 * 60);
    expect(writingTotalSeconds([2, 3])).toBe(40 * 60);
    expect(writingTotalSeconds([1])).toBe(10 * 60);
    expect(writingTotalSeconds([3])).toBe(25 * 60);
  });
  it("speaking: prep + speaking of the selected tasks", () => {
    expect(speakingTotalSeconds([1, 2, 3])).toBe(120 + 120 + 210 + 270);
    expect(speakingTotalSeconds([1])).toBe(120);
    expect(speakingTotalSeconds([2])).toBe(330);
  });
});

describe("points and NCLC mapping", () => {
  it("weights 6 / 6 / 8 (fallback) sum to 20", () => {
    expect(maxPoints("writing", [1, 2, 3])).toBe(20);
    expect(maxPoints("speaking", [1, 2])).toBe(12);
  });
  it("maps /20 to NCLC per the IRCC table", () => {
    expect(nclcFor(10, "writing")).toEqual({ nclc: 7, cecrl: "B2" });
    expect(nclcFor(14, "speaking")).toEqual({ nclc: 9, cecrl: "C1" });
    expect(nclcFor(6, "writing").nclc).toBe(5);
    expect(nclcFor(20, "speaking").nclc).toBe(10);
    expect(nclcFor(2, "writing").nclc).toBe(3);
  });
});
