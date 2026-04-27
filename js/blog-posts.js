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

  function blogCardMarkup(p) {
    var href = "/blog/" + esc(p.slug);
    var img = esc(p.coverImageUrl || "/images/image-placeholder.svg");
    var title = esc(p.title || "Blog Post");
    var category = esc(p.category || "");
    var read = readMinutes(p);
    return (
      '<a class="blog-card" href="' + href + '" data-reveal>' +
      '<div class="img"><img loading="lazy" decoding="async" src="' + img + '" alt="' + title + '" /></div>' +
      '<div class="meta">' +
      (category ? "<span>" + category + "</span>" : "") +
      (read ? "<span>" + read + "</span>" : "") +
      "</div>" +
      "<h3>" + title + "</h3>" +
      "</a>"
    );
  }

  function renderBlogCarousel(container) {
    if (!container || !window.firebase || !firebase.apps.length) return Promise.resolve();
    var db = firebase.firestore();
    return db.collection("blog_posts")
      .where("published", "==", true)
      .orderBy("date", "desc")
      .limit(6)
      .get()
      .then(function (snap) {
        if (snap.empty) { container.innerHTML = ""; return; }
        if (!container.classList.contains("blog-grid")) {
          container.classList.add("blog-grid");
        }
        container.innerHTML = "";
        snap.forEach(function (doc) {
          var data = doc.data();
          data.id = doc.id;
          container.insertAdjacentHTML("beforeend", blogCardMarkup(data));
        });
        if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
          SiteUI.rebindAfterDynamicMount(container);
        }
      })
      .catch(function (err) { console.error("blog load error", err); });
  }

  window.ccBlog = window.ccBlog || {};
  window.ccBlog.renderBlogCarousel = renderBlogCarousel;
})();
