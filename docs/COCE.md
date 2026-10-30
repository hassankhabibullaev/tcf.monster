# Compréhension orale / écrite — the build contract (2026-10-18, rooms revised the same day)

What BRIEF.md §3 and UX.md §2.5–2.6 ask for, cut into four pieces that are built at the same time. Every piece
talks to the others only through what is written here. Plain words; the owner is not a developer.

## Pieces and owners

| Piece | Where | Does |
|---|---|---|
| **Content** | `scripts/bank-export.py`, `scripts/media-upload.sh`, `worker/media.ts` | bank → static files; media → R2; `/media/*` route |
| **Server** | `worker/coce/**`, `shared/progress.ts`, `migrations/0004_coce.sql`, `tests/coce/**` | progress sync, exam attempts, scoring |
| **Rooms** | `web/app/coce/room/**` (+ `web/app/coce/store.ts`, `web/app/coce/bank.ts`) | the browser progress store, the practice room, the exam room, the review room |
| **Pages** | `web/app/coce/pages/**` | section page (Examen · Entraînement), exam card, result, the running-exam band |

Nobody edits `web/app/main.tsx`, `web/app/i18n.ts`, `web/app/app.css`, `worker/index.ts`: each piece exports and
the integrator wires. Words go in the piece's own `words.ts` (`{ fr: {...}, en: {...} }`, same keys; **the English
side is all English** — « Exam CO no. 3 », « Exam | Practice », « Short hint » — and keeps only the four section
names, « Tâche », « Partie », NCLC and the level codes), styles in the piece's own `.css` (tokens only, one phone block `@media (max-width: 760px)` at the end, no hex, no inline styles:
the CSP forbids them; React style props are fine).

## 1. Data files (Content → everyone)

