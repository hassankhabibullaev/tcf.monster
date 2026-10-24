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
console.log(`copy-media: ${n} files in dist/media${missing ? `, ${missing} skipped` : ""}; ${renamed} names in ${files} bank files${unknown ? `, ${unknown} with no file` : ""}; answer keys removed`);
