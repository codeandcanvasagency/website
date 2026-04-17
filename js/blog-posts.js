(function () {
  function esc(s) {
    if (!s) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function blogCardMarkup(p) {
    var href = "/blog/" + esc(p.slug);
    var img = esc(p.coverImageUrl || "/images/placeholder.jpg");
    var title = esc(p.title || "Blog Post");
    var summary = esc(p.summary || "");
    var category = esc(p.category || "");
    return (
      '<div class="cc-slide">' +
      '<a href="' + href + '" style="display:block;text-decoration:none;color:inherit">' +
      '<div class="cc-slide-img">' +
      '<img loading="lazy" src="' + img + '" alt="' + title + '"/>' +
      '</div>' +
      (category ? '<p style="white-space:normal;margin:12px 0 0"><span class="badge-secondary small transparent">' + category + '</span></p>' : '') +
      '<p class="color-neutral-100" style="white-space:normal;margin:8px 0 0"><strong>' + title + '</strong></p>' +
      '<p class="color-neutral-400" style="white-space:normal;margin:8px 0 0">' + summary + '</p>' +
      '</a></div>'
    );
  }

  function renderBlogCarousel(container) {
    if (!container || !window.firebase || !firebase.apps.length) return Promise.resolve();
    var db = firebase.firestore();
    return db.collection("blog_posts")
      .where("published", "==", true)
      .orderBy("date", "desc")
      .limit(12)
      .get()
      .then(function (snap) {
        if (snap.empty) { container.innerHTML = ""; return; }
        var wrapper = document.createElement("div");
        wrapper.className = "cc-carousel-wrapper";
        var track = document.createElement("div");
        track.className = "cc-carousel-track";
        snap.forEach(function (doc) {
          var data = doc.data();
          data.id = doc.id;
          track.insertAdjacentHTML("beforeend", blogCardMarkup(data));
        });
        wrapper.appendChild(track);
        var arrowRow = document.createElement("div");
        arrowRow.className = "cc-carousel-arrows";
        arrowRow.innerHTML =
          '<div class="cc-arrow-btn cc-arrow-left btn-circle-secondary circle-btn white"><div class="w-icon-slider-left"></div></div>' +
          '<div class="cc-arrow-btn cc-arrow-right btn-circle-secondary circle-btn white right"><div class="icon right w-icon-slider-left"></div></div>';
        wrapper.appendChild(arrowRow);
        container.innerHTML = "";
        container.appendChild(wrapper);
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
      .catch(function (err) { console.error("blog load error", err); });
  }

  window.ccBlog = { renderBlogCarousel: renderBlogCarousel };
})();
