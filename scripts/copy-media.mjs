// After `vite build`: the question bank's recordings and pictures become plain files nobody can find, and its answer
// keys leave the site's files.
// - Each recording or picture goes into dist/media/ under a new name: HMAC-SHA256 of its export name with a secret kept
//   on this Mac only (~/Developer/tcf.monster-data/media-secret.txt, made once). Cloudflare serves them itself (free,
//   no Worker run); the export's names (once public) are never files, so they answer 404. The same secret gives the
//   same names at every build, so a page opened before a deploy keeps its recordings.
// - The bank files in dist/data/ get the new names. They go to signed-in people only (worker/coce/guard.ts): the only
//   map from a question to its recording.
// - dist/data/key-co|ce.json (the answer keys) are removed: the Worker reads them from R2 (scripts/upload-keys.mjs).
// Reads ~/Developer/tcf.monster-data/media-manifest.json (key "media/co/x.mp3" → local path). Without it the build
// stops: a deploy would serve no recording. Files are cloned (APFS: instant, no extra disk).
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, rmSync, constants } from "node:fs";
import { join, dirname, extname } from "node:path";
import { homedir } from "node:os";
import { createHmac, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// both overridable for the tests (tests/content/copy-media.test.ts)
const DATA_HOME = process.env.TCFM_DATA_HOME ?? join(homedir(), "Developer/tcf.monster-data");
const DIST = process.env.TCFM_DIST ?? join(ROOT, "dist");
const MANIFEST = join(DATA_HOME, "media-manifest.json");
const SECRET = join(DATA_HOME, "media-secret.txt");
const DIST_DATA = join(DIST, "data");
const SAFE = /^media\/(co|ce)\/[A-Za-z0-9._-]+$/;

if (!existsSync(MANIFEST)) {
  console.error(`copy-media: no ${MANIFEST}; the build would ship no recording`);
  process.exit(1);
}
if (!existsSync(SECRET)) writeFileSync(SECRET, randomBytes(32).toString("hex"), { mode: 0o600 });
const secret = readFileSync(SECRET, "utf8").trim();
/** media/co/x.mp3 → media/co/<32 hex>.mp3 */
const hidden = (key) => `${key.slice(0, 9)}${createHmac("sha256", secret).update(key).digest("hex").slice(0, 32)}${extname(key).toLowerCase()}`;

const names = new Map();
let n = 0, missing = 0;
for (const [key, path] of Object.entries(JSON.parse(readFileSync(MANIFEST, "utf8")))) {
  if (!SAFE.test(key) || key.includes("..") || !existsSync(path)) { missing++; continue; }
  const to = join(DIST, hidden(key));
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(path, to, constants.COPYFILE_FICLONE);
  names.set(`/${key}`, `/${hidden(key)}`);
  n++;
}

// the bank files name the new files; a recording the manifest lacks keeps its old name (and answers 404)
let files = 0, renamed = 0, unknown = 0;
for (const f of existsSync(DIST_DATA) ? readdirSync(DIST_DATA) : []) {
  if (/^key-(co|ce)\.json$/.test(f)) { rmSync(join(DIST_DATA, f)); continue; }
  if (!/^((co|ce)-[A-C][12]|exam-(co|ce)-\d{2})\.json$/.test(f)) continue;
  const p = join(DIST_DATA, f);
  const text = readFileSync(p, "utf8").replace(/"(\/media\/(?:co|ce)\/[A-Za-z0-9._-]+)"/g, (m, k) => {
    const to = names.get(k);
    if (!to) { unknown++; return m; }
    renamed++;
    return `"${to}"`;
  });
  writeFileSync(p, text);
  files++;
}
// Canaries (worker/guard.ts): things in the bank files that no page ever shows, so only a program reading the files
// asks for them. Made with the same secret, so the same at every build and impossible to tell from the real ones:
// - on CANARY_MEDIA real questions a file, a recording or picture name that exists nowhere (a field no page reads);
// - from CANARY_QUESTIONS_FROM, whole questions too: in a level file under another level's name, in an exam file at
//   position 40. The pages drop them (web/app/coce/bank.ts). The date leaves time for every tab still running an app
//   from before that filter to be gone: such a tab would show them.
// Their list goes to ~/Developer/tcf.monster-data/canary.json; scripts/upload-keys.mjs puts it in R2 private/, where
// only the Worker reads it.
const CANARY_MEDIA = 2;
const CANARY_QUESTIONS_FROM = process.env.TCFM_CANARY_QUESTIONS_FROM ?? "2026-11-21";
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const mac = (s) => createHmac("sha256", secret).update(`canary:${s}`).digest("hex");
const uuidOf = (h) => `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${"89ab"[parseInt(h[16], 16) & 3]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
const fakeMedia = (section, seed, ext) => `/media/${section}/${mac(seed).slice(0, 32)}${ext}`;
const canary = { ids: [], media: [] };
const withQuestions = new Date().toISOString().slice(0, 10) >= CANARY_QUESTIONS_FROM;
for (const f of existsSync(DIST_DATA) ? readdirSync(DIST_DATA) : []) {
  const m = /^(?:(co|ce)-([A-C][12])|exam-(co|ce)-(\d{2}))\.json$/.exec(f);
  if (!m) continue;
  const p = join(DIST_DATA, f);
  const qs = JSON.parse(readFileSync(p, "utf8"));
  if (!Array.isArray(qs) || !qs.length) continue;
  const section = m[1] ?? m[3];
  for (let i = 0; i < CANARY_MEDIA; i++) {
    const q = qs[parseInt(mac(`${f}:media:${i}`).slice(0, 8), 16) % qs.length];
    const name = section === "co" ? fakeMedia("co", `${f}:media:${i}`, ".mp3") : fakeMedia("ce", `${f}:media:${i}`, ".webp");
    q[section === "co" ? "audioSlow" : "passageImageHd"] = name;
    canary.media.push(name);
  }
  if (withQuestions) {
    for (let i = 0; i < (m[1] ? 2 : 1); i++) {
      const h = mac(`${f}:question:${i}`);
      const c = structuredClone(qs[parseInt(h.slice(0, 8), 16) % qs.length]);
      c.id = uuidOf(h);
      if (m[1]) c.level = LEVELS[(LEVELS.indexOf(m[2]) + 1 + i) % LEVELS.length];
      else { c.position = 40 + i; c.placement = `${m[3].toUpperCase()}-${m[4]}-${40 + i}`; c.level = "C2"; }
      if (section === "co") c.audio = fakeMedia("co", `${f}:question:${i}`, ".mp3");
      else c.passageImage = fakeMedia("ce", `${f}:question:${i}`, ".webp");
      delete c.audioSlow; delete c.passageImageHd;
      canary.ids.push(c.id);
      canary.media.push(c.audio ?? c.passageImage);
      qs.splice(parseInt(h.slice(8, 16), 16) % (qs.length + 1), 0, c);
    }
  }
  writeFileSync(p, JSON.stringify(qs));
}
writeFileSync(join(DATA_HOME, "canary.json"), JSON.stringify(canary), { mode: 0o600 });

console.log(`copy-media: ${n} files in dist/media${missing ? `, ${missing} skipped` : ""}; ${renamed} names in ${files} bank files${unknown ? `, ${unknown} with no file` : ""}; answer keys removed; ${canary.media.length} canary names${withQuestions ? `, ${canary.ids.length} canary questions` : ""}`);
