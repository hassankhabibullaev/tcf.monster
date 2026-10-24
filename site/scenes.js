/* The scenes: the application itself, redrawn from its current design and played as short scenarios. A scene is a
   list of moments: an element with data-at="ms" is on from that moment (data-until="ms" turns it off again); text
   with data-type is typed out over data-dur; a word count (data-wc) follows the text it names; a clock (data-clock)
   counts down while the scene plays; the cursor (data-path="ms:x,y;…") glides between points. Scenes play only while
   they are on screen; the hero's four play in turn under their tabs. Reduced motion: each scene's last moment, still. */
(function () {
  var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var STAGE = { hero: [820, 500], solo: [640, 440] };
  var words = function (s) { return s.trim() ? s.trim().split(/\s+/).length : 0; };
  var two = function (n) { return String(n).padStart(2, "0"); };
  var lang = function () { return document.documentElement.lang === "en" ? "en" : "fr"; };

  /* the time of day in the room bars: 24 hours, the colon beating */
  function paintTimes() {
    var d = new Date();
    document.querySelectorAll("[data-lt]").forEach(function (el) { el.innerHTML = two(d.getHours()) + "<i>:</i>" + two(d.getMinutes()); });
  }
  paintTimes();
  setInterval(paintTimes, 10000);

  function Scene(el) {
    this.el = el;
    this.len = Number(el.dataset.len) || 9000;
    this.items = Array.prototype.slice.call(el.querySelectorAll("[data-at]"));
    this.typed = Array.prototype.slice.call(el.querySelectorAll("[data-type]"));
    this.counts = Array.prototype.slice.call(el.querySelectorAll("[data-wc]"));
    this.clocks = Array.prototype.slice.call(el.querySelectorAll("[data-clock]"));
    this.cursor = el.querySelector("[data-path]");
    this.path = this.cursor ? this.cursor.dataset.path.split(";").map(function (p) { var a = p.split(":"); var xy = a[1].split(","); return { t: Number(a[0]), x: Number(xy[0]), y: Number(xy[1]) }; }) : [];
    this.t = 0;
  }
  Scene.prototype.paint = function (t) {
    this.t = t;
    this.items.forEach(function (it) {
      var on = t >= Number(it.dataset.at) && (!it.dataset.until || t < Number(it.dataset.until));
      it.classList.toggle("on", on);
    });
    this.typed.forEach(function (it) {
      var at = Number(it.dataset.at) || 0, dur = Number(it.dataset.dur) || 3000, full = it.dataset.type;
      var n = Math.max(0, Math.min(full.length, Math.round(((t - at) / dur) * full.length)));
      it.textContent = full.slice(0, n);
      it.classList.toggle("typing", n > 0 && n < full.length);
    });
    var self = this;
    this.counts.forEach(function (it) {
      var src = self.el.querySelector("#" + it.dataset.wc);
      var n = src ? words(src.textContent) : 0, min = Number(it.dataset.min), max = Number(it.dataset.max);
      it.textContent = n + (lang() === "en" ? (n === 1 ? " word" : " words") : (n > 1 ? " mots" : " mot")) + " (" + min + "–" + max + ")";
      it.dataset.state = n < min ? "under" : n > max ? "over" : "ok";
    });
    this.clocks.forEach(function (it) {
      var p = it.dataset.clock.split(":"), s = Math.max(0, Number(p[0]) * 60 + Number(p[1]) - Math.floor(t / 1000));
      it.textContent = two(Math.floor(s / 60)) + ":" + two(s % 60);
    });
    if (this.cursor && this.path.length) {
      var a = this.path[0], b = this.path[0];
      for (var i = 0; i < this.path.length; i++) { if (this.path[i].t <= t) { a = this.path[i]; b = this.path[i + 1] || a; } }
      var k = b === a ? 0 : Math.min(1, (t - a.t) / Math.max(1, b.t - a.t));
      // glide, then rest: the move takes the first 700 ms of each span
      var span = Math.max(1, b.t - a.t), m = Math.min(1, (k * span) / Math.min(700, span));
      var e = m < .5 ? 2 * m * m : 1 - Math.pow(-2 * m + 2, 2) / 2;
      this.cursor.style.transform = "translate(" + (a.x + (b.x - a.x) * e) + "px," + (a.y + (b.y - a.y) * e) + "px)";
    }
  };

  /* a stage is drawn at a fixed size and scaled to its frame (the CSSOM, never a style attribute in the markup) */
  function fit(frame, w, h) {
    var k = Math.min(1, frame.clientWidth / w);
    frame.style.setProperty("--k", String(k));
    frame.style.height = Math.round(h * k) + "px";
  }

  /* the hero: four scenes under four tabs, one after the other, each tab's line filling while its scene plays */
  var player = document.querySelector("[data-player]");
  if (player) {
    var screen = player.querySelector(".player-screen");
    var scenes = Array.prototype.slice.call(player.querySelectorAll(".scene")).map(function (el) { return new Scene(el); });
    var tabs = Array.prototype.slice.call(player.querySelectorAll("[data-tab]"));
    var cur = 0, start = performance.now(), paused = false, pausedAt = 0, visible = true;
    function show(i) {
      cur = i; start = performance.now();
      scenes.forEach(function (s, j) { s.el.classList.toggle("now", j === i); if (j !== i) s.paint(0); });
      tabs.forEach(function (b, j) { b.setAttribute("aria-selected", String(j === i)); });
    }
    tabs.forEach(function (b, j) { b.addEventListener("click", function () { show(j); }); });
    screen.addEventListener("pointerenter", function () { paused = true; pausedAt = performance.now(); });
    screen.addEventListener("pointerleave", function () { if (paused) { start += performance.now() - pausedAt; paused = false; } });
    var resize = function () { fit(screen, STAGE.hero[0], STAGE.hero[1]); };
    window.addEventListener("resize", resize); resize();
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(player);
    show(0);
    if (still) { scenes.forEach(function (s) { s.paint(s.len); }); }
    else (function tick() {
      requestAnimationFrame(tick);
      if (!visible || paused) return;
      var s = scenes[cur], t = performance.now() - start;
      if (t >= s.len) { show((cur + 1) % scenes.length); return; }
      s.paint(t);
      tabs[cur].style.setProperty("--p", String(t / s.len));
    })();
  }

  /* the other scenes: each in its own frame, played in a loop while on screen */
  document.querySelectorAll("[data-scene-frame]").forEach(function (frame) {
    var s = new Scene(frame.querySelector(".scene"));
    var resize = function () { fit(frame, STAGE.solo[0], STAGE.solo[1]); };
    window.addEventListener("resize", resize); resize();
    if (still) { s.paint(s.len); return; }
    var visible = false, start = performance.now();
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { var v = es[0].isIntersecting; if (v && !visible) start = performance.now(); visible = v; }, { threshold: .35 }).observe(frame);
    else visible = true;
    (function tick() {
      requestAnimationFrame(tick);
      if (!visible) return;
      var t = (performance.now() - start) % (s.len + 1200);
      s.paint(Math.min(t, s.len));
    })();
  });
})();
