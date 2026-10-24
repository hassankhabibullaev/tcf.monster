// Our own scrollbars (the owner's rule, 2026-10-19): the browser never draws one — not in Safari, Chrome or Firefox,
// not on the page, not in a panel — so no page ever shifts sideways when a scrollbar comes or goes. The native ones are
// hidden by /scrollbars.css; this script draws a slim thumb over whatever is scrolling (the page or any panel): it
// shows while the content moves and when the pointer comes near the right edge of a scrollable area, fades after a
// moment, and can be dragged. One file for the app, the admin and the public site; plain JS, no build step.
// One rule for where it sits (the design tokens --sb-size and --sb-gutter): the thumb is drawn inside the gutter an
// area keeps on its scrolling edge, never over its items. A strip that scrolls sideways without that gutter gets no
// thumb at all (a swipe still moves it); an area that scrolls down without one keeps the thumb tight on its edge.
(() => {
  if (window.__tcfmScrollbars) return;
  window.__tcfmScrollbars = true;
  const HIDE_MS = 900;
  const MIN = 28;      // the shortest thumb
  const INSET = 3;     // from the area's edges
  const CLEAR = 3;     // the least room between the thumb and the area's items
  const NEAR = 18;     // how close to the right edge the pointer must come to show the thumb
  const make = (axis) => { const t = document.createElement("div"); t.className = `sb-thumb sb-${axis}`; t.setAttribute("aria-hidden", "true"); return t; };
  const thumbs = { y: make("y"), x: make("x") };
  let el = null, timer = 0, raf = 0, near = false, drag = null;

  const root = () => document.scrollingElement || document.documentElement;
  const isRoot = (e) => e === root() || e === document.body || e === document.documentElement || e === document;
  const scrollerOf = (e) => (isRoot(e) ? root() : e);
  const canScroll = (e, axis) => {
    if (!(e instanceof Element)) return false;
    // an area that shows its own place (the rooms' column of question discs) asks for no thumb: data-no-thumb
    if (e.hasAttribute("data-no-thumb")) return false;
    if (isRoot(e)) {
      if (axis === "y") return root().scrollHeight > window.innerHeight + 1;
      // a page whose sideways overflow is clipped (the phone frame) never scrolls that way: no thumb for it
      if (/hidden|clip/.test(getComputedStyle(document.documentElement).overflowX) || /hidden|clip/.test(getComputedStyle(document.body).overflowX)) return false;
      return root().scrollWidth > window.innerWidth + 1;
    }
    const o = getComputedStyle(e)[axis === "y" ? "overflowY" : "overflowX"];
    if (!/(auto|scroll|overlay)/.test(o) && e.tagName !== "TEXTAREA") return false;
    return axis === "y" ? e.scrollHeight > e.clientHeight + 1 : e.scrollWidth > e.clientWidth + 1;
  };
  function geo(e) {
    if (isRoot(e)) { const r = root(); return { top: 0, left: 0, w: window.innerWidth, h: window.innerHeight, sh: r.scrollHeight, sw: r.scrollWidth, st: r.scrollTop, sl: r.scrollLeft, root: true }; }
    const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return { top: b.top + e.clientTop, left: b.left + e.clientLeft, w: e.clientWidth, h: e.clientHeight, sh: e.scrollHeight, sw: e.scrollWidth, st: e.scrollTop, sl: e.scrollLeft,
      gr: parseFloat(cs.paddingRight) || 0, gb: parseFloat(cs.paddingBottom) || 0 };
  }
  /** a modal dialog lives in the top layer: the thumbs follow it there, or they would be drawn under it */
  function host() {
    const d = el && el instanceof Element ? el.closest("dialog[open]") : null;
    const h = d || document.body;
    for (const t of Object.values(thumbs)) if (t.parentNode !== h) h.appendChild(t);
  }
  function place() {
    raf = 0;
    if (!el || !el.isConnected) { hide(true); return; }
    const g = geo(el);
    const ty = thumbs.y, tx = thumbs.x;
    if (g.sh > g.h + 1) {
      const track = g.h - 2 * INSET, len = Math.max(MIN, (track * g.h) / g.sh);
      const pos = g.top + INSET + (g.st / (g.sh - g.h)) * (track - len);
      const size = ty.offsetWidth;
      // in the right gutter, centred, when the area keeps one; tight on the edge otherwise
      const room = g.root ? 2 * INSET + size : g.gr;
      const right = room >= size + 2 * CLEAR ? Math.min(INSET, (room - size) / 2) : 1;
      ty.style.height = `${len}px`;
      ty.style.transform = `translate(${g.left + g.w - right - size}px, ${pos}px)`;
      ty.dataset.on = "";
    } else delete ty.dataset.on;
    const xRoom = g.root ? 2 * INSET + tx.offsetHeight : g.gb;
    if (g.sw > g.w + 1 && xRoom >= tx.offsetHeight + 2 * CLEAR) {
      const track = g.w - 2 * INSET, len = Math.max(MIN, (track * g.w) / g.sw);
      const pos = g.left + INSET + (g.sl / (g.sw - g.w)) * (track - len);
      tx.style.width = `${len}px`;
      const bottom = Math.min(INSET, (xRoom - tx.offsetHeight) / 2);
      tx.style.transform = `translate(${pos}px, ${g.top + g.h - bottom - tx.offsetHeight}px)`;
      tx.dataset.on = "";
    } else delete tx.dataset.on;
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(place); };
  function show(target) {
    if (target && target !== el) { el = target; host(); }
    for (const t of Object.values(thumbs)) t.dataset.show = "";
    schedule();
    clearTimeout(timer);
    timer = setTimeout(() => hide(), HIDE_MS);
  }
  function hide(force) {
    if (!force && (near || drag)) { clearTimeout(timer); timer = setTimeout(() => hide(), HIDE_MS); return; }
    for (const t of Object.values(thumbs)) delete t.dataset.show;
  }

  document.addEventListener("scroll", (ev) => {
    const t = scrollerOf(ev.target);
    if (canScroll(t, "y") || canScroll(t, "x")) show(t);
  }, { capture: true, passive: true });

  // the pointer near the right edge of a scrollable area: its thumb shows, ready to be dragged
  let pending = 0;
  document.addEventListener("pointermove", (ev) => {
    if (ev.pointerType === "touch" || drag || pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      let e = document.elementFromPoint(ev.clientX, ev.clientY);
      if (e && e.classList && e.classList.contains("sb-thumb")) { near = true; return; }
      while (e && !canScroll(e, "y")) e = e.parentElement;
      const target = e || (canScroll(root(), "y") ? root() : null);
      if (!target) { near = false; return; }
      const g = geo(target);
      const wasNear = near;
      near = ev.clientX >= g.left + g.w - NEAR && ev.clientX <= g.left + g.w && ev.clientY >= g.top && ev.clientY <= g.top + g.h;
      if (near) show(target);
      else if (wasNear) { clearTimeout(timer); timer = setTimeout(() => hide(), HIDE_MS); }
    });
  }, { passive: true });

  // dragging a thumb scrolls its area
  for (const [axis, t] of Object.entries(thumbs)) {
    t.addEventListener("pointerdown", (ev) => {
      if (!el) return;
      ev.preventDefault();
      t.setPointerCapture(ev.pointerId);
      const g = geo(el);
      const s = scrollerOf(el);
      drag = axis === "y"
        ? { axis, from: ev.clientY, start: s.scrollTop, ratio: (g.sh - g.h) / Math.max(1, g.h - 2 * INSET - t.offsetHeight) }
        : { axis, from: ev.clientX, start: s.scrollLeft, ratio: (g.sw - g.w) / Math.max(1, g.w - 2 * INSET - t.offsetWidth) };
      t.dataset.drag = "";
    });
    t.addEventListener("pointermove", (ev) => {
      if (!drag || drag.axis !== axis || !el) return;
      const s = scrollerOf(el);
      if (axis === "y") s.scrollTop = drag.start + (ev.clientY - drag.from) * drag.ratio;
      else s.scrollLeft = drag.start + (ev.clientX - drag.from) * drag.ratio;
    });
    const end = () => { drag = null; delete t.dataset.drag; show(); };
    t.addEventListener("pointerup", end);
    t.addEventListener("pointercancel", end);
  }
  window.addEventListener("resize", schedule, { passive: true });
})();
