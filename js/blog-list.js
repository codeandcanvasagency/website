(function () {
  var POSTS_PER_PAGE = 4;
  var allPosts = [];
  var filteredPosts = [];
  var currentCategory = "";
  var currentSearch = "";
  var currentPage = 0;

  function esc(s) {
    if (!s) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function featuredCardHtml(p) {
    var href = "/blog/" + esc(p.slug);
    var img = esc(p.coverImageUrl || "/images/placeholder.jpg");
    var title = esc(p.title || "Blog Post");
    var summary = esc(p.summary || "");
    var date = esc(p.date || "");
    var category = esc(p.category || "");
    return (
      '<a href="' + href + '" class="blog-card-featured-wrapper card v2 w-inline-block">' +
      '<div class="w-layout-grid grid-2-columns blog-grid-col-2-v1">' +
      '<div class="blog-card-image-wrapper v1">' +
      '<img loading="lazy" src="' + img + '" alt="' + title + '" class="blog-card-image featured-v6"/>' +
      '</div>' +
      '<div class="blog-card-featured-inner-content v1">' +
      '<div class="inner-container _600px---tablet"><div class="inner-container _500px---mbl">' +
      (category ? '<div class="subtitle color-neutral-100 mg-bottom-24px">' + category + '</div>' : '') +
      '<h2 class="blog-card-title heading-h2-size color-neutral-100 mg-bottom-24px">' + title + '</h2>' +
      '<p class="blog-card-excerpt mg-bottom-0 color-neutral-300">' + summary + '</p>' +
      '</div></div>' +
      '<div class="divider v2"></div>' +
      '<div class="flex-horizontal space-between">' +
      '<div><div class="text-200 bold color-neutral-100">' + date + '</div></div>' +
      '<div class="btn-circle-secondary circle-btn small white no-hover"><div class="line-square-icon"></div></div>' +
      '</div></div></div></a>'
    );
  }

  function blogCardHtml(p) {
    var href = "/blog/" + esc(p.slug);
    var img = esc(p.coverImageUrl || "/images/placeholder.jpg");
    var title = esc(p.title || "Blog Post");
    var summary = esc(p.summary || "");
    var date = esc(p.date || "");
    var category = esc(p.category || "");
    return (
      '<div class="height-100">' +
      '<a href="' + href + '" class="blog-card-wrapper w-inline-block">' +
      '<div class="blog-card-image-wrapper inside-card">' +
      '<img loading="lazy" src="' + img + '" alt="' + title + '" class="blog-card-image"/>' +
      '</div>' +
      '<div class="blog-card-content-inside">' +
      '<div class="inner-container _600px---mbl">' +
      '<h3 class="blog-card-title heading-h2-size mg-bottom-16px">' + title + '</h3>' +
      '<div class="inner-container _590px">' +
      '<p class="blog-card-excerpt mg-bottom-0">' + summary + '</p>' +
      '</div></div>' +
      '<div class="mg-top-auto">' +
      '<div class="divider _40px _30px---mbl"></div>' +
      '<div class="flex-horizontal space-between">' +
      '<div class="flex-horizontal start blog-card-content-details">' +
      (category ? '<div class="badge-secondary small mg-right-16px transparent">' + category + '</div>' : '') +
      '<div class="text-200 bold color-neutral-800">' + date + '</div>' +
      '</div>' +
      '<div class="btn-circle-secondary circle-btn small no-hover"><div class="line-square-icon"></div></div>' +
      '</div></div></div></a></div>'
    );
  }

  function getFilteredPosts() {
    var result = allPosts;
    if (currentCategory) {
      result = result.filter(function (p) { return p.category === currentCategory; });
    }
    if (currentSearch) {
      var q = currentSearch.toLowerCase();
      result = result.filter(function (p) {
        return (p.title || "").toLowerCase().indexOf(q) !== -1 ||
               (p.summary || "").toLowerCase().indexOf(q) !== -1 ||
               (p.category || "").toLowerCase().indexOf(q) !== -1;
      });
    }
    return result;
  }

  function renderCategories() {
    var container = document.getElementById("cc-blog-categories");
    if (!container) return;
    var cats = {};
    allPosts.forEach(function (p) { if (p.category) cats[p.category] = true; });
    var sorted = Object.keys(cats).sort();
    var html = '<button type="button" class="badge-primary category-badges cc-cat-btn' +
      (!currentCategory ? " w--current" : "") + '" data-cat="">All</button>';
    sorted.forEach(function (c) {
      html += '<button type="button" class="badge-primary category-badges cc-cat-btn' +
        (currentCategory === c ? " w--current" : "") +
        '" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    });
    container.innerHTML = html;
    container.querySelectorAll(".cc-cat-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentCategory = btn.getAttribute("data-cat") || "";
        currentPage = 0;
        applyFilters();
      });
    });
  }

  function applyFilters() {
    filteredPosts = getFilteredPosts();
    renderCategories();
    renderFeatured();
    renderGrid();
    renderPagination();
  }

  function renderFeatured() {
    var container = document.getElementById("cc-blog-featured");
    if (!container) return;
    if (filteredPosts.length === 0) {
      container.innerHTML = '<p class="color-neutral-400">No articles found.</p>';
      return;
    }
    container.innerHTML = featuredCardHtml(filteredPosts[0]);
  }

  function renderGrid() {
    var container = document.getElementById("cc-blog-grid");
    if (!container) return;
    var gridPosts = filteredPosts.slice(1);
    var start = currentPage * POSTS_PER_PAGE;
    var page = gridPosts.slice(start, start + POSTS_PER_PAGE);
    if (page.length === 0 && filteredPosts.length <= 1) {
      container.innerHTML = "";
      return;
    }
    if (page.length === 0) {
      container.innerHTML = '<p class="color-neutral-400">No more articles on this page.</p>';
      return;
    }
    container.innerHTML = page.map(blogCardHtml).join("");
  }

  function renderPagination() {
    var container = document.getElementById("cc-blog-pagination");
    if (!container) return;
    var gridPosts = filteredPosts.slice(1);
    var totalPages = Math.ceil(gridPosts.length / POSTS_PER_PAGE);
    if (totalPages <= 1) { container.innerHTML = ""; return; }

    var prevDisabled = currentPage === 0;
    var nextDisabled = currentPage >= totalPages - 1;
    container.innerHTML =
      '<button type="button" class="btn-secondary white cc-page-prev"' + (prevDisabled ? " disabled" : "") +
      ' style="' + (prevDisabled ? "opacity:0.4;pointer-events:none" : "") + '">Previous</button>' +
      '<span class="text-200 bold color-neutral-100" style="align-self:center">Page ' + (currentPage + 1) + ' of ' + totalPages + '</span>' +
      '<button type="button" class="btn-secondary white cc-page-next"' + (nextDisabled ? " disabled" : "") +
      ' style="' + (nextDisabled ? "opacity:0.4;pointer-events:none" : "") + '">Next</button>';

    var prev = container.querySelector(".cc-page-prev");
    var next = container.querySelector(".cc-page-next");
    if (prev) prev.addEventListener("click", function () {
      if (currentPage > 0) { currentPage--; renderGrid(); renderPagination(); }
    });
    if (next) next.addEventListener("click", function () {
      if (currentPage < totalPages - 1) { currentPage++; renderGrid(); renderPagination(); }
    });
  }

  function run() {
    if (!window.firebase || !firebase.apps.length) return;
    var db = firebase.firestore();

    var searchInput = document.getElementById("blogSearchInput");
    if (searchInput) {
      var debounce;
      searchInput.addEventListener("input", function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          currentSearch = searchInput.value.trim();
          currentPage = 0;
          applyFilters();
        }, 250);
      });
    }

    db.collection("blog_posts")
      .where("published", "==", true)
      .orderBy("date", "desc")
      .get()
      .then(function (snap) {
        if (snap.empty) {
          var fc = document.getElementById("cc-blog-featured");
          if (fc) fc.innerHTML = '<p class="color-neutral-400">No articles yet.</p>';
          var gc = document.getElementById("cc-blog-grid");
          if (gc) gc.innerHTML = "";
          return;
        }
        allPosts = [];
        snap.forEach(function (doc) {
          var d = doc.data();
          d.id = doc.id;
          allPosts.push(d);
        });
        applyFilters();
      })
      .catch(function (err) {
        console.error("blog list error", err);
        var fc = document.getElementById("cc-blog-featured");
        if (fc) fc.innerHTML = '<p class="color-neutral-400">Could not load articles.</p>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
