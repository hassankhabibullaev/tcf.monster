// Scoring a mock (docs/MOCK-EXAM.md §6.4): CO and CE as the exam attempts are scored (the real sum of points, the IRCC
// table), EE and EO as the simulator marks them; the overall level is the lowest NCLC of the four.
import { scoreAnswers } from "../coce/attempts.ts";
import type { Section as CoceSection } from "../../shared/progress.ts";
import { EO_LATE_ALLOWANCE_S, TESTS, type Answer, type CoceResult, type Ended, type EndedJson, type ExprResult, type KeyRow, type Result, type Status } from "./types.ts";

export function scoreCoce(section: CoceSection, paper: KeyRow[], answers: Record<string, Answer>, ended: Ended, at: string): CoceResult {
  const s = scoreAnswers(section, paper.map((q) => ({ placement: q.id, level: q.level, answer: q.answer })), answers);
  return { score: s.score, nclc: s.nclc, right: s.right, wrong: s.wrong, blank: s.blank, byLevel: s.byLevel, ended, at };
}

/** below NCLC 4 the official tables stop: such a result counts as 3 (as the dashboard does) */
export const nclcOrThree = (n: number | null | undefined) => (n == null ? 3 : Math.max(3, n));

/** the lowest of the four (what immigration looks at); null while one is missing */
export function overallOf(r: { co: CoceResult | null; ce: CoceResult | null; ee: ExprResult | null; eo: ExprResult | null }): number | null {
  const all = [r.co?.nclc, r.ce?.nclc, r.ee?.nclc, r.eo?.nclc];
  if (r.co == null || r.ce == null || r.ee == null || r.eo == null) return null;
  return Math.min(...all.map(nclcOrThree));
}

/** the certificate is due only for a sitting completed without interruption (docs/MOCK-EXAM.md §4) */
export function certificateDue(status: Status, ended: EndedJson, r: Result): boolean {
  if (status !== "done") return false;
  for (const t of TESTS) {
    const how = ended[t];
    if (!how || how === "abandon" || how === "stale") return false;
  }
  if ((ended.eoLateS ?? 0) > EO_LATE_ALLOWANCE_S) return false;
  // a blank stage is an absence
  if (!r.co || r.co.right + r.co.wrong === 0) return false;
  if (!r.ce || r.ce.right + r.ce.wrong === 0) return false;
  if (!r.ee || r.ee.marked === 0) return false;
  if (!r.eo || r.eo.marked === 0) return false;
  return true;
}
