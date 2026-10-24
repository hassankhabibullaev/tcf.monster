// Language of the explanations shown to the candidate: the person's interface language (shared/sim/ai/context.ts).
// Quotes from the production always stay in French.
import { aiCtx } from "../ai/context.ts";

export type FeedbackLang = "fr" | "en";

export async function feedbackLanguage(): Promise<FeedbackLang> {
  return aiCtx().lang === "en" ? "en" : "fr";
}

export function languageRule(lang: FeedbackLang): string {
  return lang === "en"
    ? "Langue des explications : écris tous les commentaires destinés au candidat (reason, feedback, tip, advice) en ANGLAIS simple ; les citations de sa production et les corrections proposées restent en français."
    : "Langue des explications : français SIMPLE (phrases courtes, mots courants, compréhensibles par un apprenant B1), tutoiement.";
}
