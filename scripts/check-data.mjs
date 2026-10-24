// Before a build: the question bank (public/data/, written by the export, never committed) must be there. A clean
// checkout has an empty folder; a deploy from it served no questions (2026-10-24, about 90 minutes). Stops the build.
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const files = existsSync(DATA) ? readdirSync(DATA).filter((f) => f.endsWith(".json")) : [];
if (!files.includes("bank.json") || files.length < 20) {
  console.error(`check-data: public/data has ${files.length} files and ${files.includes("bank.json") ? "a" : "no"} bank.json; copy it from the main checkout before building`);
  process.exit(1);
}
console.log(`check-data: ${files.length} files`);
