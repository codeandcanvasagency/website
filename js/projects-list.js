(function () {
  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function tagsMarkup(tags) {
    if (!tags || !tags.length) return "";
    var arr = (tags || []).slice(0, 4);
    return (
      '<div class="project-tags">' +
      arr.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") +
      "</div>"
    );
  }

  function cardMarkup(p) {
    var href = "/projects/" + esc(p.slug);
    var img = esc(p.coverImageUrl || "/images/image-placeholder.svg");
    var title = esc(p.title || "Project");
    var summary = esc(p.summary || p.tagline || "");
    return (
      '<a class="project-card" href="' + href + '" data-reveal>' +
      '<div class="project-card-img">' +
      '<img loading="lazy" decoding="async" src="' + img + '" alt="' + title + '" />' +
      "</div>" +
      '<div class="project-card-body">' +
      tagsMarkup(p.tags) +
      "<h3>" + title + "</h3>" +
      (summary ? '<p class="summary">' + summary + "</p>" : "") +
      '<span class="read-more">View case study <span class="arrow"></span></span>' +
      "</div>" +
      "</a>"
    );
  }

  function renderList(container, options) {
    options = options || {};
    var limit = options.limit || 50;
    var featured = options.featured;
    var orderByField = options.orderBy || "sortOrder";
    var orderDir = options.orderDir || (orderByField === "date" ? "desc" : "asc");
    if (!container || !window.firebase || !firebase.apps.length) {
      if (container)
        container.innerHTML =
          '<p class="text-mute">Projects are loading…</p>';
      return Promise.resolve();
    }
    var db = firebase.firestore();
    var q = db.collection("projects").where("published", "==", true);
    if (featured === true) q = q.where("featured", "==", true);
    if (featured === false) q = q.where("featured", "==", false);
    q = q.orderBy(orderByField, orderDir).limit(limit);
    return q.get()
      .then(function (snap) {
        if (snap.empty) {
          container.innerHTML =
            '<p class="text-mute">No published projects yet.</p>';
          return;
        }
        container.innerHTML = "";
        snap.forEach(function (doc) {
          var data = doc.data();
          data.id = doc.id;
          container.insertAdjacentHTML("beforeend", cardMarkup(data));
        });
        if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
          SiteUI.rebindAfterDynamicMount(container);
        }
      })
      .catch(function (err) {
        console.error(err);
        container.innerHTML =
          '<p class="text-mute">Could not load projects.</p>';
      });
  }

  function carouselCardMarkup(p) {
    var href = "/projects/" + esc(p.slug);
    var img = esc(p.coverImageUrl || "/images/image-placeholder.svg");
    var title = esc(p.title || "Project");
    var summary = esc(p.summary || p.tagline || "");
    return (
      '<a href="' + href + '" class="carousel-card">' +
      '<div class="img"><img loading="lazy" decoding="async" src="' + img + '" alt="' + title + '" /></div>' +
      '<div class="title">' + title + "</div>" +
      (summary ? '<p class="summary">' + summary + "</p>" : "") +
      "</a>"
    );
  }

  function renderSlider(sliderSection, options) {
    options = options || {};
    var limit = options.limit || 50;
    var featured = options.featured;
    var orderByField = options.orderBy || "date";
    var orderDir = options.orderDir || "desc";
    if (!sliderSection || !window.firebase || !firebase.apps.length) return Promise.resolve();
    var db = firebase.firestore();
    var q = db.collection("projects").where("published", "==", true);
    if (featured === true) q = q.where("featured", "==", true);
    if (featured === false) q = q.where("featured", "==", false);
    q = q.orderBy(orderByField, orderDir).limit(limit);
    return q.get()
      .then(function (snap) {
        if (snap.empty) { sliderSection.style.display = "none"; return; }
        var track =
          sliderSection.querySelector("[data-carousel-track]") ||
          sliderSection.querySelector("#latestTrack") ||
          sliderSection.querySelector(".carousel-track");
        if (!track) return;
        track.innerHTML = "";
        snap.forEach(function (doc) {
          var data = doc.data(); data.id = doc.id;
          track.insertAdjacentHTML("beforeend", carouselCardMarkup(data));
        });
        if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
          SiteUI.rebindAfterDynamicMount(sliderSection);
        }
      })
      .catch(function (err) { console.error("slider load error", err); });
  }

  window.ccProjects = { renderList: renderList, renderSlider: renderSlider };
})();
