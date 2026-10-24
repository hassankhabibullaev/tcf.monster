# Grille de notation — TCF Canada, expression écrite et expression orale

**Statut : grille pédagogique NON officielle (version 2.1-non-officielle).** France Éducation international ne publie pas ses grilles ni ses descripteurs de bande. Cette grille reprend les *critères officiels* listés dans le Manuel du candidat (voir `content/exam-reference.json`) et les note sur 20, sur l'échelle CECRL ↔ /20. Toute note produite avec elle est une **estimation pédagogique**. La conversion /20 → NCLC utilise le tableau officiel IRCC.

Pondérations des tâches (repli, absentes des sources officielles) : tâche 1 = 6 points, tâche 2 = 6 points, tâche 3 = 8 points, total 20. Les valeurs chiffrées sont dans `config/tcf.ts` ; les critères et leurs poids dans `lib/eval/rubric.ts`.

## 1. Échelle (0 à 20) — la même pour chaque critère et pour la note

Chaque critère est noté **sur 20**, sur la correspondance officielle CECRL ↔ /20 du tableau IRCC. « Vocabulaire 15, Prononciation 9 » se lit donc directement : 10 est l'objectif (B2) sur chaque ligne.

| Note /20 | Niveau | Ce que l'examinateur constate |
|---|---|---|
| 0 | non évaluable | Rien de pertinent, production vide, inaudible, hors sujet total ou dans une autre langue. |
| 1–3 | A1 | Quelques mots ou phrases isolées ; la fonction du critère n'est pas remplie. |
| 4–5 | A2 | Le critère est abordé de façon très simple et incomplète ; compréhension difficile par endroits. |
| 6–9 | B1 | Le critère est rempli de façon simple mais compréhensible ; erreurs fréquentes qui ne bloquent pas le sens ; développement limité. (6 = B1 fragile, 9 = B1 solide au seuil du B2.) |
| 10–13 | B2 | Le critère est rempli clairement et de façon développée ; erreurs occasionnelles, jamais bloquantes ; bonne organisation. |
| 14–15 | C1 | Le critère est rempli avec aisance, précision et nuance ; erreurs rares et mineures ; registre maîtrisé. |
| 16–20 | C2 | Maîtrise quasi native : précision, naturel, souplesse ; erreurs quasi inexistantes. |

Règles d'attribution :
- Une note n'est accordée que sur **preuve citée** dans la production (mots exacts du candidat, ou silence documenté).
- On attribue le niveau **le mieux démontré**, pas la meilleure phrase isolée. Une seule tournure C1 dans un texte B1 ne fait pas un texte B2.
- La fréquence compte : une erreur isolée pèse moins qu'un schéma récurrent ; un schéma récurrent qui gêne la compréhension plafonne le critère linguistique à 9.
- **« Task completion » se note sur ce que la production fait**, pas sur la finesse de la langue : 10–11 = tout est traité, un point par phrase ; 12–13 = chaque point a un détail concret, texte organisé, ton juste ; 14–15 = chaque point est développé (fait, détail précis, raison ou ressenti), idées enchaînées, rien ne manque ; 16 et plus = vivant et parfaitement ajusté au destinataire. Le calcul limite ensuite l'écart avec la langue (voir § 2).
- Pour chaque critère, l'évaluateur écrit en une phrase **ce qui a empêché la note supérieure**.
- **À l'oral**, le C1 (14–15) ne demande ni idiomes rares ni style littéraire : plusieurs structures complexes employées spontanément et justes (subjonctif, hypothèse au conditionnel, relatives et mises en relief, « y » / « en », gérondif, concession), un lexique précis, pas de schéma d'erreurs audibles. Rien de ce qui dépend de l'examinatrice (nombre de questions, réponse coupée par le temps) n'est retenu contre le candidat. L'aisance est encadrée par les mesures faites sur l'enregistrement (débit, pauses) ; la prononciation note l'effort de l'auditeur, pas l'accent.

### Critères notés tout de suite et critères notés sur l'audio (oral)

