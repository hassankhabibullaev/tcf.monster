// scripts/copy-media.mjs on a pretend data folder and build: the recordings go into dist/media under names made with
// the secret, the bank files name them, the export's names exist nowhere, the answer keys leave dist, the same secret
// gives the same names at the next build, and no manifest stops the build.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

let home = "", dist = "";
const run = () => spawnSync(process.execPath, ["scripts/copy-media.mjs"], { env: { ...process.env, TCFM_DATA_HOME: home, TCFM_DIST: dist }, encoding: "utf8" });
const bankFiles = () => {
  mkdirSync(join(dist, "data"), { recursive: true });
  writeFileSync(join(dist, "data", "co-A1.json"), JSON.stringify([{ id: "q1", audio: "/media/co/old1.mp3", image: "/media/co/pic.webp" }]));
  writeFileSync(join(dist, "data", "exam-ce-03.json"), JSON.stringify([{ id: "q2", passageImage: "/media/ce/page.webp" }]));
  for (const s of ["co", "ce"]) writeFileSync(join(dist, "data", `key-${s}.json`), JSON.stringify([{ id: "q1", level: "A1", answer: "B" }]));
  writeFileSync(join(dist, "data", "bank.json"), "{}");
};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tcfm-home-"));
  dist = mkdtempSync(join(tmpdir(), "tcfm-dist-"));
  const src = join(home, "src");
  mkdirSync(src);
  const manifest: Record<string, string> = {};
  for (const k of ["media/co/old1.mp3", "media/co/pic.webp", "media/ce/page.webp"]) {
    const f = join(src, k.replaceAll("/", "_"));
    writeFileSync(f, `bytes of ${k}`);
    manifest[k] = f;
  }
  writeFileSync(join(home, "media-manifest.json"), JSON.stringify(manifest));
  bankFiles();
});
afterEach(() => { rmSync(home, { recursive: true, force: true }); rmSync(dist, { recursive: true, force: true }); });

describe("copy-media", () => {
  it("hides the recordings under new names, the bank files name them, the keys leave dist", () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    const level = readFileSync(join(dist, "data", "co-A1.json"), "utf8");
    const exam = readFileSync(join(dist, "data", "exam-ce-03.json"), "utf8");
    expect(level).not.toContain("old1");
    expect(level).not.toContain("/media/co/pic.webp");
    expect(exam).not.toContain("page.webp");
    const named = [...`${level}${exam}`.matchAll(/"(\/media\/(co|ce)\/[0-9a-f]{32}\.(mp3|webp))"/g)].map((m) => m[1]);
    expect(named).toHaveLength(3);
    for (const n of named) expect(readFileSync(join(dist, n), "utf8")).toMatch(/^bytes of media\//);
    expect(existsSync(join(dist, "media", "co", "old1.mp3"))).toBe(false);
    expect(readdirSync(join(dist, "data")).filter((f) => f.startsWith("key-"))).toEqual([]);
    // the secret stays on this Mac and out of everything written or printed
    const secret = readFileSync(join(home, "media-secret.txt"), "utf8").trim();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(r.stdout + r.stderr + level + exam).not.toContain(secret);
  });

  it("the same secret gives the same names at the next build (a page opened before a deploy keeps its recordings)", () => {
    run();
    const first = readFileSync(join(dist, "data", "co-A1.json"), "utf8");
    rmSync(dist, { recursive: true, force: true });
    mkdirSync(dist);
    bankFiles();
    run();
    expect(readFileSync(join(dist, "data", "co-A1.json"), "utf8")).toBe(first);
  });

  it("no manifest stops the build", () => {
    rmSync(join(home, "media-manifest.json"));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no ");
  });
});
