# The expression simulator (EE · EO) — how it is built

The writing and speaking simulator of tcf.monster is the engine of `~/Developer/expression` (the owner's earlier app,
tested on real candidates), carried over into this Worker. Its behaviour is described in `BRIEF.md` §4 and `UX.md`
§2.7–2.10; this file says where each part lives and what changed in the move. Read it before touching `worker/sim/`
or `web/app/sim/`.

## What stays the same (ported as it is)

- **Marking** (`shared/sim/eval/`, run in the person's browser): the evidence-first scorer, the rubric (`spec/rubric.md` is loaded into the
  prompt), the caps, the language ceiling, the complete proofreading sentence by sentence, the audio analysis
  (fluency measured in code, pronunciation heard by a model), the rewrite after the result (writing, 6 versions).
- **The examiner** (`worker/sim/oral.ts`, `interview.ts`, `roleplay.ts`, `timing.ts`, `oral-lines.ts`): one live
  Gemini session per task, the clock rules, the follow-up planner, the Tâche 2 person who answers short, the
  reconnection after a cut.
- **The browser side** (`web/app/sim/`): the live examiner (one WebSocket, 16 kHz PCM in, 24 kHz out, the turn ended
  here; its microphone capture is the AudioWorklet in `public/worklets/capture.js`, a static file — the page's
  Content-Security-Policy allows scripts from this site only, so a blob: URL was refused on the live site, 2026-10-18;
  `tests/sim/worklet.test.ts` runs the file as the worklet would), the recorder with its generation token, the
  station's state machine (`oral-runner.tsx`), the writing station (`ecrit-runner.tsx`), the results page.
- Every pure module keeps its tests (`tests/sim/`).

## What changed in the move