Une transcription ne contient ni la prononciation, ni les hésitations (le transcripteur les efface). À l'oral :
- les critères de contenu, d'interaction, de **Vocabulaire** et de **Grammaire** sont notés dès la fin de la tâche, d'après la transcription → « estimation d'après la transcription » ;
- **Aisance** et **Prononciation et intelligibilité** ne sont notés que lorsque le candidat demande l'analyse complète : l'enregistrement lui-même est alors écouté par un modèle audio, et les pauses et le débit sont mesurés en code. La note est recalculée avec tous les critères et l'écart est expliqué.

## 2. Calcul

1. **Plafond de langue.** La note du TCF est un niveau de langue : une tâche parfaitement menée ne relève pas ce niveau. Moyenne de langue = moyenne des critères linguistiques notés (vocabulaire, grammaire, puis aisance et prononciation quand ils sont connus). Un critère de tâche ne peut pas dépasser cette moyenne de plus de 3 points ; s'il est abaissé, la ligne le dit (« plafonné par le niveau de langue »).
2. Moyenne pondérée des critères notés ; elle ne peut pas dépasser la moyenne de langue de plus de 1 point.
3. Plafonds éventuels, puis **arrondi à l'entier le plus proche** : une note du TCF est un nombre entier.
4. Épreuve complète : moyenne des tâches pondérée 6 / 6 / 8, arrondie à l'entier. Épreuve partielle : même calcul sur les tâches passées, étiqueté « partiel ».

### Plafonds (non-réalisation de la tâche — appliqués **après** le calcul, quelle que soit la qualité de la langue)

| Situation constatée | Plafond de la note /20 de la tâche |
|---|---|
| Production vide, inaudible, dans une autre langue | 0 |
| Hors sujet ou mauvais type de texte / mauvaise tâche (ex. lettre au lieu d'article, monologue au lieu de questions en oral T2) | 6 |
| Élément obligatoire de la consigne absent (ex. T3 écrit : un seul document traité ou pas de prise de position ; oral T2 : le candidat ne pose pas de questions ; T1 écrit : une des actions demandées manque) | 11 |
| Registre globalement inadapté (tutoiement d'un supérieur, familiarité dans un texte formel, ou l'inverse) | 11 |
| Longueur hors fourchette officielle (écrit) : écart ≤ 25 % de la borne | 11 |
| Longueur hors fourchette officielle (écrit) : écart > 25 % de la borne | 8 |
| Oral : temps de parole du candidat < 40 % de la durée de la tâche | 8 |

Les plafonds se cumulent par le minimum. Le nombre de mots et les durées sont **calculés par le serveur** et transmis à l'évaluateur comme des faits.

## 3. Critères par tâche (poids entre parenthèses)

Les critères suivent les trois ordres que France Éducation international publie pour les deux épreuves d'expression (page « Évaluation des épreuves du TCF ») : **linguistique** (étendue du lexique → Vocabulary ; correction grammaticale et degré d'élaboration des phrases → Grammar ; orthographe → Spelling à l'écrit ; aisance et prononciation → Fluency et Pronunciation à l'oral), **pragmatique** (développement thématique et, à l'oral, interaction → Task completion ; structuration du discours, cohérence et cohésion → Organization) et **sociolinguistique** (adéquation à la situation de communication : destinataire, registre, tu/vous → Task completion). Depuis octobre 2026, les critères sont regroupés et portent le même nom dans toutes les tâches (noms en anglais, comme l'écran de résultat). Chaque critère est noté sur 20 en interne et AFFICHÉ comme un niveau (A1 à C2) ; seule la note d'ensemble est affichée sur 20. Les intitulés officiels du Manuel du candidat sont repris dans la description de « Task completion ».

Les descripteurs ci-dessous s'arrêtent à C1 pour rester courts, mais l'échelle continue : **C2 (16–18)** pour tout critère quand la production est celle d'un locuteur quasi natif — tâche menée avec aisance, humour ou implicite, lexique idiomatique et nuancé, syntaxe souple et variée, erreurs quasi inexistantes (une coquille ou un lapsus isolé n'y change rien). Ne pas s'arrêter à 15 par prudence.

Avant de noter, l'évaluateur fait un relevé factuel, citations exactes à l'appui : structures complexes employées correctement, erreurs, mots précis, expressions idiomatiques. Le serveur vérifie les citations dans la production et encadre les notes de Grammar, Vocabulary et Spelling d'après ces comptes (`lib/eval/evidence.ts`).

