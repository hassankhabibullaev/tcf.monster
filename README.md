# tcf.monster

**Free practice for the TCF Canada.** The four tests, in practice mode and as full mock exams. Run by volunteers:
no ads, no paid plan.

**[tcf.monster](https://tcf.monster)** · [Privacy](https://tcf.monster/privacy) · [Terms](https://tcf.monster/terms)

The code is public so anyone can check what the app does with their data.

## What's inside

| Test | What you get |
|---|---|
| Compréhension orale | Questions with their audio and transcript, by level; timed mock exams |
| Compréhension écrite | Questions with their passage, by level; timed mock exams |
| Expression écrite | The three tasks, marked with a score out of 20 and the NCLC level |
| Expression orale | The three tasks with a live examiner, marked the same way |

## Your data

| What | Where it stays |
|---|---|
| Your Gemini key | On your device only |
| Your texts, recordings, transcripts, corrections | In your browser only |
| Your marks, subjects, dates | The server, to show your progress |
| Your password | The server keeps only a keyed hash of it, stretched by your browser first |

No ads, no trackers, nothing sold.

## How it is built

- **Cloudflare Worker** (`worker/`, TypeScript): the site, the app and the API, on the free plan.
- **D1** (SQLite) for accounts, progress and marks — every table in `migrations/`. **R2** for audio, images and
  backups.
- **React + Vite** for the app (`web/`); plain HTML, CSS and JS for the public site (`site/`).
- **Marking** runs in your browser with your own free Gemini key, calling Google directly.

## Run it locally

```bash
npm install
npm test
npm run dev
```

The question bank is not in this repository, so the comprehension rooms are empty locally.

## Security

Found a problem? See [SECURITY.md](SECURITY.md).

---

© tcf.monster · tcf.monster is not affiliated with France Éducation international. TCF is a trademark of France Éducation
international.
