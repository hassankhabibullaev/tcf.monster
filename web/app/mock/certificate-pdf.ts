// The certificate as a PDF made in the browser (docs/MOCK-EXAM.md §1.13): the design system's two typefaces embedded
// (public/fonts, the static instances Google serves), the logo, one table, the line about having no official value in
// full type. jsPDF and the fonts load only when a certificate is asked for. Nothing goes to the server.
import type { Lang } from "../i18n.ts";
import type { Mock, TestStage } from "./api.ts";

const INK: [number, number, number] = [0x23, 0x20, 0x1c];
const MUTED: [number, number, number] = [0x6e, 0x66, 0x5c];
const ACCENT: [number, number, number] = [0xff, 0x6b, 0x4a];
const LINE: [number, number, number] = [0xea, 0xdf, 0xcb];
const SUN_SOFT: [number, number, number] = [0xff, 0xf3, 0xc4];

const FONTS = [
  ["Fraunces", "bold", "/fonts/Fraunces-Bold.ttf"],
  ["Fraunces", "normal", "/fonts/Fraunces-Regular.ttf"],
  ["Nunito", "bold", "/fonts/Nunito-Bold.ttf"],
  ["Nunito", "normal", "/fonts/Nunito-Regular.ttf"],
] as const;

const toB64 = (buf: ArrayBuffer) => { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

export type CertificateWords = {
  title: string; no: (n: number) => string; name: string; date: string; test: string; score: string; level: string; overall: string; lowest: string; line: string;
  tests: Record<TestStage, string>; site: string;
};

export type CertificateInput = { mock: Mock; number: number | null; name: string; date: string; levelOf: (t: TestStage) => string; words: CertificateWords; lang: Lang };

/** the PDF as a blob URL, ready to open */
export async function buildCertificate(input: CertificateInput): Promise<string> {
  return (await buildCertificateDoc(input)).output("bloburl").toString();
}

/** the document itself (the tests write it to a file) */
export async function buildCertificateDoc(input: CertificateInput) {
  const { jsPDF } = await import("jspdf");
  const [fonts, logo] = await Promise.all([
    Promise.all(FONTS.map(async ([, , url]) => toB64(await (await fetch(url)).arrayBuffer()))),
    fetch("/assets/app-icon-96@2x.png").then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? `data:image/png;base64,${toB64(b)}` : null)).catch(() => null),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  FONTS.forEach(([family, style, url], i) => { const file = url.split("/").pop()!; doc.addFileToVFS(file, fonts[i]); doc.addFont(file, family, style); });
  const { mock, number, name, date, levelOf, words: w } = input;
  const r = mock.result!;
  const W = doc.internal.pageSize.getWidth();
  const M = 56;
  let y = 64;

  // the logo and the wordmark, the mock's number at the right
  if (logo) doc.addImage(logo, "PNG", M, y - 20, 28, 28);
  doc.setFont("Fraunces", "bold").setFontSize(20).setTextColor(...INK);
  doc.text("tcf", M + 38, y);
  const tw = doc.getTextWidth("tcf");
  doc.setTextColor(...ACCENT).text(".", M + 38 + tw, y);
  const dw = doc.getTextWidth(".");
  doc.setTextColor(...INK).text("monster", M + 38 + tw + dw, y);
  if (number != null) { doc.setFont("Nunito", "bold").setFontSize(10).setTextColor(...MUTED); doc.text(w.no(number), W - M, y, { align: "right" }); }
  y += 52;

  doc.setFont("Fraunces", "bold").setFontSize(30).setTextColor(...INK);
  doc.text(w.title, M, y);
  y += 40;

  // who and when
  const col = (W - 2 * M) / 2;
  doc.setFont("Nunito", "bold").setFontSize(9).setTextColor(...MUTED);
  doc.text(w.name.toUpperCase(), M, y, { charSpace: 0.8 });
  doc.text(w.date.toUpperCase(), M + col, y, { charSpace: 0.8 });
  y += 18;
  doc.setFontSize(15).setTextColor(...INK);
  doc.text(name, M, y);
  doc.text(date, M + col, y);
  y += 34;

  // the line about having no official value, in a box, in full type
  doc.setFont("Nunito", "bold").setFontSize(11.5).setTextColor(...INK);
  const lines = doc.splitTextToSize(w.line, W - 2 * M - 32) as string[];
  const boxH = lines.length * 16 + 22;
  doc.setDrawColor(...INK).setLineWidth(1.5).roundedRect(M, y, W - 2 * M, boxH, 8, 8, "S");
  doc.text(lines, M + 16, y + 24);
  y += boxH + 32;

  // the table
  const cols = [M, M + 240, M + 340, M + 420];
  doc.setFont("Nunito", "bold").setFontSize(9).setTextColor(...MUTED);
  [w.test, w.score, "NCLC", w.level].forEach((h, i) => doc.text(h.toUpperCase(), cols[i], y, { charSpace: 0.8 }));
  y += 10;
  doc.setDrawColor(...LINE).setLineWidth(1).line(M, y, W - M, y);
  for (const t of ["co", "ce", "ee", "eo"] as TestStage[]) {
    const c = r[t];
    const score = !c ? "—" : t === "co" || t === "ce" ? `${(c as { score: number }).score} / 699` : `${Math.round((c as { score20: number | null }).score20 ?? 0)} / 20`;
    const nclc = c ? String(Math.max(3, c.nclc ?? 3)) : "—";
    y += 26;
    doc.setFont("Nunito", "bold").setFontSize(13).setTextColor(...INK);
    doc.text(w.tests[t], cols[0], y);
    doc.setFont("Fraunces", "bold").setFontSize(14);
    doc.text(score, cols[1], y);
    doc.text(nclc, cols[2], y);
    doc.text(c ? levelOf(t) : "—", cols[3], y);
    y += 10;
    doc.setDrawColor(...LINE).line(M, y, W - M, y);
  }
  // the overall level on a soft band
  y += 14;
  doc.setFillColor(...SUN_SOFT).roundedRect(M, y, W - 2 * M, 54, 8, 8, "F");
  doc.setFont("Nunito", "bold").setFontSize(10).setTextColor(...MUTED);
  doc.text(w.overall.toUpperCase(), M + 16, y + 20, { charSpace: 0.8 });
  doc.setFont("Fraunces", "bold").setFontSize(24).setTextColor(...INK);
  doc.text(r.overall != null ? `NCLC ${r.overall}` : "—", M + 16, y + 44);
  doc.setFont("Nunito", "normal").setFontSize(11).setTextColor(...MUTED);
  doc.text(w.lowest, W - M - 16, y + 44, { align: "right" });

  // the foot
  const H = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...ACCENT).setLineWidth(2).line(M, H - 64, M + 48, H - 64);
  doc.setFont("Nunito", "bold").setFontSize(10).setTextColor(...MUTED);
  doc.text(w.site, M, H - 44);
  doc.text(date, W - M, H - 44, { align: "right" });
  return doc;
}
