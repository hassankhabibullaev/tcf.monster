/**
 * Calibration anchors: realistic candidate productions labelled with the band they would receive on exam day.
 * They are quoted in every evaluator prompt (brief §6: "calibration collapses without anchors").
 * Non-official, written for this app; scores follow docs/rubric.md.
 */
import type { Skill, TaskNo } from "../config.ts";

export type Anchor = { level: string; score20: number; consigne: string; production: string; verdict: string };

export const ANCHORS: Record<Skill, Record<TaskNo, Anchor[]>> = {
  writing: {
    1: [
      {
        level: "B1",
        score20: 8,
        consigne: "Vous avez déménagé à Sherbrooke le mois dernier. Écrivez un courriel à votre amie Nadia pour décrire votre nouvel appartement, raconter votre installation et l'inviter à venir le week-end du 12 avril.",
        production: "Salut Nadia,\nJ'espère que tu vas bien. Je suis déménagé à Sherbrooke le mois dernier. Mon appartement est petit mais il est bien, il y a deux chambres et un balcon. Le quartier est calme et il y a un parc à côté. L'installation était difficile parce que j'ai beaucoup des cartons et je n'ai pas de voiture. Mes amis m'ont aidé le samedi.\nJe veux t'inviter chez moi le week-end du 12 avril. On peut visiter la ville et manger dans un restaurant.\nDis-moi si tu peux venir.\nÀ bientôt,\nHassan",
        verdict: "Toutes les actions sont traitées mais sommairement (niveau B1 en consigne) ; description en phrases juxtaposées ; erreurs récurrentes non bloquantes (« je suis déménagé », « beaucoup des cartons », « je veux t'inviter » un peu abrupt). Niveau B1 → 8/20 estimé (dans la fourchette, 104 mots).",
      },
      {
        level: "B2",
        score20: 12,
        consigne: "Même consigne.",
        production: "Salut Nadia,\nÇa y est, je suis enfin installé à Sherbrooke ! J'ai emménagé le 3 mars dans un trois-pièces lumineux, au deuxième étage d'une petite maison de la rue Wellington. Le salon donne sur une cour avec un érable, et la cuisine est assez grande pour qu'on y mange à quatre.\nL'installation a été plus longue que prévu : le camion est arrivé avec trois heures de retard, et j'ai monté une trentaine de cartons sans ascenseur. Heureusement, mes collègues sont venus me donner un coup de main le lendemain.\nJ'aimerais beaucoup que tu viennes le week-end du 12 avril : je te ferai visiter le centre-ville et le lac des Nations. Dis-moi si ça te convient, je m'occupe du reste.\nÀ très vite,\nHassan",
        verdict: "Chaque action est détaillée (adresse, date, anecdote), registre amical constant, connecteurs naturels ; quelques tournures simples, une seule erreur mineure. Niveau B2 → 12/20 estimé (118 mots).",
      },
      {
        level: "A2",
        score20: 5,
        consigne: "Même consigne.",
        production: "Bonjour Nadia\nJe suis dans Sherbrooke maintenant. Mon appartement est grand. Il y a un chambre et une cuisine. Je aime mon appartement. Vous venez chez moi le 12 avril s'il vous plaît. Nous mangeons ensemble.\nMerci\nHassan",
        verdict: "Sous la longueur (39 mots → plafond 8/20), pas de récit de l'installation, registre incohérent (vous/tu), erreurs bloquantes. Niveau A2 → 5/20 estimé.",
      },
    ],
    2: [
      {
        level: "B1",
        score20: 8,
        consigne: "Le journal de quartier « Le Plateau » publie des témoignages d'habitants sur les transports en commun. Racontez un trajet récent qui vous a marqué, expliquez le problème rencontré et proposez une amélioration.",
        production: "Je prends le bus 55 chaque jour pour aller au travail. La semaine dernière, j'ai attendu le bus pendant 40 minutes parce qu'il y avait beaucoup de neige. Le bus était plein et je suis arrivé en retard au travail. Mon chef n'était pas content.\nJe pense que le problème est que il n'y a pas assez de bus le matin. Aussi, l'application ne donne pas les bonnes informations, elle dit que le bus arrive dans 5 minutes mais il n'arrive pas.\nPour améliorer, la ville doit ajouter des bus entre 7h et 9h et réparer l'application. Aussi, les abris de bus doivent être chauffés en hiver parce que c'est très froid.\nJe espère que la situation va changer bientôt.",
        verdict: "Consigne respectée, mais témoignage simple, idées juxtaposées (« Aussi… Aussi… »), lexique courant, erreurs fréquentes (« que il », « Je espère »). Niveau B1 → 8/20 estimé (129 mots).",
      },
      {
        level: "C1",
        score20: 15,
        consigne: "Même consigne.",
        production: "Un mardi de février, 7 h 40, arrêt Mont-Royal : comme chaque matin, j'attends le 55. Ce jour-là, l'application annonce le bus « dans 3 minutes » pendant vingt-cinq minutes, avant d'afficher, sans explication, le passage suivant. Lorsqu'il arrive enfin, il est bondé ; une dizaine de personnes restent sur le trottoir, dont une femme âgée que j'ai vue rebrousser chemin.\nLe problème n'est pas tant la neige, prévisible en hiver, que l'absence d'information fiable : sans données exactes, impossible de décider d'attendre ou de marcher. Or c'est précisément aux heures de pointe que cette incertitude coûte le plus cher.\nJe propose donc que la Société de transport publie la position réelle des véhicules plutôt qu'un horaire théorique, et qu'elle ajoute des départs entre 7 h et 9 h sur cette ligne. Ces deux mesures, peu coûteuses, rendraient le service enfin prévisible.",
        verdict: "Récit précis et vivant, problème analysé puis proposition argumentée, progression nette, lexique riche (« bondé », « rebrousser chemin », « prévisible »), aucune erreur significative. Niveau C1 → 15/20 estimé (149 mots).",
      },
    ],
    3: [
      {
        level: "B1",
        score20: 8,
        consigne: "Deux documents sur le télétravail : Document 1 (Julie Tremblay, pour) ; Document 2 (Marc Lévesque, contre). Comparez les deux points de vue puis prenez position.",
        production: "Les deux documents parlent du télétravail. Julie Tremblay pense que le télétravail est bien parce que les employés gagnent du temps et sont plus concentrés. Marc Lévesque pense que ce n'est pas bien parce que les employés sont seuls et travaillent trop.\nPour moi, le télétravail est une bonne chose. Premièrement, on ne perd pas de temps dans les transports. Deuxièmement, on peut mieux organiser sa journée. Par exemple, moi je travaille à la maison deux jours par semaine et je suis plus productif. Mais c'est vrai que parfois je me sens seul. Donc je pense que le mieux est de faire deux ou trois jours à la maison et le reste au bureau.",
        verdict: "Les deux positions sont mentionnées mais pas vraiment comparées (deux résumés successifs) ; avis simple avec exemple personnel ; connecteurs scolaires ; langue correcte mais élémentaire. Niveau B1 → 8/20 estimé (123 mots).",
      },
      {
        level: "B2",
        score20: 12,
        consigne: "Même consigne.",
        production: "Ces deux témoignages s'opposent sur les effets du télétravail. Pour Julie Tremblay, il libère les salariés des trajets et améliore leur concentration ; Marc Lévesque, à l'inverse, y voit une source d'isolement et une frontière effacée entre vie privée et travail. Tous deux admettent cependant que l'organisation compte plus que le lieu.\nÀ mon avis, le télétravail est bénéfique à condition d'être encadré. D'une part, il fait gagner un temps précieux, que l'on peut consacrer à sa famille ou au sport. D'autre part, il oblige les entreprises à juger les résultats plutôt que la présence, ce qui est plus juste. Certes, l'isolement est réel ; mais il se corrige par des journées communes au bureau et des réunions régulières. C'est pourquoi je soutiens une formule hybride, deux à trois jours à distance, qui garde les avantages sans les dérives.",
        verdict: "Comparaison réelle avec point commun, avis justifié par deux arguments et une concession, structure en deux parties ; quelques formulations un peu attendues. Niveau B2 → 12/20 estimé (146 mots).",
      },
      {
        level: "Plafonné : élément manquant",
        score20: 8,
        consigne: "Même consigne.",
        production: "Le télétravail est devenu très courant depuis quelques années. Selon moi, c'est une excellente chose. D'abord, les salariés évitent les embouteillages et arrivent reposés. Ensuite, ils peuvent s'occuper de leurs enfants plus facilement. En outre, les entreprises économisent des bureaux. Néanmoins, il faut fixer des règles claires pour que le travail ne déborde pas sur la vie privée. Par exemple, dans mon entreprise, nous avons le droit de nous déconnecter après 18 h, et cela fonctionne bien. En conclusion, je pense que le télétravail doit être encouragé, tout en étant encadré par des horaires précis, car il améliore la qualité de vie et la productivité de tous les employés qui en bénéficient aujourd'hui.",
        verdict: "Langue de niveau B2, mais la première partie (comparaison des deux documents) est absente : la tâche n'est pas réalisée. Critère 1 = niveau A1, plafond « élément obligatoire absent » (11) → 8/20 estimé. La qualité de la langue ne compense pas.",
      },
    ],
  },
  speaking: {
    1: [
      {
        level: "B1",
        score20: 8,
        consigne: "Entretien dirigé.",
        production: "Examinatrice : Pour commencer, pouvez-vous vous présenter ?\nCandidat : Oui. Je m'appelle Hassan, j'ai 29 ans, je viens de Tachkent. Je suis ingénieur... euh... informatique. J'habite avec ma femme.\nExaminatrice : Que faites-vous dans la vie ?\nCandidat : Je travaille dans une entreprise de logiciel. Je fais les applications pour les banques. C'est... c'est intéressant mais c'est beaucoup de travail.\nExaminatrice : Que faites-vous pendant votre temps libre ?\nCandidat : J'aime le football et... regarder les films. Le week-end je vais au parc avec ma femme.\nExaminatrice : D'accord. Pouvez-vous m'en dire un peu plus ?\nCandidat : Euh... j'aime les films français, par exemple Intouchables. C'est un bon film.\nExaminatrice : Pourquoi apprenez-vous le français ?\nCandidat : Parce que je veux aller au Canada, à Montréal. Pour le travail, il faut parler français.",
        verdict: "Répond à chaque question mais brièvement, relance nécessaire, hésitations, lexique courant, erreurs mineures récurrentes (« regarder les films », « entreprise de logiciel »). Niveau B1 → 8/20 estimé.",
      },
      {
        level: "B1 solide, au seuil du B2",
        score20: 10,
        consigne: "Entretien dirigé.",
        production: "Examinatrice : Pour commencer, pouvez-vous vous présenter ?\nCandidat : Bonjour, je m'appelle Karim, je viens du Maroc et j'habite à Rabat. Je travaille comme comptable dans une entreprise de construction pendant environ quatre ans. Pendant mon temps libre, je fais du vélo et je cuisine beaucoup. L'année dernière j'ai visité Montréal et j'ai adoré cette ville, alors je veux m'installer là-bas, et pour ça j'apprends le français.\nExaminatrice : Qu'est-ce que vous préférez dans votre travail ?\nCandidat : J'aime mon travail parce que je dois parler avec beaucoup de gens différents, les clients, les ingénieurs, alors mes journées sont assez variées. C'est parfois stressant à la fin du mois, mais c'est intéressant.\nExaminatrice : Quel est votre plat préféré ? Pourquoi ?\nCandidat : Mon plat préféré c'est le couscous de ma mère, parce que c'est un plat très familial. On le mange tous les vendredis avec toute la famille, et je l'aime très beaucoup.\nExaminatrice : Où habitez-vous ?\nCandidat : J'habite dans un quartier calme près de la mer. Que me plaît, c'est que tout est proche : le marché, le travail, et les gens sont très gentils.",
        verdict: "Répond sans relance, deux ou trois phrases par réponse avec une raison, débit régulier : c'est mieux que l'ancre B1. Mais erreurs récurrentes de niveau B1 (« pendant environ quatre ans » pour « depuis », « très beaucoup », « Que me plaît »), lexique courant et répétitif (« très », « beaucoup »). D'après la transcription : task completion 11, vocabulary 9, grammar 9 → 10/20 estimé.",
      },
      {
        level: "B2",
        score20: 12,
        consigne: "Entretien dirigé.",
        production: "Examinatrice : Pour commencer, pouvez-vous vous présenter ?\nCandidat : Bien sûr. Je m'appelle Hassan, j'ai 29 ans et je suis originaire de Tachkent, en Ouzbékistan. Je suis développeur dans une société qui conçoit des applications bancaires, et je vis avec ma femme, qui est pharmacienne.\nExaminatrice : Depuis combien de temps travaillez-vous dans ce domaine ?\nCandidat : Depuis six ans environ. J'ai commencé comme stagiaire pendant mes études, puis j'ai été embauché à la fin de mon master. Ce qui me plaît, c'est de résoudre des problèmes concrets pour des clients réels.\nExaminatrice : Que faites-vous pendant votre temps libre ?\nCandidat : Je cours trois fois par semaine, souvent le matin avant le travail, et le week-end nous faisons de la randonnée dans les montagnes près de la ville. J'aime aussi le cinéma français, surtout les comédies.\nExaminatrice : Pourquoi apprenez-vous le français ?\nCandidat : D'abord parce que nous souhaitons nous installer au Québec, où le français est indispensable au travail. Mais j'y ai aussi pris goût : c'est une langue que je trouve précise et agréable à écouter.",
        verdict: "Réponses développées sans relance, détails et raisons, passé composé maîtrisé, lexique précis (« originaire », « embauché », « pris goût »), deux ou trois structures complexes seulement. B2 solide → 13/20 estimé.",
      },
      {
        level: "C1",
        score20: 15,
        consigne: "Entretien dirigé.",
        production: "Examinatrice : Pour commencer, pouvez-vous vous présenter ?\nCandidat : Avec plaisir. Je m'appelle Leila, j'ai trente et un ans et je vis à Casablanca, où je dirige depuis quatre ans une petite équipe dans une agence de communication. C'est un métier que j'ai découvert un peu par hasard, pendant un stage, et dont je ne me suis jamais lassée, parce qu'aucun projet ne ressemble au précédent. En dehors du travail, je fais de la randonnée dès que j'en ai l'occasion. Quant au français, je le parle depuis l'enfance, mais c'est en préparant mon départ pour le Québec que j'ai vraiment cherché à le perfectionner.\nExaminatrice : Quel voyage vous a le plus marqué ?\nCandidat : Sans hésiter, celui que j'ai fait en Islande il y a deux ans. Je m'attendais à de beaux paysages, mais pas à me sentir aussi petite devant la nature. Si c'était à refaire, j'y resterais plus longtemps, quitte à voir moins d'endroits.\nExaminatrice : Vivez-vous seule ou avec quelqu'un ?\nCandidat : Je vis avec ma sœur, ce qui a ses avantages et ses inconvénients. On s'entend très bien, mais il a fallu qu'on apprenne à se répartir les tâches, sinon c'était toujours la même qui faisait la cuisine.",
        verdict: "Parole souple dans la présentation comme dans les réponses : relatives variées (« où », « dont », « celui que »), subjonctif (« il a fallu qu'on apprenne »), hypothèse au conditionnel, gérondif, « y » et « en », concession (« quitte à ») ; lexique précis et nuancé, aucune erreur. C1 → 15/20 estimé.",
      },
    ],
    2: [
      {
        level: "B1",
        score20: 8,
        consigne: "Vous appelez la responsable du club de natation Aquavie pour inscrire votre fille de 8 ans : horaires, prix, conditions.",
        production: "Examinatrice : Club Aquavie, bonjour, je vous écoute.\nCandidat : Bonjour madame. Je veux inscrire ma fille à la natation. Elle a 8 ans. C'est possible ?\nExaminatrice : Oui, nous avons un groupe pour les 7 à 9 ans le samedi matin.\nCandidat : D'accord. Quel est le prix ?\nExaminatrice : 180 dollars pour la session de dix semaines.\nCandidat : C'est cher. Est-ce que il y a une réduction ?\nExaminatrice : Il y a 10 % pour le deuxième enfant.\nCandidat : Ah, je n'ai qu'une fille. Et... à quelle heure le samedi ?\nExaminatrice : De 9 h à 10 h.\nCandidat : D'accord. Elle doit apporter quelque chose ?\nExaminatrice : Un maillot, un bonnet et des lunettes.\nCandidat : OK. Merci beaucoup. Au revoir.",
        verdict: "Le candidat pose des questions pertinentes mais peu nombreuses, sans conditions (inscription, annulation, niveau requis), échange terminé bien avant le temps, formes interrogatives élémentaires (« C'est possible ? », « Est-ce que il y a »). Niveau B1 → 8/20 estimé.",
      },
      {
        level: "B2 seuil",
        score20: 10,
        consigne: "Même consigne.",
        production: "Candidat : Bonjour madame, je vous appelle parce que je voudrais inscrire ma fille à la natation. Je peux vous poser quelques questions ?\nExaminatrice : Oui, bonjour ! Je vous écoute.\nCandidat : Elle a huit ans et elle ne sait pas nager. Est-ce que vous avez un cours pour elle ?\nExaminatrice : Oui, le groupe débutants, pour les 7 à 9 ans.\nCandidat : D'accord, très bien. Et c'est quel jour ?\nExaminatrice : Le samedi, de 9 h à 10 h.\nCandidat : Ah, c'est bien pour nous. Et ça coûte combien ?\nExaminatrice : 180 dollars pour dix semaines.\nCandidat : D'accord. Est-ce qu'il y a une réduction ?\nExaminatrice : 10 % pour le deuxième enfant.\nCandidat : Ah, c'est dommage, j'ai seulement une fille. Et pour l'inscription, je fais comment ?\nExaminatrice : Il y a un formulaire en ligne.\nCandidat : Très bien. Elle doit apporter quelque chose ?\nExaminatrice : Un maillot, un bonnet et des lunettes.\nCandidat : D'accord. Et si elle est malade, on peut annuler ?\nExaminatrice : Vous pouvez rattraper une séance par session.\nCandidat : Parfait. Merci beaucoup, je vais faire l'inscription ce soir. Bonne journée !",
        verdict: "Ouverture, objectif annoncé, sept questions pertinentes qui couvrent l'essentiel, une réaction après chaque réponse, clôture ; presque aucune erreur. Mais formes interrogatives simples (« c'est quel jour ? », « ça coûte combien ? »), lexique courant, aucune structure complexe ni question de précision. B2 seuil → 10/20 estimé.",
      },
      {
        level: "B2 solide",
        score20: 13,
        consigne: "Même consigne.",
        production: "Candidat : Bonjour madame. Je vous appelle parce que j'aimerais inscrire ma fille à un cours de natation, et j'aurais quelques questions. Vous avez deux minutes ?\nExaminatrice : Oui, bonjour ! Je vous écoute.\nCandidat : Pour commencer, elle a huit ans et elle n'a jamais pris de cours. Est-ce que vous avez un groupe qui lui conviendrait ?\nExaminatrice : Oui, le groupe débutants, pour les 7 à 9 ans.\nCandidat : Ah, c'est une bonne nouvelle. Et pour les horaires, ça se passe comment ? En semaine, je travaille toute la journée.\nExaminatrice : C'est le samedi, de 9 h à 10 h.\nCandidat : Parfait, ça tombe bien. Côté prix, ça coûte combien, et qu'est-ce que ça comprend ?\nExaminatrice : 180 dollars pour dix semaines, sans le matériel.\nCandidat : D'accord, je comprends. Il y a des réductions, par exemple si on paie pour l'année ?\nExaminatrice : Non, seulement 10 % pour le deuxième enfant.\nCandidat : Ah, c'est dommage. Et le matériel, je dois l'acheter moi-même, ou on peut le louer sur place ?\nExaminatrice : Il faut l'apporter : maillot, bonnet et lunettes.\nCandidat : C'est noté, merci. Et si jamais elle n'aimait pas ça, est-ce qu'il serait possible d'annuler ?\nExaminatrice : Le premier cours est remboursable si vous annulez dans la semaine.\nCandidat : Ça me rassure. Une dernière chose : pour l'inscription, je dois venir sur place ?\nExaminatrice : Non, il y a un formulaire en ligne.\nCandidat : Très bien. Merci beaucoup, c'est très clair. Je remplis le formulaire ce soir. Bonne journée !",
        verdict: "Conduite complète et naturelle : ouverture, questions qui donnent une raison (« je travaille toute la journée »), réactions variées, questions de précision (« qu'est-ce que ça comprend ? »), une hypothèse (« si jamais elle n'aimait pas ça, est-ce qu'il serait possible… »), clôture. Répertoire B2 courant bien employé, sans la finesse d'une interrogation indirecte ou d'un registre soutenu. B2 solide → 13/20 estimé.",
      },
      {
        level: "C1",
        score20: 15,
        consigne: "Même consigne.",
        production: "Examinatrice : Club Aquavie, bonjour, je vous écoute.\nCandidat : Bonjour madame. Je vous appelle au sujet des cours de natation pour enfants : j'aimerais inscrire ma fille, qui a huit ans et qui n'a jamais pris de cours. Pourriez-vous me dire quels groupes lui correspondraient ?\nExaminatrice : Le groupe débutants 7-9 ans, le samedi de 9 h à 10 h.\nCandidat : Parfait, c'est un créneau qui nous convient. Et concrètement, combien coûte une session, et que comprend ce tarif ?\nExaminatrice : 180 dollars pour dix semaines, matériel non compris.\nCandidat : D'accord. Je me demandais s'il existait une formule d'essai, au cas où elle n'accrocherait pas.\nExaminatrice : Le premier cours est remboursable si vous annulez dans la semaine.\nCandidat : C'est bon à savoir. Dans ce cas, quelles sont les modalités d'inscription : faut-il un certificat médical ou un dossier particulier ?\nExaminatrice : Un formulaire en ligne et une preuve d'âge suffisent.\nCandidat : Très bien. Une dernière chose : si nous devions manquer une séance, serait-il possible de la rattraper ?\nExaminatrice : Oui, une fois par session, sur un autre créneau.\nCandidat : Merci beaucoup pour ces précisions, je remplis le formulaire ce soir. Bonne journée.",
        verdict: "Conduite complète de l'échange : ouverture, objectif annoncé, questions variées (inversion, indirecte, hypothèse), réactions aux réponses, vérification des conditions, clôture ; registre soutenu, aucune erreur notable. Niveau C1 → 15/20 estimé.",
      },
    ],
    3: [
      {
        level: "B1",
        score20: 8,
        consigne: "Selon vous, faut-il interdire les téléphones portables à l'école ?",
        production: "Candidat : Je pense que oui, il faut interdire les téléphones à l'école. Premièrement, les élèves ne sont pas concentrés, ils regardent leur téléphone tout le temps. Deuxièmement, il y a des problèmes avec les réseaux sociaux, par exemple le harcèlement. Dans mon pays, dans mon école, c'était interdit et c'était bien. Aussi, les élèves parlent plus ensemble quand il n'y a pas de téléphone. Donc, pour moi, c'est une bonne idée d'interdire. ... C'est tout.\nExaminatrice : Pourtant, certaines personnes pensent que le téléphone est un outil pédagogique utile. Qu'en pensez-vous ?\nCandidat : Oui, c'est vrai, on peut chercher des informations. Mais je pense que les élèves ne font pas ça, ils jouent.\nExaminatrice : Dans quelles conditions une interdiction fonctionnerait-elle moins bien ?\nCandidat : Euh... peut-être au lycée, parce que les élèves sont grands. Ils ont besoin du téléphone pour... pour les parents.\nExaminatrice : Pouvez-vous donner un exemple concret ?\nCandidat : Par exemple, ma sœur, elle a 16 ans, elle utilise le téléphone pour le bus, pour savoir l'heure.",
        verdict: "Position claire, raisons énumérées avec un exemple, mais développement court (moins d'une minute), réactions aux objections minimales, connecteurs récités. Niveau B1 → 8/20 estimé.",
      },
      {
        level: "B2 seuil",
        score20: 10,
        consigne: "Même consigne.",
        production: "Candidat : Personnellement, je pense qu'il faut interdire les téléphones pendant les cours, mais pas pendant les pauses. Ma première raison, c'est la concentration. Quand un élève a son téléphone sur la table, il regarde ses messages et il n'écoute pas le professeur. Par exemple, mon petit frère a de mauvaises notes depuis qu'il a un téléphone. Ma deuxième raison, c'est les relations. Sans téléphone, les élèves parlent ensemble et ils se font des amis. Bien sûr, le téléphone est parfois utile, par exemple pour appeler les parents. C'est pourquoi je pense que la meilleure solution est de le garder dans le sac pendant les cours. Donc, pour résumer, je suis pour une interdiction en classe.\nExaminatrice : Pourtant, certaines personnes pensent que le téléphone est un outil pédagogique utile. Qu'en pensez-vous ?\nCandidat : C'est vrai que le téléphone peut aider, par exemple pour chercher un mot. Mais je pense que les élèves l'utilisent surtout pour jouer, donc le professeur doit décider.",
        verdict: "Position claire avec une condition, deux raisons annoncées, un exemple personnel, une concession simple, une conclusion ; vraie réponse à l'objection ; presque aucune erreur. Mais phrases simples reliées par « et », « mais », « donc », lexique courant, une seule structure plus riche (« depuis qu'il a »). B2 seuil → 10/20 estimé.",
      },
      {
        level: "B2",
        score20: 12,
        consigne: "Même consigne.",
        production: "Candidat : C'est une question qui divise beaucoup les parents, et je comprends pourquoi. Pour ma part, je suis favorable à une interdiction pendant les cours, mais pas à une interdiction totale. Mon premier argument concerne l'attention : plusieurs enseignants que je connais constatent que la simple présence du téléphone sur la table réduit la concentration, même s'il est éteint. Mon deuxième argument est social : sans écran, les élèves se parlent pendant les pauses, et cela compte autant que les cours. Cela dit, le téléphone peut être utile, par exemple pour prévenir les parents d'un retard ou pour consulter un dictionnaire. C'est pourquoi je défendrais une règle claire : rangé pendant les cours, autorisé à la récréation.\nExaminatrice : Pourtant, certaines personnes pensent que le téléphone est un outil pédagogique utile. Qu'en pensez-vous ?\nCandidat : Elles ont raison dans certains cas, notamment pour les recherches rapides ou les applications de langue. Mais dans la pratique, l'usage pédagogique reste minoritaire par rapport aux jeux et aux réseaux sociaux. Il faudrait donc que ce soit l'enseignant qui décide, ponctuellement, de l'autoriser.\nExaminatrice : Dans quelles conditions une interdiction fonctionnerait-elle moins bien ?\nCandidat : Si elle est appliquée sans explication, les élèves la contournent. Elle fonctionne quand elle est discutée avec eux et appliquée de la même façon par tous les professeurs.\nExaminatrice : Pouvez-vous comparer avec votre pays ?\nCandidat : En Ouzbékistan, il n'y a pas de règle nationale ; chaque école décide. Dans celle de ma sœur, les téléphones sont déposés dans une boîte le matin, et les élèves s'y sont habitués en quelques semaines.",
        verdict: "Position nuancée maintenue, deux arguments distincts avec exemples, concession authentique, vraie réponse à chaque intervention, connecteurs au service de la logique ; lexique précis, quelques structures complexes. B2 solide → 13/20 estimé.",
      },
      {
        level: "C1",
        score20: 15,
        consigne: "Même consigne.",
        production: "Candidat : Si je comprends bien, on me demande s'il faut interdire le téléphone à l'école. Je suis plutôt pour, à condition que l'interdiction soit expliquée aux élèves plutôt qu'imposée. Ma première raison tient à la concentration : bien qu'on répète que les jeunes savent tout faire en même temps, il suffit d'observer une classe pour voir que chaque notification casse le fil du cours. Quand j'étais au lycée, un de mes professeurs ramassait les téléphones au début de l'heure, et c'est le seul cours dont je me souvienne vraiment. Ma deuxième raison est d'ordre social : sans écran, les élèves sont bien obligés de se parler, et ceux qui restaient dans leur coin finissent par trouver leur place. Certes, on m'objectera que le téléphone rassure les parents, et je le comprends ; mais rien n'empêche de le laisser dans le sac jusqu'à la sortie. Donc, pour résumer, je défendrais une interdiction pendant les cours, pourvu qu'elle s'accompagne d'une vraie discussion avec les élèves.\nExaminatrice : Pourtant, certaines personnes pensent que le téléphone est un outil pédagogique utile. Qu'en pensez-vous ?\nCandidat : Elles n'ont pas tort, et je ne voudrais pas caricaturer. Pour une recherche rapide ou un exercice de langue, il rend service. Encore faudrait-il que ce soit l'enseignant qui en décide, au cas par cas ; sinon, l'exception devient vite la règle.",
        verdict: "Position annoncée d'emblée et tenue, deux raisons d'ordres différents avec un exemple personnel, concession puis réfutation, conclusion ; subjonctif après « bien que », « pourvu que », « dont je me souvienne », lexique abstrait précis, aucune erreur ; réponse souple à l'objection. C1 → 15/20 estimé.",
      },
    ],
  },
};

