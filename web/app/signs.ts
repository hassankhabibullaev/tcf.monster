// What this browser tells about itself, for the abuse guard (worker/guard.ts): a few letters that ride along with the
// page's own requests (web/app/guard-fetch.ts, header x-signs), only when there is something to say — never a request of
// their own. Each is weak alone; the server adds them up.
//   w  the browser says a program drives it (navigator.webdriver)
//   h  a headless browser names itself in its user agent
//   u  pointer or key presses no hand made (isTrusted false); the app makes none of these itself (its own .click()
//      and typed accents send only click and input events, which are not counted)
//   n  many changes sent and no mouse, touch, key, wheel or click at all since the page opened
const UNTRUSTED_AFTER = 3;
const NO_INPUT_AFTER = 30;

let untrusted = 0, trusted = 0, writes = 0, installed = false;

function watch() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const seen = (e: Event) => { if (e.isTrusted) trusted++; else if (e.type !== "click") untrusted++; };
  for (const type of ["pointerdown", "mousedown", "touchstart", "keydown", "wheel", "click"]) document.addEventListener(type, seen, { capture: true, passive: true });
}

/** a change the page sent to its server (counted for « n ») */
export function countWrite() { writes++; }

/** the letters to send now, "" when there is nothing to say */
export function clues(): string {
  watch();
  const out: string[] = [];
  try {
    if (navigator.webdriver === true) out.push("w");
    if (/Headless/i.test(navigator.userAgent)) out.push("h");
  } catch { /* no navigator */ }
  if (untrusted >= UNTRUSTED_AFTER) out.push("u");
  if (writes >= NO_INPUT_AFTER && trusted === 0) out.push("n");
  return out.join(",");
}

/** for the tests */
export const resetClues = () => { untrusted = 0; trusted = 0; writes = 0; };
