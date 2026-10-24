// The result page's cells and the dashboard's time: the level a score gets on the TCF scale, and the minutes that
// become hours (to the nearest half) once there is an hour of work.
import { describe, expect, it } from "vitest";
import { cefrOf } from "../../web/app/coce/pages/shared.ts";
import { workedLabel } from "../../web/app/pages/worked.ts";

describe("the level a score gets", () => {
  it("follows the TCF scale: A1 to 199, A2 to 299, B1 to 399, B2 to 499, C1 to 599, C2 from 600", () => {
    expect(cefrOf(3)).toBe("A1");
    expect(cefrOf(199)).toBe("A1");
    expect(cefrOf(200)).toBe("A2");
    expect(cefrOf(399)).toBe("B1");
    expect(cefrOf(400)).toBe("B2");
    expect(cefrOf(512)).toBe("C1");
    expect(cefrOf(600)).toBe("C2");
    expect(cefrOf(699)).toBe("C2");
  });
});

const en = { fMinutes: "min of work", fHours: (h: number) => (h > 1 ? "hours of work" : "hour of work") };

describe("the time worked on the dashboard", () => {
  it("stays in minutes under an hour", () => {
    expect(workedLabel(0, "en", en)).toEqual({ n: "0", w: "min of work" });
    expect(workedLabel(59, "en", en)).toEqual({ n: "59", w: "min of work" });
  });
  it("counts hours to the nearest half from an hour on", () => {
    expect(workedLabel(60, "en", en)).toEqual({ n: "1", w: "hour of work" });
    expect(workedLabel(67, "en", en)).toEqual({ n: "1", w: "hour of work" });
    expect(workedLabel(80, "en", en)).toEqual({ n: "1.5", w: "hours of work" });
    expect(workedLabel(119, "en", en)).toEqual({ n: "2", w: "hours of work" });
    expect(workedLabel(165, "en", en)).toEqual({ n: "3", w: "hours of work" });
  });
  it("writes the half with a comma in French", () => {
    expect(workedLabel(90, "fr", { fMinutes: "min de travail", fHours: (h) => (h > 1 ? "heures de travail" : "heure de travail") })).toEqual({ n: "1,5", w: "heures de travail" });
  });
});
