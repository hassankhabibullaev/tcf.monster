# The full mock exam — the contract (approved and built 2026-10-19)

One sitting of the four tests in the official order, with breaks, under real conditions, ending with a results page
and a certificate. This page is the contract: what the person lives through, which pieces are reused, where the
work is kept so it cannot be lost, the rules, the decisions the owner took (§9) and what was built (§11). The earlier
proposal of 2026-10-18 is replaced by this page.

Durations (official, `worker/sim/exam-reference.json`): listening 35 min · reading 60 min · writing 60 min · speaking
about 12 min. Breaks (proposed, §9 b): 5 min · 5 min · 15 min. The sitting lasts about 3 h 15 with the breaks.

---

## 1. The story, screen by screen

### 1.1 The mock exam page — `/mock`

Inside the app (rail, bars). Top: one card, « Examen blanc » / "Mock exam", three short lines (the four tests in one
sitting, about 3 h 15 with the breaks, the conditions of the real test) and one button **Commencer** / **Start** that
opens the initiation page — it starts nothing by itself. Below: **Vos examens blancs** / "Your mock exams", newest
first, one row each: the date · the four NCLC as small chips (a stage never reached shows « — ») · the overall level
(« NCLC 6 ») · a word when it was abandoned (« Abandonné ») · **Revoir** → its results page · the small quiet delete
control (the x alone, a Sheet asks « Supprimer cet examen blanc ? »). Nothing when there is none. The card is
**locked** without a Gemini key (the same locked panel as the EE/EO builder, with the key form); while a mock is
already running the card says so (« Examen blanc en cours · Compréhension écrite · 23 min 10 », **Reprendre**,
**Abandonner** in a Sheet), as the exam cards do today; after a mock today the button is shut with the small line
« Un examen blanc par jour » / "One mock exam a day" under it (the one caption, like the key's four steps).

### 1.2 The initiation page — `/mock/new`

Full screen, no rail, no bars (`Frame mode="exam"`), the one place that explains, since the person is about to be
locked in for three hours. One column:

1. **Le déroulement** / "What to expect": the four stages as four rows in the official order, each with its name, its
   length and one line (listening: « chaque enregistrement une seule fois, pas de retour en arrière »; reading: « vous
   circulez librement »; writing: « les trois tâches, dans l'ordre que vous voulez »; speaking: « les trois tâches avec
   l'examinatrice Monster AI »), with the breaks between them as thin rows (« Pause · 5 min »). Under them: « Le temps
   ne s'arrête pas une fois l'épreuve commencée. » and « À la fin : vos quatre résultats, votre niveau global et un
   certificat. »
2. **Expression orale**: the two mic modes as the setup page shows them (« Conversation en direct » · « Appuyer pour
   parler »), one pressed, remembered in `me.settings.eo.mode` (the same setting the EE/EO setup page uses).
3. **The browser's permission for a notification** is asked here, once, by a quiet button « Être prévenu·e à la fin des
   pauses » / "Be told when a break ends" (it turns into a check once granted; not shown when already granted or
   refused). No microphone check: the browser asks for the microphone when the speaking stage starts, as today.
4. The footer every room shares (§2): the red **Terminer** is replaced here by **Retour** (quiet, left), **Commencer**
   (primary, right). Start creates the mock (`POST /api/mock`), then the hallway.

### 1.3 The hallway

The dark hallway as today (`web/app/sim/hallway.tsx`): the logo, « Examen blanc », « Monster AI » under it,
3 · 2 · 1 with the tones. Once per mock, before the first stage. The listening paper is fetched meanwhile.

### 1.4 Compréhension orale — 35 min, real conditions

The exam room's body as in a real-mode CO exam today (`ExamRoom`, `attempt.mode = "exam"`): each recording once, the
player locked, Suivant shut until the recording ends, then the question keeps its share of the 35 minutes (the grace
line), the next question by itself, no going back, no rail, the picker read-only. The top line and the footer are the
mock's (§2). Terminer opens the exam's finish sheet (the unanswered list, « elles comptent faux ») and ends the stage;
the clock at zero freezes the room one second, then the stage ends. Escape / the browser's back → the leave sheet
« Quitter la salle ? Le temps continue. » (the mock keeps running; the band outside offers Reprendre).

### 1.5 Break — 5 min

The break screen (§2.4): the countdown, « Continuer maintenant ». At zero the chime, the blinking title, the
notification, and the next stage starts by itself (§9 a).

### 1.6 Compréhension écrite — 60 min, free movement

The exam room's body as in a real-mode CE exam today: Précédent · Suivant, the rail and the picker open, answers may
change while the clock runs. Same chrome, same Terminer, same leave sheet.

### 1.7 Break — 5 min

Same screen.

### 1.8 Expression écrite — 60 min

The writing station's body (`EcritRunner`): the three tasks, free movement, the subject and the French keys at the
left, the sheet at the right, the word count in the footer's middle slot, the text kept at every keystroke. The clock
is the mock's (60 min, the official time; the simulator's own full exam keeps its 50, §9 f). Terminer hands the three
texts in (the finish dialog as today); the clock at zero does the same. The marking (Gemini) starts at once in the
background and goes on through the break; it never delays the sitting.

### 1.9 Break — 15 min

Same screen. At zero: the chime, the notification; **the speaking stage waits for a press** (the microphone needs the
person at the keyboard): the break screen says « La pause est terminée » / "The break is over" with the one button
**Commencer l'expression orale**. The clock of the stage starts on that press. A press more than 5 minutes late keeps
the mock going but withholds the certificate (§4).

### 1.10 Expression orale — about 12 min

The speaking station's body (`OralRunner`, exam kind): the examiner Monster AI, the three tasks with their own
preparation and speaking times, the interstitial card between tasks, the Trouble card on failures. The footer holds
Terminer at the left (the stop sheet as today: « Arrêter ici » scores what was said) and an empty right slot (there
is no Previous/Next in speaking: the slot stays, empty, at the same place). Each task is marked when it ends, as today.
The server gives this stage 20 minutes at most (the examiner's speech and the connections take time): the runner
ends it earlier by itself.

### 1.11 The marking screen

« Correction en cours » / "Marking": four rows, one per test, filling in — CO and CE at once (scored on the server
when their stage ended), EE and EO as their marks arrive. A row that fails shows the Trouble card (automatic retries
4 · 8 · 12 s, then one a minute three times, then Réessayer / the key link when the key is refused). The person may
leave this screen (the row says « en cours »): the results page shows what is marked and keeps retrying the rest when
it is opened. The screen opens the results by itself when the four rows are in.

### 1.12 The results — `/mock/:id/result`

One page, the same for a mock just finished and for a past one opened from the list. Inside the app (rail, bars),
`BackLink` « Examens blancs ». Top: the overall line as a hero — « NCLC 6 · le plus bas de vos quatre épreuves » /
"NCLC 6 · the lowest of your four tests" (what immigration looks at) —, then one row per test with the four cells the
result page has today: CO and CE score /699 · right answers /39 · NCLC · level; EE and EO score /20 · NCLC · level
(three cells; the fourth says the tasks marked « 3 / 3 »). Under the rows one muted line: the date, the time it
took, and « Abandonné pendant l'expression écrite » / « Temps écoulé » when it applies. Then **Certificat** (primary)
when one is due (§4), and the detailed review of each test, folded under its row: CO and CE as the review cards of
the result page (`ReviewCards`, §2.6), EE and EO as the session results (`SessionResults`, the tabs per task, the
proofreading, the replay). A stage never reached is a row of dashes with « non passée ».

### 1.13 The certificate — `/mock/:id/certificate`

A page laid out like a sober attestation (§9 c): the wordmark, « Examen blanc TCF Canada », the person's name, the
date, the mock's number for this person (« n° 3 »), a table — test · score · NCLC · level —, the overall line, and
the plain line, in full type, « Ce document n'a aucune valeur officielle. Il n'est pas une attestation et ne peut être
présenté à aucune administration. » / "This document has no official value. It is not an attestation and cannot be
presented to any authority." One button **Enregistrer en PDF** / **Save as PDF** that calls the browser's print; a
print stylesheet in `mock.css` prints the certificate alone (A4, white, black ink, no chrome, no button). No PDF on
the server.

---

## 2. One flow, not four rooms glued together

The four stages render **inside one shell**, `MockShell`, never inside their own `Shell` (CO/CE) or `Station` (EE/EO).
The three runners keep their bodies and their rules and give up their chrome.

### 2.1 The top line — `MockBar`

76 px high with 24 px above the row (the room rule, docs/COCE.md §4; the floating glass of every room), one grid in
every stage: LEFT the test's name in small caps (« Compréhension orale ») and the stage progress « 2 / 4 » in the mono
figures of the practice bar (`.cr-bar-n`); RIGHT the one `Clock` of every room (`web/ui/ui.tsx`, the stage's time left,
amber under five minutes, blinking under one) and, after it, the device's local time « 14 h 32 » / "2:32 pm" in small
mono (`Intl.DateTimeFormat`, ticks each minute). In the speaking stage the Clock shows the task's time as the station
does today (idle between tasks). Nothing else up there: no back, no steps pills (the three Tâches of EE/EO keep their
pills inside the body's own top row, as the station draws them, so the line above never changes shape).

### 2.2 The footer — `MockFoot`

One grid `1fr auto 1fr`, 84 px (`--room-foot`), the same padding in every stage: LEFT **Terminer** (`.btn.room-finish`,
quiet, its word in red); MIDDLE the stage's own slot (CE/CO: nothing; EE: the word count; EO: the speaking controls'
caption stays in the body — the slot is empty); RIGHT **Précédent · Suivant** where the stage has them (CE, EE), the
slot kept empty otherwise (CO real mode has Suivant alone; EO has nothing), so Terminer and Suivant sit at the same
pixels in every stage. The two CO/CE rooms today use a 64 px footer and the stations 84: the mock's is 84 everywhere.

### 2.3 How the runners give up their chrome

`ExamRoom`, `EcritRunner` and `OralRunner` gain one optional prop, `mock?: MockHooks`:

```ts
type MockHooks = {
  bar: ReactNode;                                   // MockBar, drawn by the mock
  foot: (slots: { finish: ReactNode; mid?: ReactNode; nav?: ReactNode }) => ReactNode; // MockFoot lays the slots out
  clock: { endsAt: number };                        // the stage's end, the server's clock (serverNow())
  onStageEnd: (how: "done" | "time" | "abandon", payload: unknown) => void; // answers / texts handed in
  store: MockStore;                                 // §3: where answers and drafts go
};
```

With `mock` set, a runner: skips its own hallway; takes its clock from `mock.clock`; renders its body inside
`MockShell` with `mock.bar` and `mock.foot(...)`; writes through `mock.store` instead of its own `localStorage` keys
and `PATCH /attempts` or `PATCH /expr/ecrit/draft`; calls `mock.onStageEnd` instead of showing a result page; never
shows a results page of its own. Without `mock` nothing changes for the existing rooms (tests prove it).

### 2.4 The break screen — `Break`

The hallway's dark tone, the logo small at the top, « Pause » and the next test's name under it, the countdown big in
the display font (minutes and seconds), one button **Continuer maintenant** / **Continue now** (primary). At zero: the
chime (`playChime` in `room/sound.ts`, two rising notes, Web Audio, silent under reduced motion), the title tag blinks
« ⏰ Pause terminée » until the tab is looked at, the browser notification (« La pause est terminée — Compréhension
écrite commence » / the test's name) when permission was given and the tab is hidden; then the transition card and the
stage (§9 a), or for the speaking stage the button **Commencer l'expression orale**. The countdown runs in the
browser from the server's `break_until`; the server is asked once at zero (`POST /api/mock/:id/next`).

### 2.5 The transition — `Transition`

One calm card, the same every time, at every change of screen: the hallway's tone full screen (`.sim-inter`, as the
card between the speaking tasks), the display font, one line « Compréhension écrite · 60 min » or « Pause · 5 min »
or « Correction », 2 s, the hallway's single tone, the fade of `hall-in`. The next screen is mounted under it during
those two seconds (the paper fetched, the station prepared), so the stage is there when the card lifts: no spinner
between two stages.

### 2.6 Reused and new

| Piece | Reused as it is | Changed | New |
|---|---|---|---|
| CO/CE | `Player`, `Options`, `Passage`, `Picker`, `Rail`, the finish and leave sheets, the grace line | `ExamRoom` gains `mock?` (§2.3); `ResultPage`'s review cards become `ReviewCards({ questions, answers, section })` exported from pages | — |
| EE | the station body (`.ee-room`), `FrenchKeys`, `FinishDialog`, the draft rules | `EcritRunner` gains `mock?` | — |
| EO | the whole speaking body: `Interviewer`, `LiveExaminer`, the recorder, clips in IndexedDB, `StopDialog`, the interstitial | `OralRunner` gains `mock?` | — |
| Results | `SessionResults`, the four result cells' markup (`.cp-cell`), `Nclc`, `cefrOf`, `nclcOf` | — | `MockResult` |
| Rooms | `Hallway`, `Trouble`, `Clock`, `MonsterAI`, `Sheet`, `Button`, `BackLink` | `room/sound.ts` gains `playChime` | `MockShell`, `MockBar`, `MockFoot`, `Break`, `Transition`, `Marking`, `Initiation`, `MockPage`, `Certificate`, `OwnerSwitch` |
| Server | `scoreAnswers`, `nclcOf` (CO/CE), `startSession`, `submitEcritTask`, `finishOralTask`, `computeSummary`, `addWrites`, the daily budget | `startSession` takes `mockId` and `totalSeconds`; `handleAttempts` and `/expr/start` refuse while a mock runs; `/expr/sessions` hides mock sessions; `stats.ts` gains `mocks` | `worker/mock/*` |

Files: `web/app/mock/` — `MockPage.tsx`, `Initiation.tsx`, `Sitting.tsx` (the running mock: reads the row, picks the
screen for its stage, holds the hooks), `shell.tsx` (`MockShell`, `MockBar`, `MockFoot`), `Break.tsx`,
`Transition.tsx`, `Marking.tsx`, `MockResult.tsx`, `Certificate.tsx`, `OwnerSwitch.tsx`, `store.ts` (§3), `api.ts`
(the calls), `words.ts` (FR/EN), `mock.css` (tokens only; one phone block; the print block). `worker/mock/` —
`index.ts` (routes), `paper.ts` (the paper builder, pure), `clock.ts` (the timeline, pure), `score.ts`, `types.ts`.
`migrations/0006_mock.sql`. Tests: `tests/mock/paper.test.ts`, `tests/mock/clock.test.ts`,
`tests/qa/mock.qa.test.ts` (the real Worker on SQLite: start, the no-repeat, the stage clock, breaks, abandon,
delete, the daily cap, the key lock, the owner's skip, the refusals while a mock runs). Nobody edits `main.tsx`,
`i18n.ts`, `app.css`, `worker/index.ts` beyond the wiring lines (the routes, the rail item, the band).

---

## 3. Progress that cannot be lost

### 3.1 Three places, written at once

- **The server**: one row of `mocks` per sitting (§6): the stage, its start, the break's end, the paper, the CO and
  CE answers, the EE and EO session ids (the texts and the turns live in `expr_tasks` as today), the results.
- **The browser**: `tcfm-mock-<id>` in localStorage (the same blob: stage, answers, drafts, the index of the current
  question or task, the pending marks) **and** the same blob in IndexedDB (`tcfm` database, store `mock`), next to
  the recordings the speaking station already keeps there (`clips`).
- **The page's memory**: the `MockStore` object the stage writes to.

`MockStore.write(patch)` applies the patch in memory, writes localStorage and IndexedDB in the same tick, and queues a
`PATCH /api/mock/:id` (debounced 2 s, `keepalive` when the tab hides or the page is left, one try every 10 s after a
failure, for ever; `online` triggers a try). Every field carries a stamp (`t`, the server's clock); on opening, the
three copies are merged field by field, the newest stamp wins, and what the server lacks is sent at once. Nothing
asks the person to retry: there is no Retry button for saving anywhere in the mock.

### 3.2 The server owns the clock

Every stage has `stage_started_at` and a duration; every break has `break_until`. A request that finds the stage past
its end (plus a 2-minute grace for the browser's last PATCH, as attempts have) closes and scores it before answering;
a break past its end starts the next stage at `break_until` (CE, EE) or waits (EO, §1.9). The browser corrects its
clock with the response `Date` header (`serverNow()` as today) and shows the same time on every device. The nightly
cleanup closes the mocks nobody came back to (`finalizeStaleMocks`, like `finalizeStale`).

### 3.3 What the person sees, case by case

| What happens | What the person sees |
|---|---|
| **A reload** in any stage | The same question or task, the clock unchanged (the server's), the answers and the text as they were (the local copy laid over the server's). CO: the current recording does not play again (one play): the question shows its options and the grace line resumes where the local copy says. EO: the current task is restarted from its preparation if it had not started speaking, otherwise the task is closed on what was said and the next begins (as the station does today after a cut). |
| **The tab closed, back later** | The band on every app page: « Examen blanc en cours · Compréhension écrite · 23 min 10 » · Reprendre. Reprendre opens `/mock/:id` at the stage the server's clock says — maybe a later one, maybe the break, maybe the marking screen if everything ran out. |
| **The network dies during CO/CE** | A quiet band under the top line, « Hors ligne — vos réponses sont gardées ». The stage goes on from the local copy and the local clock; CO keeps advancing by itself. PATCHes retry every 10 s. The stage end is sent with retries; the break screen opens from the local timeline. When the network returns, everything is sent; a stage ended late reaches a server that already closed it — the answers stamped before the end are still taken (the grace). |
| **The network dies during EE** | The text keeps being kept locally at every keystroke; the server's draft is sent when the network returns. Terminer at zero: the hand-in is retried with the Trouble card's countdown (4 · 8 · 12 s, then one a minute), the break goes on meanwhile; the marking happens when it can. |
| **The network dies during EO** | The station's own rule: the connection with the examiner freezes the task's clock, the Trouble card counts to the retries (`tryRecover`); the recordings stay in the browser. After three failures: Réessayer / Arrêter ici (what was said is scored). |
| **Gemini fails in EE marking** | Never blocks the sitting: the marking row on the marking screen shows the Trouble card and retries by itself; the results page keeps retrying each time it is opened; after three rounds Réessayer stays. The mock is `done` once the four results exist; until then its row in the list says « correction en cours ». |
| **Gemini fails in EO** (the live session cannot open, a cut) | The Trouble card as today, automatic retries 4 · 8 · 12 s, the task's clock frozen meanwhile; then Réessayer / Arrêter ici. A task that never comes back is scored on what exists (the stored turns); with nothing said it is marked « non évaluée » (0 of its points) and the stage goes on. The mock stays complete; the certificate is still due (the failure was not the person's). |
| **The key refused by Google** | The row shows the Trouble card with the link « Ouvrir le profil »; the person pastes a new key and presses Réessayer. Nothing else stops. |
| **Signed out elsewhere** (401) | The stage goes on from the local copy; the door opens at the next page load; after sign-in the person lands back on `/mock/:id`. |
| **Another device opens the mock** | The server's state wins; both show the same stage and clock; answers merge by stamps. |
| **The daily budget on hold** (`{hold}`) | Answers stay local and are resent later; the stage still closes by the clock on the server, and the answers that arrive within the grace are taken. The person sees nothing. |
| **The person abandons** (the band, the mock page's hero) | A Sheet « Abandonner l'examen blanc ? Les épreuves terminées gardent leur résultat. » → `POST /abandon`: the current stage is scored as it stands, the rest is « non passée », the results page opens. No certificate. |

---

## 4. The certificate

Issued only for a mock **completed without interruption**:

- not abandoned, and every stage reached;
- every stage ended by its clock or by Terminer (CO, CE, EE) or by the examiner's closing / Terminer in the speaking
  stage; a stage closed by the server because nobody came back (`stale`) counts as an interruption;
- the speaking stage started within 5 minutes of the end of its break (the one break that waits for a press);
- each stage carries some work (at least one answer, one text, one spoken turn): a blank stage is an absence.

The results page says why when it is withheld (one muted line: « Pas de certificat : examen abandonné » / « … :
reprise après la fin de la pause »). The certificate's look: §9 c. It carries the line about having no official value
in full type, above the table, in the language of the interface (the page is printed in the language in use).
Saved through the browser's print; nothing on the server.

---

## 5. The dashboard and the rail

- **The card**, right above the donation card (`Home.tsx`, after the four section cards): « Examen blanc » with the
  count (« 3 examens blancs »), the best overall level (« Meilleur niveau global · NCLC 7 »), the last mock's four NCLC
  as the four small chips in the sections' order with the date, and one button **Ouvrir** → `/mock`. With none: the
  same card with « Pas encore d'examen blanc » and the button. The numbers come with `/api/me/stats` (`mocks`
  field: `{ count, best, last: { at, id, nclc: { co, ce, ee, eo } } }`), no extra request.
- **The rail** (laptop and tablet): a fifth item after the four sections with a little margin above it (a 20 px gap,
  the rail-group's own spacing + 8): a new icon (`mock` in `ui.tsx`, a small certificate: a page with a seal) and the
  word under it in the rail's mono code style — « BLANC » / "MOCK" (§9 d). Current when the path starts with `/mock`.
  Nothing on the phone's bottom bar; on the phone the mock is reached from the dashboard card.
- Mock results **count in the dashboard's levels** (they are real results; `stats.ts` adds the mock's four NCLC to the
  sections' series) and in the twelve weeks. The EE/EO sessions created by a mock are hidden from the EE/EO history
  lists (`mock_id IS NOT NULL`): they belong to the mock's results page (§9 e).

---

## 6. The server

### 6.1 Table (migration `0006_mock.sql`)

`mocks` exists since migration 0001 (id, user_id, started_at, finished_at; `attempts.mock_id` and
`expr_sessions.mock_id` point to it). The migration adds the columns:

| column | holds |
|---|---|
| `status` | `running` · `marking` · `done` · `abandoned` |
| `stage` | `co` · `break1` · `ce` · `break2` · `ee` · `break3` · `eo` · `marking` · `over` |
| `stage_started_at`, `break_until` | the server's clock (ISO) |
| `paper_json` | `{ co: [{ id, level, answer }×39], ce: [...] }`, frozen at start |
| `topics_json` | `{ ee: combinaisonId, eo: { partId, t2, t3 } }`, frozen at start |
| `co_answers`, `ce_answers` | `{ "<questionId>": "A" }` (the mock's answers are by question id, not placement) |
| `co_result`, `ce_result` | `{ score, nclc, right, wrong, blank, byLevel, ended, at }` once the stage is closed |
| `ee_session_id`, `eo_session_id` | the `expr_sessions` rows (created when their stage starts, `mock_id` set) |
| `ended_json` | how each stage ended: `{ co: "done" \| "time" \| "abandon" \| "stale", … }`, and `eoLateS` |
| `mic_mode` | `live` · `ptt` |
| `result_json` | the four results and the overall once `done` |
| `certificate` | 1 when due (§4), 0 otherwise |

An index on `(user_id, started_at)` and a partial one on the running rows. No `mock_seen` table: the questions and
topics a person had come from their own previous rows (`paper_json`, `topics_json`), a handful of rows to read.

### 6.2 The paper builder (`worker/mock/paper.ts`, pure, tested)

The export script (`scripts/bank-export.py`) gains two small files, `public/data/key-co.json` and `key-ce.json`:
every exam-worthy question of the section as `{ id, level, answer }` (about 900 rows, ~40 KB; the level files already
carry the answers, nothing new is exposed; practice-only questions left out). The Worker reads them through `ASSETS`
(static, no database, small enough for the free plan's CPU time; the full level files, 0.3–1.5 MB each, are never
parsed on the server). `buildPaper(key, seen, random)` draws the official quotas per level — A1 4 · A2 6 · B1 9 ·
B2 10 · C1 6 · C2 4 — from the questions not in `seen` (the ids of the person's previous mocks); when a level runs
dry the draw for that level restarts among the least recently seen. The 39 are laid out in position order (1–4 A1 …
36–39 C2) and shuffled inside each level. The bank today: CO 110 · 140 · 172 · 213 · 145 · 84 and CE 112 · 113 ·
222 · 234 · 113 · 83 questions per level, so about twenty mocks before the smallest level (C2) repeats. The browser
fetches the six level files of the stage (the practice files, cached by the browser like any static file; prefetched
during the initiation page and the breaks) and picks the paper's ids out of them.

EE and EO topics: `pickTopics` as today, with an `avoid` list — the combinaisons and parties of the person's previous
mocks — and the newest months first; when every month was had, the oldest had comes back.

### 6.3 Routes (`/api/mock/*`, signed in, `worker/mock/index.ts`)

| route | does |
|---|---|
| `POST /api/mock { micMode }` | the checks (§7), builds the paper and the topics, inserts the row (`stage: co`, `stage_started_at: now`), answers `201 { mock }`; `409 { running }` when one runs (two taps: the older stands) |
| `GET /api/mock/running` | the person's running mock (or `marking`), advanced to the stage the clock says (the band, the mock page) |
| `GET /api/mock/list` | the rows, newest first, without the papers |
| `GET /api/mock/:id` | the row, advanced; with the paper, the answers, the results |
| `PATCH /api/mock/:id { stage, answers?, cursor? }` | merges answers of the running CO/CE stage (ids of the paper only, 100 a call), one row write, none when nothing changed; `409 late` past the grace |
| `POST /api/mock/:id/next { from, how }` | ends the current stage (`done` / `abandon`) or the current break (« Continuer maintenant », or zero reached): scores CO/CE from the paper's answers, creates the EE or EO session when their stage starts (`startSession` with the mock's topics, `totalSeconds` 3600 for EE, `mock_id`), moves the stage; idempotent (a second call for a stage already left answers the row as it is) |
| `POST /api/mock/:id/abandon` | §3.3 last row |
| `POST /api/mock/:id/finalize` | called by the marking screen when the four results exist: writes `result_json`, `certificate`, `status: done`; the server checks the EE/EO sessions itself and answers the row |
| `DELETE /api/mock/:id` | a finished or abandoned mock of one's own, its EE/EO sessions forgotten (`forgetSession`); `409` while it runs |
| `POST /api/mock/:id/skip` | the owner's switch (§8): ends the stage or the break now; `403` for anyone else |

EE texts and EO turns stay on the person's device like every simulator session's (`web/app/sim/work.ts`, docs/SIMULATOR.md
§Data); the mock's `next` for EE triggers nothing on the server beyond the stage move — the marking screen marks the
texts in the browser and sends the marks (`/expr/result`), which land in `expr_tasks`.

### 6.4 Scoring (`worker/mock/score.ts`)

CO/CE: `scoreAnswers` as the attempts use it (the real sum of points, no floor; `nclcOf` from the IRCC table),
applied to the paper's `{ level, answer }`. EE/EO: the simulator's marking as it is; the session's `summary_json`
gives score /20, NCLC, level. Overall: the lowest NCLC of the four (below NCLC 4 → 3), named « niveau global ».

---

## 7. Rules

- **Locked until a Gemini key is on the device** (the browser's own status, `web/app/sim/browser-score.ts`): the page
  shows the locked panel. The server never holds a key, so it does not check one.
- **One mock a day** per person (`started_at` within the last 24 h, abandoned ones included); the owner's e-mail is
  exempt (testing). `429 daily_cap`.
- **Never while another exam or session runs**, and the reverse: `POST /api/mock` answers `409 { attempt }` or
  `409 { session }` when a CO/CE attempt is running or an EE/EO session is in progress; `POST /api/attempts` and
  `POST /api/expr/start` answer `409 { mock }` while a mock runs. The band shows the mock on every app page.
- **Strict**: no rail, no bars, no links out; Escape and the browser's back open the leave sheet; closing the tab
  asks (`beforeunload`). The only way out of the whole sitting is Abandonner, outside the room.
- **Papers** drawn from the whole bank by the official quotas, never the questions of a previous mock (§6.2);
  **topics** from months the person has not had.
- **Scoring** reuses the exam scoring and the simulator's marking; nothing new (§6.4).
- **Free plan**: a mock costs about 1 (start) + ~80 small PATCHes (CO and CE answers, debounced) + 7 stage moves +
  the EE/EO sessions' own writes (as today) + 1 finalize: under 200 row writes; the daily budget (`budget`) holds as
  everywhere; no polling: the break counts down in the browser and asks the server once at zero; the band refreshes
  once a minute as today.
- **The speaking mode** chosen on the initiation page, remembered (`me.settings.eo.mode`, the same as the EE/EO setup).
- **Phones**: the four stages work at phone width as their rooms do today (stacked panels, the picker sheet, the
  station's phone layout); the mock bar and footer have one phone block in `mock.css`; the laptop layout does not move.
- **Words**: FR first, EN after, in `web/app/mock/words.ts`; the English side all English but « Examen blanc » is
  "Mock exam", the four tests keep their French names. No captions, no instructions, except the initiation page and
  the two lines named in §1.1.

---

## 8. The owner's testing switch

`OwnerSwitch`: a small floating round button at the bottom right of every mock screen (above the footer, under the
band), rendered **only** when `me.isOwner` is true (the server says so from `OWNER_EMAIL`) or when
`localStorage["tcfm-mock-switch"] === "1"` (set by hand on this Mac for local work). For anyone else nothing is in
the DOM. A press calls `POST /api/mock/:id/skip`, which the Worker accepts for `OWNER_EMAIL` only (or when
`ADMIN_OPEN` is `1`, local): the current stage is ended now (scored as `time`, answers kept) or the current break is
over now; the page then moves on as if the clock had run out — the transition card, the chime, the next stage. So
the owner walks the whole mock in a few minutes, on laptop and phone.

---

## 9. Open decisions (with a recommendation each)

a. **After a break ends: start the next test by itself, or wait for a press?** Recommendation: CE and EE start by
   themselves at zero (the clock of a centre does not wait; the chime and the notification have warned); the speaking
   stage waits for a press, since the microphone and the examiner need the person there, with the 5-minute allowance
   of §1.9 before the certificate is withheld. The alternative (every stage waits, the lateness counted against the
   stage's time) is honest too but makes a 35-minute stage shrink when someone is late.

b. **The breaks' lengths**: 5 · 5 · 15 min recommended (the real test runs the four back to back or on separate
   slots; a mock needs breaks a person can live with; 15 before the speaking lets the writing marks arrive and the
   voice rest). The 2026-10-18 proposal said 30 for the last one; 15 keeps the sitting near 3 h 15.

c. **The certificate's look**: sober, like an attestation — the wordmark, a title, the name and the date, one table,
   the overall line, the no-official-value line in full type — in the app's own typography on a white page.
   Recommended over copying the official attestation's layout, which would invite confusion and the line about no
   official value would fight the look.

d. **The rail item's word**: « BLANC » / "MOCK" under the new certificate icon (the four sections show their two
   letters; a two-letter « EB » would mean nothing in English). Alternative: the icon alone with the name on hover.

e. **Mock results on the dashboard**: count the four NCLC in the sections' levels and series (recommended: they are
   the truest results the person has), and keep the EE/EO sessions of a mock out of the EE/EO history lists (they
   open from the mock's results page). Alternative: show them in both lists with a « blanc » chip.

f. **Writing at 60 minutes** in the mock (the official time) while the simulator's own full exam stays at 50
   (10 / 15 / 25, the owner's choice of 2026-10-05). Recommended: the mock follows the official sheet; the three
   tasks are not timed one by one there either.

g. **Deleting a past mock**: allowed from the list with a Sheet (recommended, like attempts and sessions), the mock's
   EE/EO sessions forgotten with it. Alternative: mocks are kept for ever.

h. **The daily limit**: one a day (asked). Recommended as asked; the owner is exempt for testing.

---

## 10. Order of work (phase 2, once approved)

1. Server: the migration, `key-*.json` in the export, the paper builder and the timeline (pure, tested), the routes,
   the refusals in attempts and expr, stats, the nightly close; `tests/mock/*`, `tests/qa/mock.qa.test.ts`.
2. The shared room: `MockShell`, `MockBar`, `MockFoot`, `Break`, `Transition`, the `mock` prop in the three runners
   (the existing rooms unchanged, proved by the tests), `MockStore` with its three copies, the band.
3. The four stages inside it, the breaks and the chime, the notification, the hallway at the start.
4. The marking screen, the results page (with `ReviewCards`), the certificate and its print stylesheet, the mock page
   and the initiation page, the dashboard card, the rail item.
5. The owner's switch; a full walk with it on laptop and phone in the browser pane; docs updated (this file, COCE.md
   §3 and SIMULATOR.md for the `mock` prop); commits by path; `npm run deploy` and `npm run db:migrate:remote`.

---

## 11. As built (2026-10-19)

Everything above stands, with these precisions from the build:

- **Server** (`worker/mock/`): `types.ts` (the stages, the times, the row), `clock.ts` (the timeline, pure:
  `advance`, `endTest`, `endBreak`, `skip`), `paper.ts` (`buildPaper`, `seenOf`), `topics.ts` (`pickMockTopics` with
  the avoid lists), `score.ts` (`scoreCoce`, `overallOf`, `certificateDue`), `row.ts` (the row → JSON, `runningMock`),
  `index.ts` (the routes, `finalizeStaleMocks`, `mockStats`). Migration `0006_mock.sql`. The export writes
  `public/data/key-co.json` and `key-ce.json`. `GET /api/attempts/running` answers `{ attempt, mock }` (the mock's row
  as stored: one request a minute for the band, not two; the browser runs the same timeline rules, `clock.ts` is
  shared). `startSession` takes `mockId`, `seconds` and `startedAt`; `listSessions` leaves mock sessions out.
  `POST /api/mock/:id/finalize` is what the marking screen calls (it is the same as a GET: the sitting is closed when
  the four results exist). There is no `PATCH … cursor`: the current question lives in the browser's copies only.
- **The nightly close**: a sitting nobody moved for twelve hours is abandoned with the untaken test noted `stale`; a
  marking older than twelve hours is closed as `done` with what exists (no certificate when a stage has no mark).
- **Browser** (`web/app/mock/`): `api.ts` (the calls, `useRunningMock`, `refreshMock`), `store.ts` (`MockStore`:
  memory + localStorage + IndexedDB, PATCH debounced 2 s, retry 10 s, keepalive; answers merged by stamp, the furthest
  cursor, the longest draft), `shell.tsx` (`MockBar`, `MockHooks`), `Sitting.tsx` (the running mock: the stage's
  screen, the transition card, the end of a stage with retries 4 · 8 · 12 s then 30 s, the owner's switch),
  `Break.tsx`, `Transition.tsx`, `marking.ts` + `Marking.tsx` (the writing texts and the speaking clips handed in
  again from the browser until every task is marked; 4 · 8 · 12 s then one a minute; never by itself when the key is
  refused), `MockPage.tsx`, `Initiation.tsx`, `MockResult.tsx`, `Certificate.tsx`, `MockBand.tsx`, `MockCard.tsx`,
  `OwnerSwitch.tsx`, `words.ts`, `mock.css`.
- **The runners**: `ExamRoom`, `EcritRunner` and `OralRunner` take `mock?: MockHooks` (§2.3); `Shell` takes `head`
  and `Station` takes `bar` (the mock's top line in place of their own; the Tâche pills move to a second row of the
  line, 112 px, in the writing and speaking stages). With `mock` the writing stage hands nothing in itself: at
  Terminer or at zero the texts go to the server as drafts and the stage ends; the marking screen hands them in. The
  speaking stage ends when every task is handed in. The footer of every stage is 84 px (`mock.css`).
- **The certificate** is withheld too when a stage was left blank (§4): the local walk-through showed it on the first
  sitting, where the reading stage had no answer.
- **The local flag**: `localStorage["tcfm-mock-switch"] = "1"` shows the owner's switch and lifts the page's
  one-a-day lock on this browser; the server's skip and cap still answer to `OWNER_EMAIL` (or `ADMIN_OPEN=1`, local).
- **Tests**: `tests/mock/paper.test.ts`, `clock.test.ts`, `store.test.ts`, `tests/qa/mock.qa.test.ts` (nine
  scenarios on the real Worker).
- **Not verified locally**: the live examiner (no real key here: the speaking stage was seen up to the microphone
  refusal of the browser pane), the real marking of a writing text (the marking screen was seen with the key refused
  and the rows marked by hand in the local database), the print of the certificate (the print block is written, not
  printed), the chime and the notification (no audio, no permission in the pane).

## 12. The owner's review round (2026-10-19, later the same day)

What changed after the first walk, on the owner's remarks:

- **A test starts only once its room is on screen.** A test entered (after the hallway, after a break, on the
  speaking press) is first *pending*: `stage_started_at` is null and `break_until` holds its latest start (90 s).
  The browser shows the one hall — 3 · 2 · 1, then the test's name and its time for two seconds — while the room is
  rendered underneath; when the hall lifts and the room says it is ready, `POST /api/mock/:id/begin` starts the
  clock (the recording, the writing clock). Nobody there: the clock starts by itself at the latest start, so a
  closed tab still cannot stop the sitting. `clock.ts`: `isPending`, `begin`; the row carries `pending`.
- **One loader** (`web/app/sim/hallway.tsx`, `Hall`): the dark hall with the logo is the only screen for every wait
  and every announcement — the hallway before an exam (count + the test's name and time), the transition between
  the mock's stages, the breaks (their clock on it), the marking (its four lines on it), the simulator's « the
  examiner is settling in » (three breathing dots). The pen loader and the card between speaking tasks are gone.
- **One top line** (`web/app/room-bar.tsx`, `RoomBar`) for every room — practice, exam, the two stations, the
  mock's stages: LEFT what the room is (back in practice, the test's name, « 2 / 4 » in the mock, the practice
  bar), CENTRE the device's time (timed rooms), RIGHT the timer in its own pill (`.clock` in base.css: a bordered
  pill with a dot, amber under five minutes, blinking under one, red at zero). The stations' Tâche pills sit on a
  second row of the line (112 px). Every footer is 84 px. A mock stage looks exactly like the same exam or station
  outside the mock.
- **« Terminer l'épreuve » / "Complete the test"** is the end-of-test button everywhere; it is shut in the real
  listening exam (the test ends by its clock alone), it asks in the reading exam (the unanswered questions listed)
  and at the writing station (the word counts, an empty text named), and it opens the stop sheet at the speaking
  station. The initiation page's buttons float with no band under them.
- **The examiner**: her neck shows above a V collar; a slight smile at rest; no status pill under her and no
  « Examinatrice » label (the chat transcript keeps the speaker's name). The speaking room splits in two halves in
  Tâche 2 and 3 — the situation and the notes at the left, the examiner centred at the right — and the split is
  animated (she slides to the right while the left half opens); Tâche 1 keeps her alone, centred.
- **The results page** fits the screen: the overall level as the hero with the date, the sitting's length and the
  certificate button; the four tests as four cards with the same three cells — score, NCLC, level (one level, from
  the simulator's bands for writing and speaking: A1 under 4, A2 under 6, B1 under 10, B2 under 14, C1 under 16, C2) —
  and one quiet line (the right answers, the tasks marked); each card opens its detail page
  (`/mock/:id/result/:test`: the cells, then the review). No « tasks marked » cell, no « A1–A2 ».
- **The certificate** is a PDF built in the browser (jsPDF, loaded only then; `web/app/mock/certificate-pdf.ts`;
  the design system's typefaces embedded from `public/fonts/`, the static instances Google serves) and opened in a
  new tab: the wordmark, the title, the number, the name and date, the no-official-value line in a box, the table,
  the overall band. `tests/mock/certificate.test.ts` builds it in Node. No certificate page any more.
- The nightly close and the stale rules are unchanged; `tests/qa/mock.qa.test.ts` walks the pending model.

## 13. At launch (2026-10-19)

- The owner's testing switch (`OwnerSwitch`, the floating ⏭ button, and the local flag `tcfm-mock-switch`) is removed
  from the app. The server route `POST /api/mock/:id/skip` stays: only `OWNER_EMAIL` (or `ADMIN_OPEN=1` on this Mac)
  may call it, nothing in the app calls it, and `tests/qa/mock.qa.test.ts` uses it to walk a sitting in seconds.
- Sign-ups are open to everyone (`APP_OPEN = "1"` in wrangler.app.jsonc).
