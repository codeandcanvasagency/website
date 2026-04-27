/* ============================================================
   site-ui.js — Code & Canvas custom UI script
   - Partial includer ([data-include])
   - Active-nav highlighting
   - Mobile menu toggle
   - Touch dropdown for services nav
   - Scroll reveal ([data-reveal])
   - Services accordion ([data-svc])
   - Latest-projects carousel arrows ([data-carousel])
   - Testimonials slider with dots ([data-testimonials])
   ============================================================ */

(function () {
  "use strict";

  // ---------------- Partials includer -----------------------------------

  function includePartials() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll("[data-include]"));
    if (!nodes.length) return Promise.resolve();
    return Promise.all(
      nodes.map(function (el) {
        var src = el.getAttribute("data-include");
        if (!src) return Promise.resolve();
        return fetch(src, { credentials: "same-origin" })
          .then(function (r) {
            if (!r.ok) throw new Error("include_failed: " + src);
            return r.text();
          })
          .then(function (html) {
            var template = document.createElement("template");
            template.innerHTML = html.trim();
            var frag = template.content;
            var first = frag.firstElementChild;
            el.replaceWith(frag);
            return first;
          })
          .catch(function () {
            el.outerHTML = "";
          });
      })
    );
  }

  // ---------------- Active nav highlighting -----------------------------

  function highlightActiveNav() {
    var path = (window.location.pathname || "/").replace(/\/$/, "") || "/";
    var links = document.querySelectorAll("[data-nav-path]");
    links.forEach(function (a) {
      var p = (a.getAttribute("data-nav-path") || "").replace(/\/$/, "") || "/";
      var match = p === path || (p !== "/" && path.indexOf(p) === 0);
      if (match) a.classList.add("is-active");
    });
  }

  // ---------------- Mobile menu -----------------------------------------

  function bindMobileMenu() {
    var btn = document.getElementById("menuToggle");
    var menu = document.getElementById("mobileNav");
    if (!btn || !menu) return;

    function close() {
      btn.classList.remove("is-open");
      menu.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
      menu.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
    function open() {
      btn.classList.add("is-open");
      menu.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
      menu.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
    btn.addEventListener("click", function () {
      if (btn.classList.contains("is-open")) close();
      else open();
    });
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", close);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  }

  // ---------------- Touch dropdown for services nav --------------------

  function bindTouchDropdown() {
    if (!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches) return;
    var triggers = document.querySelectorAll(".nav-dropdown .nav-trigger");
    triggers.forEach(function (t) {
      var parent = t.parentElement;
      t.addEventListener("click", function (e) {
        e.preventDefault();
        var open = parent.classList.toggle("is-open");
        t.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
    document.addEventListener("click", function (e) {
      document.querySelectorAll(".nav-dropdown.is-open").forEach(function (dd) {
        if (!dd.contains(e.target)) {
          dd.classList.remove("is-open");
          var trig = dd.querySelector(".nav-trigger");
          if (trig) trig.setAttribute("aria-expanded", "false");
        }
      });
    });
  }

  // ---------------- Scroll reveal ---------------------------------------

  function bindScrollReveal() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll("[data-reveal]").forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll("[data-reveal]").forEach(function (el) { io.observe(el); });
  }

  function observeNewReveals(root) {
    if (!root) return;
    root.querySelectorAll && root.querySelectorAll("[data-reveal]").forEach(function (el) {
      el.classList.add("is-in");
    });
  }

  // ---------------- Services accordion ----------------------------------

  function bindAccordion() {
    document.querySelectorAll("[data-svc]").forEach(function (row) {
      var head = row.querySelector(".svc-head");
      if (!head) return;
      head.setAttribute("role", "button");
      head.setAttribute("tabindex", "0");
      function toggle() {
        var isOpen = row.classList.contains("is-open");
        document.querySelectorAll("[data-svc]").forEach(function (r) {
          r.classList.remove("is-open");
        });
        if (!isOpen) row.classList.add("is-open");
      }
      head.addEventListener("click", toggle);
      head.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  // ---------------- Carousel arrows -------------------------------------

  function bindCarousels() {
    document.querySelectorAll("[data-carousel]").forEach(function (root) {
      var trackId = root.getAttribute("data-carousel");
      var track = trackId ? document.getElementById(trackId) : root.querySelector(".carousel-track");
      if (!track) return;
      var prev = root.querySelector("[data-carousel-prev]");
      var next = root.querySelector("[data-carousel-next]");
      function step() {
        var card = track.querySelector(".carousel-card");
        return card ? card.offsetWidth + 24 : 320;
      }
      if (prev) prev.addEventListener("click", function () { track.scrollBy({ left: -step(), behavior: "smooth" }); });
      if (next) next.addEventListener("click", function () { track.scrollBy({ left: step(), behavior: "smooth" }); });
    });
  }

  // ---------------- Testimonials slider ---------------------------------

  function buildTestimonials(rootEl) {
    var track = rootEl.querySelector("[data-testimonial-track]") || rootEl.querySelector(".t-track");
    var dotsWrap = rootEl.querySelector("[data-testimonial-dots]") || rootEl.querySelector(".t-dots");
    var prev = rootEl.querySelector("[data-testimonial-prev]");
    var next = rootEl.querySelector("[data-testimonial-next]");
    if (!track) return null;

    var i = 0;
    var autoTimer = null;
    var cards = [];

    function renderDots() {
      cards = Array.prototype.slice.call(track.querySelectorAll(".t-card"));
      if (!dotsWrap) return;
      dotsWrap.innerHTML = "";
      cards.forEach(function (_, idx) {
        var b = document.createElement("button");
        b.className = "t-dot" + (idx === i ? " is-active" : "");
        b.type = "button";
        b.setAttribute("aria-label", "Go to testimonial " + (idx + 1));
        b.addEventListener("click", function () { go(idx); restart(); });
        dotsWrap.appendChild(b);
      });
    }

    function go(n) {
      if (!cards.length) return;
      i = ((n % cards.length) + cards.length) % cards.length;
      track.style.transform = "translateX(-" + i * 100 + "%)";
      if (dotsWrap) {
        dotsWrap.querySelectorAll(".t-dot").forEach(function (d, idx) {
          d.classList.toggle("is-active", idx === i);
        });
      }
    }

    function start() {
      if (autoTimer) clearInterval(autoTimer);
      autoTimer = setInterval(function () { go(i + 1); }, 7000);
    }
    function restart() { start(); }

    if (prev) prev.addEventListener("click", function () { go(i - 1); restart(); });
    if (next) next.addEventListener("click", function () { go(i + 1); restart(); });

    renderDots();
    if (cards.length) start();

    rootEl.addEventListener("dots:render", function () {
      i = 0;
      track.style.transform = "translateX(0)";
      renderDots();
      if (cards.length) start(); else if (autoTimer) clearInterval(autoTimer);
    });

    return {
      refresh: function () {
        i = 0;
        track.style.transform = "translateX(0)";
        renderDots();
        if (cards.length) start();
      },
    };
  }

  function bindTestimonials() {
    document.querySelectorAll("[data-testimonials]").forEach(function (rootEl) {
      buildTestimonials(rootEl);
    });
  }

  // ---------------- Reading progress (blog detail) ----------------------

  function bindReadingProgress() {
    var bar = document.querySelector("[data-reading-progress]");
    if (!bar) return;
    function update() {
      var doc = document.documentElement;
      var top = doc.scrollTop || document.body.scrollTop || 0;
      var height = (doc.scrollHeight - doc.clientHeight) || 1;
      var pct = Math.max(0, Math.min(100, (top / height) * 100));
      bar.style.width = pct + "%";
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  }

  // ---------------- TOC active link tracking ----------------------------

  function bindArticleToc() {
    var toc = document.querySelector("[data-article-toc]");
    if (!toc) return;
    var links = Array.prototype.slice.call(toc.querySelectorAll("a[href^='#']"));
    if (!links.length) return;
    var sections = links.map(function (a) {
      var id = a.getAttribute("href").slice(1);
      return id ? document.getElementById(id) : null;
    }).filter(Boolean);

    function update() {
      var scroll = window.scrollY + 120;
      var current = sections[0];
      sections.forEach(function (s) {
        if (s && s.offsetTop <= scroll) current = s;
      });
      links.forEach(function (l) { l.classList.remove("is-active"); });
      if (current) {
        var match = links.filter(function (l) { return l.getAttribute("href") === "#" + current.id; })[0];
        if (match) match.classList.add("is-active");
      }
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  }

  // ---------------- Public API ------------------------------------------

  window.SiteUI = {
    rebindAfterDynamicMount: function (rootEl) {
      bindCarousels();
      observeNewReveals(rootEl);
    },
    refreshTestimonials: function (rootEl) {
      var inst = buildTestimonials(rootEl || document.querySelector("[data-testimonials]"));
      return inst;
    },
    rebindArticle: function (rootEl) {
      bindReadingProgress();
      bindArticleToc();
      observeNewReveals(rootEl || document);
    },
  };

  // ---------------- Init ------------------------------------------------

  function init() {
    includePartials().then(function () {
      highlightActiveNav();
      bindMobileMenu();
      bindTouchDropdown();
      bindScrollReveal();
      bindAccordion();
      bindCarousels();
      bindTestimonials();
      bindReadingProgress();
      bindArticleToc();
      document.dispatchEvent(new CustomEvent("partials:loaded"));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