### Expression écrite — Tâche 1 (6 points) — message, 60–120 mots
1. **Task completion** (1) — le message fait ce qui est demandé (inviter, informer, raconter, conseiller…) pour le destinataire indiqué, avec les informations utiles que la situation appelle (c'est au candidat d'inventer les détails : date, lieu, raisons) ; contenu concret (qui, quoi, quand, où, pourquoi) ; ton adapté au destinataire, tu/vous cohérent. B1 (6–9) : objectif traité sommairement, faits énumérés ; B2 (10–13) : objectif atteint avec des détails précis et expliqués, registre juste ; C1 (14–15) : traitement complet, naturel et vivant.
2. **Organization** (0,5) — cohérence et cohésion : un message construit (ouverture, corps, clôture adaptées), idées dans un ordre logique, phrases reliées par des connecteurs justes, reprises par des pronoms plutôt que par des répétitions, ponctuation qui découpe le sens. B1 (6–9) : idées posées les unes après les autres, « et », « mais », « parce que » ; B2 (10–13) : progression claire, connecteurs variés et justes ; C1 (14–15) : enchaînement naturel, transitions fines.
3. **Vocabulary** (1) — B1 (6–9) : lexique courant, répétitions, mots approximatifs ; B2 (10–13) : lexique précis et varié ; C1 (14–15) : lexique riche, collocations justes.
4. **Grammar** (1,5) — conjugaison et temps, accords, prépositions, articles, construction des phrases, degré d'élaboration et variété des structures. B1 (6–9) : erreurs fréquentes non bloquantes, phrases simples ; B2 (10–13) : erreurs occasionnelles, phrases reliées et quelques structures complexes ; C1 (14–15) : erreurs rares, syntaxe complexe maîtrisée.
5. **Spelling** (1) — orthographe d'usage, accents, majuscules, ponctuation (les fautes d'accord relèvent de Grammar). B1 (6–9) : fautes fréquentes ; B2 (10–13) : quelques fautes ; C1 (14–15) : fautes rares. Compte dans la note, pas dans le plafond de langue.

### Expression écrite — Tâche 2 (6 points) — article, blog, courrier, message à plusieurs destinataires, 120–150 mots
1. **Task completion** (1) — le genre demandé est respecté (article de blog, message à des amis, lettre de réclamation, courrier des lecteurs…), les destinataires aussi, et l'objectif est atteint : un récit ou un compte rendu accompagné d'une opinion, d'arguments ou de commentaires. B1 (6–9) : récit simple, opinion brève ; B2 (10–13) : récit développé, opinion justifiée par des arguments ; C1 (14–15) : récit riche, opinion argumentée et nuancée.
2. **Organization** (0,5) — progression claire du récit vers l'opinion, paragraphes, connecteurs pertinents (pas seulement nombreux), reprises sans répétition. B1 (6–9) : idées juxtaposées ; B2 (10–13) : paragraphes et progression claire ; C1 (14–15) : articulation fine.
3. **Vocabulary** (1) — comme T1, avec une exigence de précision accrue.
4. **Grammar** (1,5) — comme T1 ; les temps du récit (passé composé / imparfait) sont attendus à partir du niveau B2.
5. **Spelling** (1) — comme T1.

### Expression écrite — Tâche 3 (8 points) — comparer deux points de vue puis prendre position, 120–180 mots
1. **Task completion** (1) — première partie : synthèse et REFORMULATION fidèles des deux documents, positions clairement distinguées, sans contresens (les passages recopiés, signalés dans les faits calculés par le serveur, ne comptent pas comme une reformulation et baissent cette note) ; seconde partie : position personnelle explicite, justifiée par au moins deux arguments, avec un exemple. B1 (6–9) : les deux positions sont mentionnées, avis simple ; B2 (10–13) : positions réellement comparées et reformulées, avis justifié et illustré ; C1 (14–15) : synthèse fine, avis nuancé (concession puis réfutation) et conclu.
2. **Organization** (0,5) — deux parties visibles et proportionnées (40–60 mots puis 80–120 mots), une transition entre elles, arguments annoncés et ordonnés, connecteurs logiques (opposition, cause, conséquence, concession) employés à bon escient, conclusion. B1 (6–9) : parties peu distinctes, connecteurs simples ; B2 (10–13) : plan clair, connecteurs variés ; C1 (14–15) : argumentation articulée avec finesse.
3. **Vocabulary** (1) — lexique de l'argumentation, registre neutre ou formel, aucune familiarité.
4. **Grammar** (1,5) — comme T1 ; le subjonctif après les tournures d'opinion et la concordance sont attendus à partir du niveau B2.
5. **Spelling** (1) — comme T1.

