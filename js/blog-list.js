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

  function readMinutesText(n) {
    var mins = parseInt(n, 10);
    if (!mins || mins < 1) return "";
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

  // Title rendering mirrors blog-detail: trust author <span class="italic"> if
  // present, else split on a dash to italicise the trailing phrase.
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

  function coverUrlOf(p) { return (p.coverImage && p.coverImage.url) || ""; }
  function coverAltOf(p) { return (p.coverImage && p.coverImage.alt) || p.title || ""; }
  function publishedAtOf(p) { return p.publishedAt || ""; }
  function readingMinutesOf(p) { return p.readingTimeMinutes; }

  function featuredCardHtml(p) {
    var href = "/blog/" + esc(p.slug);
    var img = esc(coverUrlOf(p) || "/images/image-placeholder.svg");
    var alt = esc(coverAltOf(p));
    var titleHtml = renderTitleHtml(p.title || "Blog Post");
    var summary = esc(p.summary || "");
    var date = fmtDate(publishedAtOf(p));
    var category = esc(p.category || "");
    var read = readMinutesText(readingMinutesOf(p));
    var showMetaDotAfterCategory = !!(category && (read || date));
    var showMetaDotAfterRead = !!(read && date);
    return (
      '<a href="' + href + '" class="featured-article" data-reveal>' +
      '<div class="featured-media">' +
      '<img loading="lazy" decoding="async" src="' + img + '" alt="' + alt + '" />' +
      (category ? '<span class="featured-tag">' + category + "</span>" : "") +
      "</div>" +
      '<div class="featured-body">' +
      '<div class="featured-meta">' +
      (category ? "<span>\u2014 " + category + "</span>" : "") +
      (showMetaDotAfterCategory ? "<span>\u00b7</span>" : "") +
      (read ? "<span>" + read + "</span>" : "") +
      (showMetaDotAfterRead ? "<span>\u00b7</span>" : "") +
      (date ? "<span>" + date + "</span>" : "") +
      "</div>" +
      "<h3>" + titleHtml + "</h3>" +
      (summary ? "<p>" + summary + "</p>" : "") +
      "</div>" +
      "</a>"
    );
  }

  function postCardHtml(p) {
    var href = "/blog/" + esc(p.slug);
    var img = esc(coverUrlOf(p) || "/images/image-placeholder.svg");
    var alt = esc(coverAltOf(p));
    var titleHtml = renderTitleHtml(p.title || "Blog Post");
    var summary = esc(p.summary || "");
    var date = fmtDate(publishedAtOf(p));
    var category = esc(p.category || "");
    var read = readMinutesText(readingMinutesOf(p));
    return (
      '<a href="' + href + '" class="post-card" data-reveal>' +
      '<div class="post-media">' +
      '<img loading="lazy" decoding="async" src="' + img + '" alt="' + alt + '" />' +
      "</div>" +
      '<div class="post-body">' +
      '<div class="post-meta">' +
      (category ? "<span>" + category + "</span>" : "") +
      (category && read ? "<span>\u00b7</span>" : "") +
      (read ? "<span>" + read + "</span>" : "") +
      "</div>" +
      "<h3>" + titleHtml + "</h3>" +
      (summary ? "<p>" + summary + "</p>" : "") +
      (date ? '<span class="post-date">' + date + "</span>" : "") +
      "</div>" +
      "</a>"
    );
  }

  function postDateMs(p) {
    var d = publishedAtOf(p);
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

  function plainText(s) {
    var d = document.createElement("div");
    d.innerHTML = String(s == null ? "" : s);
    return (d.textContent || "").trim();
  }

  function siteOrigin() {
    var o = location.origin;
    if (o && o !== "null" && o.indexOf("file:") !== 0) return o;
    return "https://code-and-canvas.web.app";
  }

  function absoluteAssetUrl(url) {
    var origin = siteOrigin();
    if (!url) return origin + "/images/meta-webstudio-x-webflow-template.png";
    if (/^https?:\/\//i.test(url)) return url;
    return origin + (url.charAt(0) === "/" ? url : "/" + url);
  }

  function upsertMeta(attr, key, content) {
    if (!content) return;
    var sel = attr === "property"
      ? 'meta[property="' + key + '"]'
      : 'meta[name="' + key + '"]';
    var el = document.querySelector(sel);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }

  function upsertJsonLd(id, data) {
    var el = document.getElementById(id);
    if (!data) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
  }

  function syncBlogIndexSeo() {
    var latest = allPosts.length ? allPosts[0] : null;
    var canonical = siteOrigin() + "/blog";
    var description =
      "Articles, field notes and resources from Code & Canvas — a London & Dubai digital agency.";
    var pageTitle = "Blog | Code & Canvas";
    var ogTitle = "Blog | Code & Canvas";
    var ogDescription = description;
    var image = absoluteAssetUrl("");

    if (latest) {
      var seo = latest.seo || {};
      var articleTitle = plainText(seo.metaTitle || latest.title || "");
      var articleSummary = (seo.metaDescription || latest.summary || "").trim().slice(0, 300);
      if (articleTitle) ogTitle = articleTitle;
      if (articleSummary) {
        description = articleSummary;
        ogDescription = articleSummary;
      }
      image = absoluteAssetUrl((latest.coverImage && latest.coverImage.url) || "");
      if (articleTitle) {
        pageTitle = "Blog — Latest: " + articleTitle + " | Code & Canvas";
      }
    }

    document.title = pageTitle;
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", ogTitle);
    upsertMeta("property", "og:description", ogDescription);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:image", image);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", ogTitle);
    upsertMeta("name", "twitter:description", ogDescription);
    upsertMeta("name", "twitter:image", image);

    var origin = siteOrigin();
    var blogPost = allPosts.slice(0, 12).filter(function (p) { return p.slug; }).map(function (p) {
      var entry = {
        "@type": "BlogPosting",
        headline: plainText(p.title || ""),
        url: origin + "/blog/" + encodeURIComponent(p.slug),
      };
      if (p.publishedAt) {
        var raw = p.publishedAt;
        if (typeof raw === "object" && typeof raw.toDate === "function") raw = raw.toDate();
        var dt = raw instanceof Date ? raw : new Date(raw);
        if (!isNaN(dt.getTime())) entry.datePublished = dt.toISOString();
      }
      return entry;
    });

    upsertJsonLd("cc-blog-index-jsonld", {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Code & Canvas Blog",
      url: canonical,
      description: description,
      publisher: {
        "@type": "Organization",
        name: "Code & Canvas",
        url: origin,
        logo: { "@type": "ImageObject", url: origin + "/images/favicon.png" },
      },
      blogPost: blogPost,
    });
  }

  function applyFilters() {
    filteredPosts = getFilteredPosts();
    renderFilterSelect();
    renderCategories();
    renderFeatured();
    renderGrid();
    renderPagination();
    syncBlogIndexSeo();
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
      (prevDisabled ? " disabled" : "") + '>\u2190 Previous</button>' +
      '<div class="pg-pages">' + pages + "</div>" +
      '<button type="button" class="pg-btn cc-page-next' + (nextDisabled ? " is-disabled" : "") + '"' +
      (nextDisabled ? " disabled" : "") + '>Next \u2192</button>';

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
      .orderBy("publishedAt", "desc")
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
