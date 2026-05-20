(function () {
  var POSTS_PER_PAGE = 6;
  var allPosts = [];
  var filteredPosts = [];
  var currentCategory = "";
  var currentSearch = "";
  var currentSort = "newest";
  var currentPage = 0;

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

  function fmtDate(d) {
    if (!d) return "";
    var raw = d;
    if (typeof d === "object" && typeof d.toDate === "function") raw = d.toDate();
    var dt = raw instanceof Date ? raw : new Date(raw);
    if (isNaN(dt.getTime())) return esc(String(d));
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return dt.getDate() + " " + months[dt.getMonth()] + " " + dt.getFullYear();
  }

  function featuredCardHtml(p) {
    var href = "/blog/" + esc(p.slug);
    var img = esc(p.coverImageUrl || "/images/image-placeholder.svg");
    var title = esc(p.title || "Blog Post");
    var summary = esc(p.summary || "");
    var date = fmtDate(p.date);
    var category = esc(p.category || "");
    var read = readMinutes(p);
    var showMetaDotAfterCategory = !!(category && (read || date));
    var showMetaDotAfterRead = !!(read && date);
    return (
      '<a href="' + href + '" class="featured-article" data-reveal>' +
      '<div class="featured-media">' +
      '<img loading="lazy" decoding="async" src="' + img + '" alt="' + title + '" />' +
      (category ? '<span class="featured-tag">' + category + "</span>" : "") +
      "</div>" +
      '<div class="featured-body">' +
      '<div class="featured-meta">' +
      (category ? "<span>— " + category + "</span>" : "") +
      (showMetaDotAfterCategory ? "<span>·</span>" : "") +
      (read ? "<span>" + read + "</span>" : "") +
      (showMetaDotAfterRead ? "<span>·</span>" : "") +
      (date ? "<span>" + date + "</span>" : "") +
      "</div>" +
      "<h3>" + title + "</h3>" +
      (summary ? "<p>" + summary + "</p>" : "") +
      "</div>" +
      "</a>"
    );
  }

  function postCardHtml(p) {
    var href = "/blog/" + esc(p.slug);
    var img = esc(p.coverImageUrl || "/images/image-placeholder.svg");
    var title = esc(p.title || "Blog Post");
    var summary = esc(p.summary || "");
    var date = fmtDate(p.date);
    var category = esc(p.category || "");
    var read = readMinutes(p);
    return (
      '<a href="' + href + '" class="post-card" data-reveal>' +
      '<div class="post-media">' +
      '<img loading="lazy" decoding="async" src="' + img + '" alt="' + title + '" />' +
      "</div>" +
      '<div class="post-body">' +
      '<div class="post-meta">' +
      (category ? "<span>" + category + "</span>" : "") +
      (category && read ? "<span>·</span>" : "") +
      (read ? "<span>" + read + "</span>" : "") +
      "</div>" +
      "<h3>" + title + "</h3>" +
      (summary ? "<p>" + summary + "</p>" : "") +
      (date ? '<span class="post-date">' + date + "</span>" : "") +
      "</div>" +
      "</a>"
    );
  }

  function postDateMs(p) {
    var d = p.date;
    if (d && typeof d.toDate === "function") d = d.toDate();
    var dt = d instanceof Date ? d : new Date(d);
    return isNaN(dt.getTime()) ? 0 : dt.getTime();
  }

  function sortPosts(arr) {
    return arr.slice().sort(function (a, b) {
      var da = postDateMs(a);
      var db = postDateMs(b);
      return currentSort === "oldest" ? da - db : db - da;
    });
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
    return sortPosts(result);
  }

  function renderFilterSelect() {
    var sel = document.getElementById("blogFilterSelect");
    if (!sel) return;
    var counts = {};
    allPosts.forEach(function (p) {
      if (p.category) counts[p.category] = (counts[p.category] || 0) + 1;
    });
    var sorted = Object.keys(counts).sort();
    var html = '<option value="">All categories</option>';
    sorted.forEach(function (c) {
      html += '<option value="' + esc(c) + '"' +
        (currentCategory === c ? " selected" : "") + ">" + esc(c) + "</option>";
    });
    sel.innerHTML = html;
    if (!sel._bound) {
      sel._bound = true;
      sel.addEventListener("change", function () {
        currentCategory = sel.value || "";
        currentPage = 0;
        applyFilters();
      });
    }
  }

  function renderCategories() {
    var container = document.getElementById("cc-blog-categories");
    if (!container) return;
    if (!container.classList.contains("blog-categories")) {
      container.classList.add("blog-categories");
    }
    var counts = {};
    allPosts.forEach(function (p) {
      if (p.category) counts[p.category] = (counts[p.category] || 0) + 1;
    });
    var sorted = Object.keys(counts).sort();
    var html = '<button type="button" class="cat-chip cc-cat-btn' +
      (!currentCategory ? " is-active" : "") +
      '" data-cat="">All <span class="cat-count">' + allPosts.length + "</span></button>";
    sorted.forEach(function (c) {
      html += '<button type="button" class="cat-chip cc-cat-btn' +
        (currentCategory === c ? " is-active" : "") +
        '" data-cat="' + esc(c) + '">' + esc(c) +
        ' <span class="cat-count">' + counts[c] + "</span></button>";
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
    renderFilterSelect();
    renderCategories();
    renderFeatured();
    renderGrid();
    renderPagination();
  }

  function renderFeatured() {
    var container = document.getElementById("cc-blog-featured");
    if (!container) return;
    if (filteredPosts.length === 0) {
      container.innerHTML = '<p class="text-mute">No articles found.</p>';
      return;
    }
    container.innerHTML = featuredCardHtml(filteredPosts[0]);
    if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
      SiteUI.rebindAfterDynamicMount(container);
    }
  }

  function renderGrid() {
    var container = document.getElementById("cc-blog-grid");
    if (!container) return;
    if (!container.classList.contains("blog-list-grid")) {
      container.classList.add("blog-list-grid");
    }
    var gridPosts = filteredPosts.slice(1);
    var start = currentPage * POSTS_PER_PAGE;
    var page = gridPosts.slice(start, start + POSTS_PER_PAGE);
    if (page.length === 0 && filteredPosts.length <= 1) {
      container.innerHTML = "";
      return;
    }
    if (page.length === 0) {
      container.innerHTML = '<p class="text-mute">No more articles on this page.</p>';
      return;
    }
    container.innerHTML = page.map(postCardHtml).join("");
    if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
      SiteUI.rebindAfterDynamicMount(container);
    }
  }

  function renderPagination() {
    var container = document.getElementById("cc-blog-pagination");
    if (!container) return;
    if (!container.classList.contains("pagination")) {
      container.classList.add("pagination");
    }
    var gridPosts = filteredPosts.slice(1);
    var totalPages = Math.ceil(gridPosts.length / POSTS_PER_PAGE);
    if (totalPages <= 1) { container.innerHTML = ""; return; }

    var prevDisabled = currentPage === 0;
    var nextDisabled = currentPage >= totalPages - 1;
    var pages = "";
    for (var i = 0; i < totalPages; i++) {
      var label = (i + 1 < 10 ? "0" : "") + (i + 1);
      pages += '<button type="button" class="pg-page cc-page-num' +
        (i === currentPage ? " is-active" : "") +
        '" data-page="' + i + '">' + label + "</button>";
    }
    container.innerHTML =
      '<button type="button" class="pg-btn cc-page-prev' + (prevDisabled ? " is-disabled" : "") + '"' +
      (prevDisabled ? " disabled" : "") + '>← Previous</button>' +
      '<div class="pg-pages">' + pages + "</div>" +
      '<button type="button" class="pg-btn cc-page-next' + (nextDisabled ? " is-disabled" : "") + '"' +
      (nextDisabled ? " disabled" : "") + '>Next →</button>';

    var prev = container.querySelector(".cc-page-prev");
    var next = container.querySelector(".cc-page-next");
    if (prev) prev.addEventListener("click", function () {
      if (currentPage > 0) {
        currentPage--;
        renderGrid();
        renderPagination();
        scrollToGrid();
      }
    });
    if (next) next.addEventListener("click", function () {
      if (currentPage < totalPages - 1) {
        currentPage++;
        renderGrid();
        renderPagination();
        scrollToGrid();
      }
    });
    container.querySelectorAll(".cc-page-num").forEach(function (b) {
      b.addEventListener("click", function () {
        var p = parseInt(b.getAttribute("data-page"), 10) || 0;
        if (p !== currentPage) {
          currentPage = p;
          renderGrid();
          renderPagination();
          scrollToGrid();
        }
      });
    });
  }

  function scrollToGrid() {
    var grid = document.getElementById("cc-blog-grid");
    if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
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

    var sortSelect = document.getElementById("blogSortSelect");
    if (sortSelect && !sortSelect._bound) {
      sortSelect._bound = true;
      sortSelect.addEventListener("change", function () {
        currentSort = sortSelect.value || "newest";
        currentPage = 0;
        applyFilters();
      });
    }

    db.collection("blog_posts")
      .where("published", "==", true)
      .orderBy("date", "desc")
      .get()
      .then(function (snap) {
        if (snap.empty) {
          var fc = document.getElementById("cc-blog-featured");
          if (fc) fc.innerHTML = '<p class="text-mute">No articles yet.</p>';
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
        if (fc) fc.innerHTML = '<p class="text-mute">Could not load articles.</p>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
