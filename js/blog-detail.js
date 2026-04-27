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
    var prefix = "/blog/";
    if (path.indexOf(prefix) !== 0) return "";
    var rest = decodeURIComponent(path.slice(prefix.length));
    return rest.replace(/\.html$/, "");
  }

  function setMetaTitle(title) {
    document.title = title ? title + " | Code & Canvas" : "Blog | Code & Canvas";
    var og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute("content", document.title);
  }

  function fmtDate(d) {
    if (!d) return "";
    var raw = d;
    if (typeof d === "object" && typeof d.toDate === "function") raw = d.toDate();
    var dt = raw instanceof Date ? raw : new Date(raw);
    if (isNaN(dt.getTime())) return String(d);
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return dt.getDate() + " " + months[dt.getMonth()] + " " + dt.getFullYear();
  }

  function readMinutes(p) {
    if (p.readMinutes) return Math.max(1, parseInt(p.readMinutes, 10) || 1) + " minutes";
    if (p.readTime) return String(p.readTime);
    var body = String(p.body || p.bodyHtml || p.content || p.summary || "");
    if (!body) return "";
    var text = body.replace(/<[^>]+>/g, " ");
    var words = text.split(/\s+/).filter(Boolean).length;
    var mins = Math.max(1, Math.round(words / 220));
    return mins + " minutes";
  }

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);
  }

  function buildBodyAndToc(p) {
    var html = p.bodyHtml || "";
    if (!html && p.body) {
      var paragraphs = String(p.body)
        .split(/\n{2,}/)
        .map(function (para) { return "<p>" + esc(para.trim()) + "</p>"; });
      html = paragraphs.join("\n");
    }
    if (!html) return { html: "", toc: [] };

    var template = document.createElement("template");
    template.innerHTML = html;
    var headings = template.content.querySelectorAll("h2");
    var toc = [];
    var idx = 0;
    headings.forEach(function (h) {
      idx++;
      var text = (h.textContent || "").trim();
      if (!h.id) h.id = slugify(text) || ("section-" + idx);
      var marker = document.createElement("span");
      marker.className = "marker";
      marker.textContent = "— " + (idx < 10 ? "0" + idx : idx);
      h.insertBefore(marker, h.firstChild);
      toc.push({ id: h.id, text: text });
    });
    return { html: template.innerHTML, toc: toc };
  }

  function tagsMarkup(p) {
    var parts = [];
    if (Array.isArray(p.tags)) parts = p.tags.slice(0, 4);
    else if (p.category) parts = [p.category];
    if (!parts.length) return "";
    return (
      '<div class="article-tags">' +
      parts.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") +
      "</div>"
    );
  }

  function tocMarkup(toc) {
    if (!toc || !toc.length) return "";
    var items = toc
      .map(function (t) { return '<li><a href="#' + esc(t.id) + '">' + esc(t.text) + "</a></li>"; })
      .join("");
    return (
      '<aside class="article-toc" data-article-toc>' +
      '<span class="cm-label">In this article</span>' +
      "<ol>" + items + "</ol>" +
      '<div class="toc-share">' +
      '<span class="cm-label">Share</span>' +
      '<div class="share-row">' +
      '<a href="#" data-share="linkedin" aria-label="Share on LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.34 17.34H5.67V9.67h2.67v7.67zM7 8.5a1.55 1.55 0 1 1 0-3.1 1.55 1.55 0 0 1 0 3.1zm11.34 8.84h-2.67v-3.74c0-.89-.02-2.04-1.24-2.04-1.24 0-1.43.97-1.43 1.97v3.81h-2.67V9.67h2.56v1.05h.04c.36-.68 1.23-1.4 2.53-1.4 2.71 0 3.21 1.78 3.21 4.1v3.92z"/></svg></a>' +
      '<a href="#" data-share="x" aria-label="Share on X"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.53 3H20.5l-6.5 7.43L21.5 21h-5.95l-4.66-6.1L5.5 21H2.5l6.95-7.95L2 3h6.1l4.21 5.56L17.53 3z"/></svg></a>' +
      '<a href="#" data-share="copy" aria-label="Copy link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg></a>' +
      "</div></div>" +
      "</aside>"
    );
  }

  function authorMarkup(p) {
    var author = p.author || "";
    var role = p.authorRole || "";
    var bio = p.authorBio || "";
    var img = p.authorAvatarUrl || "";
    if (!author && !bio && !img) return "";
    return (
      '<section class="author-section">' +
      '<div class="container">' +
      '<div class="author-card" data-reveal>' +
      '<div class="author-portrait">' +
      (img ? '<img loading="lazy" decoding="async" src="' + esc(img) + '" alt="' + esc(author) + '" />' : "") +
      "</div>" +
      '<div class="author-body">' +
      '<span class="cm-label">— About the author</span>' +
      "<h3>" + esc(author) + (role ? ' <span class="italic">— ' + esc(role) + ".</span>" : "") + "</h3>" +
      (bio ? "<p>" + esc(bio) + "</p>" : "") +
      '<div class="author-links">' +
      '<a href="/blog" class="btn btn-secondary">Read more articles <span class="arrow"></span></a>' +
      "</div>" +
      "</div></div></div></section>"
    );
  }

  function relatedCardHtml(p) {
    var href = "/blog/" + esc(p.slug);
    var img = esc(p.coverImageUrl || "/images/image-placeholder.svg");
    var title = esc(p.title || "Blog Post");
    var summary = esc(p.summary || "");
    var date = fmtDate(p.date);
    var category = esc(p.category || "");
    var read = readMinutes(p);
    return (
      '<a href="' + href + '" class="post-card" data-reveal>' +
      '<div class="post-media"><img loading="lazy" decoding="async" src="' + img + '" alt="' + title + '" /></div>' +
      '<div class="post-body">' +
      '<div class="post-meta">' +
      (category ? "<span>" + category + "</span>" : "") +
      (category && read ? "<span>·</span>" : "") +
      (read ? "<span>" + read + "</span>" : "") +
      "</div>" +
      "<h3>" + title + "</h3>" +
      (summary ? "<p>" + summary + "</p>" : "") +
      (date ? '<span class="post-date">' + date + "</span>" : "") +
      "</div></a>"
    );
  }

  function loadRelated(currentDoc, category) {
    var root = document.getElementById("blog-related-root");
    if (!root) return Promise.resolve();
    if (!window.firebase || !firebase.apps.length) return Promise.resolve();
    var db = firebase.firestore();
    var q = db.collection("blog_posts").where("published", "==", true);
    if (category) q = q.where("category", "==", category);
    return q.orderBy("date", "desc").limit(4).get()
      .then(function (snap) {
        if (snap.empty) { root.innerHTML = ""; return; }
        var cards = [];
        snap.forEach(function (doc) {
          if (doc.id === currentDoc) return;
          var d = doc.data();
          d.id = doc.id;
          cards.push(d);
        });
        cards = cards.slice(0, 3);
        if (!cards.length) { root.innerHTML = ""; return; }
        root.innerHTML =
          '<section class="related-section">' +
          '<div class="container">' +
          '<div class="section-head">' +
          '<span class="label">— Keep reading</span>' +
          '<h2>Related <span class="italic">articles.</span></h2>' +
          '<a href="/blog" class="btn btn-secondary">All articles <span class="arrow"></span></a>' +
          "</div>" +
          '<div class="blog-list-grid">' +
          cards.map(relatedCardHtml).join("") +
          "</div></div></section>";
        if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
          SiteUI.rebindAfterDynamicMount(root);
        }
      })
      .catch(function (err) { console.error("related load error", err); });
  }

  function render(p, docId) {
    var root = document.getElementById("blog-detail-root");
    if (!root) return;

    setMetaTitle(p.title);
    var desc = document.querySelector('meta[name="description"]');
    if (desc && p.summary) desc.setAttribute("content", p.summary);

    var cover = p.coverImageUrl || "/images/image-placeholder.svg";
    var date = fmtDate(p.date);
    var read = readMinutes(p);
    var built = buildBodyAndToc(p);

    root.innerHTML =
      '<div class="reading-progress" data-reading-progress></div>' +
      '<article class="article">' +
      '<section class="article-hero">' +
      '<div class="container">' +
      '<a href="/blog" class="back-link">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 18l-6-6 6-6"/></svg>' +
      "All articles</a>" +
      tagsMarkup(p) +
      "<h1>" + esc(p.title || "Blog Post") + "</h1>" +
      (p.summary ? '<p class="article-deck">' + esc(p.summary) + "</p>" : "") +
      '<div class="article-byline">' +
      (p.author
        ? '<div class="byline-author">' +
            (p.authorAvatarUrl
              ? '<span class="avatar"><img loading="lazy" decoding="async" src="' + esc(p.authorAvatarUrl) + '" alt="' + esc(p.author) + '"/></span>'
              : "") +
            "<div>" +
            '<span class="byline-name">' + esc(p.author) + "</span>" +
            (p.authorRole ? '<span class="byline-role">' + esc(p.authorRole) + "</span>" : "") +
            "</div></div>"
        : "") +
      '<div class="byline-meta">' +
      (date ? '<div class="bm-row"><span class="cm-label">Published</span><span>' + esc(date) + "</span></div>" : "") +
      (read ? '<div class="bm-row"><span class="cm-label">Read time</span><span>' + esc(read) + "</span></div>" : "") +
      "</div>" +
      "</div>" +
      "</div>" +
      "</section>" +
      '<div class="container">' +
      '<div class="article-cover">' +
      '<img loading="lazy" decoding="async" src="' + esc(cover) + '" alt="' + esc(p.title || "") + '" />' +
      "</div>" +
      "</div>" +
      '<section class="article-body-section">' +
      '<div class="container">' +
      '<div class="article-layout">' +
      tocMarkup(built.toc) +
      '<div class="article-prose">' + built.html + "</div>" +
      "</div></div></section>" +
      authorMarkup(p) +
      "</article>" +
      '<div id="blog-related-root"></div>';

    if (window.SiteUI && SiteUI.rebindArticle) {
      SiteUI.rebindArticle(root);
    }

    // Wire share buttons
    root.querySelectorAll("[data-share]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var kind = a.getAttribute("data-share");
        var url = location.href;
        var title = document.title;
        if (kind === "linkedin") {
          window.open("https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url), "_blank", "noopener");
        } else if (kind === "x") {
          window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(title) + "&url=" + encodeURIComponent(url), "_blank", "noopener");
        } else if (kind === "copy") {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url);
          }
        }
      });
    });

    loadRelated(docId, p.category);
  }

  function run() {
    var slug = getSlug();
    var root = document.getElementById("blog-detail-root");
    if (!root) return;

    if (!slug) {
      root.innerHTML =
        '<div class="container" style="padding:120px 0"><p class="text-mute">Article not found.</p>' +
        '<a href="/blog" class="btn btn-secondary">Back to blog</a></div>';
      return;
    }

    if (!window.firebase || !firebase.apps.length) {
      root.innerHTML =
        '<div class="container" style="padding:120px 0"><p class="text-mute">Configure Firebase.</p></div>';
      return;
    }

    root.innerHTML = '<div class="container" style="padding:120px 0"><p class="text-mute">Loading…</p></div>';

    var db = firebase.firestore();
    db.collection("blog_posts")
      .where("slug", "==", slug)
      .where("published", "==", true)
      .limit(1)
      .get()
      .then(function (snap) {
        if (snap.empty) {
          root.innerHTML =
            '<div class="container" style="padding:120px 0"><p class="text-mute">Article not found.</p>' +
            '<a href="/blog" class="btn btn-secondary">Back to blog</a></div>';
          return;
        }
        var doc = snap.docs[0];
        render(doc.data(), doc.id);
      })
      .catch(function (e) {
        console.error(e);
        root.innerHTML =
          '<div class="container" style="padding:120px 0"><p class="text-mute">Could not load article.</p></div>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
