(function () {
  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getSlug() {
    var path = (location.pathname || "").replace(/\/$/, "");
    var prefix = "/projects/";
    if (path.indexOf(prefix) !== 0) return "";
    var rest = decodeURIComponent(path.slice(prefix.length));
    return rest.replace(/\.html$/, "");
  }

  function setMetaTitle(title) {
    document.title = title ? title + " | Code & Canvas" : "Project | Code & Canvas";
    var og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute("content", document.title);
  }

  function statBlock(label, value, modifier) {
    if (!value) return "";
    var className = "stat" + (modifier ? " " + modifier : "");
    return (
      '<div class="' + className + '">' +
      '<span class="stat-label">' + esc(label) + "</span>" +
      '<span class="stat-value">' + esc(value) + "</span>" +
      "</div>"
    );
  }

  function isBulletLine(line) {
    return /^[•\u2022\-\*–]\s+/.test(line);
  }

  function bulletLineText(line) {
    return line.replace(/^[•\u2022\-\*–]\s+/, "");
  }

  function isNumberedLine(line) {
    return /^\d+[\.\)]\s+/.test(line);
  }

  function numberedLineText(line) {
    return line.replace(/^\d+[\.\)]\s+/, "");
  }

  function linesToHtml(lines) {
    var html = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (isBulletLine(line)) {
        var bulletItems = [];
        while (i < lines.length && isBulletLine(lines[i])) {
          bulletItems.push("<li>" + esc(bulletLineText(lines[i])) + "</li>");
          i++;
        }
        html.push("<ul>" + bulletItems.join("") + "</ul>");
      } else if (isNumberedLine(line)) {
        var numberedItems = [];
        while (i < lines.length && isNumberedLine(lines[i])) {
          numberedItems.push("<li>" + esc(numberedLineText(lines[i])) + "</li>");
          i++;
        }
        html.push("<ol>" + numberedItems.join("") + "</ol>");
      } else {
        html.push("<p>" + esc(line) + "</p>");
        i++;
      }
    }
    return html.join("");
  }

  function plainToRichHtml(text) {
    if (!text || !String(text).trim()) return "";
    return String(text)
      .trim()
      .split(/\n{2,}/)
      .map(function (block) {
        var lines = block.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
        return linesToHtml(lines);
      })
      .join("");
  }

  function buildCaseBody(p) {
    var sections = [];

    function add(title, body) {
      if (!body || !String(body).trim()) return;
      sections.push(
        '<section class="case-section">' +
        "<h2>" + esc(title) + "</h2>" +
        plainToRichHtml(body) +
        "</section>"
      );
    }

    if (p.bodyHtml) {
      return p.bodyHtml;
    }

    add("The brief", p.caseBrief);
    add("What we delivered", p.caseDelivered);
    add("Result", p.caseOutcome);
    return sections.join("");
  }

  function tagPill(tag) {
    if (!tag) return "";
    return esc(tag);
  }

  function buildTagline(p) {
    var bits = [];
    if (Array.isArray(p.tags) && p.tags.length) bits.push(p.tags.slice(0, 3).map(tagPill).join(" · "));
    else if (p.category) bits.push(esc(p.category));
    if (p.year) bits.push(esc(p.year));
    else if (p.date) {
      var dt = (typeof p.date === "object" && p.date.toDate) ? p.date.toDate() : new Date(p.date);
      if (!isNaN(dt.getTime())) bits.push(dt.getFullYear());
    }
    return bits.filter(Boolean).join(" · ");
  }

  function preloadImage(url, fetchPriority) {
    if (!url) return;
    var href = String(url);
    var resolvedHref = href;
    try {
      resolvedHref = new URL(href, location.href).href;
    } catch (_) {}
    var links = document.querySelectorAll('link[rel="preload"][as="image"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].href === resolvedHref) return;
    }
    var link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = resolvedHref;
    if (fetchPriority) link.setAttribute("fetchpriority", fetchPriority);
    document.head.appendChild(link);
  }

  function normalizeAssetUrl(u) {
    if (!u) return "";
    var s = String(u).trim();
    if (!s) return "";
    // Absolute URLs (or special schemes) are fine as-is.
    if (/^(https?:)?\/\//i.test(s) || /^data:/i.test(s) || /^blob:/i.test(s)) return s;
    // Root-relative paths are fine as-is.
    if (s[0] === "/") return s;
    // Otherwise make it root-relative so it doesn't resolve under /projects/{slug}/...
    return "/" + s;
  }

  function markImageLoaded(img) {
    if (!img) return;
    img.classList.add("is-loaded");
  }

  function bindImageLoadStates(root) {
    if (!root) return;
    var imgs = root.querySelectorAll("img[data-img-state]");
    imgs.forEach(function (img) {
      if (img.complete && img.naturalWidth > 0) {
        markImageLoaded(img);
        return;
      }
      img.addEventListener("load", function () {
        markImageLoaded(img);
      }, { once: true });
      img.addEventListener("error", function () {
        markImageLoaded(img);
      }, { once: true });
    });
  }

  function galleryGridSection(urls) {
    if (!urls.length) return "";
    var grid = urls.map(function (u) {
      return '<div><img data-img-state loading="lazy" decoding="async" src="' + esc(u) + '" alt="" /></div>';
    }).join("");
    return (
      '<section class="detail-gallery">' +
      '<div class="container">' +
      '<div class="gallery-grid" data-reveal>' + grid + "</div>" +
      "</div></section>"
    );
  }

  function inlineGalleryImage(url, altText, sectionModifier) {
    if (!url) return "";
    var sectionClass = "detail-inline-media" + (sectionModifier ? " " + sectionModifier : "");
    return (
      '<section class="' + sectionClass + '">' +
      '<div class="container">' +
      '<div class="detail-inline-media-frame" data-reveal>' +
      '<img data-img-state loading="eager" fetchpriority="high" decoding="async" src="' + esc(url) + '" alt="' + esc(altText || "") + '" />' +
      "</div>" +
      "</div></section>"
    );
  }

  function loadNext(currentSlug) {
    return Promise.resolve();
  }

  function render(p) {
    var root = document.getElementById("project-detail-root");
    if (!root) return;

    setMetaTitle(p.title);
    var desc = document.querySelector('meta[name="description"]');
    if (desc && p.summary) desc.setAttribute("content", p.summary);

    var cover = p.coverImageUrl || "/images/image-placeholder.svg";
    var stats =
      statBlock("Client", p.client) +
      statBlock("Objective", p.objective) +
      statBlock("Deliverables", p.deliverables) +
      statBlock("Duration", p.duration);

    var body = buildCaseBody(p);
    var coverNorm = normalizeAssetUrl(cover) || "/images/image-placeholder.svg";
    var galleryUrls = (p.galleryUrls || []).map(normalizeAssetUrl).filter(Boolean);
    var imageBelowHero = galleryUrls[0] || "";
    var remainingImages = galleryUrls.slice(1);
    preloadImage(coverNorm, "high");
    preloadImage(imageBelowHero, "high");

    var remainingImagesHtml = remainingImages.map(function (u) {
      return inlineGalleryImage(u, p.title || "", "detail-inline-media--wide");
    }).join("");

    root.innerHTML =
      '<section class="page-hero detail-hero">' +
      '<div class="container">' +
      '<a href="/projects" class="back-link">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>' +
      "All projects</a>" +
      '<div class="detail-hero-layout">' +
      '<div class="detail-hero-copy">' +
      "<h1>" + esc(p.title || "Project") + "</h1>" +
      (p.summary ? '<p class="lead">' + esc(p.summary) + "</p>" : "") +
      "</div>" +
      '<div class="detail-cover" data-reveal>' +
      '<img data-img-state loading="eager" fetchpriority="high" decoding="async" src="' + esc(coverNorm) + '" alt="' + esc(p.title || "") + '" />' +
      "</div>" +
      (stats ? '<div class="detail-stats">' + stats + "</div>" : "") +
      "</div>" +
      "</div></section>" +
      inlineGalleryImage(imageBelowHero, p.title || "", "detail-inline-media--hero") +
      (body
        ? "<section><div class=\"container\"><div class=\"case-body\" data-reveal>" + body + "</div></div></section>"
        : "") +
      remainingImagesHtml +
      '<div id="project-next-root"></div>';

    bindImageLoadStates(root);

    if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
      SiteUI.rebindAfterDynamicMount(root);
    }

    loadNext(p.slug);
  }

  function run() {
    var slug = getSlug();
    var root = document.getElementById("project-detail-root");
    if (!root) return;

    if (!slug) {
      root.innerHTML =
        '<div class="container" style="padding:120px 0"><p class="text-mute">Project not found.</p>' +
        '<a href="/projects" class="btn btn-secondary">Back to projects</a></div>';
      return;
    }

    if (!window.firebase || !firebase.apps.length) {
      root.innerHTML =
        '<div class="container" style="padding:120px 0"><p class="text-mute">Configure Firebase.</p></div>';
      return;
    }

    root.innerHTML = '<div class="container" style="padding:120px 0"><p class="text-mute">Loading…</p></div>';

    var db = firebase.firestore();
    db.collection("projects")
      .where("slug", "==", slug)
      .where("published", "==", true)
      .limit(1)
      .get()
      .then(function (snap) {
        if (snap.empty) {
          root.innerHTML =
            '<div class="container" style="padding:120px 0"><p class="text-mute">Project not found.</p>' +
            '<a href="/projects" class="btn btn-secondary">Back to projects</a></div>';
          return;
        }
        var doc = snap.docs[0];
        var data = doc.data();
        data.slug = data.slug || slug;
        render(data);
      })
      .catch(function (e) {
        console.error(e);
        root.innerHTML =
          '<div class="container" style="padding:120px 0"><p class="text-mute">Could not load project.</p></div>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