| Before (expression) | Here |
|---|---|
| Next.js routes, drizzle | plain Worker handlers (`worker/expr.ts`), raw D1 SQL through `worker/sim/db.ts` |
| the visitor's key or the app's public key, hourly credits, 3 live slots | **each person's own key only, on their device** (localStorage `tcfm-gk:<user id>`, `web/app/sim/browser-score.ts`); the Worker never holds a key and never calls Google; no credits, no slots, no `ai_usage` table |
| model cooldowns shared through a `settings` row | in-memory per Worker instance, keyed by user + model (`worker/sim/ai/cooldown.ts`) |
| `getAccess()`, `getDb()`, `getEnv()` read Next's request context | one request context in `AsyncLocalStorage` (`worker/sim/ctx.ts`): `ctx()` gives `{ env, user, lang, asked }` |
| feedback language from a `settings` row | `ctx().lang` = the person's interface language |
| subjects generated or from a bank | **the `topics` table** (the monthly topic lists, word for word) → `GeneratedPrompt` in `worker/sim/prompts.ts`; Tâche 1 (oral) has no topic |
| `sim_sessions` / `sim_tasks` | `expr_sessions` / `expr_tasks` (migrations 0003, 0012): subjects, statuses and marks only; the work itself in the browser (`web/app/sim/work.ts`) |
| recorded fixed lines (TTS cache, `/say`) | none: the live examiner says every line; when she is not connected the text is shown |
| QA fault switch, cost ledger, admin pages | removed |
| the opening of the exam | the official script of France Éducation international (`resources/examiner/script-irn-demo.txt`), with TCF Canada's durations: welcome and rules, « dites-moi vos prénom et nom », the name repeated, each task announced in the official words. A single task in practice skips the formalities. |
| the microphone check in the hallway (bars, « J'entends ma voix ») | none (2026-10-18): the hallway is the logo, the title (« Monster AI » under it), and 3 · 2 · 1 — one real second each, a tone on every number and a higher one at the start; the browser asks for the microphone when the first task starts, and a refusal shows the trouble card with Quitter and Réessayer in the room |
| the examiner's figure | the same shaded portrait (`interviewer.tsx`), its surroundings and jacket on the app's tokens (wall and sheet follow the theme, jacket and lips terracotta); the face keeps its own colours as SVG attributes; the neck is drawn with the body so it goes behind the collar, no line across the lips or around the chin; her status pill (parle · vous écoute · réfléchit · lit ses notes) sits under the portrait |
| the writing station | two columns 40 % / 60 %: at the left the subject and its documents under « Tâche 1 · Message » (the tag and the task's name, no word range or advised time there), scrolling inside their own panel, the French keys pinned under them at the same spot whatever the task; at the right the sheet, as tall as the room. The room is `100dvh` and never scrolls as a page. A new task fades in (nothing slides, nothing trembles). The footer is the one every room shares: **Terminer** (quiet, its word in red) at the left — it opens the finish sheet, whose acting button is red —, the word count in the middle as « 12 mots (60–120) » (amber under the range, green inside, red above, a fixed box), Précédent · Suivant at the right (Suivant shut on the last task) |
| the station's top strip (`station.tsx`) | never changes shape and has **no back button** (Terminer is the way out, as in every room): left the test's name in small caps, then the Tâches as the stages of the test — fixed-width pills joined by a short line (done ✓ · current in the accent · next muted; a started writing task in green), the same place in every phase; right the one `Clock` of every room (`web/ui/ui.tsx`, 24 px mono, the same box as the comprehension exam's), idle (muted) before the time runs |
| the speaking room (`oral-runner.tsx`) | the examiner in a fixed 300 px frame in the middle, the same in every phase; what is written — Tâche 2's situation and notes, Tâche 3's question (its text hidden until « Afficher le texte ») — in one fixed 380 px column at the left, the examiner alone when there is none; what she says when not connected on one quiet line under her (never a transcript); the controls, the same row in every phase and the same as every room's footer: **Terminer** (quiet, its word in red) at the left — it opens the stop sheet —, the voice bars (live) or the one big microphone button (push to talk) in the middle, nothing at the right. Between two tasks (and before the first) a calm card in the hallway's tone for two seconds, « Tâche 2 · 5 min 30 » (preparation + speaking time), no countdown; the next task opens under it. Keys: Space = push to talk (or ends the answer in live mode), Escape = the stop sheet |
| the errors (`sim/trouble.tsx`) | one calm card for everything: a surface with a hairline, an amber ⚠, one plain sentence (what happened, the work is kept), « Réessayer ». The station retries by itself at 4 · 8 · 12 s with the countdown on the card (« Nouvel essai dans 12 s »); after three failures the sentence becomes « Google ne répond pas pour le moment… » with « Réessayer » and « Quitter ». Used for the live connection that cannot open or is cut, a preparation that fails, an answer that could not be sent, the microphone refused, and on the results page for a marking that fails (three automatic tries a minute apart at most; the key refused never retries by itself and offers « Ouvrir le profil »). No `sim-band bad`, no red text anywhere in `sim/` |
| **Monster AI** (2026-10-19) | the simulators' brand, everywhere the app and the public site speak of them: `MonsterAI` in `web/ui/ui.tsx` — « Monster AI » in the font and size of the text it sits in (so it reads as one text), the AI lit by the accent and the sun sweeping across it with a faint glow (`.mai`, base.css; the site has the same in styles.css); with `powered` the words « propulsé par Gemini » / « powered by Gemini » follow in small muted type, wherever Monster AI stands on its own (Google asks that the model be named): the practice tab's simulator card, the setup page under its title, the bottom right corner of both stations, under the results page's header, the key panel's lead. The EE/EO tab reads « S'entraîner avec Monster AI », every topic's button « S'entraîner sur ce sujet avec Monster AI », the hallway of a simulator shows « Monster AI » under the test's name, the locked card « Monster AI se débloque avec votre clé Gemini gratuite » |
| the practice tab and the setup page (`pages/Expression.tsx`) | the simulator card: « Monster AI · propulsé par Gemini », one sentence on what the simulator is, then Examen complet / Une tâche as two picks, each explained in full (the tasks, their times, the one clock, the mark), one « Continuer ». The setup page (`?setup=exam` / `?setup=task`): the title, the brand line, one sentence on what the page is (a random topic from the newest month unless chosen); one card per Tâche — its tag, its name, its time, one line on what it asks, then its topic (« Sujet tiré au hasard au lancement » or the chosen text, never a month) with « Choisir un sujet » / « Au hasard »; in single-task mode the cards are the choice (the chosen one in the sun, its topic row open); the microphone (speaking); « Lancer la simulation » |
| phones (the approved boards, 2026-10-22) | the station's top line is one row: « EE » / « EO » in mono (`.room-code`), the Tâches as 30 px numbered discs joined by short lines (done ✓ in green, current in the accent), the clock. Writing: the subject folds to its Tâche line with « ⌃ replier » / « ⌄ déplier » (250 px at most open), the French keys on one row that scrolls sideways, the sheet takes the rest; the footer is one row: the red stop, « 14 mots (120–150) », « ‹ », « › » (accent). Speaking: the Tâche 2 situation card folds to one line (⌄), the examiner at 200 px, her status pill under her (« vous écoute · vous parle · réfléchit · préparation », phones only), her words, the notes, the big round red « Arrêter » button (push to talk) or the voice bars; the footer's red stop at the left, « Monster AI · propulsé par Gemini » in its middle. The practice tab shows the two ways as cards with a tile (1·2·3 / 1), a short line and the full explanation behind « ⌄ »; the setup's microphone is one pill above the Tâche cards, « Lancer la simulation » is fixed above the tab bar; the topics' month pill and chips share one scrolling row, the search folds behind a round button in the title row, every topic's button reads « ✦ S'entraîner ». Every laptop control stays in the DOM (`.desk-only` / `.mob-only`) |
| the topics tab | the Partie / Combinaison chips on one row that scrolls sideways (a fade at the edge where there is more); every task named the same way in both tests (`TacheTag` « Tâche 2 » in yellow mono, its name, one line on what it asks); EO topics numbered 1… inside each Tâche; EE's Combinaison as three such blocks |

## Layout of the code

```
worker/sim/
  ctx.ts            request context (AsyncLocalStorage): env, user, lang, the asked questions the browser sent
  db.ts             tiny D1 helpers (one, all, run, batch) and json helpers
  config.ts         ← config/tcf.ts + content/exam-reference.json (official facts, NCLC table)
  oral-bank.ts      ← config/oral-bank.ts
  ai/gemini.ts      → shared/sim/ai/gemini.ts (runs in the browser with the person's key; no usage ledger, no QA)
  ai/models.ts      ← lib/ai/models.ts
  ai/cooldown.ts    ← lib/ai/cooldown.ts (in-memory, per user)
  eval/*.ts         → shared/sim/eval/*.ts (rubric, evidence, evaluate, anchors, proofread, language, highlight, audio-core, audio)
  rubric.md.ts      the text of spec/rubric.md as a string (loaded into the scorer prompt)
  types.ts, timing.ts, oral-lines.ts, interview.ts, roleplay.ts, asked.ts, session.ts
  oral.ts           her lines for a task (prepareTask) and her live script (liveScript)
  results.ts        the marks a browser sends: checked, kept as numbers (shared/sim/marks.ts)
  prompts.ts        topics table → GeneratedPrompt
worker/expr.ts      the HTTP routes (/api/expr/*, /api/me/key)
shared/sim/         what runs in the browser: the marking (writing-core.ts, oral-core.ts, eval/), the key's shape
                    (key-shape.ts), the marks kept by the server (marks.ts), the asked questions (asked-core.ts),
                    what the live examiner is told of the exchange (live-notes.ts)
web/app/sim/        the browser side (see above) + sim.css; browser-score.ts (the key, the marking), work.ts (the work)
tests/sim/          the ported tests
```

## The API

| Route | Does |
|---|---|
| `POST /api/me/key` `{ status, error? }` | how the key on a device fares (ok · none · error · quota, with Google's message), for the admin; a body carrying a key is refused (`400 key_stays_in_browser`). Nothing to GET |
| `POST /api/expr/start` `{ section, kind, taches, topicIds?, mode? }` | creates a session and its tasks; returns `StartedSession` |
| `GET /api/expr/sessions` · `GET/PATCH/DELETE /api/expr/session/:id` | history; one session (subjects, statuses, marks); `{ status: "abandoned" }`; delete |
| `POST /api/expr/oral/prepare` `{ sessionId, taskNo, asked? }` | her lines for a task (the welcome, the rules, the subject, the closings) |
| `POST /api/expr/oral/realtime` `{ sessionId, taskNo, asked? }` | her live script `{ instructions, sessionSeconds }`; the browser adds what was already said (`shared/sim/live-notes.ts`, from `work.ts`), mints the session token with the person's key and talks to Google directly. `{ failed, model }` and `{ usage, model, turns }` are log lines |
| `POST /api/expr/result` | the marks of a task marked in the browser: writing `{ wordCount, elapsedS, score20, marks }`, speaking `{ durationS, score20, marks }`; `marks` is reduced to the grid's rows and numbers (`shared/sim/marks.ts`), anything else sent is dropped |

`asked` is the browser's list of the Tâche 1 questions already asked (`shared/sim/asked-core.ts`, localStorage
`tcfm-asked:<user id>`): used for that answer, never stored. Without a key on the device the Start opens the key
sheet (`pages/Expression.tsx`, `mock/MockPage.tsx`); the server does not know.

## Data

- **On the server** (D1): `expr_sessions`, one per session (section ee/eo, kind practice/exam, taches as JSON, mode
  live/ptt, status, score/nclc/level and `summary_json` once done); `expr_tasks`, one per task: `prompt_json` (the
  subject and her plan, never anything the candidate said), duration, word count, status, `score20`/`level`/`nclc`
  and `marks_json` (`{ stage, score20, taskScore, taskScoreMax, criteria: [{ name, score }], locked }`). `users`
  keeps `gemini_status` as the browser last reported it. No key, no text, no transcript, no correction (migration
  0012 removed the columns and their content).
- **On the person's device**: the key (localStorage); the work (`web/app/sim/work.ts`, IndexedDB `tcfm-work`, one
  record per task: the text or the turns, the full evaluation, the complete list of mistakes, the rewrites), kept
  until the session or the account is deleted or the browser cleared; the recordings (`clips.ts`, IndexedDB, 30 days,
  swept on app start), sent only to Google. `loadSession(id)` reads the server's copy and completes it from here; on
  another device a marked task shows its marks alone (`elsewhere`: « … restent sur l'appareil où vous l'avez écrit »).
- Free-plan guard: a daily write budget (`budget` table, like the comprehension app) answers `{ hold }` past the
  day's limit; per-person caps: sessions per day, upload size to Google (19 MB), text length.

## Work is never lost (rules checked by tests/qa/expr.qa.test.ts, tests/qa/browser-score.qa.test.ts, tests/sim/finish.test.ts)

- A task with status `done` is closed: `POST /result` answers 409 `done`, and the browser gives the stored mark back
  without asking Google. A room reopened on a finished session (bookmark, another device) goes to its result page
  (`Room.tsx` always asks the server for the session's status).
- The writing drafts are kept on the device (localStorage on every change, `work.ts` every 3 minutes, when the task
  changes and when the tab hides); an empty hand-in scores the kept draft, never a blank page over it.
- The speaking log (her lines, Google's text of each answer, the answers' registrations) is written to `work.ts`
  every 5 seconds, before a task is marked and when the tab hides; an answer registered twice is kept once.
- `DELETE /session` with a task handed in or marked closes the session as `abandoned` instead (the marks stay); the
  browser's Abandon sends `PATCH {status: "abandoned"}` when anything was finished or is being marked. Deleting a
  finished session from the history removes its work from the device too.

## The mock exam (docs/MOCK-EXAM.md, 2026-10-19)

The writing and speaking stages of a mock are sessions of this simulator (`mock_id` set, `kind: exam`, the writing
one with `seconds: 3600`), run by `EcritRunner` and `OralRunner` with the `mock?: MockHooks` prop (web/app/mock/shell.tsx):
no hallway, the mock's clock and top line (`Station` takes `bar`), the stage ends instead of the results page. The
marking of a mock's tasks is driven by `web/app/mock/marking.ts` from the mock's marking screen. `listSessions` leaves
mock sessions out of the EE/EO history; `POST /api/expr/start` answers `409 mock_running` while a mock runs.

Since the owner's review round (docs/MOCK-EXAM.md §12): the stations' top line is the shared `RoomBar` (the Tâche
pills on its second row, the time in the centre, the timer pill at the right); the one `Hall` screen replaces the pen
loader and the card between tasks; the examiner has no status pill; the speaking room splits in two halves for
Tâche 2 and 3 with an animated split; « Terminer l'épreuve » is the end-of-test button.
