// The one place the pages reach the other pieces (docs/COCE.md §1–§2): the shared rules, the browser store, the bank.
export { LEVELS, POINTS, EXAM_COUNT, emptyState, counts } from "../../../../shared/progress.ts";
export { useSection, type State, type Level } from "../store.ts";
export { loadIndex, loadExam, loadLevel, type BankIndex, type Question, type Key } from "../bank.ts";
