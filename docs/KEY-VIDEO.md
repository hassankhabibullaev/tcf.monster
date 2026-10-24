# The Gemini key video

The key section shows one sentence, this video, and the field. The video is drawn in code (`web/app/keyvideo/`), not
recorded: four versions, chosen by the viewer's screen and language — laptop FR, laptop EN, phone FR, phone EN — in
the viewer's theme (Google's light or dark look). It starts on the very page the viewer is on (the settings page and
its key section), zooms in where something is typed or clicked, and plays soft click and typing sounds (a button in
the corner turns them off). Nothing else: no chapters, no progress bar; a click pauses it.

## What was checked on the live sites (2026-10-19, the owner's account)

- Signed out, `aistudio.google.com/api-keys` answers 302 to `accounts.google.com/ServiceLogin?…continue=
  https://aistudio.google.com/api-keys`, which shows Google's sign-in (`accounts.google.com/v3/signin/identifier…`).
  After signing in Google sends the visitor back to `aistudio.google.com/api-keys`.
- Sign-in, laptop: a 840 × 402 card with 28 px corners; « Connexion / Utilisez votre compte Google », « Adresse e-mail
  ou téléphone », « Adresse e-mail oubliée ? », the guest-mode line, « Créer un compte », the blue « Suivant » pill.
  Phone: the same, one column, no card.
- AI Studio's API keys page (French exists for the page itself): sidebar, « Clés API », « Guide de démarrage rapide
  des API », « Créer une clé API », « Grouper par », « Filtrer par ». The list (laptop): Key / Project / Created /
  Billing Tier; the key shows as a blue « …jZQQ » with its name under it, the project in blue with its id under it,
  « Set up billing / Free tier », then copy, cost, usage, data and more icons. Phone: one card per key.
- The owner's screenshots: « Create a new key » (Name your key, Choose an imported project, Cancel, Create key), the
  same dialog with a spinner while the key is made, then « API key details »: a note about auth keys, API Key with a
  copy icon, Name, Project name (`projects/…`), Project number, and Delete key / Copy cURL quickstart / Copy key.
- Since 28 May 2026 new keys start with `AQ.`.

## Drawn without being seen (French words guessed; to correct from a screenshot)

- French words of the list's columns, the « Create a new key » dialog and « API key details ».
- The password step (the sample account never types a real address): Google's usual « Bienvenue ».
- A brand-new account's first visit may show Google's terms first; the video leaves it out.

## The pace (the owner's round of 2026-10-19, second)

Nothing happens by itself: the pointer glides to the control (900 ms, slower when it only wanders), clicks, and the
change follows 250 ms later, so the click is seen before its effect. Each new page gets a pause of one to two seconds,
with the pointer at rest or wandering (to « Clés API » in the sidebar on the laptop, to « Tous les projets » on the
phone). The laptop clicks the address bar's suggestion rather than pressing Enter, and pastes through the right-click
menu (« Coller ») rather than a shortcut. About 50 s on a laptop, 52 s on a phone.

## The scenario (laptop; the phone does the same with its own gestures)

1. The settings page, as the viewer sees it; the view pulls back to show the browser around it.
2. A new tab (+). The view zooms on the address bar; `aistudio.google.com/api-keys` is typed; Enter.
3. Google's sign-in. `marie.exemple@gmail.com`, Suivant; the password, Suivant.
4. Back on AI Studio's API keys page. « Créer une clé API »; the dialog; « Créer une clé »; the spinner; the key's
   details; « Copier la clé ».
5. Back to the first tab: the key pasted into the field, « Vérifier », « Clé active ».

On a phone: the tabs button and its « + » instead of the tab strip, the keyboard while typing, « Coller » over the
field instead of a keyboard shortcut.
