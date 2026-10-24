// After `vite build`: the recordings and pictures of the question bank go into dist/media/ as plain files, so Cloudflare
// serves them itself (free and unlimited, cached at the edge) instead of the Worker reading R2 for each one (every
// Worker run counts toward the free plan's 100 000 a day; one exam plays about 40 recordings). The Worker's /media/*
// route stays as the fallback: a file missing here is still read from R2.
// Reads ~/Developer/tcf.monster-data/media-manifest.json (key "media/co/x.mp3" → local path). No manifest (a test
// machine): nothing is copied and R2 serves everything, as before. Files are cloned (APFS: instant, no extra disk).
import { readFileSync, existsSync, mkdirSync, copyFileSync, constants } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(homedir(), "Developer/tcf.monster-data/media-manifest.json");
const SAFE = /^media\/(co|ce)\/[A-Za-z0-9._-]+$/;

if (!existsSync(MANIFEST)) {
  console.log("copy-media: no manifest, the recordings stay on R2 only");
} else {
  const list = Object.entries(JSON.parse(readFileSync(MANIFEST, "utf8")));
  let n = 0, missing = 0;
  for (const [key, path] of list) {
    if (!SAFE.test(key) || key.includes("..")) { missing++; continue; }
    if (!existsSync(path)) { missing++; continue; }
    const to = join(ROOT, "dist", key);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(path, to, constants.COPYFILE_FICLONE);
    n++;
  }
  console.log(`copy-media: ${n} files in dist/media${missing ? `, ${missing} skipped` : ""}`);
}