### Expression orale — Tâche 1 (6 points) — entretien dirigé, 2 min, sans préparation
1. **Task completion** (1) — une présentation (qui je suis, mon travail ou mes études, mon temps libre, mon projet), puis des réponses directes aux questions sur soi, son environnement familial et professionnel, développées (le fait, un détail concret, une raison). L'examinatrice interrompt la présentation à 1 min 30 et pose au moins deux questions : une présentation coupée n'est pas un défaut, et le nombre de questions posées ne dépend pas du candidat. B1 (6–9) : réponses courtes mais pertinentes, parfois seulement après relance ; B2 (10–13) : réponses développées spontanément (deux ou trois phrases avec une raison), échange suivi sans aide ; C1 (14–15) : réponses riches, nuancées, avec anecdotes, échange naturel.
2. **Organization** (0,5) — structuration du discours, cohérence et cohésion : une présentation qui suit un ordre (qui je suis, ce que je fais, mes projets), des réponses qui vont droit à la question puis se développent, des idées reliées par des connecteurs audibles. B1 (6–9) : phrases posées les unes après les autres ; B2 (10–13) : discours ordonné et relié ; C1 (14–15) : enchaînements naturels et variés.
3. **Vocabulary** (1) — B1 (6–9) : mots courants, répétitions ; B2 (10–13) : lexique précis ; C1 (14–15) : lexique varié et idiomatique.
4. **Grammar** (1,5) — temps du passé pour le parcours, prépositions, constructions, variété des structures, d'après ce qui a été réellement DIT. La transcription est automatique : ce qui ne s'entend pas (accords et terminaisons muets, homophones), les petits mots que la machine confond ou avale (un/une, le/la, « se », « ne ») et les lapsus isolés de l'oral spontané ne comptent pas ; seules comptent les erreurs audibles, certaines et récurrentes, ou celles qui gênent la compréhension. Cette règle vaut pour le vocabulaire et pour les trois tâches orales.
5. **Fluency** (1) — *analyse audio* — hésitations, « euh », faux départs et reprises, pauses au milieu des phrases, temps de réaction, débit. La note est encadrée par les mesures faites sur l'enregistrement. B1 (6–9) : hésitations fréquentes, débit lent ou haché ; B2 (10–13) : débit assez régulier, quelques pauses pour chercher ses mots ; C1 (14–15) : parole fluide et spontanée.
6. **Pronunciation** (1) — *analyse audio* — sons (voyelles nasales, u/ou, é/è, r), rythme et intonation ; on note l'effort demandé à l'auditeur, pas l'accent. B1 (6–9) : accent marqué, certains mots demandent un effort ; B2 (10–13) : tout se comprend, accent présent ; C1 (14–15) : rythme et intonation naturels.

### Expression orale — Tâche 2 (6 points) — obtenir des informations, 2 min de préparation + 3 min 30
1. **Task completion** (1) — poser des questions adaptées à la situation : initiative, pertinence par rapport à l'objectif, couverture des informations à obtenir, questions de suivi et de précision, variété des formes interrogatives ; conduite de l'échange : ouverture et clôture, une courte réaction après les réponses (« D'accord, très bien. », « Ah, c'est dommage. »), une relance quand la réponse est courte, registre choisi selon l'interlocuteur (tu avec un proche, vous avec un professionnel, un employeur ou un inconnu) et tenu jusqu'à la fin. Ne pas retirer de points pour un détail non demandé que la consigne ne rendait pas nécessaire. B1 (6–9) : quelques questions simples, objectif partiellement atteint ; B2 (10–13) : questions variées et pertinentes, informations obtenues, quelques questions de suivi ; C1 (14–15) : conduite naturelle, questions de précision et de vérification finement formulées.
2. **Organization** (0,5) — un échange conduit dans un ordre logique : ouverture, questions regroupées par sujet et enchaînées, relances au bon moment, clôture. B1 (6–9) : questions posées au hasard ; B2 (10–13) : échange ordonné du début à la fin ; C1 (14–15) : conduite fluide qui suit naturellement les réponses.
3. **Vocabulary** (1) — lexique de la situation (prix, conditions, dates…).
4. **Grammar** (1,5) — formes interrogatives (inversion, « est-ce que », interrogation indirecte), conditionnel de politesse ; même règle de transcription que T1.
5. **Fluency** (1) — *analyse audio* — comme T1.
6. **Pronunciation** (1) — *analyse audio* — comme T1.

