/**
 * Tâche 1 interview questions, filed under the six topics a real examiner comes back to after the self-presentation
 * (work or studies, city and neighbourhood, family and home, free time and travel, French, Canada and plans).
 * - `core`: the typical question of the topic, asked when the candidate said nothing about it;
 * - `more`: questions that go one step further, for a topic the presentation already covered.
 * They serve three purposes: the bank the follow-up planner reuses word for word (so the audio is already cached),
 * the fallback when the planning fails, and the list pre-recorded with the fixed lines.
 * Every entry must pass isPersonalQuestion (tests/oral-bank.test.ts).
 */
export const T1_TOPICS = ["travail", "ville", "famille", "loisirs", "francais", "projets"] as const;
export type T1Topic = (typeof T1_TOPICS)[number];

export const T1_TOPIC_LABEL: Record<T1Topic, string> = {
  travail: "son travail ou ses études",
  ville: "sa ville et son quartier",
  famille: "sa famille et son logement",
  loisirs: "ses loisirs et ses voyages",
  francais: "le français",
  projets: "le Canada et ses projets",
};

export const T1_BANK: Record<T1Topic, { core: string[]; more: string[] }> = {
  travail: {
    core: ["Que faites-vous dans la vie ?", "Pourquoi avez-vous choisi ce métier ?", "Qu'avez-vous étudié ?"],
    more: [
      "Depuis combien de temps travaillez-vous dans ce domaine ?",
      "Qu'est-ce que vous préférez dans votre travail ?",
      "Comment se passe une journée de travail pour vous ?",
      "Travaillez-vous seul ou en équipe ?",
      "Comment avez-vous trouvé votre premier emploi ?",
      "Quelle a été votre meilleure expérience professionnelle ?",
      "Qu'est-ce qui est difficile dans votre travail ?",
    ],
  },
  ville: {
    core: ["Parlez-moi de votre ville.", "Aimez-vous votre quartier ?", "Où habitez-vous ?"],
    more: [
      "Qu'est-ce que vous aimez dans votre quartier ?",
      "Depuis combien de temps habitez-vous là ?",
      "Qu'est-ce qui vous plaît dans votre ville ?",
      "Quel est votre endroit préféré dans votre ville ?",
      "Préférez-vous la ville ou la campagne ? Pourquoi ?",
      "Comment vous déplacez-vous au quotidien ?",
      "Où avez-vous grandi ?",
    ],
  },
  famille: {
    core: ["Parlez-moi de votre famille.", "Vivez-vous seul ou avec quelqu'un ?"],
    more: [
      "Que faites-vous ensemble, en famille ?",
      "Avez-vous des frères et sœurs ?",
      "Voyez-vous souvent votre famille ?",
      "Qui est la personne la plus proche de vous ?",
      "Comment fêtez-vous les anniversaires dans votre famille ?",
      "Pouvez-vous décrire votre logement ?",
      "Pouvez-vous me parler de votre meilleur ami ?",
    ],
  },
  loisirs: {
    core: ["Quels sont vos loisirs ?", "Quel voyage vous a le plus marqué ?", "Que faites-vous pendant votre temps libre ?"],
    more: [
      "Que faites-vous le week-end ?",
      "Qu'avez-vous fait le week-end dernier ?",
      "Pratiquez-vous un sport ?",
      "Depuis quand pratiquez-vous cette activité ?",
      "Avec qui passez-vous votre temps libre ?",
      "Aimez-vous voyager ?",
      "Quel pays aimeriez-vous visiter ? Pourquoi ?",
      "Préférez-vous voyager seul ou accompagné ?",
      "Quelle cuisine aimez-vous ? Pourquoi ?",
      "Quel est le dernier film que vous avez aimé ?",
      "Quel genre de musique écoutez-vous ?",
      "Que ferez-vous pendant vos prochaines vacances ?",
    ],
  },
  francais: {
    core: ["Depuis quand apprenez-vous le français ?", "Comment apprenez-vous le français ?"],
    more: [
      "Pourquoi apprenez-vous le français ?",
      "Qu'est-ce qui est le plus difficile pour vous en français ?",
      "Avec qui parlez-vous français ?",
      "Regardez-vous des films ou des séries en français ?",
      "Parlez-vous d'autres langues ?",
    ],
  },
  projets: {
    core: ["Pourquoi avez-vous choisi le Canada ?", "Quels sont vos projets ?"],
    more: [
      "Dans quelle ville du Canada aimeriez-vous vivre ?",
      "Quel métier aimeriez-vous exercer plus tard ?",
      "Où vous voyez-vous dans cinq ans ?",
      "Qu'aimeriez-vous apprendre prochainement ?",
      "Avez-vous un projet personnel en ce moment ?",
    ],
  },
};

export const T1_BANK_ALL: string[] = T1_TOPICS.flatMap((k) => [...T1_BANK[k].core, ...T1_BANK[k].more]);

export function topicOf(question: string): T1Topic | null {
  return T1_TOPICS.find((k) => T1_BANK[k].core.includes(question) || T1_BANK[k].more.includes(question)) ?? null;
}

/**
 * One question per topic, used only when the follow-ups could not be planned from the presentation. Nobody has read
 * the presentation in that case, so the questions come from `more`: a presentation rarely answers those, whereas it
 * almost always answers the typical ones (job, city, family). Questions in `avoid` are skipped when possible.
 */
export function fallbackInterview(avoid: (q: string) => boolean = () => false): string[] {
  const pick = (k: T1Topic) => {
    const all = T1_BANK[k].more.filter((q) => !/canada/i.test(q) || k === "projets");
    const fresh = all.filter((q) => !avoid(q));
    const pool = fresh.length ? fresh : all;
    return pool[Math.floor(Math.random() * pool.length)];
  };
  // the two guaranteed questions come first: start with two topics drawn at random, then the others
  const order = [...T1_TOPICS].sort(() => Math.random() - 0.5);
  return order.map(pick);
}
