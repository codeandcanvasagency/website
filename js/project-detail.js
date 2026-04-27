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

  function statBlock(label, value) {
    if (!value) return "";
    return (
      '<div class="stat">' +
      '<span class="stat-label">' + esc(label) + "</span>" +
      '<span class="stat-value">' + esc(value) + "</span>" +
      "</div>"
    );
  }

  function plainToParagraphs(text) {
    if (!text || !String(text).trim()) return "";
    return String(text)
      .trim()
      .split(/\n{2,}/)
      .map(function (block) {
        return "<p>" + esc(block).replace(/\n/g, "<br/>") + "</p>";
      })
      .join("");
  }

  function buildCaseBody(p) {
    var sections = [];
    var idx = 0;

    function add(title, body) {
      if (!body || !String(body).trim()) return;
      idx++;
      var marker = "— " + (idx < 10 ? "0" + idx : idx) + " / " + title;
      var html =
        '<h2><span class="marker">' + esc(marker) + "</span>" +
        esc(title) + "</h2>" +
        plainToParagraphs(body);
      sections.push(html);
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

  function gallerySection(p) {
    var urls = (p.galleryUrls || []).filter(Boolean);
    if (!urls.length) return "";
    var hero = urls[0];
    var rest = urls.slice(1);
    var grid = rest.map(function (u) {
      return '<div><img loading="lazy" decoding="async" src="' + esc(u) + '" alt="" /></div>';
    }).join("");
    return (
      '<section class="detail-gallery" style="padding-top: 80px">' +
      '<div class="container">' +
      '<div class="gallery-hero" data-reveal>' +
      '<img loading="lazy" decoding="async" src="' + esc(hero) + '" alt="' + esc(p.title || "") + '" />' +
      "</div>" +
      (rest.length ? '<div class="gallery-grid" data-reveal>' + grid + "</div>" : "") +
      "</div></section>"
    );
  }

  function loadNext(currentSlug) {
    var root = document.getElementById("project-next-root");
    if (!root) return Promise.resolve();
    if (!window.firebase || !firebase.apps.length) return Promise.resolve();
    var db = firebase.firestore();
    return db.collection("projects")
      .where("published", "==", true)
      .orderBy("date", "desc")
      .limit(6)
      .get()
      .then(function (snap) {
        if (snap.empty) { root.innerHTML = ""; return; }
        var next = null;
        snap.forEach(function (doc) {
          if (next) return;
          var d = doc.data();
          if (d.slug && d.slug !== currentSlug) {
            d.id = doc.id;
            next = d;
          }
        });
        if (!next) { root.innerHTML = ""; return; }
        root.innerHTML =
          '<section class="section" style="padding-top: 0">' +
          '<div class="container">' +
          '<div class="section-head" style="border-top: 1px solid var(--ink-line); padding-top: 64px">' +
          '<div class="head-left">' +
          '<div class="eyebrow">Next project</div>' +
          '<h2 class="display-3">' + esc(next.title || "View project") + "</h2>" +
          "</div>" +
          '<a href="/projects/' + esc(next.slug) + '" class="btn btn-ghost">View case study <span class="arrow"></span></a>' +
          "</div></div></section>";
      })
      .catch(function (err) { console.error("next project error", err); });
  }

  function render(p) {
    var root = document.getElementById("project-detail-root");
    if (!root) return;

    setMetaTitle(p.title);
    var desc = document.querySelector('meta[name="description"]');
    if (desc && p.summary) desc.setAttribute("content", p.summary);

    var cover = p.coverImageUrl || "/images/image-placeholder.svg";
    var tagline = buildTagline(p);
    var stats =
      statBlock("Client", p.client) +
      statBlock("Objective", p.objective) +
      statBlock("Deliverables", p.deliverables) +
      statBlock("Duration", p.duration);

    var body = buildCaseBody(p);

    root.innerHTML =
      '<section class="page-hero detail-hero">' +
      '<div class="container">' +
      '<a href="/projects" class="back-link">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>' +
      "All projects</a>" +
      (tagline ? '<div class="tagline">' + tagline + "</div>" : "") +
      "<h1>" + esc(p.title || "Project") + "</h1>" +
      (p.summary ? '<p class="lead">' + esc(p.summary) + "</p>" : "") +
      '<div class="detail-cover" data-reveal>' +
      '<img loading="lazy" decoding="async" src="' + esc(cover) + '" alt="' + esc(p.title || "") + '" />' +
      "</div>" +
      "</div></section>" +
      (stats
        ? '<section class="section" style="padding-top:0; padding-bottom:0;">' +
            '<div class="container">' +
            '<div class="detail-stats">' + stats + "</div>" +
            "</div></section>"
        : "") +
      (body
        ? "<section><div class=\"container\"><div class=\"case-body\" data-reveal>" + body + "</div></div></section>"
        : "") +
      '<section><div class="container"><div class="detail-cta" data-reveal>' +
      '<h3>Have a project that needs <span class="italic">this kind of care?</span></h3>' +
      '<a href="/contact" class="btn btn-primary">Let\'s chat <span class="arrow"></span></a>' +
      "</div></div></section>" +
      gallerySection(p) +
      '<div id="project-next-root"></div>';

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
