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
    var img = esc(p.coverImageUrl || "/images/image-placeholder.svg");
    var title = esc(p.title || "Project");
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
      '<h2 class="display-4 color-neutral-100 mg-bottom-16px">' +
      title +
      "</h2>" +
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
    if (!container || !window.firebase || !firebase.apps.length) {
      if (container)
        container.innerHTML =
          '<p class="color-neutral-400">Projects are loading… If this persists, configure Firebase in js/firebase-config.js.</p>';
      return Promise.resolve();
    }
    var db = firebase.firestore();
    return db
      .collection("projects")
      .where("published", "==", true)
      .orderBy("sortOrder", "asc")
      .limit(limit)
      .get()
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

  window.ccProjects = { renderList: renderList };
})();
