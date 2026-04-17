(function () {
  function esc(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function reviewSlideMarkup(r) {
    var heading = esc(r.heading || "");
    var body = esc(r.body || "");
    var clientName = esc(r.clientName || "");
    var clientIndustry = esc(r.clientIndustry || "");
    var avatarUrl = esc(r.avatarUrl || "/images/placeholder.jpg");
    return (
      '<div class="w-slide">' +
      '<div class="card testimonial-card">' +
      '<div class="inner-container _650px---tablet">' +
      '<div class="inner-container _874px">' +
      '<h3 class="heading-h1-size testimonial-heading"><em>"' + heading + '"</em></h3>' +
      '</div>' +
      '<div class="inner-container _874px text">' +
      '<div class="text-300 medium color-neutral-400">' + body + '</div>' +
      '</div>' +
      '<div class="inner-container _80 _100---mbl">' +
      '<div class="flex-horizontal start testimonial-card-content-bottom">' +
      '<div class="avatar-wrapper">' +
      '<img loading="lazy" src="' + avatarUrl + '" alt="' + clientName + '" class="avatar-circle _72px _56px---mbl"/>' +
      '</div>' +
      '<div>' +
      '<div class="text-400 bold color-neutral-100 mg-bottom-8px">' + clientName + '</div>' +
      '<div class="text-300 medium color-neutral-400">' + clientIndustry + '</div>' +
      '</div></div></div></div></div></div>'
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
        var mask = sliderSection.querySelector(".w-slider-mask");
        if (!mask) return;
        mask.innerHTML = "";
        snap.forEach(function (doc) {
          var data = doc.data();
          mask.insertAdjacentHTML("beforeend", reviewSlideMarkup(data));
        });
        try {
          if (window.jQuery) window.jQuery(window).trigger("resize");
          if (window.Webflow && window.Webflow.require) window.Webflow.require("slider").redraw();
        } catch (e) { /* noop */ }
      })
      .catch(function (err) {
        console.error("reviews load error", err);
      });
  }

  window.ccReviews = { renderReviews: renderReviews };
})();
