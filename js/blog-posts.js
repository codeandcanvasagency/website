(function () {
  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readMinutes(p) {
    if (p.readMinutes) return Math.max(1, parseInt(p.readMinutes, 10) || 1) + " min read";
    if (p.readTime) return esc(p.readTime);
    var body = String(p.body || p.content || p.excerpt || "");
    if (!body) return "";
    var words = body.split(/\s+/).length;
    var mins = Math.max(1, Math.round(words / 220));
    return mins + " min read";
  }

  function summaryFor(p) {
    if (p.summary) return String(p.summary);
    if (p.excerpt) return String(p.excerpt);
    var body = String(p.body || p.content || "");
    if (!body) return "";
    var firstPara = body.split(/\n\s*\n/)[0] || body;
    return firstPara.replace(/<[^>]+>/g, "").slice(0, 220);
  }

  function carouselCardMarkup(p) {
    var href = "/blog/" + esc(p.slug);
    var img = esc(p.coverImageUrl || "/images/image-placeholder.svg");
    var title = esc(p.title || "Blog Post");
    var summary = esc(summaryFor(p));
    var category = esc(p.category || "");
    var read = readMinutes(p);
    var meta = [category, read].filter(Boolean).map(function (m) { return "<span>" + m + "</span>"; }).join("");
    return (
      '<a href="' + href + '" class="carousel-card">' +
      '<div class="img"><img loading="lazy" decoding="async" src="' + img + '" alt="' + title + '" /></div>' +
      (meta ? '<div class="card-meta">' + meta + "</div>" : "") +
      '<div class="title">' + title + "</div>" +
      (summary ? '<p class="summary">' + summary + "</p>" : "") +
      "</a>"
    );
  }

  function renderBlogCarousel(sectionOrContainer) {
    if (!sectionOrContainer || !window.firebase || !firebase.apps.length) return Promise.resolve();
    var db = firebase.firestore();
    return db.collection("blog_posts")
      .where("published", "==", true)
      .orderBy("date", "desc")
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
