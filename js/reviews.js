(function () {
  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function reviewCardMarkup(r) {
    var heading = esc(r.heading || "");
    var body = esc(r.body || "");
    var clientName = esc(r.clientName || "");
    var clientIndustry = esc(r.clientIndustry || "");
    var avatarUrl = esc(r.avatarUrl || "");
    var avatar = avatarUrl
      ? '<img loading="lazy" decoding="async" src="' + avatarUrl + '" alt="' + clientName + '" />'
      : "";
    return (
      '<div class="t-card">' +
      (heading ? '<h3 class="t-quote">' + heading + "</h3>" : "") +
      (body ? '<p class="t-body">' + body + "</p>" : "") +
      '<div class="t-author">' +
      '<div class="t-avatar">' + avatar + "</div>" +
      "<div>" +
      '<div class="t-name">' + clientName + "</div>" +
      '<div class="t-role">' + clientIndustry + "</div>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderReviews(sliderSection) {
    if (!sliderSection || !window.firebase || !firebase.apps.length) return Promise.resolve();
    var db = firebase.firestore();
    return db.collection("reviews")
      .where("published", "==", true)
      .orderBy("sortOrder", "asc")
      .get()
      .then(function (snap) {
        if (snap.empty) return;
        var track =
          sliderSection.querySelector("[data-testimonial-track]") ||
          sliderSection.querySelector("#tTrack") ||
          sliderSection.querySelector(".t-track");
        if (!track) return;
        track.innerHTML = "";
        snap.forEach(function (doc) {
          var data = doc.data();
          track.insertAdjacentHTML("beforeend", reviewCardMarkup(data));
        });
        if (window.SiteUI && SiteUI.refreshTestimonials) {
          var rootEl = sliderSection.matches && sliderSection.matches("[data-testimonials]")
            ? sliderSection
            : sliderSection.querySelector("[data-testimonials]") || sliderSection;
          SiteUI.refreshTestimonials(rootEl);
        } else {
          sliderSection.dispatchEvent(new CustomEvent("dots:render", { bubbles: true }));
        }
      })
      .catch(function (err) {
        console.error("reviews load error", err);
      });
  }

  window.ccReviews = { renderReviews: renderReviews };
})();
