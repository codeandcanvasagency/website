(function () {
  function esc(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function cardMarkup(p) {
    var href = "/projects/" + esc(p.slug);
    var img = esc(p.coverImageUrl || "/images/placeholder.jpg");
    var title = esc(p.title || "Project");
    var tagline = esc(p.tagline || "");
    var summary = esc(p.summary || "");
    return (
      '<div role="listitem" class="w-dyn-item">' +
      '<a href="' +
      href +
      '" class="content-link project-item w-inline-block">' +
      '<div class="image-wrapper project-item-image">' +
      '<img loading="lazy" src="' +
      img +
      '" alt="' +
      title +
      '" class="_w-h-100 fit-cover project-item-image"/>' +
      "</div>" +
      '<div class="project-item-content">' +
      '<div class="inner-container project-item-content---text">' +
      "<div>" +
      '<h2 class="display-4 color-neutral-100 mg-bottom-8px">' +
      title +
      "</h2>" +
      (tagline ? '<p class="text-400 medium color-neutral-300 mg-bottom-16px">' + tagline + "</p>" : "") +
      '<p class="color-neutral-400 mg-bottom-0">' +
      summary +
      "</p>" +
      "</div></div>" +
      '<div class="inner-container _54px">' +
      '<div class="line-rounded-icon link-icon">\ue145</div>' +
      "</div></div></a></div>"
    );
  }

  function renderList(container, options) {
    options = options || {};
    var limit = options.limit || 50;
    var featured = options.featured; // true | false | undefined
    var orderByField = options.orderBy || "sortOrder"; // "sortOrder" | "date"
    var orderDir = options.orderDir || (orderByField === "date" ? "desc" : "asc");
    if (!container || !window.firebase || !firebase.apps.length) {
      if (container)
        container.innerHTML =
          '<p class="color-neutral-400">Projects are loading… If this persists, configure Firebase in js/firebase-config.js.</p>';
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
            '<p class="color-neutral-400">No published projects yet. Use the admin tools to add work or run the one-time seed API.</p>';
          return;
        }
        container.innerHTML = "";
        snap.forEach(function (doc) {
          var data = doc.data();
          data.id = doc.id;
          container.insertAdjacentHTML("beforeend", cardMarkup(data));
        });
      })
      .catch(function (err) {
        console.error(err);
        container.innerHTML =
          '<p class="color-neutral-400">Could not load projects. Deploy Firestore indexes (firestore.indexes.json) and check the browser console.</p>';
      });
  }

  function slideCardMarkup(p) {
    var href = "/projects/" + esc(p.slug);
    var img = esc(p.coverImageUrl || "/images/placeholder.jpg");
    var title = esc(p.title || "Project");
    var tagline = esc(p.tagline || "");
    var summary = esc(p.summary || "");
    return (
      '<div class="cc-slide">' +
      '<a href="' + href + '" style="display:block;text-decoration:none;color:inherit">' +
      '<div class="cc-slide-img">' +
      '<img loading="lazy" src="' + img + '" alt="' + title + '"/>' +
      '</div>' +
      '<p class="color-neutral-100" style="white-space:normal;margin:16px 0 0"><strong>' + title + '</strong></p>' +
      (tagline ? '<p class="color-neutral-300" style="white-space:normal;margin:6px 0 0">' + tagline + '</p>' : '') +
      '<p class="color-neutral-400" style="white-space:normal;margin:8px 0 0">' + summary + '</p>' +
      '</a></div>'
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
        // Replace the entire .testimonial-slider div with a custom carousel
        var old = sliderSection.querySelector(".testimonial-slider");
        if (!old) return;
        var wrapper = document.createElement("div");
        wrapper.className = "cc-carousel-wrapper";
        var track = document.createElement("div");
        track.className = "cc-carousel-track";
        snap.forEach(function (doc) {
          var data = doc.data(); data.id = doc.id;
          track.insertAdjacentHTML("beforeend", slideCardMarkup(data));
        });
        wrapper.appendChild(track);
        // Original-style Webflow arrows outside the container
        var arrowRow = document.createElement("div");
        arrowRow.className = "cc-carousel-arrows";
        arrowRow.innerHTML =
          '<div class="cc-arrow-btn cc-arrow-left btn-circle-secondary circle-btn white"><div class="w-icon-slider-left"></div></div>' +
          '<div class="cc-arrow-btn cc-arrow-right btn-circle-secondary circle-btn white right"><div class="icon right w-icon-slider-left"></div></div>';
        wrapper.appendChild(arrowRow);
        old.replaceWith(wrapper);
        var btnL = arrowRow.querySelector(".cc-arrow-left");
        var btnR = arrowRow.querySelector(".cc-arrow-right");
        function slideWidth() {
          var first = track.querySelector(".cc-slide");
          if (!first) return 300;
          return first.offsetWidth + 24;
        }
        btnL.addEventListener("click", function () { track.scrollBy({ left: -slideWidth(), behavior: "smooth" }); });
        btnR.addEventListener("click", function () { track.scrollBy({ left: slideWidth(), behavior: "smooth" }); });
      })
      .catch(function (err) { console.error("slider load error", err); });
  }

  window.ccProjects = { renderList: renderList, renderSlider: renderSlider };
})();
