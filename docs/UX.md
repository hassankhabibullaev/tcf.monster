# Consistency audits — the shared pieces

`UX.md` at the root says how the application behaves. This file keeps the dated audits of the shared pieces (the
same component must look and behave the same in the app, the admin and the public site): what was fixed, and what
waits for the owner.

## 2026-10-19 — app, admin and public site side by side

Walked on laptop (1280 px) and phone (375 px), light and dark: the site (`/about`, the door), the app (dashboard,
section, exam card, result, mock page, practice room) and the admin (overview, people, a person, content, jobs).

### Fixed

- **Monster AI** — one block of rules (`shared:mai` in `web/ui/base.css`, an exact copy in `site/styles.css`, kept
  equal by `tests/site.test.ts`). The site's copy had no « powered by Gemini » style and no reduced-motion rule. The
  site's Monster AI line now uses the app's markup: « Monster AI » then « powered by Gemini » in small muted type, no
  « · » between them.
- **Wordmark and logo** — one block (`shared:brand`, plus `shared:brand-phone` inside each phone block, both tested).
  One lockup everywhere: the app icon 32 px beside the wordmark 24 px, 10 px apart, on laptop (site bar and footer,
  admin bar, the welcome page); on a phone the icon 30 px and the wordmark 20 px, the theme switch and the language
  pill 36 px, the bar 56 px (site, admin, app top bar, the door). Before: the site's phone bar was 62 px with a 28 px
  icon, 21 px name and 40 px switches; the app's phone bar spaced icon and name 8 px apart; the admin used 30 px and
  20 px on laptop.
- **The admin's wordmark dot** — the admin's log dots used the class `.dot`, so the coral dot of « tcf.monster » got
  a pale disc behind it (visible in dark). The log dots are now `.log-dot`.
- **Buttons** — one block (`shared:buttons`, tested). The site's buttons were 46 px (now 44 px like the app) and its
  header button was its own « small » 40 px (now the app's `.sm`, 36 px). The app's donation button was a copy of the
  button with other sizes (`.dgo`); it is now a `.btn` with its size only. The site's donation button lost its own
  background (now the button's white like the app's), and the app's payment note has the site's lock.
- **Back links** — the admin's « People » and the door's « Back to the site » were muted text arrows; both are the
  round back button now (`BackLink`, which gains `href` for a page outside the app).
- **Tabs** — the admin's Content tabs had their own strip; they use the app's full-width tabs. The unused `.x-tabs`
  copy is gone.
- **Search field and selects** — one copy in `base.css` for the app and the admin (the admin's select had no arrow and
  another padding).
- **Toasts on a phone** — they sit above the bottom bar in the app too (only the admin had it).
- **Past attempts on the exam card** — « abandonné » / « temps écoulé » were muted lowercase words; they are chips
  (red « Abandonné », amber « Temps écoulé ») as in the mock and expression lists, and the delete × is the same quiet
  round button as in those lists.
- **The admin overview's rows** — the arrow was a flipped « back » arrow; it is the app's right arrow.
- **One phone block per stylesheet** — `base.css` had three, `app.css` two (and two tablet blocks); one each now. The
  site's phone block moved after its shared blocks, so the phone sizes win over them.
- Small: the avatar ring rule was written three times (kept once, same look); a wrong comment in `Frame.tsx` (the
  rail's logo leads to the site, not the dashboard).

### Already one piece (checked, nothing to do)

- Option rows: one `Options` in practice, exam, the mock (it runs the exam room) and the result pages (the mock's
  detail uses the same review cards).
- The clock pill (`Clock`), the hall (`Hall` / `Hallway`), the room bar (`RoomBar`), sheets (`Sheet`), empty states
  (`Empty`, app and admin), toasts (`Toast`), the theme switch and the language pill (`shared:switches`), the
  examiner (`shared:examiner`).
- The door and the welcome page use the app's language pill and theme switch (done the same day by the door's own
  session).

### For the owner to decide

1. **Past sittings, two row formats.** The mock and expression lists: the whole card is the link, an arrow at the
   right, × to delete. The CO/CE exam card: a « Revoir » button, then ×. Recommended: the card link with the arrow
   everywhere.
2. **Page titles.** The section pages open with the section's icon and name (`SectionHead`); « Examen blanc » and
   « Profil » are a plain title. Recommended: the mock page gets its icon the same way; the profile stays plain.
3. **An explaining line.** The exam card says « Le temps continue même si vous quittez la salle. » under the two
   modes, against the rule of no instructive captions. Remove it, or keep it as a rule of the exam?
4. **The no-key screen.** Expression without a Gemini key shows a large dashed card of its own (`.locked-note`) instead
   of the standard empty state. Keep it big (it is the only thing on the page), or make it the standard one?
5. **The site's phone width.** The site turns into its phone layout under 560 px, the app and the admin under 760 px.
   Between the two, the site keeps its laptop bar and sizes. Recommended: 760 px for the site too.
6. **The donation card.** The app's is a horizontal band (text left, button right, a 3 px shadow); the site's is a
   centred card with a 6 px shadow and a paler heart disc. Make the site's a copy of the app's, or keep the site's
   larger version?
7. **The site's own scale.** Its cards have 20 px corners (the app's 14 px), its section marks are 26 px (the app's
   20 px), its « 100 % gratuit » badge is larger than the app's chips, its focus ring sits 3 px out (the app's 2 px).
   Bring them to the app's values, or keep the larger marketing scale?
8. **The avatar ring.** The coral ring around the avatar shows on every page (rail and phone bar), not only on the
   profile page. Keep it always, or only when the profile is open?
9. **Landscape phones.** `room.css` has a second phone rule for phones held sideways (under 520 px high). It is a
   different case from the phone block; keep it as its own block?

## 2026-10-19 — the owner's round on the door, the welcome page and the scrollbars

- **One code field.** The six boxes (`CodeBoxes` in `web/app/pages/AuthInputs.tsx`, with `PasswordInput` and
  `Strength`) are the only way a code is typed: the door, the profile's new password, the account deletion.
- **The code e-mail** has no button (« Ouvrir tcf.monster » went): the code is one unbroken block that one tap selects
  whole. A copy button cannot exist in an e-mail (no JavaScript).
- **Sign-up** asks for three ticks, each its own line: free and as is; no responsibility, donations are gifts; the
  terms of use read and accepted. « Recevoir un code » waits for all three.
- **One date picker** (`web/app/Calendar.tsx`), never the browser's: the welcome sentence and the profile. It holds the
  « Pas encore inscrit·e » button; the welcome sentence then reads « …et [je ne suis pas encore inscrit·e]. », and the
  dashboard « Votre objectif est le NCLC 7, et vous n'êtes [pas encore inscrit·e]. » (the last words open the profile).
- **The scrollbar is part of the design system** (`--sb-thumb`, `--sb-thumb-active`, `--sb-size`, `--sb-gutter` in
  `tokens.css`, drawn by `public/scrollbars.js`): one coral colour, one 6 px pill that never changes size. It is drawn
  inside the gutter its area keeps on the scrolling edge, never over the items. A strip that scrolls sideways keeps
  `padding-bottom: var(--sb-gutter)`, or it gets no thumb (a swipe still moves it); a list that scrolls down keeps
  `padding-right: var(--sb-gutter)`.
