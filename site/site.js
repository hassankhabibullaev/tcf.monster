/* The theme, the language, the donation. No tracking, no cookies. The language pill and the theme switch behave as
   the application's (web/app/Frame.tsx): one round button showing the language in use; a click opens the pill, a
   click on the other language slides the thumb there; it closes two seconds after the pointer leaves, on Escape, or
   at a tap elsewhere. */
(function () {
  var FR = {};
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
                set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  /* light unless this device chose dark (the same key as the app) */
  /* the button names what it does, as the app's: « Mode sombre » in the light, « Mode clair » in the dark */
  var THEME_WORDS = { fr: { dark: "Mode sombre", light: "Mode clair" }, en: { dark: "Dark mode", light: "Light mode" } };
  function paintTheme(th) {
    document.documentElement.dataset.theme = th; store.set("tcfm-theme", th);
    var w = THEME_WORDS[document.documentElement.lang === "en" ? "en" : "fr"];
    document.querySelectorAll("[data-theme-switch]").forEach(function (b) { var l = th === "dark" ? w.light : w.dark; b.setAttribute("aria-label", l); b.setAttribute("title", l); });
  }
  paintTheme(store.get("tcfm-theme") === "dark" ? "dark" : "light");
  document.querySelectorAll("[data-theme-switch]").forEach(function (b) { b.addEventListener("click", function () { paintTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); }); });

  var pill = document.querySelector(".lang");
  document.querySelectorAll("[data-i18n]").forEach(function (el) { FR[el.dataset.i18n] = el.textContent; });
  document.querySelectorAll("[data-i18n-html]").forEach(function (el) { FR[el.dataset.i18nHtml] = el.innerHTML; });
  document.querySelectorAll("[data-i18n-attr]").forEach(function (el) { var p = el.dataset.i18nAttr.split(":"); FR["@" + p[1]] = el.getAttribute(p[0]); });
  /* the HTML head is English (what crawlers and link previews see); the French titles live here */
  var descEl = document.querySelector('meta[name="description"]');
  var titleEN = document.title;
  var descEN = descEl ? descEl.content : "";
  var root = document.documentElement;
  var titleFR = root.dataset.titleFr || "tcf.monster — préparez le TCF Canada, gratuitement";
  var descFR = root.dataset.descFr || "Les quatre épreuves du TCF Canada, gratuitement : 80 examens chronométrés, un examen blanc complet, un entraînement de A1 à C2 avec une explication pour chaque réponse, et Monster AI pour l'écrit et l'oral.";

  function setLang(lang) {
    var dict = lang === "en" ? window.EN : null;
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) { var k = el.dataset.i18n; el.textContent = dict && dict[k] ? dict[k] : FR[k]; });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) { var k = el.dataset.i18nHtml; el.innerHTML = dict && dict[k] ? dict[k] : FR[k]; });
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) { var p = el.dataset.i18nAttr.split(":"); el.setAttribute(p[0], dict && dict[p[1]] ? dict[p[1]] : FR["@" + p[1]]); });
    if (descEl && pill) { document.title = lang === "en" ? titleEN : titleFR; descEl.content = lang === "en" ? descEN : descFR; }
    if (pill) {
      pill.dataset.lang = lang;
      pill.querySelectorAll("[data-set-lang]").forEach(function (b) {
        var now = b.dataset.setLang === lang;
        if (now) b.setAttribute("data-now", ""); else b.removeAttribute("data-now");
        b.setAttribute("aria-current", now ? "true" : "false");
        b.setAttribute("aria-label", b.dataset.setLang === "fr" ? (now ? "Français" : "Passer en français") : (now ? "English" : "Switch to English"));
      });
    }
    store.set("lang", lang);
    paintTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }

  if (pill) {
    var timer = null, hovering = false;
    var cancel = function () { if (timer) { clearTimeout(timer); timer = null; } };
    var close = function () { cancel(); pill.removeAttribute("data-open"); };
    var closeSoon = function () { cancel(); timer = setTimeout(close, 2000); };
    pill.addEventListener("pointerenter", function (e) { if (e.pointerType === "touch") return; hovering = true; cancel(); });
    pill.addEventListener("pointerleave", function (e) { if (e.pointerType === "touch") return; hovering = false; if (pill.hasAttribute("data-open")) closeSoon(); });
    pill.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    pill.addEventListener("focusout", function (e) { if (!pill.contains(e.relatedTarget)) close(); });
    document.addEventListener("pointerdown", function (e) { if (pill.hasAttribute("data-open") && !pill.contains(e.target)) close(); });
    pill.querySelectorAll("[data-set-lang]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!pill.hasAttribute("data-open")) { cancel(); pill.setAttribute("data-open", ""); return; }
        if (b.dataset.setLang !== pill.dataset.lang) setLang(b.dataset.setLang);
        if (!hovering) closeSoon();
      });
    });
    /* English unless this device chose French before (the owner, 2026-10-22: English by default) */
    var chosen = store.get("lang");
    setLang(chosen === "fr" ? "fr" : "en");
  } else {
    /* a page without the pill (the thanks page) speaks the language chosen on the others */
    setLang(store.get("lang") === "fr" ? "fr" : "en");
  }

  /* Donations, as in the app: one button, the amount is chosen on the payment page. The app's Worker answers the page
     to open; it opens in a new tab, opened at the click itself so a blocker does not refuse it. No card data here. */
  var don = document.querySelector("form.don");
  if (don) {
    var go = document.getElementById("don-go");
    var notes = { secure: don.querySelector('[data-don="secure"]'), error: don.querySelector('[data-don="error"]') };
    var note = function (which) { Object.keys(notes).forEach(function (k) { notes[k].hidden = k !== which; }); };
    don.addEventListener("submit", function (e) {
      e.preventDefault();
      go.disabled = true; note("secure");
      var tab = window.open("", "_blank");
      fetch("/api/donate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount: 5, currency: "usd", kind: "once", lang: document.documentElement.lang }) })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (d) {
          if (!d || typeof d.url !== "string" || !/^https:\/\//.test(d.url)) return Promise.reject();
          if (tab) { tab.opener = null; tab.location.href = d.url; } else location.assign(d.url);
        })
        .catch(function () { if (tab) tab.close(); note("error"); })
        .then(function () { go.disabled = false; });
    });
  }
  /* the public chat's preview starts talking when it comes into view */
  var phone = document.querySelector(".chat-phone");
  if (phone) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { phone.classList.add("seen"); io.disconnect(); } }); }, { threshold: 0.35 });
      io.observe(phone);
    } else phone.classList.add("seen");
  }
})();
