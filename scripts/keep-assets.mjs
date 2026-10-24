// After `vite build`: the app's files of earlier builds stay online. A deploy replaces every file Cloudflare serves, so a
// tab opened before it still runs the old app, and that app asks for its own files by their old names (the scoring code
// is loaded only when a text or an answer is marked): without them the marking failed with a 404 (seen 2026-10-22,
// mid-session). Every build copies its dist/assets into a history folder on this Mac and puts back the files of the
// builds of the last 14 days. Names carry their content's hash, so an old file never clashes with a new one.
import { readdirSync, existsSync, mkdirSync, copyFileSync, statSync, utimesSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist", "assets");
const HISTORY = join(homedir(), "Developer/tcf.monster-data/assets-history");
const KEEP_DAYS = 14;

if (!existsSync(DIST)) {
  console.log("keep-assets: no dist/assets");
} else {
  mkdirSync(HISTORY, { recursive: true });
  const now = Date.now();
  let saved = 0, restored = 0, dropped = 0;
  // this build's files join the history (their date: today, so they are kept 14 days from their last build)
  for (const f of readdirSync(DIST)) {
    const to = join(HISTORY, f);
    if (!existsSync(to)) { copyFileSync(join(DIST, f), to); saved++; }
    utimesSync(to, new Date(now), new Date(now));
  }
  for (const f of readdirSync(HISTORY)) {
    const p = join(HISTORY, f);
    if (now - statSync(p).mtimeMs > KEEP_DAYS * 86400000) { rmSync(p); dropped++; continue; }
    const to = join(DIST, f);
    if (!existsSync(to)) { copyFileSync(p, to); restored++; }
  }
  console.log(`keep-assets: ${saved} new, ${restored} earlier files kept online${dropped ? `, ${dropped} older than ${KEEP_DAYS} days dropped` : ""}`);
}
