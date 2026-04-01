(function () {
  function esc(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function getSlug() {
    var path = location.pathname.replace(/\/$/, "") || "";
    var prefix = "/projects/";
    if (!path.startsWith(prefix)) return "";
    return decodeURIComponent(path.slice(prefix.length));
  }

  function setMetaTitle(title) {
    document.title = title ? title + " | Code & Canvas" : "Project | Code & Canvas";
    var og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute("content", document.title);
  }

  function statBlock(label, value) {
    if (!value) return "";
    label = esc(label);
    value = esc(value);
    return (
      '<div class="w-layout-grid grid-1-column subgrid-1-column v1">' +
      '<div class="text-400 medium color-neutral-600">' +
      label +
      "</div>" +
      '<div class="text-400 medium color-neutral-800">' +
      value +
      "</div></div>"
    );
  }

  function renderGallery(urls) {
    if (!urls || !urls.length) return "";
    var items = urls
      .map(function (u) {
        return (
          '<div role="listitem" class="w-dyn-item w-dyn-repeater-item"><div>' +
          '<img loading="lazy" alt="" class="_w-h-100" src="' +
          esc(u) +
          '"/>' +
          "</div></div>"
        );
      })
      .join("");
    return (
      '<div role="list" class="grid-1-column project-result-gallery w-dyn-items">' +
      items +
      "</div>"
    );
  }

  function render(p) {
    var root = document.getElementById("project-detail-root");
    if (!root) return;

    setMetaTitle(p.title);

    var desc = document.querySelector('meta[name="description"]');
    if (desc && p.summary) desc.setAttribute("content", p.summary);

    var cover = p.coverImageUrl || "/images/image-placeholder.svg";
    var stats =
      statBlock("Client", p.client) +
      statBlock("Objective", p.objective) +
      statBlock("Deliverables", p.deliverables) +
      statBlock("Duration", p.duration);

    var bodySection = "";
    if (p.bodyHtml) {
      bodySection =
        '<div class="inner-container _1012px center">' +
        '<div class="mg-bottom-32px"><div class="inner-container _804px">' +
        '<div class="rich-text-with-display-heading w-richtext">' +
        p.bodyHtml +
        "</div></div></div></div>";
    }

    var gallerySection = "";
    if (p.galleryUrls && p.galleryUrls.length === 1) {
      gallerySection =
        '<div class="inner-container _1012px center mg-top-48px">' +
        '<img loading="lazy" alt="" class="_w-h-100 fit-cover" src="' +
        esc(p.galleryUrls[0]) +
        '"/></div>';
    } else if (p.galleryUrls && p.galleryUrls.length > 1) {
      gallerySection =
        '<div class="w-layout-grid grid-2-columns project-result-grid mg-top-48px">' +
        '<div class="height-100"><img loading="lazy" alt="" class="_w-h-100 fit-cover" src="' +
        esc(p.galleryUrls[0]) +
        '"/></div>' +
        '<div class="w-dyn-list">' +
        renderGallery(p.galleryUrls.slice(1)) +
        "</div></div>";
    }

    root.innerHTML =
      '<section class="section hero v10">' +
      '<div class="container-default w-container">' +
      '<div class="position-relative z-index-1">' +
      '<div class="mg-bottom-118px">' +
      '<a href="/projects" class="back-link"><span class="line-rounded-icon">&#xe184;</span> All Projects</a>' +
      "</div>" +
      '<div class="inner-container _966px">' +
      '<div class="inner-container _600px---mbl">' +
      '<h1 class="color-neutral-100 display-1 mg-bottom-12px">' +
      esc(p.title) +
      "</h1>" +
      (p.tagline
        ? '<p class="text-400 medium color-neutral-400 mg-bottom-8px">' +
          esc(p.tagline) +
          "</p>"
        : "") +
      '<div class="inner-container _700px">' +
      '<p class="color-neutral-300 mg-bottom-0">' +
      esc(p.summary || "") +
      "</p>" +
      "</div></div></div>" +
      '<div class="mg-top-64px"><div class="portfolio-featured-image-wrapper">' +
      '<img loading="lazy" alt="' +
      esc(p.title) +
      '" src="' +
      esc(cover) +
      '" class="portfolio-featured-image"/>' +
      "</div></div></div></div>" +
      '<div class="floating-circle _380px top-right---v2"></div>' +
      '<div class="floating-circle _380px bottom-left---v2"></div>' +
      '<div class="half-bg-bottom portfolio-single-bg"></div>' +
      "</section>" +
      '<section class="section pd-top-100px">' +
      '<div class="container-default w-container">' +
      '<div class="w-layout-grid grid-4-columns portfolio-stats">' +
      stats +
      "</div>" +
      (stats ? '<div class="divider v1"></div>' : "") +
      bodySection +
      gallerySection +
      "</div></section>";
  }

  function run() {
    var slug = getSlug();
    if (!slug) {
      location.href = "/projects";
      return;
    }
    var root = document.getElementById("project-detail-root");
    if (!root) return;

    if (!window.firebase || !firebase.apps.length) {
      root.innerHTML =
        '<div class="container-default w-container pd-top-150px"><p class="color-neutral-400">Configure Firebase in js/firebase-config.js.</p></div>';
      return;
    }

    root.innerHTML =
      '<div class="container-default w-container pd-top-150px"><p class="color-neutral-400">Loading…</p></div>';

    var db = firebase.firestore();
    db.collection("projects")
      .where("slug", "==", slug)
      .where("published", "==", true)
      .limit(1)
      .get()
      .then(function (snap) {
        if (snap.empty) {
          root.innerHTML =
            '<div class="container-default w-container pd-top-150px"><p class="color-neutral-400">Project not found.</p><a href="/projects" class="w-button">Back to projects</a></div>';
          return;
        }
        render(snap.docs[0].data());
      })
      .catch(function (e) {
        console.error(e);
        root.innerHTML =
          '<div class="container-default w-container pd-top-150px"><p class="color-neutral-400">Could not load project. Deploy Firestore indexes if you have not yet.</p></div>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