Built by `python3 scripts/bank-export.py` from `~/Developer/tcf.monster-data/final/{questions,placements}.json`
into `public/data/` (git-ignored). Never committed. The bank's guard (`worker/coce/guard.ts`):
- `/data/*` goes through the Worker, to signed-in people only, kept an hour by the browser. Each file a person opens
  is noted once a day (`bank_reads`). Every request passes the abuse guard (`worker/guard.ts`): a pace or a daily
  volume no person reaches, or technical signs of a program, ask Cloudflare's human check (`429 { error: "human",
  turnstile }`, shown by `web/app/guard-fetch.ts`, token sent again as `x-turnstile`, a pass holds 45 minutes); failing
  it only asks again. The account is blocked — signed out everywhere, sign-in answers « blocked » — on a hidden trap or
  a canary, on requests at a machine's pace while the check waits, past a hard line, or when signs add up, until the
  owner unblocks on the admin's person page. The owner is never checked or blocked.
- Canaries (`scripts/copy-media.mjs`, made with the media secret, listed in R2 `private/canary.json` by
  `scripts/upload-keys.mjs`): on two real questions a file, a recording or picture name that exists nowhere
  (`audioSlow` / `passageImageHd`, read by no page); from 2026-11-21, whole questions too — in a level file under another
  level, in an exam file at position 40. `web/app/coce/bank.ts` keeps a level's own questions and an exam's positions
  1…39; scoring keeps positions 01…39. Asking for a canary name, answering or reporting a canary question blocks.
- `/media/*` are plain files Cloudflare serves without the Worker (free): `scripts/copy-media.mjs` copies them into
  `dist/media/` under names made with a secret kept on this Mac (`~/Developer/tcf.monster-data/media-secret.txt`; the
  same secret, the same names at every build) and rewrites the names inside `dist/data/`. The export's names below
  were public once: they are never files, a request for one reaches the Worker and is a 404. On this Mac
  (`npm run dev`, no copy-media) the Worker reads them from R2's local folder.
- `key-co|ce.json` (the answer keys, the mock exam's paper builder) leave `dist/` at the build and live in R2 under
  `private/` (`scripts/upload-keys.mjs`, inside `npm run deploy`). `summary.json` is the admin's. Any other spelling of
  `/data` or `/media` (encoded, doubled slashes, capitals) is a 404.

- `public/data/bank.json` — the index:
  ```json
  { "builtAt": "…", "points": { "A1": 3, "A2": 9, "B1": 15, "B2": 21, "C1": 26, "C2": 33 },
    "examCount": { "A1": 4, "A2": 6, "B1": 9, "B2": 10, "C1": 6, "C2": 4 },
    "levels": { "co": { "A1": 110, "A2": 140, … }, "ce": { … } }, "exams": 40 }
  ```
- `public/data/<co|ce>-<A1…C2>.json` — the level for practice: `Question[]` in a fixed order (the order of
  `questions.json`); numbering 1…N is the index + 1. Practice-only questions included.
- `public/data/exam-<co|ce>-<01…40>.json` — `Question[]` of 39, position order, **the placement's options and
  answer applied** when the placement has its own (`question_key` dropped), plus `placement: "CO-12-05"`,
  `position: 5`, `level` by position (1–4 A1, 5–10 A2, 11–19 B1, 20–29 B2, 30–35 C1, 36–39 C2).
- `Question` (browser shape, camelCase, nulls never missing keys):
  ```ts
  type Question = {
    id: string; section: "co" | "ce"; level: "A1"|"A2"|"B1"|"B2"|"C1"|"C2";
    stem: string; stemEn: string | null;
    options: { key: "A"|"B"|"C"|"D"; text: string | null; textEn: string | null; reason: string | null }[];  // CO: text null = spoken only
    answer: "A"|"B"|"C"|"D";
    hint: { fr: string; en: string } | null;            // [[…]] marks the key words
    keySentence: string | null; keySentenceEn: string | null; explanation: string | null;
    // CO
    audio: string | null;                                // "/media/<key>"
    image: string | null;                                // "/media/<key>"
    transcript: string | null; transcriptEn: string | null;
    words: { w: string; s: number; e: number }[] | null; // word timing when known (extract rows; bank rows rebuilt from the bank's transcript_json + timing_json)
    segments: { options: [number, number][] | null; question: [number, number] | null } | null;  // where the four options / the question are spoken
    maxPlays: number;                                    // 2 when unknown
    // CE
    passage: string | null; passageEn: string | null; passageImage: string | null;  // "/media/<key>"
    practiceOnly: boolean;
  };
  ```
- Media keys: `media/<section>/<basename>` (`media/co/69205b60b0f61d26db49.mp3`, `media/ce/2c63def4ef06bb3f0092.webp`);
  the export writes `~/Developer/tcf.monster-data/media-manifest.json` (`key → local path`) and the uploader
  reads it (`wrangler r2 object put tcf-monster-files/<key> --file <path> --remote`, 8 in parallel, skips keys
  already listed, resumable; R2 keeps them as the backup). In the bank files the build replaces each with its hidden
  name (above). Keys are immutable: a changed file gets a new name.

## 2. Progress (Server ↔ Rooms ↔ Pages)

**Browser-first.** An answer is applied in the browser at once, queued in localStorage, sent in bundles. The same
pure rules run in the browser and in the Worker: `shared/progress.ts` (plain TS, no imports).

- State of one level: `{ v: 1, q: { [questionId]: { s: "green"|"red"|"amber", t: number, a: "A"|"B"|"C"|"D"|null } }, pos: number | null, x?: { [questionId]: number } }`
  (`t` = seconds since epoch of the last event that touched it; `pos` = last question number opened; `x` = the
  questions reset by hand and the second of the reset, so an older answer arriving later — a phone that was offline,
  a bundle sent twice — cannot bring the question back; an entry of `x` goes at the next answer; absent in old rows).
- Events (each `{ id: string(uuid), section, level, t, type, qid?, key?, right?, s?, n? }`):
  - `answer` `{qid, key, right}`: grey → green (right) or red (wrong); red + right → amber; red + wrong → red;
    green/amber: ignored (already learned; Retry exists only on red).
  - `mark` `{qid, s: "green"|"amber"}`: only on a green/amber question.
  - `reset` `{qid}`: removes the entry.
  - `pos` `{n}`: remembers the position (no colour change).
  - An event applies only when its `t` is strictly after the entry's `t` (or the entry is missing); applying the same
    bundle twice changes nothing.
- `apply(state, event) → state` (pure, returns the same object when nothing changed), `counts(state, n) → {green, red, amber, grey}`.
- API (signed in): `GET /api/progress?section=co` → `{ levels: { A1: State, … }, updatedAt }`;
  `POST /api/sync { events: Event[] }` → `{ ok: true, applied: n }` or `{ hold: true }` (daily budget passed: the
  browser keeps its queue and tries later; nothing is shown). One row write per (section, level) touched, plus the
  `practice_days` upkeep (answered, wrong, seconds from the events' optional `dt`, 120 s at most an event; only the
  answers that changed something count, so a bundle sent twice adds nothing), counted with `addWrites`.
  The Worker drops bad events (wrong section, level, key, type; `id` over 40 characters, `qid` over 64; a stamp
  before 2025-01-01), takes 500 events a bundle and 256 KB a body at most, moves a whole bundle back when its stamps
  run more than a minute ahead of its own clock (order and gaps kept; what then falls before 2025 is dropped), and
  ignores an answer to a new question once a level's state holds 2 000 entries (made-up ids cannot grow a row).
  Bundles go about 15 s after the last answer, at most 60 s, and when the tab is hidden (`fetch keepalive`).
- Browser store `web/app/coce/store.ts` (Rooms owns it, Pages reads it):
  `useLevel(section, level) → { state, answer(q, key), mark(qid, s), reset(qid), setPos(n), synced: boolean }`,
  `useSection(section) → { levels: Record<Level, State> | null, refresh }`, `flush()`, `pendingCount()`.
  Loads from the server once per section per visit, lays the local queue over it, saves nothing else in the browser
  but the queue. The queue belongs to one person: `setOwner(userId)` is called by `main.tsx` as soon as `/api/me`
  answers (and with `null` at sign-out); the key is `tcfm-queue:<userId>`, so two people on one browser never see
  or send each other's answers; a queue left unsent waits under its owner's key until they sign in here again. The
  old `tcfm-queue` (before owners) is adopted by the browser's last known person. `forgetDevice()` (sign-out,
  deletion) removes drafts, pending marks and exam copies, never the queues.

## 2b. Reports on a question (Server ↔ Rooms ↔ Admin)

- Table `disputes` (migration 0009): `id, user_id, section, level, question_id, n` (the number the person saw),
  `message` (≤ 2 000 characters), `status` open · resolved, `created_at`, `resolved_at`. One row a report; a person's
  rows go with their account (deletion from the app or the admin) and are in the nightly backup.
- `POST /api/disputes { section, level, questionId, n, message }` (signed in, same site) → `201 { ok, id }`;
  `400` on a bad field, `too_long` past 2 000 characters; `429 daily_cap` past 20 a person in 24 h; `503 hold` past
  the daily write budget. `GET /api/disputes?section=&level=` → `{ ids }`: the question ids of that level the person
  already reported (one read when the room opens; the room adds to it as it sends).
- `note` (migration 0012): the owner's optional note when a report is marked done.
- Admin (`admin.tcf.monster/disputes`, `GET /api/admin/disputes?status=open|resolved|all&page=`, newest first, 50 a
  page, with `open` / `resolved` counts; `GET /api/admin/disputes/:id` → the report with the sender's name, e-mail,
  sign-up, last visit and number of reports; `POST /api/admin/disputes/:id/resolve { note? } | reopen`). The list is
  tickets (#, section · level · n°, the message, who, when, open / done); a report's page shows the message, the
  question (its text read from the same `/data/<section>-<level>.json`, right option marked; « In the app » opens the
  room at that question on tcf.monster), who sent it, and Mark done (with a note) / Reopen. The People page counts the
  open ones; a person's page lists theirs.

## 3. Exam attempts (Server ↔ Rooms ↔ Pages)

The exam room also keeps a copy of the answers in localStorage under `tcfm-exam-<attemptId>` while the attempt runs:
a PATCH that never landed (network, a closed tab, a session expired elsewhere) is laid over the server's copy when
the room reopens and sent again; the copy goes when the attempt is finished.

The attempt lives on the server; the deadline is the server's. Durations: CO 35 min, CE 60 min. Table `attempts`
(migration 0001; `exam` 1…40, `answers` JSON `{ "CO-12-05": "B" }` by placement, `ended` done · time · abandon;
migration 0005 adds `mode` TEXT NOT NULL DEFAULT 'exam').

- **Mode** (`exam` | `training`, chosen on the exam's page; shown as « Mode examen réel » / « Real exam mode » and
  « Mode libre » / « Free mode » everywhere — chips « Réel » / « Libre » —, never renamed in the database): `exam` is
  the real thing — no going back in either section; CO plays each recording once, the next question cannot be
  opened before the recording has ended, and once it has the question keeps 2100 s / 39 − the recording's length
  (6 s at least; the whole exam stays 35 min) before the next comes by itself. `training` is the same questions and
  the same running clock, but free movement everywhere, and CO may replay and scrub. The score and the NCLC are
  computed the same way; the attempts list shows the mode next to each row. Rows from before the column read as `exam`.
- `POST /api/attempts { section, exam, mode? }` → `201 { attempt }` (`mode` missing → `exam`; anything but
  `exam` | `training` → `400 mode`); if one is already running for this person (any section, any mode) →
  `409 { running: attempt }` — two starts at the same instant (a double tap, two tabs) end the same way: the older
  row stands, the other is taken back. Free-plan guard: `{ error: "hold" }` 503 past the daily budget, 6 attempts a day a person (`429 daily_cap`).
- `GET /api/attempts/running` → `{ attempt | null }` (the band); a running attempt past its deadline **plus the
  2-minute grace** is finalised first (`ended: time`); inside the grace it is still returned as running, so the
  band shows 0 min rather than nothing while the room's last answers arrive.
- `GET /api/attempts?section=co` → `{ attempts: AttemptRow[] }` newest first (cards: latest / best / average per exam).
- `GET /api/attempts/:id` → `{ attempt }` with answers; `PATCH /api/attempts/:id { answers: {placement: key}, at }`
  → merges (accepted while the server's clock ≤ deadline + 2 min for answers stamped before the deadline); one row
  write, none when nothing changed; only placements of this attempt's exam and positions 01…39 are kept, 100 keys a
  PATCH at most. Refusals: `409 { error: "late", attempt }` (past the grace the attempt comes
  back finalised `time`), `409 { error: "finished", attempt }` on a finished one; `at` is optional (ms or ISO).
- `POST /api/attempts/:id/finish { ended: "done" | "abandon" }` → `{ attempt }` scored; past the grace the row is
  recorded as `time` whatever the browser says; a finished attempt answers `409 { error: "finished", attempt }`.
- `DELETE /api/attempts/:id` → `{ ok: true }`: a finished attempt of one's own goes for good (one row write; the lists
  and `/api/me/stats` no longer count it); somebody else's or none → `404`; one still running → `409 { error:
  "running", attempt }`. Asked from the exam page's « Essais passés » through a Sheet (« Supprimer cet essai ? »).
- The simulator's twin (worker/expr.ts): `DELETE /api/expr/session/:id?forget=1` erases a session of one's own whose
  status is `done` or `abandoned`, tasks and marks included; without `forget` the DELETE keeps today's behaviour (a
  session with a task handed in is abandoned, not erased); one still in progress is treated the plain way either way.
- Scoring (Server): the exam's file read through `env.ASSETS` (`/data/exam-co-12.json`); right answers add their
  level's points (`A1 3 · A2 9 · B1 15 · B2 21 · C1 26 · C2 33`, 699 in all); `score = sum` (no floor: the official scale starts at 100, the owner wants the real sum shown);
  NCLC from `worker/sim/exam-reference.json` → `nclc.rows[].comprehension_orale / comprehension_ecrite` ranges
  (below NCLC 4 → `nclc: null`, shown as « NCLC 3 », like the dashboard); `right_count`, `wrong_count`, `blank_count`; per-level right
  counts in the answer (`byLevel: { A1: { right, of } … }`) for the result's bar.
- `AttemptRow = { id, section, exam, mode, startedAt, deadlineAt, finishedAt, ended, score, nclc, right, wrong, blank }`;
  `attempt` adds `answers` and, once finished, `byLevel` (stored in `attempts.by_level`, migration 0004, which also
  adds the small index `attempts_user_running` of the running rows).
- Nightly job hook: `finalizeStale(env)` exported from `worker/coce/attempts.ts` (the integrator calls it from `jobs.ts`).
- `GET /api/attempts/running` also carries `mock` (the running mock exam's row, docs/MOCK-EXAM.md §11), and
  `POST /api/attempts` answers `409 { error: "mock_running", mock }` while one runs. `ExamRoom` takes `mock?: MockHooks`
  and `Shell` takes `sub` (« 2 / 4 ») for the mock; nothing changes without them. Every room's top line is the one
  `RoomBar` (web/app/room-bar.tsx: the room at the left, the time in the centre, the timer pill at the right) and
  every footer is 84 px; « Terminer l'épreuve » is shut in the real listening exam (docs/MOCK-EXAM.md §12).

## 4. Rooms (browser)

All inside `web/app/coce/room/`, exported from `web/app/coce/room/index.ts`:

- **The room rule — the chrome floats.** In every room (practice, exam, and the EE/EO station) the top line and the
  footer are floating layers with an iOS-style blur: `background: color-mix(in srgb, var(--bg) 55%, transparent)` +
  `backdrop-filter: blur(14px) saturate(1.2)`, no hairline, no solid strip; the body scrolls under them from the very
  top to the very bottom, and every scroll area keeps their heights free (`--cr-head` / `--cr-foot` in room.css,
  `--room-bar` / `--room-foot` in sim.css, with `scroll-padding` to match) so the first and last lines can be reached.
  The buttons in the footer keep their own pills and so look as if they float. One rule set, light and dark alike
  (the mix follows `--bg`). In practice the one way back is the design system's `BackLink` (the round arrow button;
  the word is off in rooms, `aria-label` « Retour »); **an exam has no back button**: the red Terminer of the footer
  is the way out (Escape and the browser's back still open the « Quitter l'examen ? » sheet).
- **The rooms are flat** (the owner: no onion): one slim top line, 76 px high with 24 px kept above its row so the
  back circle's centre sits at 50 px, where the rail's logo has its own (the app pages do the same; the EE/EO station
  too) (the back button in practice · the title in small caps — the test's name, « Compréhension orale · B1 » in
  practice, « Compréhension orale » (+ « · Libre ») in an exam; never « n° 12 », too specific to mean anything — · the **progress bar** of the level:
  « 12 / 110 » in small mono before it (current / total), green · amber · red · grey in proportion, and in practice the
  four counts as tiny dots with their numbers after it on laptop (hidden on phones: the picker has them; an exam's bar
  shows done · todo and no dots); the whole thing is one button: a press focuses the rail on laptop and opens the
  picker on phone, where it sits under the first row · in exams the one `Clock` of every room (`web/ui/ui.tsx`: 24 px
  mono, amber under five minutes, blinking under one, red at zero; the EE/EO station shows the very same)); a band (offline, a failed finish)
  hangs under it; the question rail as a plain 48 px column of numbers
  (each in its colour, a thin bar at its left for the state, the current one bold in the accent; it scrolls inside its
  column, never past it); the two panels with no border or background of their own, one vertical hairline between
  them; the panel line at the top of the left panel: the toggles, **right-aligned**, all of one family (a small label
  with a slim pill thumb; the CE view choice is a two-word one, « Texte complet ○ Indice court »); the floating
  footer with Précédent and Suivant always at the two ends, Réinitialiser (plain,
  small) right of Précédent only when the question has a colour, Réessayer (plain, same size) left of Suivant on red.
  **In an exam the footer is the one every room shares** (the EE/EO stations too, 2026-10-19): **Terminer** at the
  bottom left — a quiet button with its word in red (`.btn.room-finish`, base.css), the one way out —, then
  Précédent · Suivant at the right (Suivant shut on the last question). No Abandonner anywhere: Terminer opens one
  sheet that lists the unanswered questions (« elles comptent faux ») with « Continuer l'examen » and a red Terminer;
  every question answered → `finish done`, otherwise `finish abandon` (the result says « Terminé avant la fin »).
  **Reading paper**: the French passage sits on a soft yellow sheet (`--sun-soft`, hairline `--sun`, radius-md, serif);
  English on → a second, separate sheet under it; the hint uses the same paper, under one small muted line (« Résumé
  écrit pour l'entraînement, pas le texte original. » / "A summary written for practice, not the original text.") wherever
  the hint is shown (CE's « Indice court », CO's hint); nothing else in the body gets a box
  but the spoken question's small bordered box in CO. English of the stem, an option, the key sentence sits **to the
  right of the French on the same line** (smaller, italic, muted; under it on phones), so nothing moves when English
  is toggled; the transcript's English speech stays below the French after a thin divider. The hint's `[[…]]` marks
  are rendered as plain words (no highlight). Phones: no rail, the bottom-sheet picker, the panels stacked.
- **The player is one dark pill** (2026-10-22, the phone round): `.cr-pill` in room.css — the `--hall` background,
  the round play button in the accent (pause while playing), the thin line in the sun (a scrubber in practice, a plain
  line in the strict exam), the two times as « 0:20 / 0:53 » in small mono; the same look in practice, in the exam,
  on the result page's cards, on laptop and phone.
- **The number strip** (2026-10-22; phones only since 2026-10-24: the laptop keeps one list, the rail at the left,
  drawn with the same discs): `Strip` in Rail.tsx, a row of full discs in the phone's practice footer — green · amber · red, grey when unseen, the current one filled in the accent with an ink border, the same size —, scrolling sideways
  (no thumb), the current one kept in view, a tap jumps. The footer is two rows (`.cr-foot-strip` then
  `.cr-foot-row`, `--cr-foot` 128 px when the strip is there); the laptop keeps its rail too.
- **Phones (the approved boards of 2026-10-22, `@media (max-width: 760px)`)** — adaptive, not just responsive: every
  laptop control stays in the DOM with its handler and is restyled, shortened to an icon, or folded (`.desk-only` /
  `.mob-only` in app.css). The top line scrolls away with the page (round 4, 2026-10-22; the window scrolls, only the footer is
  fixed): the round back, the test's icon + « CO » (accent) + « B1 » in mono (never the full name), « 2 / 172 » at the
  right (Shell's `code` and `subline`), and a round ⋯ button (`more`) whose bottom sheet holds Marquer ambre/vert and
  Réessayer when they apply and Signaler un problème always (the laptop's buttons, same handlers). **One FR | EN per page, never both languages at once** (the owner, 2026-10-23): one small pill — on the
  laptop's panel line, above the player or the passage on phones — turns the whole page (`data-english` on `.cr`):
  the passage, the transcript, the hint, the stem, the options and the key sentence show their English alone, in the
  French's own type; nothing is shown twice. The section pages open on practice (`/co`), the 40 exams are the second
  tab (`/co/exam`); the EE/EO second tab reads « Simulateur IA » / "AI Simulator". The body is one page
  (`.cr-left` is `display: contents`, the pieces ordered): the player, the question and its options, the feedback,
  then in listening two folded containers « Transcription » and « Indice » (`Fold` in Passage.tsx, always there,
  folded until opened), each with its own « FR | EN » pill in its header; in reading two small pills above the passage, « Texte | Indice » and « FR | EN »
  (`MiniSeg`, the same two settings as the laptop's switches). One language at a time on phones: with English asked
  the English stands alone (the FR sheet of `.cr-cols` / `.cr-passage` is hidden). The footer is one fixed row that never moves: the round « ‹ » at the left, the round accent « › » at the right
  (Suivant), the number strip between them — 32 px discs, 6 px gaps, a fade into the two buttons, the current one the
  same size filled in the accent with an ink border (never a ring), kept in view with `scrollIntoView` —; « Enregistré »
  flashes just above it. The top line is three items with the
  middle one truly centred (round 5): the back, the test's icon + code in the accent · the level (« B1 ») · « 6 / 222 »
  and the ⋯. In an exam the same line reads icon + « CE » · « n° 3 » · the clock, and nothing scrolls as a page: the
  passage (or the player and its picture) sits in a box that scrolls inside itself and the four options in a box of
  their own (332 px) docked above the footer, the same place whatever the question; its footer is the red stop,
  « ‹ », the grid button « 1 / 39 » (the picker), « Suivant › ». The stop sheet shows every question as a disc
  (answered ones filled in ink, the current one in the accent; right or wrong is unknown during an exam), the count
  of unanswered ones, and two buttons side by side: « Continuer l'examen » and the red « Abandonner le test », which
  ends the exam now and scores it (laptop and phone). The hint's paper is the surface-2 tone with a hairline, never the
  passage's yellow (round 6: people mistook it for the text). The bottom tab bar
  is hidden in a room and in an exam.
- `PracticeRoom({ section, level, lang, onExit })` — UX §2.5: the top line, the rail, the panel line — CE « Texte
  complet ○ Indice court » and « Traduction anglaise »; CO « Lecture auto », « Transcription », « Indice court » and
  « Traduction anglaise », under the player (« Lecture auto » starts each recording when its question opens; on phones
  a switch row in the ⋯ sheet) —, passage or player left / question right (phone: stacked),
  answer → colours at once and a short soft tone (`room/sound.ts`, Web Audio, two ascending notes when right, one low
  note when wrong; silent under reduced motion; never in exams), the feedback fades in only once an option is chosen
  (« Pourquoi pas C » then « La réponse était B — pourquoi B » / right: « Pourquoi B »), Suivant, Réessayer on red,
  Marquer vert/ambre chip, Réinitialiser in the footer with a Sheet, keyboard 1–4 / Enter / Space / Esc, opens at the
  next unanswered question (`pos`), or at the question a search hit named (`start`, from the address's `?q=37`; the
  integrator reads it in `PracticeRoute`). Once a question is answered, a quiet small « Signaler un problème » /
  "Report a problem" button (flag icon) sits under the feedback: it opens a Sheet with the question's reference
  (« Compréhension orale · B1 · n° 12 »), one text field for the person's own words (2 000 characters at most),
  Annuler / Envoyer; sent → toast « Merci, c'est envoyé » and the button reads « Signalé » (check icon, shut) for that
  question from then on (§2b). Help settings live in the account:
  `me.settings.help = { co: { autoplay, transcript, hint, english }, ce: { hint, english } }` through the `update` the
  integrator passes in (`onSettings(patch)`), defaults all off. On the level list, a level with answers has
  « Recommencer » (a Sheet to confirm): every question of the level back to grey, one `reset` each, in one bundle
  (`record.resetLevel`); the exams do not change.
  CO player: the dark pill above (the accent play button, the sun line, « 0:20 / 0:53 »); no plays count and no play
  limit in practice. The transcript is read from its lines: the spoken question (the
  last line ending in « ? ») in its own small box marked « ? » above the speech, the four spoken options (« A. … »
  lines) as a small list under it; the live transcript lights the speech's words with the audio (`words`), a tap on a
  word seeks; the question box and the options seek through `segments` when known.
- `ExamRoom({ section, exam, attempt, questions, lang, onFinished(attempt), onLeave })` — UX §2.6: timer top right
  from `deadlineAt` (server clock offset taken from the response `Date` header), n/39, no help. `attempt.mode` decides
  the rest: in `exam` **CO** has no going back (no Précédent, the rail and the picker read-only, no arrow keys) and
  plays once (`maxPlays` ignored: one play, locked player), Suivant — button, Enter — stays shut until the recording
  has ended (`onEnded`), then the question keeps `2100 / 39 − duration` seconds (6 at least; the grace line drains over
  that span) and the next comes by itself; a recording that fails to load is skipped after 1.2 s as before; **CE moves
  freely between the questions in both modes**, as at the real test (2026-10-19: the owner's rule). In
  `training` everything moves freely, the CO player is unlocked (replay, scrubber) and nothing advances by itself; the
  clock runs the same. The title carries « · Libre » / « · Free » in training. Before a new attempt the hallway (below);
  the room opens the moment the attempt exists and CO's first recording autoplays when the browser allows it.
  Terminer → the one
  sheet above (the unanswered list, `done` or `abandon`); leave (Escape, the browser's back) → Sheet « Quitter l'examen ?
  Le temps continue » (the attempt keeps running); time up → freeze one second at 00:00 → `onFinished`. Answers go to the store at once and
  to `PATCH` 20 s after the last change (and on hide/leave with keepalive). Offline: a band inside the room; answers kept and sent later.
- There is no review room any more: the result page (§5) holds the review. `/…/result/:id/review` redirects there.
- **The hallway**: Commencer on the exam's page leads to the salle; with no attempt running, the same dark hallway as
  EE/EO (`web/app/sim/hallway.tsx`: the logo, the section's title « Examen CO n° 3 », 3 · 2 · 1 — one real second
  each, a short tone on every number and a higher one at the start (`playCount` in room/sound.ts, Web Audio, silent
  under reduced motion) — nothing else, no microphone check; drawn on `document.body` above every layer of the page,
  fully opaque from its first frame in light and dark) runs first and the
  attempt is `POST`ed only when the count reaches zero, so the three seconds are not taken from the 35 minutes; the
  exam file is fetched meanwhile. A running attempt found on arrival (this exam) skips the hallway and resumes at once;
  another exam's → its own salle. On a failure, an `Empty` with Réessayer (which posts again, no second hallway) and Retour.
  All four timed exams share this loader.
- Shared parts (also exported, Pages may reuse): `Player` (`preload="none"` on a page with many of them), `Transcript`,
  `Passage`, `Paper`, `Hint`, `Options`, `Feedback`, `ColourBar`, `Legend`.
- Audio that fails to load (after one quiet second try): « Audio indisponible » + Réessayer in place of the player; in
  the strict exam the question is skipped and not counted; in Free mode it stays open (`skipped: true` in the PATCH answers as `"-"`).

## 5. Pages (browser)

All inside `web/app/coce/pages/`, exported from `web/app/coce/pages/index.ts`:

- `SectionPage({ section, mode: "examen"|"entrainement", lang })` — the **Examen | Entraînement** tabs at the top,
  Exam first (EN « Exam | Practice »; the integrator routes `/co` → examen and `/co/practice` → entraînement);
  Entraînement: a search field (320 px, right-aligned, above the levels): two or more characters typed load the six
  level files once (`pages/search.ts`, pure: stem, options, transcript or passage, accents and case ignored) and list up
  to twenty hits as rows « A2 · n° 37 · …snippet… », each opening the room at that question
  (`/co/practice/A2?q=37`); then six level rows (name · questions · one sentence « Une question vaut 3 points ; les 4 de ce niveau font
  12 des 699 points d'un examen. » from `POINTS` × `EXAM_COUNT` · four-colour bar with its four counts spread
  `space-between` (green left, grey right) · Ouvrir), the legend — no « Continuer » card: practice never asks to
  continue; Examen: 40 tiles, 5 a row (3 tablet, 2 phone), each with its number, the status chip
  (Nouveau / Terminé / En cours), the **latest** score « 470 /699 » with its NCLC chip, and « n essais »; a new exam
  keeps the same shape with « 0 /699 » and « 0 essais » in muted type. No score switch (`me.settings.examScore` is
  no longer read or written); the running attempt first if any.
- `ExamCard({ section, exam, lang })` — the exam's page: `BackLink` « Tous les examens » top left, then a hero card
  (the section's icon alone beside « Examen CO n° 3 », 34 px: the letters would say CO twice):
  mark and « Examen CO n° 12 », « 39 questions · 35 min » and the status chip; two big picks **Mode examen réel** /
  **Mode libre** (`.pick` cards, one pressed), each explaining itself in the **same number of lines, matched pair by
  pair** so the difference reads line by line (CO: « Chaque enregistrement n'est joué qu'une fois. » ↔ « Réécoutez
  autant que vous voulez. »; « La question suivante vient d'elle-même. » ↔ « Vous passez à la suivante quand vous
  voulez. »; « Pas de retour en arrière. » ↔ « Revenez en arrière librement. ». CE: « Vous avancez dans l'ordre, sans
  retour en arrière. » ↔ « Revenez en arrière librement. »; « Une réponse est définitive une fois la question passée. »
  ↔ « Changez de réponse tant que le temps court. »; « Le chronomètre tourne : 60 minutes. » ↔ « Le chronomètre tourne
  quand même : 60 minutes. »), one line under both: « Le temps continue même si vous quittez la salle. », one big
  **Commencer** → `/co/exam/12/room` for exam mode,
  `/co/exam/12/room?mode=training` for training (`sallePath(a)` adds the query from `a.mode`). **While any attempt
  runs** (`GET /api/attempts/running`, any section): the picks and Commencer are not shown; the hero shows « Examen CE
  n° 12 en cours » with the time left, **Reprendre** and **Abandonner** (Sheet → finish `abandon` → the result). Below
  the hero, « Essais passés » only when there are any: each row date · mode chip (« Réel » / « Libre ») · score / 699 ·
  NCLC chip · the status word when abandoned or timed out · **Revoir** (→ the result page) · a small quiet delete
  control (the x alone, `aria-label` « Supprimer ») that asks in a Sheet — « Supprimer cet essai ? » / « Il disparaît
  de vos résultats et de votre tableau de bord. » — then `DELETE /api/attempts/:id` and drops the row.
- `ResultPage({ section, exam, attemptId, lang })` — **one scrollable page, the review included**: `BackLink`
  « Retour » top left (a back button names a general place or says Retour; never the exam's number); then two columns
  (2026-10-19): at the left four cells as cards — the **score** /699 (the real sum of points since 2026-10-18, no
  floor), the **right answers** /39, the **NCLC** (3 under the table), the **level** on the TCF scale (`cefrOf`: A1 to
  199, A2 to 299, B1 to 399, B2 to 499, C1 to 599, C2 from 600) —, at the right the level card A1…C2 (right out of
  asked, 10 px bars) pointing at weak levels; under them one small muted line: the date, and « Terminé avant la fin »
  or « Temps écoulé » when it applies (no wrong or unanswered counts anywhere); « S'entraîner au B2 » when a level stands out
  (below half right, most questions); then one card per question in exam order, the same width as the cards above (the
  tone is a 4 px strip drawn inside the card, not a thicker border): « Question 12 · B1 » with its worth « 3 points »
  … « 33 points » (green once earned, muted otherwise), the given answer
  and the right one as chips, the four options with the chosen one marked (wrong crossed) and the right one ticked, the
  feedback (why / why not / the key sentence) as in practice. CO cards carry a small player (`preload="none"`) and the
  transcript folded under « Transcription » (rendered only once opened: no 39 live transcripts at once); CE cards
  show the passage folded under « Texte », once per group of questions sharing one passage, open by default on the
  first card of the page. An app page in the Frame: no room chrome, no question rail. Phones: the same cards, tighter.
- `RunningBand({ lang })` — « Examen CE n° 12 en cours — 23 min 10 » · Reprendre · Abandonner (Sheet), shown on
  every app page by the integrator when `GET /api/attempts/running` says so; refreshes once a minute.

## 6. Routes (integrator)

```
/co  /ce                       SectionPage mode examen (the 40 tiles)      /co/practice  → mode entrainement (the levels)
/co/exam                       → redirects to /co (`Redirect`, exported by the pages)
/co/practice/B2                PracticeRoom (frame: rail collapsed); `?q=37` opens at question 37 (a search hit)
/co/exam/12                    ExamCard
/co/exam/12/room               ExamRoom (frame: rail hidden): on mount the integrator asks
                                 `GET /api/attempts/running` (this exam → resume at once; another → its salle); none →
                                 the Hallway (3 · 2 · 1), and when it ends `POST /api/attempts { section, exam, mode }`
                                 with `mode` read from `new URLSearchParams(location.search).get("mode")`
                                 (`?mode=training` = the free mode); the exam file is fetched meanwhile; the room reads
                                 `attempt.mode` from the answer
/co/exam/12/result/:id         ResultPage (the review is on it)      /review → redirects to the result page
```

## 7. Numbers to keep in mind

Free plan: 100,000 Worker requests a day (static files, the recordings included, are not counted), 100,000 row writes.
A practice session ≈ 1 progress read + 3–6 syncs; an exam ≈ 1 + 39 small PATCHes + 1 finish; the bank's files are
about 13 requests the first time a section opens, then an hour of browser cache. One person's day stays under 200
requests.
