// scripts/copy-media.mjs on a pretend data folder and build: the recordings go into dist/media under names made with
// the secret, the bank files name them, the export's names exist nowhere, the answer keys leave dist, the same secret
// gives the same names at the next build, and no manifest stops the build.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

let home = "", dist = "";
const run = (questionsFrom = "2999-01-01") => spawnSync(process.execPath, ["scripts/copy-media.mjs"], { env: { ...process.env, TCFM_DATA_HOME: home, TCFM_DIST: dist, TCFM_CANARY_QUESTIONS_FROM: questionsFrom }, encoding: "utf8" });
const bankFiles = () => {
  mkdirSync(join(dist, "data"), { recursive: true });
  writeFileSync(join(dist, "data", "co-A1.json"), JSON.stringify([{ id: "q1", section: "co", level: "A1", audio: "/media/co/old1.mp3", image: "/media/co/pic.webp" }]));
  writeFileSync(join(dist, "data", "exam-ce-03.json"), JSON.stringify([{ id: "q2", section: "ce", level: "A1", placement: "CE-03-01", position: 1, passageImage: "/media/ce/page.webp" }]));
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
    const canary = JSON.parse(readFileSync(join(home, "canary.json"), "utf8")) as { ids: string[]; media: string[] };
    const real = named.filter((n) => !canary.media.includes(n));
    expect(real).toHaveLength(3);
    for (const n of real) expect(readFileSync(join(dist, n), "utf8")).toMatch(/^bytes of media\//);
    // the canaries: names like the others, on a field no page reads, and no file behind them
    for (const n of named.filter((x) => canary.media.includes(x))) expect(existsSync(join(dist, n))).toBe(false);
    expect(JSON.parse(level)[0].audioSlow).toMatch(/^\/media\/co\/[0-9a-f]{32}\.mp3$/);
    expect(JSON.parse(exam)[0].passageImageHd).toMatch(/^\/media\/ce\/[0-9a-f]{32}\.webp$/);
    // before the date, no whole question is added (a tab still running an older app would show it)
    expect(canary.ids).toEqual([]);
    expect(JSON.parse(level)).toHaveLength(1);
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

  it("from the date: canary questions, under another level in a level file and at position 40 in an exam, listed", () => {
    expect(run("2000-01-01").status).toBe(0);
    const level = JSON.parse(readFileSync(join(dist, "data", "co-A1.json"), "utf8")) as Record<string, unknown>[];
    const exam = JSON.parse(readFileSync(join(dist, "data", "exam-ce-03.json"), "utf8")) as Record<string, unknown>[];
    const canary = JSON.parse(readFileSync(join(home, "canary.json"), "utf8")) as { ids: string[]; media: string[] };
    const extra = [...level.filter((q) => q.id !== "q1"), ...exam.filter((q) => q.id !== "q2")];
    expect(extra).toHaveLength(3);
    expect(canary.ids.sort()).toEqual(extra.map((q) => String(q.id)).sort());
    for (const q of level.filter((x) => x.id !== "q1")) { expect(q.level).not.toBe("A1"); expect(canary.media).toContain(q.audio); }
    const e = exam.find((q) => q.id !== "q2")!;
    expect([e.position, e.placement]).toEqual([40, "CE-03-40"]);
    expect(canary.media).toContain(e.passageImage);
    // the pages' own filter (web/app/coce/bank.ts) keeps only the real ones
    expect(level.filter((q) => q.section === "co" && q.level === "A1").map((q) => q.id)).toEqual(["q1"]);
    expect(exam.filter((q) => Number(q.position) >= 1 && Number(q.position) <= 39).map((q) => q.id)).toEqual(["q2"]);
  });

  it("no manifest stops the build", () => {
    rmSync(join(home, "media-manifest.json"));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no ");
  });
});
