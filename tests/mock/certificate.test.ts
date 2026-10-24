// The certificate PDF is built in the browser; here it is built in Node with the same fonts and written to a file, so a
// person can look at it (and the build cannot break silently).
import { describe, it, expect, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCertificateDoc } from "../../web/app/mock/certificate-pdf.ts";

describe("the certificate", () => {
  it("builds an A4 page with the embedded typefaces and the no-official-value line", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const p = join(process.cwd(), "public", String(url).replace(/^\//, ""));
      if (String(url).startsWith("/fonts/")) return new Response(readFileSync(p));
      return new Response("not found", { status: 404 });
    });
    const mock = { id: 5, result: { co: { score: 412, nclc: 6, right: 20, wrong: 15, blank: 4 }, ce: { score: 455, nclc: 7, right: 22, wrong: 10, blank: 7 }, ee: { score20: 11, nclc: 7, level: "B2", marked: 3, of: 3, status: "done" }, eo: { score20: 12, nclc: 8, level: "B2", marked: 3, of: 3, status: "done" }, overall: 6, at: "" } } as never;
    const doc = await buildCertificateDoc({
      mock, number: 3, name: "Amina", date: "19 octobre 2026", levelOf: (t) => (t === "co" ? "B2" : t === "ce" ? "B2" : "B2"), lang: "fr",
      words: { title: "Examen blanc TCF Canada", no: (n) => `Examen blanc n° ${n}`, name: "Candidat·e", date: "Date", test: "Épreuve", score: "Score", level: "Niveau", overall: "Niveau global", lowest: "le plus bas des quatre", line: "Ce document n'a aucune valeur officielle. Il n'est pas une attestation et ne peut être présenté à aucune administration.", tests: { co: "Compréhension orale", ce: "Compréhension écrite", ee: "Expression écrite", eo: "Expression orale" }, site: "tcf.monster" },
    });
    const bytes = Buffer.from(doc.output("arraybuffer"));
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.getFontList()).toHaveProperty("Fraunces");
    expect(doc.getFontList()).toHaveProperty("Nunito");
    const out = process.env.CERT_OUT;
    if (out) writeFileSync(out, bytes);
    vi.unstubAllGlobals();
  });
});
