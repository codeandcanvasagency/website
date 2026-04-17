(function () {
  function esc(s) {
    if (!s) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function getSlug() {
    var path = location.pathname.replace(/\/$/, "") || "";
    var prefix = "/blog/";
    if (!path.startsWith(prefix)) return "";
    return decodeURIComponent(path.slice(prefix.length));
  }

  function setMetaTitle(title) {
    document.title = title ? title + " | Code & Canvas" : "Blog | Code & Canvas";
    var og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute("content", document.title);
  }

  function render(p) {
    var root = document.getElementById("blog-detail-root");
    if (!root) return;

    setMetaTitle(p.title);
    var desc = document.querySelector('meta[name="description"]');
    if (desc && p.summary) desc.setAttribute("content", p.summary);

    var cover = p.coverImageUrl || "/images/placeholder.jpg";
    var category = p.category || "";
    var date = p.date || "";
    var author = p.author || "";

    var bodySection = "";
    if (p.bodyHtml) {
      bodySection =
        '<div class="inner-container _804px center">' +
        '<div class="rich-text-with-display-heading w-richtext">' +
        p.bodyHtml +
        "</div></div>";
    }

    root.innerHTML =
      '<section class="section hero v10">' +
      '<div class="container-default w-container">' +
      '<div class="position-relative z-index-1">' +
      '<div class="mg-bottom-118px">' +
      '<a href="/blog" class="back-link"><span class="line-rounded-icon">&#xe184;</span> All Articles</a>' +
      "</div>" +
      '<div class="inner-container _966px">' +
      '<div class="inner-container _600px---mbl">' +
      (category ? '<div class="subtitle color-neutral-100 mg-bottom-12px">' + esc(category) + '</div>' : '') +
      '<h1 class="color-neutral-100 display-1 mg-bottom-12px">' + esc(p.title) + "</h1>" +
      '<div class="flex-horizontal start mg-top-16px" style="gap:16px">' +
      (author ? '<span class="text-200 bold color-neutral-300">' + esc(author) + '</span>' : '') +
      (date ? '<span class="text-200 color-neutral-400">' + esc(date) + '</span>' : '') +
      '</div>' +
      '<div class="inner-container _700px mg-top-24px">' +
      '<p class="color-neutral-300 mg-bottom-0">' + esc(p.summary || "") + "</p>" +
      "</div></div></div>" +
      '<div class="mg-top-64px"><div class="portfolio-featured-image-wrapper">' +
      '<img loading="lazy" alt="' + esc(p.title) + '" src="' + esc(cover) + '" class="portfolio-featured-image"/>' +
      "</div></div></div></div>" +
      '<div class="floating-circle _380px top-right---v2"></div>' +
      '<div class="floating-circle _380px bottom-left---v2"></div>' +
      '<div class="half-bg-bottom portfolio-single-bg"></div>' +
      "</section>" +
      (bodySection ? '<section class="section pd-top-100px"><div class="container-default w-container">' + bodySection + '</div></section>' : '');
  }

  function run() {
    var slug = getSlug();
    if (!slug) { location.href = "/blog"; return; }
    var root = document.getElementById("blog-detail-root");
    if (!root) return;

    if (!window.firebase || !firebase.apps.length) {
      root.innerHTML = '<div class="container-default w-container pd-top-150px"><p class="color-neutral-400">Configure Firebase.</p></div>';
      return;
    }

    root.innerHTML = '<div class="container-default w-container pd-top-150px"><p class="color-neutral-400">Loading\u2026</p></div>';

    var db = firebase.firestore();
    db.collection("blog_posts")
      .where("slug", "==", slug)
      .where("published", "==", true)
      .limit(1)
      .get()
      .then(function (snap) {
        if (snap.empty) {
          root.innerHTML =
            '<div class="container-default w-container pd-top-150px"><p class="color-neutral-400">Article not found.</p><a href="/blog" class="w-button">Back to blog</a></div>';
          return;
        }
        render(snap.docs[0].data());
      })
      .catch(function (e) {
        console.error(e);
        root.innerHTML =
          '<div class="container-default w-container pd-top-150px"><p class="color-neutral-400">Could not load article. Check the console for errors.</p></div>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
