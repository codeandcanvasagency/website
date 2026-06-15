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

  var SITE_ORIGIN = "https://code-and-canvas.web.app";

  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Trusted rich text (admin-authored). Used for paragraph/list/quote/callout
  // text where inline HTML such as <em>, <strong>, or <span class="italic"> is
  // allowed per the schema.
  function richText(s) {
    return String(s == null ? "" : s);
  }

  function getSlug() {
    var path = (location.pathname || "").replace(/\/$/, "");
    var prefix = "/blog/";
    if (path.indexOf(prefix) !== 0) return "";
    var rest = decodeURIComponent(path.slice(prefix.length));
    return rest.replace(/\.html$/, "");
  }

  function siteOrigin() {
    var o = location.origin;
    if (o && o !== "null" && o.indexOf("file:") !== 0) return o;
    return SITE_ORIGIN;
  }

  function plainText(s) {
    var d = document.createElement("div");
    d.innerHTML = String(s == null ? "" : s);
    return (d.textContent || "").trim();
  }

  function blogCanonicalUrl(slug) {
    return siteOrigin() + "/blog/" + encodeURIComponent(slug || "");
  }

  function absoluteAssetUrl(url) {
    var origin = siteOrigin();
    if (!url) return origin + "/images/meta-webstudio-x-webflow-template.png";
    if (/^https?:\/\//i.test(url)) return url;
    return origin + (url.charAt(0) === "/" ? url : "/" + url);
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

  function upsertCanonical(href) {
    if (!href) return;
    var el = document.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement("link");
      el.setAttribute("rel", "canonical");
      document.head.appendChild(el);
    }
    el.setAttribute("href", href);
  }

  function toIsoDate(value) {
    if (!value) return "";
    if (typeof value === "object" && typeof value.toDate === "function") {
      return value.toDate().toISOString();
    }
    if (value instanceof Date) return value.toISOString();
    var d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
    return "";
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

  function setBlogJsonLd(post, slug) {
    if (!post) {
      upsertJsonLd("cc-blog-article-jsonld", null);
      return;
    }
    var seo = post.seo || {};
    var headline = plainText(seo.metaTitle || post.title || "Article");
    var description = (seo.metaDescription || post.summary || "").trim().slice(0, 500);
    var canonical = blogCanonicalUrl(slug);
    var cover = post.coverImage || {};
    var image = absoluteAssetUrl(cover.url);
    var datePublished = toIsoDate(post.publishedAt);
    var dateModified = toIsoDate(post.updatedAt) || datePublished;
    var author = post.author || {};
    var authorNode = author.name
      ? {
          "@type": "Person",
          name: author.name,
          url: author.linkedinUrl || undefined,
        }
      : {
          "@type": "Organization",
          name: "Code & Canvas",
          url: siteOrigin(),
        };
    if (authorNode.url === undefined) delete authorNode.url;

    var publisher = {
      "@type": "Organization",
      name: "Code & Canvas",
      url: siteOrigin(),
      logo: {
        "@type": "ImageObject",
        url: siteOrigin() + "/images/favicon.png",
      },
    };

    var data = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: headline,
      description: description,
      image: [image],
      url: canonical,
      mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
      author: authorNode,
      publisher: publisher,
    };
    if (datePublished) data.datePublished = datePublished;
    if (dateModified) data.dateModified = dateModified;
    upsertJsonLd("cc-blog-article-jsonld", data);
  }

  function shareTweetText(post) {
    var title = plainText(post.title || "");
    var summary = plainText(post.summary || "");
    if (!summary) return title;
    var room = 240 - title.length;
    if (room < 24) return title;
    if (summary.length > room) summary = summary.slice(0, room - 1).trim() + "\u2026";
    return title + " \u2014 " + summary;
  }

  function setShareMeta(post, slug) {
    var seo = post.seo || {};
    var title = plainText(seo.metaTitle || post.title || "Article");
    var desc = (seo.metaDescription || post.summary || "").trim();
    var pageTitle = title ? title + " | Code & Canvas" : "Blog | Code & Canvas";
    var url = blogCanonicalUrl(slug);
    var cover = post.coverImage || {};
    var image = absoluteAssetUrl(cover.url);

    document.title = pageTitle;
    upsertMeta("name", "description", desc);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", desc);
    upsertMeta("property", "og:type", "article");
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:image", image);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", desc);
    upsertMeta("name", "twitter:image", image);
    upsertCanonical(url);
  }

  function fmtDate(d) {
    if (window.ccBlogCard && ccBlogCard.fmtDate) return ccBlogCard.fmtDate(d);
    if (!d) return "";
    var raw = d;
    if (typeof d === "object" && typeof d.toDate === "function") raw = d.toDate();
    var dt = raw instanceof Date ? raw : new Date(raw);
    if (isNaN(dt.getTime())) return String(d);
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return dt.getDate() + " " + months[dt.getMonth()] + " " + dt.getFullYear();
  }

  function readMinutesText(n) {
    var mins = parseInt(n, 10);
    if (!mins || mins < 1) return "";
    return mins + " minute" + (mins === 1 ? "" : "s");
  }

  // Title rendering: trust author markup if they wrap the italic portion in
  // <span class="italic">…</span>; otherwise split on a dash separator so the
  // trailing phrase renders italic with a trailing period (matches design).
  function renderTitleHtml(title) {
    var t = String(title == null ? "" : title);
    if (/<span\s+class\s*=\s*["']italic["']/i.test(t)) return t;
    var sep = / [\u2014\u2013\-] /; // em-dash / en-dash / hyphen, space-padded
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

  function tagsHtml(tags) {
    if (!Array.isArray(tags) || !tags.length) return "";
    return (
      '<div class="article-tags">' +
      tags.slice(0, 4).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") +
      "</div>"
    );
  }

  function articleStatRow(label, valueHtml) {
    if (!valueHtml) return "";
    return (
      '<div class="stat">' +
      '<span class="stat-label">' + esc(label) + "</span>" +
      '<span class="stat-value">' + valueHtml + "</span>" +
      "</div>"
    );
  }

  function articleStatsHtml(p) {
    var rows = [];
    if (p.category) rows.push(articleStatRow("Category", esc(p.category)));
    if (Array.isArray(p.tags) && p.tags.length) {
      rows.push(articleStatRow("Tags", tagsHtml(p.tags)));
    }
    var date = fmtDate(p.publishedAt);
    if (date) rows.push(articleStatRow("Published", esc(date)));
    var read = readMinutesText(p.readingTimeMinutes);
    if (read) rows.push(articleStatRow("Read time", esc(read)));
    if (!rows.length) return "";
    return '<div class="detail-stats" data-reveal>' + rows.join("") + "</div>";
  }

  function shareRowHtml(url, tweetText) {
    var linkedin =
      "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url);
    var x =
      "https://twitter.com/intent/tweet?text=" +
      encodeURIComponent(tweetText) +
      "&url=" +
      encodeURIComponent(url);
    return (
      '<div class="toc-share">' +
        '<span class="cm-label">Share</span>' +
        '<div class="share-row">' +
          '<a href="' + linkedin + '" data-share="linkedin" target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.34 17.34H5.67V9.67h2.67v7.67zM7 8.5a1.55 1.55 0 1 1 0-3.1 1.55 1.55 0 0 1 0 3.1zm11.34 8.84h-2.67v-3.74c0-.89-.02-2.04-1.24-2.04-1.24 0-1.43.97-1.43 1.97v3.81h-2.67V9.67h2.56v1.05h.04c.36-.68 1.23-1.4 2.53-1.4 2.71 0 3.21 1.78 3.21 4.1v3.92z"/></svg></a>' +
          '<a href="' + x + '" data-share="x" target="_blank" rel="noopener noreferrer" aria-label="Share on X"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.53 3H20.5l-6.5 7.43L21.5 21h-5.95l-4.66-6.1L5.5 21H2.5l6.95-7.95L2 3h6.1l4.21 5.56L17.53 3z"/></svg></a>' +
          '<a href="#" data-share="copy" aria-label="Copy link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg></a>' +
        "</div>" +
      "</div>"
    );
  }

  function tocHtml(toc, bodySections, shareUrl, tweetText) {
    var entries = Array.isArray(toc) && toc.length
      ? toc.filter(function (t) { return t && t.id && t.label; })
      : (Array.isArray(bodySections)
          ? bodySections
              .filter(function (s) { return s && s.id && s.heading; })
              .map(function (s) { return { id: s.id, label: s.heading }; })
          : []);
    if (!entries.length) return "";
    var items = entries
      .map(function (t) { return '<li><a href="#' + esc(t.id) + '">' + esc(t.label) + "</a></li>"; })
      .join("");
    return (
      '<aside class="article-toc" data-article-toc>' +
        '<span class="cm-label">In this article</span>' +
        "<ol>" + items + "</ol>" +
        shareRowHtml(shareUrl, tweetText) +
      "</aside>"
    );
  }

  function blockHtml(b) {
    if (!b || !b.type) return "";
    switch (b.type) {
      case "lead":
        return '<p class="lead-para">' + richText(b.text) + "</p>";
      case "paragraph":
        return "<p>" + richText(b.text) + "</p>";
      case "subheading":
        return "<h3>" + esc(b.text) + "</h3>";
      case "list":
        var items = (b.items || []).map(function (it) { return "<li>" + richText(it) + "</li>"; }).join("");
        return b.style === "number" ? "<ol>" + items + "</ol>" : "<ul>" + items + "</ul>";
      case "quote": {
        var cite = String(b.cite || "").trim();
        var isStudioCite = /^code\s*&\s*canvas$/i.test(cite);
        return (
          "<blockquote>" +
            "<p>" + richText(b.text) + "</p>" +
            (cite && !isStudioCite ? "<cite>" + esc(cite) + "</cite>" : "") +
          "</blockquote>"
        );
      }
      case "callout":
        return "";
      case "image":
        if (!b.url) return "";
        return (
          '<figure class="article-figure">' +
            '<img data-img-state loading="lazy" decoding="async" src="' + esc(b.url) + '" alt="' + esc(b.alt || "") + '" />' +
            (b.caption ? "<figcaption>" + esc(b.caption) + "</figcaption>" : "") +
          "</figure>"
        );
      default:
        return "";
    }
  }

  function sectionHtml(s) {
    if (!s) return "";
    var blocks = (s.blocks || []).map(blockHtml).join("");
    var heading = s.heading
      ? '<h2 id="' + esc(s.id || "") + '">' + esc(s.heading) + "</h2>"
      : "";
    if (!heading && !blocks) return "";
    return (
      '<section class="article-section">' +
      heading +
      (blocks ? '<div class="article-section-body">' + blocks + "</div>" : "") +
      "</section>"
    );
  }

  var BLOG_FINAL_CTA = {
    title: "Launching soon?",
    text: "From UX and storefront design to engineering and launch support, we help brands go live with fewer gaps and better foundations.",
    primaryUrl: "/contact",
  };

  function ctaLinkAttrs(url) {
    var href = url || "/contact";
    var attrs = ' href="' + esc(href) + '"';
    if (/^https?:\/\//i.test(href)) attrs += ' target="_blank" rel="noopener noreferrer"';
    return attrs;
  }

  function ctaConfig(raw, defaults) {
    if (raw === false || (raw && raw.enabled === false)) return null;
    var c = raw && typeof raw === "object" ? raw : {};
    return {
      eyebrow: c.eyebrow || c.label || defaults.eyebrow,
      title: c.title || c.heading || defaults.title,
      text: c.text || c.body || c.description || defaults.text,
      primaryLabel: c.primaryLabel || c.buttonLabel || c.ctaLabel || defaults.primaryLabel,
      primaryUrl: c.primaryUrl || c.buttonUrl || c.ctaUrl || c.url || defaults.primaryUrl,
      secondaryLabel: c.secondaryLabel || defaults.secondaryLabel,
      secondaryUrl: c.secondaryUrl || defaults.secondaryUrl,
    };
  }

  function ctaActionsHtml(c) {
    var secondary = c.secondaryLabel && c.secondaryUrl
      ? '<a class="btn btn-ghost"' + ctaLinkAttrs(c.secondaryUrl) + ">" + esc(c.secondaryLabel) + "</a>"
      : "";
    return (
      '<div class="article-cta-actions">' +
        '<a class="btn btn-primary"' + ctaLinkAttrs(c.primaryUrl) + ">" +
          esc(c.primaryLabel || "Start a project") +
          '<span class="arrow"></span>' +
        "</a>" +
        secondary +
      "</div>"
    );
  }

  function articleCtaHtml(raw, defaults, variant) {
    var c = ctaConfig(raw, defaults);
    if (!c) return "";
    return (
      '<aside class="article-cta article-cta-' + esc(variant) + '" data-reveal>' +
        '<div class="article-cta-copy">' +
          (c.eyebrow ? '<span class="cm-label">' + esc(c.eyebrow) + "</span>" : "") +
          (c.title ? "<h3>" + renderTitleHtml(c.title) + "</h3>" : "") +
          (c.text ? "<p>" + esc(c.text) + "</p>" : "") +
        "</div>" +
        ctaActionsHtml(c) +
      "</aside>"
    );
  }

  function finalCtaHtml() {
    return (
      '<section class="section section--cta-tight article-final-cta" aria-label="Start a project">' +
        '<div class="container">' +
          '<div class="cta-inline cta-inline--flush" data-reveal>' +
            '<h2 class="display-2">' + esc(BLOG_FINAL_CTA.title) + "</h2>" +
            "<p>" + esc(BLOG_FINAL_CTA.text) + "</p>" +
            '<a class="btn btn-primary"' + ctaLinkAttrs(BLOG_FINAL_CTA.primaryUrl) + ">" +
              "Let's chat" +
              '<span class="arrow"></span>' +
            "</a>" +
          "</div>" +
        "</div>" +
      "</section>"
    );
  }

  function bodyHtml(sections) {
    if (!Array.isArray(sections) || !sections.length) return "";
    return sections.map(sectionHtml).join("");
  }

  function authorHtml(author) {
    return "";
  }

  function relatedCardHtml(r) {
    var ci = r.coverImage || {};
    var href = "/blog/" + esc(r.slug || "");
    var img = esc(ci.url || "/images/image-placeholder.svg");
    var alt = esc(ci.alt || r.title || "");
    var titleHtml = renderTitleHtml(r.title || "");
    var summary = esc(r.summary || "");
    var metaHtml = window.ccBlogCard ? ccBlogCard.metaHtml(r) : "";
    return (
      '<a href="' + href + '" class="post-card" data-reveal>' +
        '<div class="post-media">' +
          '<img data-img-state loading="lazy" decoding="async" src="' + img + '" alt="' + alt + '" />' +
        "</div>" +
        '<div class="post-body">' +
          "<h3>" + titleHtml + "</h3>" +
          (summary ? "<p>" + summary + "</p>" : "") +
          metaHtml +
        "</div>" +
      "</a>"
    );
  }

  function relatedHtml(related) {
    return "";
  }

  function copyShareLink(url, btn) {
    function markCopied() {
      btn.classList.add("is-copied");
      btn.setAttribute("aria-label", "Link copied");
      setTimeout(function () {
        btn.classList.remove("is-copied");
        btn.setAttribute("aria-label", "Copy link");
      }, 2000);
    }
    function fallbackCopy() {
      var input = document.createElement("input");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand("copy");
        markCopied();
      } catch (err) {
        window.prompt("Copy this link:", url);
      }
      document.body.removeChild(input);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(markCopied).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  }

  function wireShare(root, url) {
    root.querySelectorAll('[data-share="copy"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        copyShareLink(url, a);
      });
    });
  }

  function render(p, slug) {
    var root = document.getElementById("blog-detail-root");
    if (!root) return;

    setShareMeta(p, slug);
    setBlogJsonLd(p, slug);

    var coverImg = p.coverImage || {};
    var cover = coverImg.url || "/images/image-placeholder.svg";
    var coverAlt = coverImg.alt || p.title || "";
    var titleHtml = renderTitleHtml(p.title || "Blog Post");
    var author = p.author || {};
    preloadImage(cover, "high");
    if (author.avatarUrl) preloadImage(author.avatarUrl, "high");

    root.innerHTML =
      '<div class="reading-progress" data-reading-progress></div>' +
      '<article class="article">' +
        '<section class="page-hero detail-hero">' +
          '<div class="container">' +
            '<a href="/blog" class="back-link">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 18l-6-6 6-6"/></svg>' +
              "All articles</a>" +
            '<div class="detail-hero-layout">' +
              '<div class="detail-hero-copy" data-reveal>' +
                "<h1>" + titleHtml + "</h1>" +
                (p.summary ? '<p class="lead">' + esc(p.summary) + "</p>" : "") +
              "</div>" +
              '<div class="detail-cover" data-reveal>' +
                '<img data-img-state loading="eager" fetchpriority="high" decoding="async" src="' + esc(cover) + '" alt="' + esc(coverAlt) + '" />' +
              "</div>" +
              articleStatsHtml(p) +
            "</div>" +
          "</div>" +
        "</section>" +
        '<section class="article-body-section article-body-light">' +
          '<div class="container">' +
            '<div class="article-layout">' +
              '<div class="article-prose">' + bodyHtml(p.body) + "</div>" +
            "</div>" +
          "</div>" +
        "</section>" +
        authorHtml(author) +
      "</article>" +
      finalCtaHtml() +
      relatedHtml(p.related);

    bindImageLoadStates(root);

    if (window.SiteUI && SiteUI.rebindArticle) {
      SiteUI.rebindArticle(root);
    }

  }

  function notFound(root) {
    root.innerHTML =
      '<div class="container" style="padding:120px 0"><p class="text-mute">Article not found.</p>' +
      '<a href="/blog" class="btn btn-secondary">Back to blog</a></div>';
  }

  function run() {
    var slug = getSlug();
    var root = document.getElementById("blog-detail-root");
    if (!root) return;

    if (!slug) { notFound(root); return; }

    if (!window.firebase || !firebase.apps.length) {
      root.innerHTML =
        '<div class="container" style="padding:120px 0"><p class="text-mute">Configure Firebase.</p></div>';
      return;
    }

    root.innerHTML = '<div class="container" style="padding:120px 0"><p class="text-mute">Loading\u2026</p></div>';

    var db = firebase.firestore();
    db.collection("blog_posts")
      .where("slug", "==", slug)
      .where("published", "==", true)
      .limit(1)
      .get()
      .then(function (snap) {
        if (snap.empty) { notFound(root); return; }
        render(snap.docs[0].data(), slug);
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
