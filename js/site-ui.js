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
      btn.setAttribute("aria-label", "Open menu");
      menu.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      document.body.classList.remove("mobile-menu-open");
    }
    function open() {
      btn.classList.add("is-open");
      menu.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-label", "Close menu");
      menu.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      document.body.classList.add("mobile-menu-open");
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

  // ---------------- Mobile services submenu toggle ----------------------

  function bindMobileServicesToggle() {
    document.querySelectorAll("[data-mn-services]").forEach(function (row) {
      var btn = row.querySelector(".mn-services-toggle");
      if (!btn) return;
      var listId = btn.getAttribute("aria-controls");
      var list = listId ? document.getElementById(listId) : row.nextElementSibling;
      if (!list) return;
      var closeTimer = null;

      function setOpen(open) {
        if (closeTimer) {
          window.clearTimeout(closeTimer);
          closeTimer = null;
        }

        if (open) {
          list.removeAttribute("hidden");
          // Ensure hidden removal is painted before adding the open class.
          window.requestAnimationFrame(function () {
            row.classList.add("is-open");
            list.classList.add("is-open");
          });
        } else {
          row.classList.remove("is-open");
          list.classList.remove("is-open");
          // Wait for the close transition before removing from layout/accessibility tree.
          closeTimer = window.setTimeout(function () {
            if (btn.getAttribute("aria-expanded") !== "true") {
              list.setAttribute("hidden", "");
            }
            closeTimer = null;
          }, 320);
        }
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      }

      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(btn.getAttribute("aria-expanded") !== "true");
      });

      // Reset to collapsed whenever the mobile menu closes.
      var menu = document.getElementById("mobileNav");
      if (menu) {
        var mo = new MutationObserver(function () {
          if (!menu.classList.contains("is-open")) setOpen(false);
        });
        mo.observe(menu, { attributes: true, attributeFilter: ["class"] });
      }
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
      if (prev && !prev.__ccCarouselBound) {
        prev.__ccCarouselBound = true;
        prev.addEventListener("click", function () {
          if (typeof track.__ccCarouselGoRelative === "function") {
            track.__ccCarouselGoRelative(-1);
            return;
          }
          track.scrollBy({ left: -step(), behavior: "smooth" });
        });
      }
      if (next && !next.__ccCarouselBound) {
        next.__ccCarouselBound = true;
        next.addEventListener("click", function () {
          if (typeof track.__ccCarouselGoRelative === "function") {
            track.__ccCarouselGoRelative(1);
            return;
          }
          track.scrollBy({ left: step(), behavior: "smooth" });
        });
      }

      // Home carousels autoplay one card at a time; latest projects runs on desktop too.
      var autoplaysOnDesktop = track.id === "latestTrack";
      var isAutoTrack = autoplaysOnDesktop || track.id === "blogTrack";
      if (!isAutoTrack) return;
      if (track.__ccLatestAutoBound) {
        if (typeof track.__ccCarouselAutoStart === "function") track.__ccCarouselAutoStart();
        return;
      }
      track.__ccLatestAutoBound = true;

      var autoTimer = null;
      var AUTO_DELAY_MS = 3000;

      function isMobileViewport() {
        return window.matchMedia("(max-width: 640px)").matches;
      }

      function shouldAutoplay() {
        return autoplaysOnDesktop || isMobileViewport();
      }

      function cards() {
        return Array.prototype.slice.call(track.querySelectorAll(".carousel-card"));
      }

      function originalCards() {
        return cards().filter(function (el) {
          return !el.hasAttribute("data-carousel-clone");
        });
      }

      function prepareClone(card, placement) {
        card.setAttribute("data-carousel-clone", placement);
        card.setAttribute("aria-hidden", "true");
        card.setAttribute("tabindex", "-1");
        card.querySelectorAll("a, button, input, select, textarea, [tabindex]").forEach(function (el) {
          el.setAttribute("tabindex", "-1");
        });
        return card;
      }

      function ensureLoopClones() {
        var existingClones = track.querySelectorAll("[data-carousel-clone]");
        if (existingClones.length) return originalCards().length;

        var originals = originalCards();
        if (originals.length < 2) return originals.length;

        var before = document.createDocumentFragment();
        var after = document.createDocumentFragment();
        originals.forEach(function (card) {
          before.appendChild(prepareClone(card.cloneNode(true), "before"));
          after.appendChild(prepareClone(card.cloneNode(true), "after"));
        });

        track.insertBefore(before, track.firstChild);
        track.appendChild(after);
        track.scrollLeft = originals[0].offsetLeft;
        return originals.length;
      }

      function currentIndex(cardEls) {
        if (!cardEls.length) return 0;
        var left = track.scrollLeft;
        var idx = 0;
        var minDelta = Infinity;
        cardEls.forEach(function (el, i) {
          var delta = Math.abs(el.offsetLeft - left);
          if (delta < minDelta) {
            minDelta = delta;
            idx = i;
          }
        });
        return idx;
      }

      function normalizeLoopPosition() {
        var count = originalCards().length;
        if (count < 2) return;

        var cardEls = cards();
        if (cardEls.length < count * 3) return;

        var idx = currentIndex(cardEls);
        var target = null;
        if (idx < count) {
          target = idx + count;
        } else if (idx >= count * 2) {
          target = idx - count;
        }

        if (target !== null && cardEls[target]) {
          track.scrollLeft = cardEls[target].offsetLeft;
        }
      }

      function goRelative(delta) {
        var count = ensureLoopClones();
        if (count < 2) return;

        normalizeLoopPosition();
        var cardEls = cards();
        var target = currentIndex(cardEls) + delta;
        if (!cardEls[target]) return;

        track.scrollTo({ left: cardEls[target].offsetLeft, behavior: "smooth" });
        window.setTimeout(normalizeLoopPosition, 650);
      }
      track.__ccCarouselGoRelative = goRelative;

      function stopAutoplay() {
        if (autoTimer) {
          clearInterval(autoTimer);
          autoTimer = null;
        }
      }

      function startAutoplay() {
        stopAutoplay();
        ensureLoopClones();
        normalizeLoopPosition();
        if (!shouldAutoplay()) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        if (originalCards().length < 2) return;
        autoTimer = setInterval(function () {
          goRelative(1);
        }, AUTO_DELAY_MS);
      }
      track.__ccCarouselAutoStart = startAutoplay;

      function restartAutoplay() {
        stopAutoplay();
        if (shouldAutoplay()) {
          window.setTimeout(startAutoplay, AUTO_DELAY_MS);
        }
      }

      track.addEventListener("touchstart", restartAutoplay, { passive: true });
      track.addEventListener("pointerdown", restartAutoplay);
      track.addEventListener("wheel", restartAutoplay, { passive: true });
      track.addEventListener("scroll", function () {
        window.clearTimeout(track.__ccLoopNormalizeTimer);
        track.__ccLoopNormalizeTimer = window.setTimeout(normalizeLoopPosition, 120);
      }, { passive: true });
      if (prev) prev.addEventListener("click", restartAutoplay);
      if (next) next.addEventListener("click", restartAutoplay);

      document.addEventListener("visibilitychange", function () {
        if (document.hidden) stopAutoplay();
        else startAutoplay();
      });
      window.addEventListener("resize", function () {
        startAutoplay();
      });

      startAutoplay();
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
      autoTimer = setInterval(function () { go(i + 1); }, 3000);
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

  // ---------------- Detail hero cover images (project + service pages) ----

  function bindDetailCoverImages(root) {
    var scope = root || document;
    var imgs = scope.querySelectorAll(".detail-cover img[data-img-state]");
    imgs.forEach(function (img) {
      function markLoaded() {
        img.classList.add("is-loaded");
      }
      if (img.complete && img.naturalWidth > 0) {
        markLoaded();
        return;
      }
      img.addEventListener("load", markLoaded, { once: true });
      img.addEventListener("error", markLoaded, { once: true });
    });
  }

  // ---------------- Public API ------------------------------------------

  window.SiteUI = {
    bindDetailCoverImages: bindDetailCoverImages,
    rebindAfterDynamicMount: function (rootEl) {
      bindCarousels();
      observeNewReveals(rootEl);
      bindDetailCoverImages(rootEl);
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
      bindMobileServicesToggle();
      bindScrollReveal();
      bindAccordion();
      bindCarousels();
      bindTestimonials();
      bindReadingProgress();
      bindArticleToc();
      bindDetailCoverImages(document);
      document.dispatchEvent(new CustomEvent("partials:loaded"));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
