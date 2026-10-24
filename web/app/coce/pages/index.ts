// The CO / CE pages (docs/COCE.md §5). The integrator imports from here and nowhere else in this folder.
import "./pages.css";

export { SectionPage, Nclc, type SectionPageProps } from "./SectionPage.tsx";
export { ExamCard, type ExamCardProps } from "./ExamCard.tsx";
export { ResultPage, weakLevel, type ResultPageProps } from "./ResultPage.tsx";
export { RunningBand, type RunningBandProps } from "./RunningBand.tsx";
export { Redirect } from "./Redirect.tsx";
export { WORDS, type Words } from "./words.ts";
export { EXAMS, fetchRunning, useRunning, refreshRunning, currentRunning, noteRunning, seedRunning, finishAttempt, latestScore, nclcOf, serverNow, sallePath, resultPath, type Attempt, type AttemptRow, type AttemptMode, type CoceSection } from "./shared.ts";