### Expression orale — Tâche 3 (8 points) — point de vue, 4 min 30, sans préparation
1. **Task completion** (1) — présenter une argumentation : position claire et maintenue, au moins deux raisons distinctes (de deux ordres différents : santé, argent, temps, relations, environnement…), au moins un exemple concret ou personnel, une nuance (« certes… mais… »), une réponse à la question posée ; réponse réelle aux objections de l'examinatrice ; parole tenue sur la durée (s'arrêter au bout de deux minutes limite ce critère). Si l'examinatrice n'a posé aucune question parce que le candidat a parlé jusqu'à la fin du temps, la nuance se juge dans son développement. B1 (6–9) : opinion simple avec une raison ; B2 (10–13) : argumentation organisée avec exemples et une concession ; C1 (14–15) : argumentation riche, nuancée, objections traitées avec souplesse.
2. **Organization** (0,5) — structuration du discours : position annoncée dès les premières phrases, raisons annoncées de façon audible (« ma première raison… », « ensuite… »), connecteurs au service de la logique, conclusion qui reprend la position. B1 (6–9) : idées dites dans l'ordre où elles viennent ; B2 (10–13) : plan audible et connecteurs variés ; C1 (14–15) : discours articulé avec finesse, transitions naturelles.
3. **Vocabulary** (1) — lexique abstrait et précis du sujet.
4. **Grammar** (1,5) — même règle de transcription que T1.
5. **Fluency** (1) — *analyse audio* — comme T1 ; en monologue long, capacité à tenir la parole sans blocage.
6. **Pronunciation** (1) — *analyse audio* — comme T1.

## 4. Retour au candidat

L'application affiche la note entière sur 20, le NCLC et le niveau, puis une ligne par critère : une barre A1 → C2 avec un repère sur le niveau atteint et un mot (Very weak, Weak, Almost there, On target, Excellent, Outstanding) — pas de note par critère. Dessous, trois conseils au plus, courts : une chose dite ou écrite de travers (ses mots → la forme correcte), un son à corriger avec la réécoute du passage (oral), et ce qui ferait passer au niveau supérieur, avec une phrase modèle construite sur son propre contenu. La note d'ensemble est le jugement global de l'évaluateur, maintenu à un point près de la moyenne pondérée des critères. À l'oral, l'enregistrement est analysé d'office à la fin de chaque tâche (aisance, prononciation). À l'écrit, la liste complète des erreurs et le vocabulaire à apprendre restent affichés sous la carte.

## 4 bis. Erreurs itémisées (ancienne version, non utilisée)

Chaque erreur relevée est typée (`grammar`, `lexis`, `syntax`, `register`, `coherence`, `task`, `pronunciation`, `fluency`), citée **exactement**, corrigée, expliquée en une ligne et classée par gravité :
- `minor` : ne gêne pas la compréhension, isolée ;
- `moderate` : gêne ponctuellement ou schéma récurrent ;
- `blocking` : empêche la compréhension ou constitue une non-réalisation de la tâche.

## 5. Calibrage

- Attribuer la note que le candidat obtiendrait **le jour de l'examen** ; être généreux nuit à sa préparation.
- Les ancres (`lib/eval/anchors.ts`) montrent des productions typiques avec leur note ; s'y comparer avant de conclure.
- Une seule lecture critériée par tâche (limite de coût : 0,05 $ par session) ; les notes par critère sont conservées dans `feedback_json` pour contrôle.
