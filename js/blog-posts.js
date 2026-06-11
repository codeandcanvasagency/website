(function () {
  if (!window.ccBlogCard) {
    (function () {
      function escMeta(s) {
        if (s === undefined || s === null) return "";
        return String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }
      function fmtDate(d) {
        if (!d) return "";
        var raw = d;
        if (typeof d === "object" && typeof d.toDate === "function") raw = d.toDate();
        var dt = raw instanceof Date ? raw : new Date(raw);
        if (isNaN(dt.getTime())) return escMeta(String(d));
        var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        var label = dt.getDate() + " " + months[dt.getMonth()];
        if (dt.getFullYear() !== new Date().getFullYear()) label += " " + dt.getFullYear();
        return label;
      }
      function readMinutesText(n) {
        var mins = parseInt(n, 10);
        if (!mins || mins < 1) return "";
        return mins + " min read";
      }
      function metaHtml(post) {
        if (!post) return "";
        var category = escMeta(post.category || "");
        var date = fmtDate(post.publishedAt);
        var read = readMinutesText(post.readingTimeMinutes);
        var parts = [];
        if (category) parts.push("<span>" + category + "</span>");
        if (date) parts.push("<span>" + date + "</span>");
        if (read) parts.push("<span>" + read + "</span>");
        if (!parts.length) return "";
        return '<div class="post-meta">' + parts.join("<span>\u00b7</span>") + "</div>";
      }
      window.ccBlogCard = { fmtDate: fmtDate, readMinutesText: readMinutesText, metaHtml: metaHtml };
    })();
  }

  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function summaryFor(p) {
    if (p.summary) return String(p.summary);
    return "";
  }

  // Same title-italic convention as blog-detail / blog-list.
  function renderTitleHtml(title) {
    var t = String(title == null ? "" : title);
    if (/<span\s+class\s*=\s*["']italic["']/i.test(t)) return t;
    var sep = / [\u2014\u2013\-] /;
    var m = t.match(sep);
    if (m) {
      var idx = m.index;
      var prefix = t.slice(0, idx);
      var suffix = t.slice(idx + m[0].length);
      if (suffix) {
        var trailing = /[.!?]$/.test(suffix) ? "" : ".";
        return esc(prefix) + ': <span class="italic">' + esc(suffix) + trailing + "</span>";
      }
    }
    return esc(t);
  }

  function carouselCardMarkup(p) {
    var href = "/blog/" + esc(p.slug);
    var coverUrl = (p.coverImage && p.coverImage.url) || "";
    var coverAlt = (p.coverImage && p.coverImage.alt) || p.title || "";
    var img = esc(coverUrl || "/images/image-placeholder.svg");
    var alt = esc(coverAlt);
    var titleHtml = renderTitleHtml(p.title || "Blog Post");
    var summary = esc(summaryFor(p));
    var metaHtml = window.ccBlogCard ? ccBlogCard.metaHtml(p) : "";
    return (
      '<a href="' + href + '" class="carousel-card">' +
      '<div class="img"><img loading="lazy" decoding="async" src="' + img + '" alt="' + alt + '" /></div>' +
      '<div class="title">' + titleHtml + "</div>" +
      (summary ? '<p class="summary">' + summary + "</p>" : "") +
      metaHtml +
      "</a>"
    );
  }

  function renderBlogCarousel(sectionOrContainer) {
    if (!sectionOrContainer || !window.firebase || !firebase.apps.length) return Promise.resolve();
    var db = firebase.firestore();
    return db.collection("blog_posts")
      .where("published", "==", true)
      .orderBy("publishedAt", "desc")
      .limit(8)
      .get()
      .then(function (snap) {
        if (snap.empty) { sectionOrContainer.style.display = "none"; return; }
        var track =
          sectionOrContainer.querySelector("[data-carousel-track]") ||
          sectionOrContainer.querySelector("#blogTrack") ||
          sectionOrContainer.querySelector(".carousel-track") ||
          sectionOrContainer;
        track.innerHTML = "";
        snap.forEach(function (doc) {
          var data = doc.data();
          data.id = doc.id;
          track.insertAdjacentHTML("beforeend", carouselCardMarkup(data));
        });
        if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
          SiteUI.rebindAfterDynamicMount(sectionOrContainer);
        }
      })
      .catch(function (err) { console.error("blog load error", err); });
  }

  window.ccBlog = window.ccBlog || {};
  window.ccBlog.renderBlogCarousel = renderBlogCarousel;
})();