/**
 * Short extra anchors for the two ends of the scale, shared by every written task. A range test showed that without
 * them a weak A2 text drifted up to 7 and every strong text was flattened at 15. They sit in the cached part of the
 * prompt, so they cost almost nothing per scoring.
 */
export const RANGE_ANCHORS = `--- Repère bas — A2, 5/20 (extrait) ---
« Bonjour Madame. Je écris parce que je veux un information pour le cours de danse. Je suis intéressé beaucoup. Combien il coûte le cours ? Moi je travaille le matin alors je peux venir seulement le soir. Vous répondre à moi s'il vous plaît. »
Verdict : erreurs dans presque chaque phrase (élision, genre, verbe non conjugué, ordre des mots), phrases juxtaposées ; le message passe quand même → 5.
--- Repère haut — C1, 15/20 (extrait) ---
« Bien que le quartier ait beaucoup changé ces dernières années, il a su conserver ce qui faisait son charme : ses petits commerces, où l'on prend encore le temps de discuter, et ce marché du dimanche qu'aucun habitant ne manquerait pour rien au monde. »
Verdict : concession au subjonctif, relatives enchâssées, lexique précis, aucune erreur → 15.
--- Repère très haut — C2, 18/20 (extrait) ---
« On aura beau dire que la ville ne dort jamais, c'est pourtant à l'aube, quand les rideaux de fer se lèvent un à un dans un fracas familier, qu'elle m'a paru la plus vivante — et, disons-le, la plus attachante. »
Verdict : aisance de plume, rythme, expression idiomatique et implicite maîtrisés, comme un locuteur natif cultivé → 18.
--- Repère très haut, message court et familier — C2, 18/20 (extrait) ---
« Mon cher Karim, il paraît qu'on ne fête pas ses trente-cinq ans — raison de plus pour le faire. Samedi, à partir de 19 heures, la maison sera ouverte à une vingtaine d'amis. Inutile de venir les bras chargés : si vraiment tu ne peux pas t'en empêcher, une bouteille fera l'affaire. Dis-moi seulement si je peux compter sur toi, que je ne me retrouve pas avec de quoi nourrir un régiment. »
Verdict : un message simple et amical PEUT être C2 : tout y est (date, heure, invités, quoi apporter, réponse attendue), dit avec naturel, humour et expressions idiomatiques justes, sans une faute. Le registre familier et la brièveté ne plafonnent pas la note à 15 : toutes les lignes, « Task completion » et « Spelling » comprises, montent à 17–19 → 18.`;

/** Every anchor of the task (the fixed part of the prompt is cached, so the third one costs next to nothing) plus the range anchors for writing. */
export function anchorsText(skill: Skill, task: TaskNo, max = 3): string {
  const chosen = ANCHORS[skill][task].slice(0, max);
  const body = chosen.map((a, i) => `--- Ancre ${i + 1} — ${a.level}, ${a.score20}/20 ---\nConsigne : ${a.consigne}\nProduction :\n${a.production}\nVerdict de l'examinateur : ${a.verdict}`).join("\n\n");
  return skill === "writing" ? `${body}\n\n${RANGE_ANCHORS}` : body;
}
