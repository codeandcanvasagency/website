(function () {
  /** Timestamp, ISO string, or number → comparable millis */
  function projectDateMillis(p) {
    var d = p && p.date;
    if (!d && d !== 0) return 0;
    if (typeof d.toMillis === "function") return d.toMillis();
    if (typeof d === "number") return d;
    if (typeof d === "string") {
      var t = Date.parse(d);
      return isNaN(t) ? 0 : t;
    }
    return 0;
  }

  function sortProjectsByDateDesc(arr) {
    return arr.slice().sort(function (a, b) {
      return projectDateMillis(b) - projectDateMillis(a);
    });
  }

  function docsFromSnap(snap) {
    var out = [];
    snap.forEach(function (doc) {
      var data = doc.data();
      data.id = doc.id;
      out.push(data);
    });
    return out;
  }

  function isIndexError(err) {
    var msg = (err && (err.message || (err.toString && err.toString()))) || "";
    return /requires an index/i.test(msg) || /failed precondition/i.test(msg);
  }

  /**
   * Manual order via sortOrder, with date as tie-breaker.
   */
  function sortBySortOrder(arr) {
    return arr.slice().sort(function (a, b) {
      var ao = (a && typeof a.sortOrder === "number") ? a.sortOrder : Number(a && a.sortOrder);
      var bo = (b && typeof b.sortOrder === "number") ? b.sortOrder : Number(b && b.sortOrder);
      if (!isFinite(ao)) ao = 999999;
      if (!isFinite(bo)) bo = 999999;
      if (ao !== bo) return ao - bo;
      return projectDateMillis(b) - projectDateMillis(a);
    });
  }

  function mergeFeaturedThenLatest(featuredRows, nonFeaturedRows) {
    return sortBySortOrder(featuredRows).concat(sortBySortOrder(nonFeaturedRows));
  }

  /**
   * Fallback: single published query then partition + sort.
   */
  function mergeFromAllPublished(rows) {
    var feat = [];
    var rest = [];
    rows.forEach(function (p) {
      if (p.featured === true) feat.push(p);
      else rest.push(p);
    });
    return mergeFeaturedThenLatest(feat, rest);
  }

  function fetchCombinedHomeList(db) {
    var col = db.collection("projects");
    var qFeat = col
      .where("published", "==", true)
      .where("featured", "==", true)
      .orderBy("sortOrder", "asc")
      .limit(80);
    var qRecent = col
      .where("published", "==", true)
      .orderBy("date", "desc")
      .limit(150);
    return Promise.all([qFeat.get(), qRecent.get()])
      .then(function (pair) {
        var featured = docsFromSnap(pair[0]);
        var recent = docsFromSnap(pair[1]);
        var seen = {};
        featured.forEach(function (p) {
          seen[p.id] = true;
        });
        var rest = [];
        recent.forEach(function (p) {
          if (!seen[p.id]) rest.push(p);
        });
        return mergeFeaturedThenLatest(featured, rest);
      })
      .catch(function (err) {
        if (!isIndexError(err)) throw err;
        return col
          .where("published", "==", true)
          .orderBy("sortOrder", "asc")
          .limit(200)
          .get()
          .then(function (snap) {
            return mergeFromAllPublished(docsFromSnap(snap));
          });
      });
  }

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

  function tileMarkup(p) {
    var href = "/projects/" + esc(p.slug);
    var img = esc(p.coverImageUrl || "/images/image-placeholder.svg");
    var title = esc(p.title || "Project");
    return (
      '<a class="project-tile" href="' + href + '" data-reveal>' +
      '<div class="project-tile-img">' +
      '<img loading="lazy" decoding="async" src="' + img + '" alt="' + title + '" />' +
      "</div>" +
      '<div class="project-tile-body">' +
      "<h3>" + title + "</h3>" +
      '<span class="project-tile-cta">View case study <span class="arrow"></span></span>' +
      "</div>" +
      "</a>"
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
    var layout = options.layout || "cards";
    var orderByField = options.orderBy || "sortOrder";
    var orderDir = options.orderDir || (orderByField === "date" ? "desc" : "asc");
    if (!container || !window.firebase || !firebase.apps.length) {
      if (container)
        container.innerHTML =
          '<p class="text-mute">Projects are loading…</p>';
      return Promise.resolve();
    }
    var db = firebase.firestore();
    var base = db.collection("projects").where("published", "==", true);
    if (featured === true) base = base.where("featured", "==", true);
    if (featured === false) base = base.where("featured", "==", false);

    function run(orderField, dir) {
      return base.orderBy(orderField, dir).limit(limit).get();
    }

    return run(orderByField, orderDir)
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
          container.insertAdjacentHTML("beforeend", layout === "tiles" ? tileMarkup(data) : cardMarkup(data));
        });
        if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
          SiteUI.rebindAfterDynamicMount(container);
        }
      })
      .catch(function (err) {
        // If the chosen orderBy requires an index (common), fall back to a stable field.
        if (isIndexError(err) && orderByField !== "sortOrder") {
          return run("sortOrder", "asc")
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
                container.insertAdjacentHTML("beforeend", layout === "tiles" ? tileMarkup(data) : cardMarkup(data));
              });
              if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
                SiteUI.rebindAfterDynamicMount(container);
              }
            })
            .catch(function (err2) {
              console.error(err2);
              container.innerHTML =
                '<p class="text-mute">Could not load projects.</p>';
            });
        }

        console.error(err);
        container.innerHTML =
          '<p class="text-mute">Could not load projects.</p>';
      });
  }

  function renderProjectsIndex(container, options) {
    options = options || {};
    var limit = options.limit || 50;
    var layout = options.layout || "tiles";
    if (!container || !window.firebase || !firebase.apps.length) {
      if (container)
        container.innerHTML =
          '<p class="text-mute">Projects are loading…</p>';
      return Promise.resolve();
    }
    var db = firebase.firestore();
    container.innerHTML = '<p class="text-mute">Projects are loading…</p>';
    return fetchCombinedHomeList(db)
      .then(function (combined) {
        if (!combined.length) {
          container.innerHTML =
            '<p class="text-mute">No published projects yet.</p>';
          return;
        }
        var rows = combined.slice(0, limit);
        container.innerHTML = "";
        rows.forEach(function (p) {
          container.insertAdjacentHTML(
            "beforeend",
            layout === "tiles" ? tileMarkup(p) : cardMarkup(p),
          );
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

  /**
   * Home featured grid: featured first, then the rest (both by sortOrder).
   * Initial visible count `initialCount`, then +`step` per "Show more".
   * Resolves to doc ids for the first `reserveExclude` rows (carousel excludes these).
   */
  function renderHomeFeatured(gridEl, buttonMountEl, options) {
    options = options || {};
    var initial = options.initialCount || 8;
    var step = options.step || 4;
    var reserveExclude = options.reserveExclude || 8;

    if (!gridEl || !window.firebase || !firebase.apps.length) {
      if (gridEl)
        gridEl.innerHTML =
          '<p class="text-mute">Projects are loading…</p>';
      return Promise.resolve([]);
    }
    if (!buttonMountEl) {
      return Promise.resolve([]);
    }

    var db = firebase.firestore();
    gridEl.innerHTML = '<p class="text-mute">Projects are loading…</p>';
    buttonMountEl.innerHTML = "";

    return fetchCombinedHomeList(db)
      .then(function (combined) {
        if (!combined.length) {
          gridEl.innerHTML =
            '<p class="text-mute">No published projects yet.</p>';
          return [];
        }

        var shown = Math.min(initial, combined.length);

        function appendTiles(start, end) {
          for (var i = start; i < end; i++) {
            gridEl.insertAdjacentHTML(
              "beforeend",
              tileMarkup(combined[i]),
            );
          }
        }

        gridEl.innerHTML = "";
        appendTiles(0, shown);

        if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
          SiteUI.rebindAfterDynamicMount(gridEl);
        }

        function syncButton() {
          if (shown >= combined.length) {
            buttonMountEl.innerHTML =
              '<a href="/projects" class="btn btn-primary home-projects-more-btn">' +
              "Show all projects " +
              '<span class="arrow"></span></a>';
          } else {
            buttonMountEl.innerHTML =
              '<button type="button" class="btn btn-ghost home-projects-more-btn" id="cc-home-projects-more-btn">' +
              "Show more</button>";
            var btn = document.getElementById("cc-home-projects-more-btn");
            if (btn) {
              btn.addEventListener("click", function () {
                var next = Math.min(shown + step, combined.length);
                appendTiles(shown, next);
                shown = next;
                if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
                  SiteUI.rebindAfterDynamicMount(gridEl);
                }
                syncButton();
              });
            }
          }
        }

        syncButton();

        var excludeIds = [];
        var n = Math.min(reserveExclude, combined.length);
        for (var e = 0; e < n; e++) {
          excludeIds.push(combined[e].id);
        }
        return excludeIds;
      })
      .catch(function (err) {
        console.error(err);
        gridEl.innerHTML =
          '<p class="text-mute">Could not load projects.</p>';
        return [];
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
    var excludeIds = options.excludeIds || [];
    var excludeSet = {};
    excludeIds.forEach(function (id) {
      if (id) excludeSet[id] = true;
    });
    var orderByField = options.orderBy || "date";
    var orderDir = options.orderDir || "desc";
    if (!sliderSection || !window.firebase || !firebase.apps.length)
      return Promise.resolve();
    var db = firebase.firestore();

    function fillTrackFromSnap(snap, maxCards) {
      var track =
        sliderSection.querySelector("[data-carousel-track]") ||
        sliderSection.querySelector("#latestTrack") ||
        sliderSection.querySelector(".carousel-track");
      if (!track) return 0;
      track.innerHTML = "";
      var added = 0;
      snap.forEach(function (doc) {
        if (added >= maxCards) return;
        if (excludeSet[doc.id]) return;
        var data = doc.data();
        data.id = doc.id;
        track.insertAdjacentHTML("beforeend", carouselCardMarkup(data));
        added++;
      });
      return added;
    }

    function runSliderQuery(q) {
      return q.get().then(function (snap) {
        if (snap.empty) {
          sliderSection.style.display = "none";
          return;
        }
        var added = fillTrackFromSnap(snap, limit);
        if (!added) {
          sliderSection.style.display = "none";
          return;
        }
        sliderSection.style.display = "";
        if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
          SiteUI.rebindAfterDynamicMount(sliderSection);
        }
      });
    }

    var base = db.collection("projects").where("published", "==", true);

    // Home “Latest”: all published by date, skipping ids shown in the top grid slots.
    if (excludeIds.length) {
      var fetchCap = Math.max(limit * 5, 48);
      var qExc = base.orderBy(orderByField, orderDir).limit(fetchCap);
      return runSliderQuery(qExc).catch(function (err) {
        if (!isIndexError(err)) {
          console.error("slider load error", err);
          return;
        }
        var qFb = base.orderBy("sortOrder", "asc").limit(fetchCap);
        return runSliderQuery(qFb);
      });
    }

    var q = base;
    if (featured === true) q = q.where("featured", "==", true);
    if (featured === false) q = q.where("featured", "==", false);
    q = q.orderBy(orderByField, orderDir).limit(limit);
    return q
      .get()
      .then(function (snap) {
        if (snap.empty) {
          sliderSection.style.display = "none";
          return;
        }
        var track =
          sliderSection.querySelector("[data-carousel-track]") ||
          sliderSection.querySelector("#latestTrack") ||
          sliderSection.querySelector(".carousel-track");
        if (!track) return;
        track.innerHTML = "";
        snap.forEach(function (doc) {
          var data = doc.data();
          data.id = doc.id;
          track.insertAdjacentHTML("beforeend", carouselCardMarkup(data));
        });
        if (window.SiteUI && SiteUI.rebindAfterDynamicMount) {
          SiteUI.rebindAfterDynamicMount(sliderSection);
        }
      })
      .catch(function (err) {
        console.error("slider load error", err);
      });
  }

  window.ccProjects = {
    renderList: renderList,
    renderProjectsIndex: renderProjectsIndex,
    renderSlider: renderSlider,
    renderHomeFeatured: renderHomeFeatured,
  };
})();
