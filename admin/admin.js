(function () {
  var auth, db, storage;

  function $(id) {
    return document.getElementById(id);
  }

  function show(el, on) {
    if (!el) return;
    el.style.display = on ? "" : "none";
  }

  function initFirebase() {
    var cfg = window.__FIREBASE_CONFIG__;
    if (!cfg || !cfg.apiKey || cfg.apiKey === "REPLACE_ME") {
      $("auth-error").textContent =
        "Configure ../js/firebase-config.js with your Firebase web app keys.";
      return false;
    }
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();
    return true;
  }

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function collectionGalleryUrls() {
    var ta = $("galleryUrls");
    return ta.value
      .split(/\n/)
      .map(function (u) {
        return u.trim();
      })
      .filter(Boolean);
  }

  function fillForm(data, id) {
    $("editId").value = id || "";
    $("slug").value = data.slug || "";
    $("slug").readOnly = !!id;
    $("title").value = data.title || "";
    $("tagline").value = data.tagline || "";
    $("summary").value = data.summary || "";
    $("coverImageUrl").value = data.coverImageUrl || "";
    $("client").value = data.client || "";
    $("objective").value = data.objective || "";
    $("deliverables").value = data.deliverables || "";
    $("duration").value = data.duration || "";
    $("sortOrder").value = data.sortOrder != null ? String(data.sortOrder) : "0";
    $("published").checked = !!data.published;
    $("bodyHtml").value = data.bodyHtml || "";
    $("galleryUrls").value = (data.galleryUrls || []).join("\n");
  }

  function readForm() {
    return {
      slug: slugify($("slug").value) || slugify($("title").value),
      title: $("title").value.trim(),
      tagline: $("tagline").value.trim(),
      summary: $("summary").value.trim(),
      coverImageUrl: $("coverImageUrl").value.trim(),
      client: $("client").value.trim(),
      objective: $("objective").value.trim(),
      deliverables: $("deliverables").value.trim(),
      duration: $("duration").value.trim(),
      sortOrder: Number($("sortOrder").value) || 0,
      published: $("published").checked,
      bodyHtml: $("bodyHtml").value,
      galleryUrls: collectionGalleryUrls(),
    };
  }

  async function ensureAdminUser(user) {
    try {
      var snap = await db.collection("admins").doc(user.uid).get();
      return snap.exists;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async function refreshList() {
    var ul = $("projectList");
    ul.innerHTML = "";
    var snap = await db.collection("projects").orderBy("sortOrder", "asc").get();
    snap.forEach(function (doc) {
      var d = doc.data();
      var li = document.createElement("li");
      li.innerHTML =
        "<strong>" +
        (d.title || doc.id) +
        "</strong> <code>/" +
        (d.slug || doc.id) +
        "</code>" +
        (d.published ? " · live" : " · draft");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Edit";
      btn.onclick = function () {
        fillForm(d, doc.id);
      };
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  async function uploadCover(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var user = auth.currentUser;
    if (!user) return;
    var slug = slugify($("slug").value) || "draft-" + user.uid;
    var path = "portfolio/" + slug + "/cover-" + Date.now() + "-" + file.name.replace(/\s/g, "_");
    var ref = storage.ref(path);
    $("uploadStatus").textContent = "Uploading…";
    try {
      await ref.put(file);
      var url = await ref.getDownloadURL();
      $("coverImageUrl").value = url;
      $("uploadStatus").textContent = "Uploaded.";
    } catch (e) {
      console.error(e);
      $("uploadStatus").textContent = "Upload failed. Check Storage rules and admin document.";
    }
  }

  async function saveProject(ev) {
    ev.preventDefault();
    $("saveStatus").textContent = "";
    var payload = readForm();
    if (!payload.slug || !payload.title) {
      $("saveStatus").textContent = "Slug and title are required.";
      return;
    }
    var editId = $("editId").value;
    var docId = editId || payload.slug;
    try {
      await db
        .collection("projects")
        .doc(docId)
        .set(
          {
            ...payload,
            slug: payload.slug,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      $("saveStatus").textContent = "Saved.";
      $("editId").value = docId;
      await refreshList();
    } catch (e) {
      console.error(e);
      $("saveStatus").textContent = "Save failed: " + (e.message || e);
    }
  }

  async function signIn(ev) {
    ev.preventDefault();
    $("auth-error").textContent = "";
    $("firstSetupMsg").textContent = "";
    var email = $("email").value.trim();
    var password = $("password").value;
    try {
      var cred = await auth.signInWithEmailAndPassword(email, password);
      var ok = await ensureAdminUser(cred.user);
      if (!ok) {
        show($("loginPanel"), false);
        show($("firstSetupPanel"), true);
        show($("adminPanel"), false);
        return;
      }
      show($("loginPanel"), false);
      show($("firstSetupPanel"), false);
      show($("adminPanel"), true);
      await refreshList();
    } catch (e) {
      $("auth-error").textContent = e.message || String(e);
    }
  }

  async function completeFirstSetup() {
    $("firstSetupMsg").textContent = "";
    $("firstSetupMsg").className = "ok";
    var user = auth.currentUser;
    if (!user) {
      $("firstSetupMsg").className = "err";
      $("firstSetupMsg").textContent = "Sign in first.";
      return;
    }
    try {
      var token = await user.getIdToken();
      var r = await fetch("/api/bootstrap-admin", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      var data = await r.json().catch(function () {
        return {};
      });
      if (!r.ok || !data.ok) {
        $("firstSetupMsg").className = "err";
        $("firstSetupMsg").textContent =
          data.message || data.error || "Setup failed (HTTP " + r.status + ").";
        return;
      }
      $("firstSetupMsg").textContent = "Done. Loading…";
      show($("firstSetupPanel"), false);
      show($("adminPanel"), true);
      await refreshList();
    } catch (e) {
      $("firstSetupMsg").className = "err";
      $("firstSetupMsg").textContent = e.message || String(e);
    }
  }

  async function signOut() {
    await auth.signOut();
    show($("loginPanel"), true);
    show($("firstSetupPanel"), false);
    show($("adminPanel"), false);
  }

  function newProject() {
    fillForm({}, "");
    $("slug").value = "";
    $("slug").readOnly = false;
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!initFirebase()) return;
    $("loginForm").addEventListener("submit", signIn);
    $("logoutBtn").addEventListener("click", signOut);
    $("btnFirstAdmin").addEventListener("click", completeFirstSetup);
    $("btnFirstSetupSignOut").addEventListener("click", signOut);
    $("projectForm").addEventListener("submit", saveProject);
    $("newBtn").addEventListener("click", newProject);
    $("coverFile").addEventListener("change", uploadCover);
    $("slugAuto").addEventListener("click", function () {
      $("slug").value = slugify($("title").value);
    });

    auth.onAuthStateChanged(async function (user) {
      if (!user) {
        show($("loginPanel"), true);
        show($("firstSetupPanel"), false);
        show($("adminPanel"), false);
        return;
      }
      var ok = await ensureAdminUser(user);
      if (!ok) {
        show($("loginPanel"), false);
        show($("firstSetupPanel"), true);
        show($("adminPanel"), false);
        return;
      }
      show($("loginPanel"), false);
      show($("firstSetupPanel"), false);
      show($("adminPanel"), true);
      await refreshList();
    });
  });
})();
