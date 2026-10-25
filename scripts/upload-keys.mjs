// Before a deploy: the answer keys (public/data/key-co|ce.json, written by the export) go to R2 under private/, where
// only the Worker reads them (the mock exam's paper builder); the build removes them from the site's files. The list of
// the bank's canaries (~/Developer/tcf.monster-data/canary.json, written by scripts/copy-media.mjs at the build) goes
// with them: the guard's traps (worker/guard.ts). Both are
// uploaded at every deploy (two small files): a note on this Mac saying « unchanged » could not tell that the bucket
// lost them, or that another machine deployed. The hashes are still written, for the record.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DONE = join(homedir(), "Developer/tcf.monster-data/keys-uploaded.json");
const done = existsSync(DONE) ? JSON.parse(readFileSync(DONE, "utf8")) : {};

for (const section of ["co", "ce"]) {
  const file = join(ROOT, "public", "data", `key-${section}.json`);
  if (!existsSync(file)) { console.error(`upload-keys: no ${file}`); process.exit(1); }
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
  execFileSync("npx", ["wrangler", "r2", "object", "put", `tcf-monster-files/private/key-${section}.json`, "--file", file,
    "--content-type", "application/json", "--remote", "-c", "wrangler.app.jsonc"], { cwd: ROOT, stdio: "inherit" });
  done[section] = hash;
  writeFileSync(DONE, JSON.stringify(done, null, 2));
  console.log(`upload-keys: key-${section} uploaded`);
}

const CANARY = join(homedir(), "Developer/tcf.monster-data/canary.json");
if (!existsSync(CANARY)) { console.error(`upload-keys: no ${CANARY} (run the build first)`); process.exit(1); }
execFileSync("npx", ["wrangler", "r2", "object", "put", "tcf-monster-files/private/canary.json", "--file", CANARY,
  "--content-type", "application/json", "--remote", "-c", "wrangler.app.jsonc"], { cwd: ROOT, stdio: "inherit" });
console.log("upload-keys: canary list uploaded");
