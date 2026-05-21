(function () {
  var auth, db, storage;
  var companiesCache = [];
  var authorsCache = [];

  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.style.display = on ? "" : "none"; }

  function initFirebase() {
    var cfg = window.__FIREBASE_CONFIG__;
    if (!cfg || !cfg.apiKey || cfg.apiKey === "REPLACE_ME") {
      $("auth-error").textContent = "Configure ../js/firebase-config.js with your Firebase web app keys.";
      return false;
    }
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();
    return true;
  }

  function slugify(s) {
    return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function snippet(text, max) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    return text.length <= max ? text : text.slice(0, max - 1) + "\u2026";
  }

  function mergeTime(d) {
    var u = d.updatedAt;
    if (u && typeof u.toMillis === "function") return u.toMillis();
    if (u && u.seconds != null) return u.seconds * 1000;
    return 0;
  }

  function pickCanonicalRow(items) {
    if (items.length === 1) return items[0];
    var byId = items.find(function (x) { return x.doc.id === (x.d.slug || "").trim(); });
    if (byId) return byId;
    return items.slice().sort(function (a, b) { return mergeTime(b.d) - mergeTime(a.d); })[0];
  }

  function slugPatternOk(s) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s); }

  function getCompanyById(id) {
    return companiesCache.find(function (c) { return c.id === id; });
  }

  function populateCompanyDropdowns() {
    var selectors = [$("projectCompany"), $("reviewCompany")];
    selectors.forEach(function (sel) {
      if (!sel) return;
      var cur = sel.value;
      sel.innerHTML = '<option value="">\u2014 select a company \u2014</option>';
      companiesCache.forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name + (c.industry ? " \u2014 " + c.industry : "");
        sel.appendChild(opt);
      });
      sel.value = cur;
    });
  }

  // ─── Generic modal helpers ───
  function openModal(id) {
    var m = $(id);
    if (!m) return;
    m.hidden = false;
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeModal(id) {
    var m = $(id);
    if (!m) return;
    m.hidden = true;
    m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  // ═══════════════════════════════════
  //  COMPANIES
  // ═══════════════════════════════════
  function fillCompanyForm(data, id) {
    $("companyEditId").value = id || "";
    $("companyName").value = data.name || "";
    $("companyIndustry").value = data.industry || "";
    $("companyLogoUrl").value = data.logoUrl || "";
    var f = $("companyLogoFile"); if (f) f.value = "";
  }

  function openNewCompanyModal() {
    fillCompanyForm({}, "");
    $("companyModalTitle").textContent = "New company";
    $("btnDeleteCompany").hidden = true;
    openModal("companyModal");
    $("companySaveStatus").textContent = "";
    setTimeout(function () { $("companyName").focus(); }, 0);
  }

  function openEditCompanyModal(data, docId) {
    fillCompanyForm(data, docId);
    $("companyModalTitle").textContent = "Edit company";
    $("btnDeleteCompany").hidden = false;
    openModal("companyModal");
    $("companySaveStatus").textContent = "";
    setTimeout(function () { $("companyName").focus(); }, 0);
  }

  async function saveCompany() {
    $("companySaveStatus").textContent = "";
    $("companySaveStatus").className = "ok";
    var name = $("companyName").value.trim();
    if (!name) {
      $("companySaveStatus").textContent = "Company name is required.";
      $("companySaveStatus").className = "err";
      return;
    }
    var payload = {
      name: name,
      industry: $("companyIndustry").value.trim(),
      logoUrl: $("companyLogoUrl").value.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    var editId = $("companyEditId").value;
    var docId = editId || slugify(name);
    try {
      await db.collection("companies").doc(docId).set(payload, { merge: true });
      $("companySaveStatus").textContent = "Saved.";
      $("companyEditId").value = docId;
      $("companyModalTitle").textContent = "Edit company";
      $("btnDeleteCompany").hidden = false;
      await refreshCompanies();
    } catch (e) {
      console.error(e);
      $("companySaveStatus").textContent = "Save failed: " + (e.message || e);
      $("companySaveStatus").className = "err";
    }
  }

  async function deleteCompany() {
    var editId = $("companyEditId").value;
    if (!editId) return;
    if (!confirm("Delete this company permanently? Projects and reviews linked to it will keep their data but lose the link.")) return;
    try {
      await db.collection("companies").doc(editId).delete();
      closeModal("companyModal");
      await refreshCompanies();
    } catch (e) {
      $("companySaveStatus").textContent = "Delete failed: " + (e.message || e);
      $("companySaveStatus").className = "err";
    }
  }

  async function uploadCompanyLogo(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file || !auth.currentUser) return;
    var name = $("companyName").value.trim() || "company";
    var path = "companies/" + slugify(name) + "/logo-" + Date.now() + "-" + file.name.replace(/\s/g, "_");
    $("companyUploadStatus").textContent = "Uploading\u2026";
    try {
      var ref = storage.ref(path);
      await ref.put(file);
      $("companyLogoUrl").value = await ref.getDownloadURL();
      $("companyUploadStatus").textContent = "Uploaded.";
    } catch (e) {
      console.error("Company logo upload error:", e);
      $("companyUploadStatus").textContent = "Upload failed: " + (e.message || e.code || "unknown error");
    }
  }

  function buildCompanyCard(doc, data, onEdit) {
    var card = document.createElement("article");
    card.className = "project-card";
    var thumb = document.createElement("div");
    thumb.className = "project-card-thumb";
    if (data.logoUrl) {
      var img = document.createElement("img");
      img.src = data.logoUrl; img.alt = ""; img.loading = "lazy";
      thumb.appendChild(img);
    }
    var body = document.createElement("div");
    body.className = "project-card-body";
    var h3 = document.createElement("h3");
    h3.className = "project-card-title";
    h3.textContent = data.name || doc.id;
    var meta = document.createElement("div");
    meta.className = "project-card-meta";
    meta.textContent = data.industry || "";
    var btn = document.createElement("button");
    btn.type = "button"; btn.textContent = "Edit"; btn.onclick = onEdit;
    body.appendChild(h3);
    body.appendChild(meta);
    body.appendChild(btn);
    card.appendChild(thumb);
    card.appendChild(body);
    return card;
  }

  async function refreshCompanies() {
    var list = $("companyList");
    var empty = $("companiesEmpty");
    if (list) list.innerHTML = "";
    companiesCache = [];
    var snap = await db.collection("companies").orderBy("name").get();
    snap.forEach(function (doc) {
      var d = doc.data();
      companiesCache.push({ id: doc.id, name: d.name || "", industry: d.industry || "", logoUrl: d.logoUrl || "" });
      var card = buildCompanyCard(doc, d, function () { openEditCompanyModal(d, doc.id); });
      if (list) list.appendChild(card);
    });
    if (empty) empty.hidden = companiesCache.length > 0;
    populateCompanyDropdowns();
  }

  // ═══════════════════════════════════
  //  PROJECTS
  // ═══════════════════════════════════
  var modalDocPublished = false;
  var projectDnDWired = false;

  function getProjectListIds(containerId) {
    var el = $(containerId);
    if (!el) return [];
    return Array.prototype.map
      .call(el.querySelectorAll(".project-card[data-project-id]"), function (c) {
        return c.getAttribute("data-project-id");
      })
      .filter(Boolean);
  }

  function wireProjectDragDropOnce() {
    if (projectDnDWired) return;
    projectDnDWired = true;
    ["projectListFeatured", "projectListNotFeatured"].forEach(function (cid) {
      var el = $(cid);
      if (!el) return;
      el.addEventListener("dragenter", function (e) {
        e.preventDefault();
      });
      el.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        el.classList.add("drag-over");
      });
      el.addEventListener("dragleave", function (e) {
        if (!el.contains(e.relatedTarget)) el.classList.remove("drag-over");
      });
      el.addEventListener("drop", onProjectZoneDrop);
    });
  }

  async function persistFeaturedBuckets(featIds, plainIds) {
    var batch = db.batch();
    var ts = firebase.firestore.FieldValue.serverTimestamp();
    featIds.forEach(function (id, i) {
      batch.update(db.collection("projects").doc(id), {
        featured: true,
        sortOrder: i,
        updatedAt: ts,
      });
    });
    plainIds.forEach(function (id) {
      batch.update(db.collection("projects").doc(id), {
        featured: false,
        updatedAt: ts,
      });
    });
    await batch.commit();
  }

  async function onProjectZoneDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    var zoneEl = e.currentTarget;
    zoneEl.classList.remove("drag-over");
    var zone =
      zoneEl.getAttribute("data-drop-zone") ||
      (zoneEl.id === "projectListFeatured" ? "featured" : "notFeatured");
    var docId = (e.dataTransfer && e.dataTransfer.getData("text/plain")) || "";
    docId = String(docId).trim();
    if (!docId) return;

    var beforeEl = e.target.closest && e.target.closest(".project-card[data-project-id]");
    var insertBeforeId = null;
    if (beforeEl && zoneEl.contains(beforeEl)) {
      insertBeforeId = beforeEl.getAttribute("data-project-id");
      if (insertBeforeId === docId) {
        var next = beforeEl.nextElementSibling;
        insertBeforeId =
          next && next.classList && next.classList.contains("project-card")
            ? next.getAttribute("data-project-id")
            : null;
      }
    }

    var metaEl = $("projectListMeta");
    try {
      var feat = getProjectListIds("projectListFeatured");
      var plain = getProjectListIds("projectListNotFeatured");
      feat = feat.filter(function (id) {
        return id !== docId;
      });
      plain = plain.filter(function (id) {
        return id !== docId;
      });
      if (zone === "featured") {
        var idx = insertBeforeId ? feat.indexOf(insertBeforeId) : feat.length;
        if (idx < 0) idx = feat.length;
        feat.splice(idx, 0, docId);
      } else {
        var idx2 = insertBeforeId ? plain.indexOf(insertBeforeId) : plain.length;
        if (idx2 < 0) idx2 = plain.length;
        plain.splice(idx2, 0, docId);
      }
      await persistFeaturedBuckets(feat, plain);
      await refreshList();
      if (metaEl) {
        var cur = (metaEl.textContent || "").trim();
        metaEl.textContent = cur ? cur + " \u2014 Featured order saved." : "Featured order saved.";
      }
    } catch (err) {
      console.error(err);
      if (metaEl) {
        metaEl.textContent = "Could not save order: " + (err.message || String(err));
        metaEl.className = "list-meta err";
      }
    }
  }

  // ─── JSON view sync state ───
  var EMPTY_PROJECT_TEMPLATE = {
    companyId: "",
    slug: "",
    title: "",
    tagline: "",
    summary: "",
    coverImageUrl: "",
    objective: "",
    deliverables: "",
    duration: "",
    featured: false,
    date: "",
    sortOrder: 0,
    caseBrief: "",
    caseDelivered: "",
    caseOutcome: "",
    bodyHtml: "",
    galleryUrls: [],
  };
  var jsonSyncing = false;          // guard to prevent form↔JSON loops
  var jsonSyncTimer = null;         // debounce: form → JSON
  var jsonParseTimer = null;        // debounce: JSON → form
  var lastEditedSide = "form";      // "form" | "json"
  var originalProjectData = null;   // snapshot for "Discard changes"
  var pendingSavePublished = null;  // remembers the save action when JSON-error modal is open

  function toEditableShape(data) {
    data = data || {};
    return {
      companyId: data.companyId || "",
      slug: data.slug || "",
      title: data.title || "",
      tagline: data.tagline || "",
      summary: data.summary || "",
      coverImageUrl: data.coverImageUrl || "",
      objective: data.objective || "",
      deliverables: data.deliverables || "",
      duration: data.duration || "",
      featured: !!data.featured,
      date: String(data.date || "").slice(0, 10),
      sortOrder: Number(data.sortOrder) || 0,
      caseBrief: data.caseBrief || "",
      caseDelivered: data.caseDelivered || "",
      caseOutcome: data.caseOutcome || "",
      bodyHtml: data.bodyHtml || "",
      galleryUrls: Array.isArray(data.galleryUrls) ? data.galleryUrls.slice() : [],
    };
  }

  function buildEditableFromForm() {
    return {
      companyId: $("projectCompany").value,
      slug: $("slug").value.trim(),
      title: $("title").value.trim(),
      tagline: $("tagline").value.trim(),
      summary: $("summary").value.trim(),
      coverImageUrl: $("coverImageUrl").value.trim(),
      objective: $("objective").value.trim(),
      deliverables: $("deliverables").value.trim(),
      duration: $("duration").value.trim(),
      featured: $("featured") ? !!$("featured").checked : false,
      date: $("projectDate") && $("projectDate").value ? String($("projectDate").value).slice(0, 10) : "",
      sortOrder: Number($("sortOrder").value) || 0,
      caseBrief: $("caseBrief").value.trim(),
      caseDelivered: $("caseDelivered").value.trim(),
      caseOutcome: $("caseOutcome").value.trim(),
      bodyHtml: $("bodyHtml").value,
      galleryUrls: $("galleryUrls").value.split(/\n/).map(function (u) { return u.trim(); }).filter(Boolean),
    };
  }

  function setJsonStatus(kind, msg) {
    var el = $("projectJsonStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.className = kind === "err" ? "err" : "ok";
  }

  function writeJsonTextarea(obj) {
    var ta = $("projectJson");
    if (!ta) return;
    jsonSyncing = true;
    try { ta.value = JSON.stringify(obj, null, 2); }
    finally { jsonSyncing = false; }
  }

  function syncJsonFromForm() {
    if (!$("projectJson")) return;
    writeJsonTextarea(buildEditableFromForm());
    setJsonStatus("ok", "");
  }

  function applyJsonObjectToForm(data) {
    var isEdit = !!$("editId").value;
    jsonSyncing = true;
    try {
      if (data.companyId !== undefined) $("projectCompany").value = data.companyId || "";
      // Slug stays read-only on existing docs — never overwrite from JSON when editing
      if (!isEdit && data.slug !== undefined) $("slug").value = data.slug || "";
      if (data.title !== undefined) $("title").value = data.title || "";
      if (data.tagline !== undefined) $("tagline").value = data.tagline || "";
      if (data.summary !== undefined) $("summary").value = data.summary || "";
      if (data.coverImageUrl !== undefined) $("coverImageUrl").value = data.coverImageUrl || "";
      if (data.objective !== undefined) $("objective").value = data.objective || "";
      if (data.deliverables !== undefined) $("deliverables").value = data.deliverables || "";
      if (data.duration !== undefined) $("duration").value = data.duration || "";
      if (data.featured !== undefined) { var feat = $("featured"); if (feat) feat.checked = !!data.featured; }
      if (data.date !== undefined) {
        var dateEl = $("projectDate");
        if (dateEl) dateEl.value = String(data.date || "").slice(0, 10);
      }
      if (data.sortOrder !== undefined) $("sortOrder").value = String(Number(data.sortOrder) || 0);
      if (data.caseBrief !== undefined) $("caseBrief").value = data.caseBrief || "";
      if (data.caseDelivered !== undefined) $("caseDelivered").value = data.caseDelivered || "";
      if (data.caseOutcome !== undefined) $("caseOutcome").value = data.caseOutcome || "";
      if (data.bodyHtml !== undefined) $("bodyHtml").value = data.bodyHtml || "";
      if (data.galleryUrls !== undefined) {
        var gu = data.galleryUrls;
        $("galleryUrls").value = Array.isArray(gu) ? gu.join("\n") : String(gu || "");
      }
    } finally { jsonSyncing = false; }
  }

  function tryApplyJsonToForm() {
    var ta = $("projectJson");
    if (!ta) return true;
    var raw = ta.value;
    if (!raw.trim()) { setJsonStatus("err", "JSON is empty."); return false; }
    var data;
    try { data = JSON.parse(raw); }
    catch (e) { setJsonStatus("err", "Invalid JSON: " + e.message); return false; }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      setJsonStatus("err", "JSON must be an object.");
      return false;
    }
    applyJsonObjectToForm(data);
    setJsonStatus("ok", "");
    return true;
  }

  function onProjectFieldInput() {
    if (jsonSyncing) return;
    lastEditedSide = "form";
    if (jsonSyncTimer) clearTimeout(jsonSyncTimer);
    jsonSyncTimer = setTimeout(function () { jsonSyncTimer = null; syncJsonFromForm(); }, 150);
  }

  function onProjectJsonInput() {
    if (jsonSyncing) return;
    lastEditedSide = "json";
    if (jsonParseTimer) clearTimeout(jsonParseTimer);
    jsonParseTimer = setTimeout(function () { jsonParseTimer = null; tryApplyJsonToForm(); }, 200);
  }

  function flushPendingSync() {
    if (jsonSyncTimer) { clearTimeout(jsonSyncTimer); jsonSyncTimer = null; }
    if (jsonParseTimer) { clearTimeout(jsonParseTimer); jsonParseTimer = null; }
  }

  function fillForm(data, id) {
    $("editId").value = id || "";
    $("projectCompany").value = data.companyId || "";
    $("slug").value = data.slug || "";
    $("slug").readOnly = !!id;
    $("title").value = data.title || "";
    $("tagline").value = data.tagline || "";
    $("summary").value = data.summary || "";
    $("coverImageUrl").value = data.coverImageUrl || "";
    $("objective").value = data.objective || "";
    $("deliverables").value = data.deliverables || "";
    $("duration").value = data.duration || "";
    var feat = $("featured"); if (feat) feat.checked = !!data.featured;
    var dateEl = $("projectDate"); if (dateEl) dateEl.value = (data.date || "").slice(0, 10);
    $("sortOrder").value = data.sortOrder != null ? String(data.sortOrder) : "0";
    $("caseBrief").value = data.caseBrief || "";
    $("caseDelivered").value = data.caseDelivered || "";
    $("caseOutcome").value = data.caseOutcome || "";
    $("bodyHtml").value = data.bodyHtml || "";
    $("galleryUrls").value = (data.galleryUrls || []).join("\n");
    var cf = $("coverFile"); if (cf) cf.value = "";
    var gf = $("galleryFiles"); if (gf) gf.value = "";
  }

  function readForm(published) {
    var companyId = $("projectCompany").value;
    var company = getCompanyById(companyId);
    return {
      companyId: companyId,
      client: company ? company.name : "",
      slug: slugify($("slug").value) || slugify($("title").value),
      title: $("title").value.trim(),
      tagline: $("tagline").value.trim(),
      summary: $("summary").value.trim(),
      coverImageUrl: $("coverImageUrl").value.trim(),
      objective: $("objective").value.trim(),
      deliverables: $("deliverables").value.trim(),
      duration: $("duration").value.trim(),
      featured: $("featured") ? !!$("featured").checked : false,
      date: $("projectDate") && $("projectDate").value ? String($("projectDate").value).slice(0, 10) : "",
      sortOrder: Number($("sortOrder").value) || 0,
      published: !!published,
      caseBrief: $("caseBrief").value.trim(),
      caseDelivered: $("caseDelivered").value.trim(),
      caseOutcome: $("caseOutcome").value.trim(),
      bodyHtml: $("bodyHtml").value,
      galleryUrls: $("galleryUrls").value.split(/\n/).map(function (u) { return u.trim(); }).filter(Boolean),
    };
  }

  function setModalMode(isNew, isDraft) {
    var t = $("projectModalTitle"), d = $("projectModalDesc");
    if (!t) return;
    if (isNew) { t.textContent = "New project"; if (d) d.textContent = "Save as a draft to work in private, or publish when it\u2019s ready for the site."; return; }
    t.textContent = "Edit project";
    if (d) d.textContent = isDraft
      ? "This project is a draft \u2014 not visible on the public site until you save & publish."
      : "This project is live. Use Unpublish to hide it, or Save & publish to update.";
  }

  function syncModalActionButtons() {
    var editId = $("editId").value;
    var unpub = $("btnUnpublish"), draft = $("btnSaveDraft"), del = $("btnDeleteProject");
    if (del) del.hidden = !editId;
    if (unpub && draft) { var live = !!editId && modalDocPublished; unpub.hidden = !live; draft.hidden = live; }
  }

  function openNewProjectModal() {
    modalDocPublished = false;
    originalProjectData = JSON.parse(JSON.stringify(EMPTY_PROJECT_TEMPLATE));
    fillForm({}, "");
    $("slug").readOnly = false;
    setModalMode(true, true);
    syncModalActionButtons();
    flushPendingSync();
    writeJsonTextarea(EMPTY_PROJECT_TEMPLATE);
    setJsonStatus("ok", "");
    lastEditedSide = "form";
    openModal("projectModal");
    $("saveStatus").textContent = "";
    setTimeout(function () { $("projectCompany").focus(); }, 0);
  }

  function openEditProjectModal(data, docId) {
    modalDocPublished = !!data.published;
    originalProjectData = JSON.parse(JSON.stringify(data || {}));
    fillForm(data, docId);
    setModalMode(false, !data.published);
    syncModalActionButtons();
    flushPendingSync();
    writeJsonTextarea(toEditableShape(data));
    setJsonStatus("ok", "");
    lastEditedSide = "form";
    openModal("projectModal");
    $("saveStatus").textContent = "";
    setTimeout(function () { $("title").focus(); }, 0);
  }

  function buildProjectCard(row, onEdit, opts) {
    opts = opts || {};
    var doc = row.doc,
      d = row.d;
    var card = document.createElement("article");
    card.className = "project-card";
    card.setAttribute("data-project-id", doc.id);
    var thumb = document.createElement("div");
    thumb.className = "project-card-thumb";
    if (d.coverImageUrl) {
      var img = document.createElement("img");
      img.src = d.coverImageUrl;
      img.alt = "";
      img.loading = "lazy";
      thumb.appendChild(img);
    }
    var body = document.createElement("div");
    body.className = "project-card-body";
    var h3 = document.createElement("h3");
    h3.className = "project-card-title";
    h3.textContent = d.title || doc.id;
    var meta = document.createElement("div");
    meta.className = "project-card-meta";
    meta.textContent = "/" + (d.slug || doc.id) + (d.client ? "  \u00b7  " + d.client : "");
    var sum = document.createElement("p");
    sum.className = "project-card-summary";
    sum.textContent = snippet(d.summary, 200);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Edit";
    btn.onclick = onEdit;
    body.appendChild(h3);
    body.appendChild(meta);
    body.appendChild(sum);
    body.appendChild(btn);

    if (opts.draggable) {
      var drag = document.createElement("div");
      drag.className = "project-card-drag";
      drag.setAttribute("draggable", "true");
      drag.setAttribute("aria-label", "Drag to move or reorder");
      drag.setAttribute("title", "Drag to featured / not featured or reorder");
      drag.textContent = "\u2261";
      drag.addEventListener("mousedown", function (ev) {
        ev.stopPropagation();
      });
      drag.addEventListener("dragstart", function (ev) {
        if (ev.dataTransfer) {
          ev.dataTransfer.setData("text/plain", doc.id);
          ev.dataTransfer.effectAllowed = "move";
        }
        card.classList.add("dragging");
      });
      drag.addEventListener("dragend", function () {
        card.classList.remove("dragging");
        document.querySelectorAll(".drag-list.drag-over").forEach(function (n) {
          n.classList.remove("drag-over");
        });
      });
      card.appendChild(drag);
    }
    card.appendChild(thumb);
    card.appendChild(body);
    return card;
  }

  async function refreshList() {
    wireProjectDragDropOnce();
    var listFeat = $("projectListFeatured"),
      listNot = $("projectListNotFeatured"),
      listDraft = $("projectListDrafts");
    var metaEl = $("projectListMeta"),
      featEmpty = $("featuredPubEmpty"),
      notFeatEmpty = $("notFeaturedPubEmpty"),
      draftsEmpty = $("draftsEmpty");
    if (listFeat) listFeat.innerHTML = "";
    if (listNot) listNot.innerHTML = "";
    if (listDraft) listDraft.innerHTML = "";
    if (metaEl) {
      metaEl.textContent = "";
      metaEl.className = "list-meta";
    }
    var snap = await db.collection("projects").get();
    var groups = new Map();
    snap.forEach(function (doc) {
      var d = doc.data(),
        slugKey = (d.slug || doc.id || "").trim() || doc.id;
      var arr = groups.get(slugKey) || [];
      arr.push({ doc: doc, d: d });
      groups.set(slugKey, arr);
    });
    var hiddenDupes = 0,
      rows = [];
    groups.forEach(function (items) {
      if (items.length > 1) hiddenDupes += items.length - 1;
      rows.push(pickCanonicalRow(items));
    });
    if (metaEl && hiddenDupes > 0)
      metaEl.textContent = hiddenDupes + " duplicate document(s) hidden (same slug).";
    var pubRows = rows.filter(function (r) {
      return !!r.d.published;
    });
    var draftRows = rows.filter(function (r) {
      return !r.d.published;
    });
    var featPub = pubRows.filter(function (r) {
      return !!r.d.featured;
    });
    var restPub = pubRows.filter(function (r) {
      return !r.d.featured;
    });
    featPub.sort(function (a, b) {
      return (a.d.sortOrder || 0) - (b.d.sortOrder || 0);
    });
    restPub.sort(function (a, b) {
      var da = String(a.d.date || "").slice(0, 10);
      var db = String(b.d.date || "").slice(0, 10);
      if (da !== db) return db.localeCompare(da);
      return (a.d.sortOrder || 0) - (b.d.sortOrder || 0);
    });
    if (featEmpty) featEmpty.hidden = featPub.length > 0;
    if (notFeatEmpty) notFeatEmpty.hidden = restPub.length > 0;
    if (draftsEmpty) draftsEmpty.hidden = draftRows.length > 0;
    featPub.forEach(function (r) {
      if (listFeat)
        listFeat.appendChild(
          buildProjectCard(r, function () {
            openEditProjectModal(r.d, r.doc.id);
          }, { draggable: true }),
        );
    });
    restPub.forEach(function (r) {
      if (listNot)
        listNot.appendChild(
          buildProjectCard(r, function () {
            openEditProjectModal(r.d, r.doc.id);
          }, { draggable: true }),
        );
    });
    draftRows.forEach(function (r) {
      if (listDraft)
        listDraft.appendChild(
          buildProjectCard(r, function () {
            openEditProjectModal(r.d, r.doc.id);
          }, { draggable: false }),
        );
    });
  }

  async function uploadCover(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file || !auth.currentUser) return;
    var slug = slugify($("slug").value) || "draft-" + auth.currentUser.uid;
    var path = "portfolio/" + slug + "/cover-" + Date.now() + "-" + file.name.replace(/\s/g, "_");
    $("uploadStatus").textContent = "Uploading\u2026";
    try { var ref = storage.ref(path); await ref.put(file); $("coverImageUrl").value = await ref.getDownloadURL(); $("uploadStatus").textContent = "Uploaded."; }
    catch (e) { $("uploadStatus").textContent = "Upload failed."; }
  }

  async function uploadGalleryImages(ev) {
    var files = ev.target.files ? Array.prototype.slice.call(ev.target.files) : [];
    if (!files.length || !auth.currentUser) return;
    var slug = slugify($("slug").value) || "draft-" + auth.currentUser.uid;
    var status = $("galleryUploadStatus");
    var uploaded = [];
    if (status) { status.className = "ok"; status.textContent = "Uploading " + files.length + " image" + (files.length === 1 ? "" : "s") + "\u2026"; }
    try {
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var path = "portfolio/" + slug + "/gallery-" + Date.now() + "-" + i + "-" + file.name.replace(/\s/g, "_");
        var ref = storage.ref(path);
        await ref.put(file);
        uploaded.push(await ref.getDownloadURL());
        if (status) status.textContent = "Uploaded " + uploaded.length + " of " + files.length + "\u2026";
      }
      var existing = $("galleryUrls").value.split(/\n/).map(function (u) { return u.trim(); }).filter(Boolean);
      $("galleryUrls").value = existing.concat(uploaded).join("\n");
      if (status) status.textContent = "Uploaded " + uploaded.length + " gallery image" + (uploaded.length === 1 ? "." : "s.");
      if (ev.target) ev.target.value = "";
      onProjectFieldInput();
    } catch (e) {
      console.error("gallery upload error", e);
      if (status) { status.className = "err"; status.textContent = "Upload failed: " + (e.message || e.code || "unknown error"); }
    }
  }

  async function saveProject(published) {
    $("saveStatus").textContent = ""; $("saveStatus").className = "ok";

    // Reconcile JSON view ↔ form fields based on whichever was edited last.
    flushPendingSync();
    if (lastEditedSide === "json") {
      if (!tryApplyJsonToForm()) {
        pendingSavePublished = published;
        openModal("projectJsonErrorModal");
        return;
      }
    } else {
      syncJsonFromForm();
    }

    var form = $("projectForm"); if (form && !form.reportValidity()) return;
    var payload = readForm(published);
    if (!payload.companyId) { $("saveStatus").textContent = "Select a company."; $("saveStatus").className = "err"; return; }
    if (!payload.title) { $("saveStatus").textContent = "Title is required."; $("saveStatus").className = "err"; return; }
    if (!payload.slug) { $("saveStatus").textContent = "Set a URL slug."; $("saveStatus").className = "err"; return; }
    if (!slugPatternOk(payload.slug)) { $("saveStatus").textContent = "Slug must use lowercase letters, numbers, and single hyphens only."; $("saveStatus").className = "err"; return; }
    var editId = $("editId").value, docId = editId || payload.slug, wasLive = modalDocPublished;
    try {
      await db.collection("projects").doc(docId).set({ ...payload, slug: payload.slug, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      modalDocPublished = published;
      $("saveStatus").textContent = published ? "Saved and published." : wasLive ? "Unpublished \u2014 saved as draft." : "Draft saved.";
      $("editId").value = docId; $("slug").readOnly = true;
      setModalMode(false, !published); syncModalActionButtons();
      await refreshList();
    } catch (e) { console.error(e); $("saveStatus").textContent = "Save failed: " + (e.message || e); $("saveStatus").className = "err"; }
  }

  async function deleteProject() {
    var editId = $("editId").value; if (!editId) return;
    if (!confirm('Delete project "' + ($("title").value.trim() || editId) + '" permanently?')) return;
    try { await db.collection("projects").doc(editId).delete(); closeModal("projectModal"); await refreshList(); }
    catch (e) { $("saveStatus").textContent = "Delete failed: " + (e.message || e); $("saveStatus").className = "err"; }
  }

  // ─── JSON-error modal actions ───
  function onJsonErrFix() {
    closeModal("projectJsonErrorModal");
    flushPendingSync();
    syncJsonFromForm();
    lastEditedSide = "form";
    var p = pendingSavePublished;
    pendingSavePublished = null;
    if (p !== null) saveProject(!!p);
  }

  function onJsonErrDiscard() {
    closeModal("projectJsonErrorModal");
    flushPendingSync();
    pendingSavePublished = null;
    var orig = originalProjectData || {};
    var editId = $("editId").value || "";
    fillForm(orig, editId);
    if (editId) $("slug").readOnly = true;
    writeJsonTextarea(toEditableShape(orig));
    setJsonStatus("ok", "");
    lastEditedSide = "form";
    closeModal("projectModal");
  }

  function onJsonErrKeep() {
    closeModal("projectJsonErrorModal");
    pendingSavePublished = null;
    setTimeout(function () { var ta = $("projectJson"); if (ta) ta.focus(); }, 0);
  }

  // ═══════════════════════════════════
  //  REVIEWS
  // ═══════════════════════════════════
  var reviewModalDocPublished = false;

  function fillReviewForm(data, id) {
    $("reviewEditId").value = id || "";
    $("reviewCompany").value = data.companyId || "";
    $("reviewHeading").value = data.heading || "";
    $("reviewBody").value = data.body || "";
    $("reviewSortOrder").value = data.sortOrder != null ? String(data.sortOrder) : "0";
  }

  function readReviewForm(published) {
    var companyId = $("reviewCompany").value;
    var company = getCompanyById(companyId);
    return {
      companyId: companyId,
      clientName: company ? company.name : "",
      clientIndustry: company ? company.industry : "",
      avatarUrl: company ? company.logoUrl : "",
      heading: $("reviewHeading").value.trim(),
      body: $("reviewBody").value.trim(),
      sortOrder: Number($("reviewSortOrder").value) || 0,
      published: !!published,
    };
  }

  function syncReviewButtons() {
    var editId = $("reviewEditId").value;
    var unpub = $("btnReviewUnpublish"), draft = $("btnReviewSaveDraft"), del = $("btnDeleteReview");
    if (del) del.hidden = !editId;
    if (unpub && draft) { var live = !!editId && reviewModalDocPublished; unpub.hidden = !live; draft.hidden = live; }
  }

  function openNewReviewModal() {
    reviewModalDocPublished = false;
    fillReviewForm({}, "");
    $("reviewModalTitle").textContent = "New review";
    syncReviewButtons();
    openModal("reviewModal");
    $("reviewSaveStatus").textContent = "";
    setTimeout(function () { $("reviewCompany").focus(); }, 0);
  }

  function openEditReviewModal(data, docId) {
    reviewModalDocPublished = !!data.published;
    fillReviewForm(data, docId);
    $("reviewModalTitle").textContent = "Edit review";
    syncReviewButtons();
    openModal("reviewModal");
    $("reviewSaveStatus").textContent = "";
    setTimeout(function () { $("reviewHeading").focus(); }, 0);
  }

  function buildReviewCard(doc, data, onEdit) {
    var card = document.createElement("article"); card.className = "project-card";
    var thumb = document.createElement("div"); thumb.className = "project-card-thumb";
    if (data.avatarUrl) { var img = document.createElement("img"); img.src = data.avatarUrl; img.alt = ""; img.loading = "lazy"; thumb.appendChild(img); }
    var body = document.createElement("div"); body.className = "project-card-body";
    var h3 = document.createElement("h3"); h3.className = "project-card-title"; h3.textContent = data.heading ? "\u201C" + data.heading + "\u201D" : doc.id;
    var meta = document.createElement("div"); meta.className = "project-card-meta"; meta.textContent = data.clientName + (data.clientIndustry ? " \u2014 " + data.clientIndustry : "");
    var sum = document.createElement("p"); sum.className = "project-card-summary"; sum.textContent = snippet(data.body, 160);
    var btn = document.createElement("button"); btn.type = "button"; btn.textContent = "Edit"; btn.onclick = onEdit;
    body.appendChild(h3); body.appendChild(meta); body.appendChild(sum); body.appendChild(btn);
    card.appendChild(thumb); card.appendChild(body);
    return card;
  }

  async function refreshReviews() {
    var listPub = $("reviewListPublished"), listDraft = $("reviewListDrafts");
    var pubEmpty = $("reviewsPubEmpty"), draftEmpty = $("reviewsDraftEmpty");
    if (listPub) listPub.innerHTML = "";
    if (listDraft) listDraft.innerHTML = "";
    var snap = await db.collection("reviews").orderBy("sortOrder", "asc").get();
    var published = [], drafts = [];
    snap.forEach(function (doc) { var d = doc.data(); (d.published ? published : drafts).push({ doc: doc, d: d }); });
    if (pubEmpty) pubEmpty.hidden = published.length > 0;
    if (draftEmpty) draftEmpty.hidden = drafts.length > 0;
    published.forEach(function (r) { if (listPub) listPub.appendChild(buildReviewCard(r.doc, r.d, function () { openEditReviewModal(r.d, r.doc.id); })); });
    drafts.forEach(function (r) { if (listDraft) listDraft.appendChild(buildReviewCard(r.doc, r.d, function () { openEditReviewModal(r.d, r.doc.id); })); });
  }

  async function saveReview(published) {
    $("reviewSaveStatus").textContent = ""; $("reviewSaveStatus").className = "ok";
    var form = $("reviewForm"); if (form && !form.reportValidity()) return;
    var payload = readReviewForm(published);
    if (!payload.companyId) { $("reviewSaveStatus").textContent = "Select a company."; $("reviewSaveStatus").className = "err"; return; }
    if (!payload.heading) { $("reviewSaveStatus").textContent = "Heading is required."; $("reviewSaveStatus").className = "err"; return; }
    var editId = $("reviewEditId").value;
    var docId = editId || slugify(payload.clientName) || "review-" + Date.now();
    try {
      await db.collection("reviews").doc(docId).set({ ...payload, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      reviewModalDocPublished = published;
      $("reviewSaveStatus").textContent = published ? "Saved and published." : "Draft saved.";
      $("reviewEditId").value = docId;
      $("reviewModalTitle").textContent = "Edit review";
      syncReviewButtons();
      await refreshReviews();
    } catch (e) { console.error(e); $("reviewSaveStatus").textContent = "Save failed: " + (e.message || e); $("reviewSaveStatus").className = "err"; }
  }

  async function deleteReview() {
    var editId = $("reviewEditId").value; if (!editId) return;
    if (!confirm("Delete this review permanently?")) return;
    try { await db.collection("reviews").doc(editId).delete(); closeModal("reviewModal"); await refreshReviews(); }
    catch (e) { $("reviewSaveStatus").textContent = "Delete failed: " + (e.message || e); $("reviewSaveStatus").className = "err"; }
  }

  // ═══════════════════════════════════
  //  BLOG AUTHORS
  // ═══════════════════════════════════
  function emptyAuthorProfile() {
    return { name: "", role: "", avatarUrl: "", bio: "", linkedinUrl: "", moreArticlesUrl: "" };
  }

  function readAuthorForm() {
    return {
      name: $("authorName").value.trim(),
      role: $("authorRole").value.trim(),
      avatarUrl: $("authorAvatarUrl").value.trim(),
      bio: $("authorBio").value.trim(),
      linkedinUrl: $("authorLinkedinUrl").value.trim(),
      moreArticlesUrl: $("authorMoreArticlesUrl").value.trim(),
    };
  }

  function fillAuthorForm(data, id) {
    data = data || {};
    $("authorEditId").value = id || "";
    $("authorName").value = data.name || "";
    $("authorRole").value = data.role || "";
    $("authorAvatarUrl").value = data.avatarUrl || "";
    $("authorBio").value = data.bio || "";
    $("authorLinkedinUrl").value = data.linkedinUrl || "";
    $("authorMoreArticlesUrl").value = data.moreArticlesUrl || "";
    var f = $("authorAvatarFile"); if (f) f.value = "";
  }

  function getAuthorById(id) {
    return authorsCache.find(function (a) { return a.id === id; });
  }

  function populateBlogAuthorDropdown() {
    var sel = $("blogAuthorPick");
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">\u2014 Custom (type below) \u2014</option>';
    authorsCache.forEach(function (a) {
      var opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name + (a.role ? " \u2014 " + a.role : "");
      sel.appendChild(opt);
    });
    if (cur && authorsCache.some(function (a) { return a.id === cur; })) sel.value = cur;
    else sel.value = "";
  }

  function applyAuthorProfileToBlogForm(profile) {
    profile = profile || emptyAuthorProfile();
    $("blogAuthorName").value = profile.name || "";
    $("blogAuthorRole").value = profile.role || "";
    $("blogAuthorAvatarUrl").value = profile.avatarUrl || "";
    $("blogAuthorBio").value = profile.bio || "";
    $("blogAuthorLinkedinUrl").value = profile.linkedinUrl || "";
    $("blogAuthorMoreArticlesUrl").value = profile.moreArticlesUrl || "";
  }

  function setBlogAuthorPick(id) {
    var sel = $("blogAuthorPick");
    if (!sel) return;
    if (id && authorsCache.some(function (a) { return a.id === id; })) sel.value = id;
    else sel.value = "";
  }

  function resolveBlogAuthorPickId(data) {
    if (!data) return "";
    if (data.authorId && getAuthorById(data.authorId)) return data.authorId;
    var a = data.author;
    if (!a || typeof a !== "object" || !a.name) return "";
    var name = String(a.name).trim().toLowerCase();
    var match = authorsCache.find(function (x) {
      return String(x.name || "").trim().toLowerCase() === name;
    });
    return match ? match.id : "";
  }

  function onBlogAuthorPickChange() {
    var id = $("blogAuthorPick") && $("blogAuthorPick").value;
    if (!id) return;
    var author = getAuthorById(id);
    if (!author) return;
    applyAuthorProfileToBlogForm(author);
    onBlogFieldInput();
  }

  function openNewAuthorModal() {
    fillAuthorForm({}, "");
    $("authorModalTitle").textContent = "New author";
    $("btnDeleteAuthor").hidden = true;
    openModal("authorModal");
    $("authorSaveStatus").textContent = "";
    setTimeout(function () { $("authorName").focus(); }, 0);
  }

  function openEditAuthorModal(data, docId) {
    fillAuthorForm(data, docId);
    $("authorModalTitle").textContent = "Edit author";
    $("btnDeleteAuthor").hidden = false;
    openModal("authorModal");
    $("authorSaveStatus").textContent = "";
    setTimeout(function () { $("authorName").focus(); }, 0);
  }

  async function saveAuthor() {
    $("authorSaveStatus").textContent = "";
    $("authorSaveStatus").className = "ok";
    var form = $("authorForm");
    if (form && !form.reportValidity()) return;
    var profile = readAuthorForm();
    if (!profile.name) {
      $("authorSaveStatus").textContent = "Author name is required.";
      $("authorSaveStatus").className = "err";
      return;
    }
    var editId = $("authorEditId").value;
    var docId = editId || slugify(profile.name);
    try {
      await db.collection("blog_authors").doc(docId).set(
        Object.assign({}, profile, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }),
        { merge: true }
      );
      $("authorSaveStatus").textContent = "Saved.";
      $("authorEditId").value = docId;
      $("authorModalTitle").textContent = "Edit author";
      $("btnDeleteAuthor").hidden = false;
      await refreshAuthors();
    } catch (e) {
      console.error(e);
      $("authorSaveStatus").textContent = "Save failed: " + (e.message || e);
      $("authorSaveStatus").className = "err";
    }
  }

  async function deleteAuthor() {
    var editId = $("authorEditId").value;
    if (!editId) return;
    if (!confirm("Delete this author profile permanently? Existing blog posts keep their saved author text.")) return;
    try {
      await db.collection("blog_authors").doc(editId).delete();
      closeModal("authorModal");
      await refreshAuthors();
    } catch (e) {
      $("authorSaveStatus").textContent = "Delete failed: " + (e.message || e);
      $("authorSaveStatus").className = "err";
    }
  }

  async function uploadAuthorAvatar(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file || !auth.currentUser) return;
    var slug = slugify($("authorName").value.trim()) || "author-" + Date.now();
    var path = "authors/" + slug + "/avatar-" + Date.now() + "-" + file.name.replace(/\s/g, "_");
    $("authorUploadStatus").textContent = "Uploading\u2026";
    try {
      var ref = storage.ref(path);
      await ref.put(file);
      $("authorAvatarUrl").value = await ref.getDownloadURL();
      $("authorUploadStatus").textContent = "Uploaded.";
    } catch (e) {
      console.error("author avatar upload error", e);
      $("authorUploadStatus").textContent = "Upload failed: " + (e.message || e);
    }
  }

  function buildAuthorCard(doc, data, onEdit) {
    var card = document.createElement("article");
    card.className = "project-card";
    var thumb = document.createElement("div");
    thumb.className = "project-card-thumb";
    if (data.avatarUrl) {
      var img = document.createElement("img");
      img.src = data.avatarUrl;
      img.alt = "";
      img.loading = "lazy";
      thumb.appendChild(img);
    }
    var body = document.createElement("div");
    body.className = "project-card-body";
    var h3 = document.createElement("h3");
    h3.className = "project-card-title";
    h3.textContent = data.name || doc.id;
    var meta = document.createElement("div");
    meta.className = "project-card-meta";
    meta.textContent = data.role || "";
    var sum = document.createElement("p");
    sum.className = "project-card-summary";
    sum.textContent = snippet(data.bio, 160);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Edit";
    btn.onclick = onEdit;
    body.appendChild(h3);
    body.appendChild(meta);
    body.appendChild(sum);
    body.appendChild(btn);
    card.appendChild(thumb);
    card.appendChild(body);
    return card;
  }

  async function refreshAuthors() {
    var list = $("authorList");
    var empty = $("authorsEmpty");
    if (list) list.innerHTML = "";
    authorsCache = [];
    var snap = await db.collection("blog_authors").orderBy("name").get();
    snap.forEach(function (doc) {
      var d = doc.data();
      authorsCache.push({
        id: doc.id,
        name: d.name || "",
        role: d.role || "",
        avatarUrl: d.avatarUrl || "",
        bio: d.bio || "",
        linkedinUrl: d.linkedinUrl || "",
        moreArticlesUrl: d.moreArticlesUrl || "",
      });
      if (list) {
        list.appendChild(buildAuthorCard(doc, d, function () { openEditAuthorModal(d, doc.id); }));
      }
    });
    if (empty) empty.hidden = authorsCache.length > 0;
    populateBlogAuthorDropdown();
  }

  // ═══════════════════════════════════
  //  BLOG POSTS
  // ═══════════════════════════════════
  var EMPTY_BLOG_TEMPLATE = {
    slug: "",
    title: "",
    summary: "",
    category: "",
    tags: [],
    publishedAt: "",
    readingTimeMinutes: 0,
    author: { name: "", role: "", avatarUrl: "", bio: "", linkedinUrl: "", moreArticlesUrl: "" },
    coverImage: { url: "", alt: "" },
    toc: [],
    body: [],
    midCta: { enabled: true, eyebrow: "", title: "", text: "", primaryLabel: "", primaryUrl: "", secondaryLabel: "", secondaryUrl: "" },
    finalCta: { enabled: true, eyebrow: "", title: "", text: "", primaryLabel: "", primaryUrl: "", secondaryLabel: "", secondaryUrl: "" },
    related: [],
    seo: { metaTitle: "", metaDescription: "" },
  };

  var BLOG_BLOCK_TYPES = [
    { value: "lead", label: "Lead paragraph" },
    { value: "paragraph", label: "Paragraph" },
    { value: "subheading", label: "Subheading (h3)" },
    { value: "list", label: "List" },
    { value: "quote", label: "Quote" },
    { value: "callout", label: "Callout" },
    { value: "image", label: "Image" },
  ];

  var blogModalDocPublished = false;
  var blogState = { toc: [], body: [], related: [], midCta: null, finalCta: null };
  var blogJsonSyncing = false;
  var blogJsonSyncTimer = null;
  var blogJsonParseTimer = null;
  var blogLastEditedSide = "form";
  var blogOriginalData = null;
  var blogPendingSavePublished = null;
  var blogDelegationWired = false;

  function blogEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function makeEmptyBlogBlock(type) {
    switch (type) {
      case "lead":
      case "paragraph":
      case "subheading":
        return { type: type, text: "" };
      case "list":
        return { type: "list", style: "bullet", items: [] };
      case "quote":
        return { type: "quote", text: "", cite: "" };
      case "callout":
        return { type: "callout", tag: "", text: "" };
      case "image":
        return { type: "image", url: "", alt: "", caption: "" };
      default:
        return { type: "paragraph", text: "" };
    }
  }
  function makeEmptyBlogSection() {
    return { type: "section", id: "", number: "", heading: "", blocks: [] };
  }
  function makeEmptyBlogTocItem() { return { id: "", label: "" }; }
  function makeEmptyBlogRelated() {
    return {
      slug: "",
      title: "",
      summary: "",
      category: "",
      readingTimeMinutes: 0,
      publishedAt: "",
      coverImage: { url: "", alt: "" },
    };
  }
  function makeEmptyBlogCta() {
    return {
      enabled: true,
      eyebrow: "",
      title: "",
      text: "",
      primaryLabel: "",
      primaryUrl: "",
      secondaryLabel: "",
      secondaryUrl: "",
    };
  }

  function normalizeBlogCta(c) {
    if (c === false) return Object.assign(makeEmptyBlogCta(), { enabled: false });
    c = c && typeof c === "object" ? c : {};
    return {
      enabled: c.enabled === false ? false : true,
      eyebrow: String(c.eyebrow || c.label || ""),
      title: String(c.title || c.heading || ""),
      text: String(c.text || c.body || c.description || ""),
      primaryLabel: String(c.primaryLabel || c.buttonLabel || c.ctaLabel || ""),
      primaryUrl: String(c.primaryUrl || c.buttonUrl || c.ctaUrl || c.url || ""),
      secondaryLabel: String(c.secondaryLabel || ""),
      secondaryUrl: String(c.secondaryUrl || ""),
    };
  }

  function normalizeBlogBlock(b) {
    if (!b || !b.type) return { type: "paragraph", text: "" };
    switch (b.type) {
      case "lead":
      case "paragraph":
      case "subheading":
        return { type: b.type, text: String(b.text || "") };
      case "list":
        return {
          type: "list",
          style: b.style === "number" ? "number" : "bullet",
          items: Array.isArray(b.items)
            ? b.items.map(function (s) { return String(s); }).filter(function (s) { return s.trim() !== ""; })
            : [],
        };
      case "quote":
        return { type: "quote", text: String(b.text || ""), cite: String(b.cite || "") };
      case "callout":
        return { type: "callout", tag: String(b.tag || ""), text: String(b.text || "") };
      case "image":
        return { type: "image", url: String(b.url || ""), alt: String(b.alt || ""), caption: String(b.caption || "") };
      default:
        return { type: "paragraph", text: String(b.text || "") };
    }
  }

  // ─── Schema placeholders (JSON view documentation) ─────────────
  // The JSON view at the bottom of the blog modal always shows the FULL schema
  // including the shape of array items. When an array is empty in the form,
  // these placeholder items are injected into the JSON view so the user can see
  // what each item type looks like. They are filtered out on save and when
  // parsing JSON back to the form, so they never make it into Firestore.
  function blogTocPlaceholder() { return { id: "", label: "" }; }
  function blogRelatedPlaceholder() {
    return {
      slug: "", title: "", summary: "", category: "",
      readingTimeMinutes: 0, publishedAt: "",
      coverImage: { url: "", alt: "" },
    };
  }
  function blogAllBlockPlaceholders() {
    return [
      { type: "lead", text: "" },
      { type: "paragraph", text: "" },
      { type: "subheading", text: "" },
      { type: "list", style: "bullet", items: [] },
      { type: "quote", text: "", cite: "" },
      { type: "callout", tag: "", text: "" },
      { type: "image", url: "", alt: "", caption: "" },
    ];
  }
  function blogSectionPlaceholder() {
    return {
      type: "section",
      id: "",
      number: "",
      heading: "",
      blocks: blogAllBlockPlaceholders(),
    };
  }

  function isEmptyBlogTocItem(t) {
    if (!t) return true;
    return !String(t.id || "").trim() && !String(t.label || "").trim();
  }
  function isEmptyBlogBlock(b) {
    if (!b || !b.type) return true;
    switch (b.type) {
      case "lead":
      case "paragraph":
      case "subheading":
        return !String(b.text || "").trim();
      case "list":
        return !Array.isArray(b.items) || !b.items.filter(function (s) { return String(s || "").trim(); }).length;
      case "quote":
        return !String(b.text || "").trim() && !String(b.cite || "").trim();
      case "callout":
        return !String(b.text || "").trim() && !String(b.tag || "").trim();
      case "image":
        return !String(b.url || "").trim() && !String(b.alt || "").trim() && !String(b.caption || "").trim();
      default:
        return true;
    }
  }
  function isEmptyBlogSection(s) {
    if (!s) return true;
    var noFields = !String(s.id || "").trim() && !String(s.number || "").trim() && !String(s.heading || "").trim();
    var noBlocks = !Array.isArray(s.blocks) || s.blocks.every(isEmptyBlogBlock);
    return noFields && noBlocks;
  }
  function isEmptyBlogRelated(r) {
    if (!r) return true;
    var ci = r.coverImage || {};
    return !String(r.slug || "").trim()
      && !String(r.title || "").trim()
      && !String(r.summary || "").trim()
      && !String(r.category || "").trim()
      && !(Number(r.readingTimeMinutes) > 0)
      && !String(r.publishedAt || "").trim()
      && !String(ci.url || "").trim()
      && !String(ci.alt || "").trim();
  }

  // Builds the JSON shown in the bottom textarea: the canonical payload, plus
  // schema placeholders for any empty arrays so the full structure is visible.
  function buildBlogJsonViewPayload() {
    var p = readBlogPayloadFromForm();
    if (!p.toc.length) p.toc = [blogTocPlaceholder()];
    if (!p.body.length) {
      p.body = [blogSectionPlaceholder()];
    } else {
      p.body = p.body.map(function (s) {
        if (!Array.isArray(s.blocks) || !s.blocks.length) {
          return Object.assign({}, s, { blocks: blogAllBlockPlaceholders() });
        }
        return s;
      });
    }
    if (!p.related.length) p.related = [blogRelatedPlaceholder()];
    return p;
  }

  // Strips placeholder items (those that are entirely empty) from a payload
  // before it is persisted. Also removes empty blocks inside non-empty sections.
  function stripBlogPlaceholders(p) {
    if (!p) return p;
    p.toc = (Array.isArray(p.toc) ? p.toc : []).filter(function (t) { return !isEmptyBlogTocItem(t); });
    p.body = (Array.isArray(p.body) ? p.body : [])
      .map(function (s) {
        var blocks = Array.isArray(s.blocks) ? s.blocks.filter(function (b) { return !isEmptyBlogBlock(b); }) : [];
        return Object.assign({}, s, { blocks: blocks });
      })
      .filter(function (s) { return !isEmptyBlogSection(s); });
    p.related = (Array.isArray(p.related) ? p.related : []).filter(function (r) { return !isEmptyBlogRelated(r); });
    return p;
  }

  // ─── Repeater item renderers ─────────────────────────────
  function buildBlogBlockEditorHTML(block, sIdx, bIdx) {
    var b = block || {};
    var type = b.type || "paragraph";
    var typeOpts = BLOG_BLOCK_TYPES.map(function (t) {
      return '<option value="' + t.value + '"' + (type === t.value ? " selected" : "") + ">" + t.label + "</option>";
    }).join("");
    var dp = ' data-s-idx="' + sIdx + '" data-b-idx="' + bIdx + '"';

    var inner = "";
    if (type === "lead" || type === "paragraph") {
      inner =
        '<span class="field-label">Text' + (type === "paragraph" ? " (HTML allowed: &lt;em&gt;, &lt;strong&gt;)" : "") + "</span>" +
        '<textarea class="field-textarea" data-blog-block-field="text"' + dp + ">" + blogEsc(b.text || "") + "</textarea>";
    } else if (type === "subheading") {
      inner =
        '<span class="field-label">Subheading text</span>' +
        '<input type="text" class="field-input" data-blog-block-field="text"' + dp + ' value="' + blogEsc(b.text || "") + '" />';
    } else if (type === "list") {
      var style = b.style === "number" ? "number" : "bullet";
      var items = Array.isArray(b.items) ? b.items.join("\n") : "";
      inner =
        '<div class="grid-2"><div>' +
        '<span class="field-label">Style</span>' +
        '<select class="field-select" data-blog-block-field="style"' + dp + ">" +
        '<option value="bullet"' + (style === "bullet" ? " selected" : "") + ">Bullet (\u2192 markers)</option>" +
        '<option value="number"' + (style === "number" ? " selected" : "") + ">Number</option>" +
        "</select></div><div></div></div>" +
        '<span class="field-label">Items (one per line)</span>' +
        '<textarea class="field-textarea" data-blog-block-field="items"' + dp + ">" + blogEsc(items) + "</textarea>";
    } else if (type === "quote") {
      inner =
        '<span class="field-label">Quote text</span>' +
        '<textarea class="field-textarea" data-blog-block-field="text"' + dp + ">" + blogEsc(b.text || "") + "</textarea>" +
        '<span class="field-label">Cite (attribution)</span>' +
        '<input type="text" class="field-input" data-blog-block-field="cite"' + dp + ' value="' + blogEsc(b.cite || "") + '" placeholder="\u2014 Attribution" />';
    } else if (type === "callout") {
      inner =
        '<span class="field-label">Tag (pink monospace label)</span>' +
        '<input type="text" class="field-input" data-blog-block-field="tag"' + dp + ' value="' + blogEsc(b.tag || "") + '" placeholder="\u2192 Studio practice" />' +
        '<span class="field-label">Text</span>' +
        '<textarea class="field-textarea" data-blog-block-field="text"' + dp + ">" + blogEsc(b.text || "") + "</textarea>";
    } else if (type === "image") {
      inner =
        '<span class="field-label">Image URL</span>' +
        '<input type="text" class="field-input" data-blog-block-field="url"' + dp + ' value="' + blogEsc(b.url || "") + '" placeholder="https://\u2026 or /images/\u2026" />' +
        '<span class="field-label">Alt text</span>' +
        '<input type="text" class="field-input" data-blog-block-field="alt"' + dp + ' value="' + blogEsc(b.alt || "") + '" />' +
        '<span class="field-label">Caption (optional)</span>' +
        '<input type="text" class="field-input" data-blog-block-field="caption"' + dp + ' value="' + blogEsc(b.caption || "") + '" />';
    }

    return (
      '<div class="repeater-item nested" data-blog-block-item' + dp + ">" +
        '<div class="repeater-header">' +
          '<span class="repeater-title">Block ' + (bIdx + 1) + " \u00b7 " + type + "</span>" +
          '<div class="repeater-actions">' +
            '<button type="button" class="icon-btn-sm" data-blog-action="block-up"' + dp + ' title="Move up">\u2191</button>' +
            '<button type="button" class="icon-btn-sm" data-blog-action="block-down"' + dp + ' title="Move down">\u2193</button>' +
            '<button type="button" class="icon-btn-sm danger" data-blog-action="block-remove"' + dp + ' title="Remove block">\u00d7</button>' +
          "</div>" +
        "</div>" +
        '<div class="block-type-row">' +
          '<span class="field-label" style="margin-top:0;margin-bottom:0">Type</span>' +
          '<select class="field-select" data-blog-block-type' + dp + ">" + typeOpts + "</select>" +
        "</div>" +
        inner +
      "</div>"
    );
  }

  function buildBlogSectionEditorHTML(section, idx) {
    var s = section || {};
    var dp = ' data-s-idx="' + idx + '"';
    var blocks = Array.isArray(s.blocks) ? s.blocks : [];
    var blocksHTML = blocks.length
      ? blocks.map(function (b, j) { return buildBlogBlockEditorHTML(b, idx, j); }).join("")
      : '<p class="repeater-empty">No blocks yet. Add one below.</p>';
    return (
      '<div class="repeater-item" data-blog-section-item' + dp + ">" +
        '<div class="repeater-header">' +
          '<span class="repeater-title">Section ' + (idx + 1) + (s.number ? " \u00b7 " + blogEsc(s.number) : "") + (s.heading ? " \u00b7 " + blogEsc(s.heading) : "") + "</span>" +
          '<div class="repeater-actions">' +
            '<button type="button" class="icon-btn-sm" data-blog-action="section-up"' + dp + ' title="Move up">\u2191</button>' +
            '<button type="button" class="icon-btn-sm" data-blog-action="section-down"' + dp + ' title="Move down">\u2193</button>' +
            '<button type="button" class="icon-btn-sm danger" data-blog-action="section-remove"' + dp + ' title="Remove section">\u00d7</button>' +
          "</div>" +
        "</div>" +
        '<div class="grid-2">' +
          '<label>ID (anchor) <input type="text" class="field-input" data-blog-section-field="id"' + dp + ' value="' + blogEsc(s.id || "") + '" placeholder="e.g. tldr" /></label>' +
          '<label>Number (marker) <input type="text" class="field-input" data-blog-section-field="number"' + dp + ' value="' + blogEsc(s.number || "") + '" placeholder="e.g. 01" /></label>' +
        "</div>" +
        '<label>Heading <input type="text" class="field-input" data-blog-section-field="heading"' + dp + ' value="' + blogEsc(s.heading || "") + '" /></label>' +
        '<div style="margin-top:10px">' +
          '<span class="field-label">Blocks</span>' +
          '<div class="repeater" data-blog-blocks-list' + dp + ">" + blocksHTML + "</div>" +
          '<button type="button" class="repeater-add" data-blog-action="block-add"' + dp + ">+ Add block</button>" +
        "</div>" +
      "</div>"
    );
  }

  function buildBlogTocItemHTML(item, idx) {
    var i = item || {};
    var dp = ' data-t-idx="' + idx + '"';
    return (
      '<div class="repeater-item" data-blog-toc-item' + dp + ">" +
        '<div class="repeater-header">' +
          '<span class="repeater-title">Item ' + (idx + 1) + "</span>" +
          '<div class="repeater-actions">' +
            '<button type="button" class="icon-btn-sm" data-blog-action="toc-up"' + dp + ' title="Move up">\u2191</button>' +
            '<button type="button" class="icon-btn-sm" data-blog-action="toc-down"' + dp + ' title="Move down">\u2193</button>' +
            '<button type="button" class="icon-btn-sm danger" data-blog-action="toc-remove"' + dp + ' title="Remove">\u00d7</button>' +
          "</div>" +
        "</div>" +
        '<div class="grid-2">' +
          '<label>ID (anchor) <input type="text" class="field-input" data-blog-toc-field="id"' + dp + ' value="' + blogEsc(i.id || "") + '" placeholder="matches a section id" /></label>' +
          '<label>Label <input type="text" class="field-input" data-blog-toc-field="label"' + dp + ' value="' + blogEsc(i.label || "") + '" /></label>' +
        "</div>" +
      "</div>"
    );
  }

  function buildBlogRelatedItemHTML(item, idx) {
    var r = item || {};
    var ci = r.coverImage || {};
    var dp = ' data-r-idx="' + idx + '"';
    return (
      '<div class="repeater-item" data-blog-related-item' + dp + ">" +
        '<div class="repeater-header">' +
          '<span class="repeater-title">Card ' + (idx + 1) + "</span>" +
          '<div class="repeater-actions">' +
            '<button type="button" class="icon-btn-sm" data-blog-action="rel-up"' + dp + ' title="Move up">\u2191</button>' +
            '<button type="button" class="icon-btn-sm" data-blog-action="rel-down"' + dp + ' title="Move down">\u2193</button>' +
            '<button type="button" class="icon-btn-sm danger" data-blog-action="rel-remove"' + dp + ' title="Remove">\u00d7</button>' +
          "</div>" +
        "</div>" +
        '<div class="grid-2">' +
          '<label>Slug <input type="text" class="field-input" data-blog-related-field="slug"' + dp + ' value="' + blogEsc(r.slug || "") + '" /></label>' +
          '<label>Title <input type="text" class="field-input" data-blog-related-field="title"' + dp + ' value="' + blogEsc(r.title || "") + '" /></label>' +
        "</div>" +
        '<label>Summary <textarea class="field-textarea" data-blog-related-field="summary"' + dp + ">" + blogEsc(r.summary || "") + "</textarea></label>" +
        '<div class="grid-2">' +
          '<label>Category <input type="text" class="field-input" data-blog-related-field="category"' + dp + ' value="' + blogEsc(r.category || "") + '" /></label>' +
          '<label>Reading time (minutes) <input type="number" min="0" step="1" class="field-input" data-blog-related-field="readingTimeMinutes"' + dp + ' value="' + blogEsc(r.readingTimeMinutes || 0) + '" /></label>' +
        "</div>" +
        '<div class="grid-2">' +
          '<label>Published date <input type="date" class="field-input" data-blog-related-field="publishedAt"' + dp + ' value="' + blogEsc(String(r.publishedAt || "").slice(0, 10)) + '" /></label>' +
          '<label>Cover image URL <input type="text" class="field-input" data-blog-related-field="coverImage.url"' + dp + ' value="' + blogEsc(ci.url || "") + '" /></label>' +
        "</div>" +
        '<label>Cover image alt <input type="text" class="field-input" data-blog-related-field="coverImage.alt"' + dp + ' value="' + blogEsc(ci.alt || "") + '" /></label>' +
      "</div>"
    );
  }

  function renderBlogTocList() {
    var el = $("blogTocList");
    if (!el) return;
    if (!blogState.toc.length) {
      el.innerHTML = '<p class="repeater-empty">No TOC entries yet. Body sections will auto-generate this when saved.</p>';
      return;
    }
    el.innerHTML = blogState.toc.map(buildBlogTocItemHTML).join("");
  }
  function renderBlogBodyList() {
    var el = $("blogBodyList");
    if (!el) return;
    if (!blogState.body.length) {
      el.innerHTML = '<p class="repeater-empty">No sections yet. Add one below.</p>';
      return;
    }
    el.innerHTML = blogState.body.map(buildBlogSectionEditorHTML).join("");
  }
  function renderBlogRelatedList() {
    var el = $("blogRelatedList");
    if (!el) return;
    if (!blogState.related.length) {
      el.innerHTML = '<p class="repeater-empty">No related articles yet.</p>';
      return;
    }
    el.innerHTML = blogState.related.map(buildBlogRelatedItemHTML).join("");
  }
  function renderBlogDynamic() {
    renderBlogTocList();
    renderBlogBodyList();
    renderBlogRelatedList();
  }

  function moveBlogArrayItem(arr, idx, delta, rerender) {
    if (!arr || isNaN(idx) || idx < 0 || idx >= arr.length) return;
    var j = idx + delta;
    if (j < 0 || j >= arr.length) return;
    var tmp = arr[j]; arr[j] = arr[idx]; arr[idx] = tmp;
    if (rerender) rerender();
  }
  function removeBlogArrayItem(arr, idx, rerender) {
    if (!arr || isNaN(idx) || idx < 0 || idx >= arr.length) return;
    arr.splice(idx, 1);
    if (rerender) rerender();
  }

  function getBlogCsvTags() {
    var raw = ($("blogTags") && $("blogTags").value) || "";
    return raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function readBlogPayloadFromForm() {
    var slug = slugify($("blogSlug").value) || slugify($("blogTitle").value);
    var rt = parseInt($("blogReadingTimeMinutes").value, 10);
    return {
      slug: slug,
      title: $("blogTitle").value.trim(),
      summary: $("blogSummary").value.trim(),
      category: $("blogCategory").value.trim(),
      tags: getBlogCsvTags(),
      publishedAt: $("blogPublishedAt") && $("blogPublishedAt").value ? String($("blogPublishedAt").value).slice(0, 10) : "",
      readingTimeMinutes: isNaN(rt) ? 0 : Math.max(0, rt),
      authorId: ($("blogAuthorPick") && $("blogAuthorPick").value) || "",
      author: {
        name: $("blogAuthorName").value.trim(),
        role: $("blogAuthorRole").value.trim(),
        avatarUrl: $("blogAuthorAvatarUrl").value.trim(),
        bio: $("blogAuthorBio").value.trim(),
        linkedinUrl: $("blogAuthorLinkedinUrl").value.trim(),
        moreArticlesUrl: $("blogAuthorMoreArticlesUrl").value.trim(),
      },
      coverImage: {
        url: $("blogCoverImageUrl").value.trim(),
        alt: $("blogCoverImageAlt").value.trim(),
      },
      toc: blogState.toc.map(function (t) {
        return { id: String(t.id || "").trim(), label: String(t.label || "").trim() };
      }),
      body: blogState.body.map(function (s) {
        return {
          type: "section",
          id: String(s.id || "").trim(),
          number: String(s.number || "").trim(),
          heading: String(s.heading || "").trim(),
          blocks: (s.blocks || []).map(normalizeBlogBlock),
        };
      }),
      midCta: normalizeBlogCta(blogState.midCta),
      finalCta: normalizeBlogCta(blogState.finalCta),
      related: blogState.related.map(function (r) {
        var ci = r.coverImage || {};
        return {
          slug: String(r.slug || "").trim(),
          title: String(r.title || "").trim(),
          summary: String(r.summary || "").trim(),
          category: String(r.category || "").trim(),
          readingTimeMinutes: Number(r.readingTimeMinutes) || 0,
          publishedAt: String(r.publishedAt || "").slice(0, 10),
          coverImage: { url: String(ci.url || "").trim(), alt: String(ci.alt || "").trim() },
        };
      }),
      seo: {
        metaTitle: $("blogSeoMetaTitle").value.trim(),
        metaDescription: $("blogSeoMetaDescription").value.trim(),
      },
    };
  }

  function applyBlogDataToForm(data) {
    data = data || {};
    blogJsonSyncing = true;
    try {
      var isEdit = !!$("blogEditId").value;
      if (!isEdit) $("blogSlug").value = data.slug || "";
      $("blogTitle").value = data.title || "";
      $("blogSummary").value = data.summary || "";
      $("blogCategory").value = data.category || "";
      $("blogTags").value = Array.isArray(data.tags) ? data.tags.join(", ") : "";
      $("blogPublishedAt").value = String(data.publishedAt || "").slice(0, 10);
      $("blogReadingTimeMinutes").value = String(Number(data.readingTimeMinutes) || 0);
      var a = data.author || {};
      $("blogAuthorName").value = a.name || "";
      $("blogAuthorRole").value = a.role || "";
      $("blogAuthorAvatarUrl").value = a.avatarUrl || "";
      $("blogAuthorBio").value = a.bio || "";
      $("blogAuthorLinkedinUrl").value = a.linkedinUrl || "";
      $("blogAuthorMoreArticlesUrl").value = a.moreArticlesUrl || "";
      setBlogAuthorPick(resolveBlogAuthorPickId(data));
      var ci = data.coverImage || {};
      $("blogCoverImageUrl").value = ci.url || "";
      $("blogCoverImageAlt").value = ci.alt || "";
      var seo = data.seo || {};
      $("blogSeoMetaTitle").value = seo.metaTitle || "";
      $("blogSeoMetaDescription").value = seo.metaDescription || "";

      // Map inputs into normalized state, then strip schema placeholders so the
      // form mirrors the actual data — placeholders live only in the JSON view.
      blogState.toc = (Array.isArray(data.toc) ? data.toc : [])
        .map(function (t) {
          t = t || {};
          return { id: String(t.id || ""), label: String(t.label || "") };
        })
        .filter(function (t) { return !isEmptyBlogTocItem(t); });
      blogState.body = (Array.isArray(data.body) ? data.body : [])
        .map(function (s) {
          s = s || {};
          var rawBlocks = Array.isArray(s.blocks) ? s.blocks.map(normalizeBlogBlock) : [];
          return {
            type: "section",
            id: String(s.id || ""),
            number: String(s.number || ""),
            heading: String(s.heading || ""),
            blocks: rawBlocks.filter(function (b) { return !isEmptyBlogBlock(b); }),
          };
        })
        .filter(function (s) { return !isEmptyBlogSection(s); });
      blogState.midCta = normalizeBlogCta(data.midCta);
      blogState.finalCta = normalizeBlogCta(data.finalCta);
      blogState.related = (Array.isArray(data.related) ? data.related : [])
        .map(function (r) {
          r = r || {};
          var ci2 = r.coverImage || {};
          return {
            slug: String(r.slug || ""),
            title: String(r.title || ""),
            summary: String(r.summary || ""),
            category: String(r.category || ""),
            readingTimeMinutes: Number(r.readingTimeMinutes) || 0,
            publishedAt: String(r.publishedAt || "").slice(0, 10),
            coverImage: { url: String(ci2.url || ""), alt: String(ci2.alt || "") },
          };
        })
        .filter(function (r) { return !isEmptyBlogRelated(r); });

      renderBlogDynamic();
    } finally {
      blogJsonSyncing = false;
    }
  }

  function setBlogJsonStatus(kind, msg) {
    var el = $("blogJsonStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.className = kind === "err" ? "err" : "ok";
  }

  function writeBlogJsonTextarea(obj) {
    var ta = $("blogJson");
    if (!ta) return;
    blogJsonSyncing = true;
    try { ta.value = JSON.stringify(obj, null, 2); }
    finally { blogJsonSyncing = false; }
  }

  function syncBlogJsonFromForm() {
    if (!$("blogJson")) return;
    writeBlogJsonTextarea(buildBlogJsonViewPayload());
    setBlogJsonStatus("ok", "");
  }

  function tryApplyBlogJsonToForm() {
    var ta = $("blogJson");
    if (!ta) return true;
    var raw = ta.value;
    if (!raw.trim()) { setBlogJsonStatus("err", "JSON is empty."); return false; }
    var data;
    try { data = JSON.parse(raw); }
    catch (e) { setBlogJsonStatus("err", "Invalid JSON: " + e.message); return false; }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      setBlogJsonStatus("err", "JSON must be an object.");
      return false;
    }
    applyBlogDataToForm(data);
    setBlogJsonStatus("ok", "");
    return true;
  }

  function onBlogFieldInput() {
    if (blogJsonSyncing) return;
    blogLastEditedSide = "form";
    if (blogJsonSyncTimer) clearTimeout(blogJsonSyncTimer);
    blogJsonSyncTimer = setTimeout(function () { blogJsonSyncTimer = null; syncBlogJsonFromForm(); }, 150);
  }

  function onBlogJsonInput() {
    if (blogJsonSyncing) return;
    blogLastEditedSide = "json";
    if (blogJsonParseTimer) clearTimeout(blogJsonParseTimer);
    blogJsonParseTimer = setTimeout(function () { blogJsonParseTimer = null; tryApplyBlogJsonToForm(); }, 200);
  }

  function flushBlogPendingSync() {
    if (blogJsonSyncTimer) { clearTimeout(blogJsonSyncTimer); blogJsonSyncTimer = null; }
    if (blogJsonParseTimer) { clearTimeout(blogJsonParseTimer); blogJsonParseTimer = null; }
  }

  function setBlogModalMode(isNew, isDraft) {
    var t = $("blogModalTitle"), d = $("blogModalDesc");
    if (!t) return;
    if (isNew) {
      t.textContent = "New blog post";
      if (d) d.textContent = "Save as a draft to work in private, or publish when it\u2019s ready for the site.";
      return;
    }
    t.textContent = "Edit blog post";
    if (d) d.textContent = isDraft
      ? "This blog post is a draft \u2014 not visible on the public site until you save & publish."
      : "This blog post is live. Use Unpublish to hide it, or Save & publish to update.";
  }

  function syncBlogButtons() {
    var editId = $("blogEditId").value;
    var unpub = $("btnBlogUnpublish"), draft = $("btnBlogSaveDraft"), del = $("btnDeleteBlog");
    if (del) del.hidden = !editId;
    if (unpub && draft) { var live = !!editId && blogModalDocPublished; unpub.hidden = !live; draft.hidden = live; }
  }

  // ─── Dynamic event delegation ─────────────────────────────
  function setupBlogDelegation() {
    if (blogDelegationWired) return;
    var form = $("blogForm"); if (!form) return;
    blogDelegationWired = true;

    form.addEventListener("input", function (e) {
      var t = e.target; if (!t || !t.matches) return;
      if (t.matches("[data-blog-toc-field]")) {
        var i = parseInt(t.getAttribute("data-t-idx"), 10);
        var f = t.getAttribute("data-blog-toc-field");
        if (!isNaN(i) && blogState.toc[i]) blogState.toc[i][f] = t.value;
      } else if (t.matches("[data-blog-section-field]")) {
        var si = parseInt(t.getAttribute("data-s-idx"), 10);
        var sf = t.getAttribute("data-blog-section-field");
        if (!isNaN(si) && blogState.body[si]) blogState.body[si][sf] = t.value;
      } else if (t.matches("[data-blog-block-field]")) {
        var bs = parseInt(t.getAttribute("data-s-idx"), 10);
        var bb = parseInt(t.getAttribute("data-b-idx"), 10);
        var bf = t.getAttribute("data-blog-block-field");
        var sec = blogState.body[bs]; if (!sec) return;
        var blk = sec.blocks && sec.blocks[bb]; if (!blk) return;
        if (bf === "items") {
          blk.items = t.value.split(/\n/);
        } else if (bf === "style") {
          blk.style = t.value === "number" ? "number" : "bullet";
        } else {
          blk[bf] = t.value;
        }
      } else if (t.matches("[data-blog-related-field]")) {
        var ri = parseInt(t.getAttribute("data-r-idx"), 10);
        var rf = t.getAttribute("data-blog-related-field");
        var rel = blogState.related[ri]; if (!rel) return;
        if (rf === "coverImage.url") {
          rel.coverImage = rel.coverImage || { url: "", alt: "" };
          rel.coverImage.url = t.value;
        } else if (rf === "coverImage.alt") {
          rel.coverImage = rel.coverImage || { url: "", alt: "" };
          rel.coverImage.alt = t.value;
        } else if (rf === "readingTimeMinutes") {
          rel.readingTimeMinutes = Number(t.value) || 0;
        } else {
          rel[rf] = t.value;
        }
      }
    });

    form.addEventListener("change", function (e) {
      var t = e.target; if (!t || !t.matches) return;
      if (t.matches("[data-blog-block-type]")) {
        var bs = parseInt(t.getAttribute("data-s-idx"), 10);
        var bb = parseInt(t.getAttribute("data-b-idx"), 10);
        var sec = blogState.body[bs]; if (!sec) return;
        sec.blocks[bb] = makeEmptyBlogBlock(t.value);
        renderBlogBodyList();
        onBlogFieldInput();
      }
    });

    form.addEventListener("click", function (e) {
      var t = e.target; if (!t || !t.matches) return;

      if (t.matches("[data-blog-add]")) {
        var kind = t.getAttribute("data-blog-add");
        if (kind === "toc") { blogState.toc.push(makeEmptyBlogTocItem()); renderBlogTocList(); }
        else if (kind === "section") { blogState.body.push(makeEmptyBlogSection()); renderBlogBodyList(); }
        else if (kind === "related") { blogState.related.push(makeEmptyBlogRelated()); renderBlogRelatedList(); }
        onBlogFieldInput();
        return;
      }

      if (!t.matches("[data-blog-action]")) return;
      var action = t.getAttribute("data-blog-action");
      var si = parseInt(t.getAttribute("data-s-idx"), 10);
      var bi = parseInt(t.getAttribute("data-b-idx"), 10);
      var ti = parseInt(t.getAttribute("data-t-idx"), 10);
      var ri = parseInt(t.getAttribute("data-r-idx"), 10);

      if (action === "toc-up") moveBlogArrayItem(blogState.toc, ti, -1, renderBlogTocList);
      else if (action === "toc-down") moveBlogArrayItem(blogState.toc, ti, 1, renderBlogTocList);
      else if (action === "toc-remove") removeBlogArrayItem(blogState.toc, ti, renderBlogTocList);
      else if (action === "section-up") moveBlogArrayItem(blogState.body, si, -1, renderBlogBodyList);
      else if (action === "section-down") moveBlogArrayItem(blogState.body, si, 1, renderBlogBodyList);
      else if (action === "section-remove") removeBlogArrayItem(blogState.body, si, renderBlogBodyList);
      else if (action === "block-add") {
        var sec = blogState.body[si]; if (!sec) return;
        sec.blocks = sec.blocks || [];
        sec.blocks.push(makeEmptyBlogBlock("paragraph"));
        renderBlogBodyList();
      } else if (action === "block-up") {
        var sec2 = blogState.body[si]; if (!sec2) return;
        moveBlogArrayItem(sec2.blocks, bi, -1, renderBlogBodyList);
      } else if (action === "block-down") {
        var sec3 = blogState.body[si]; if (!sec3) return;
        moveBlogArrayItem(sec3.blocks, bi, 1, renderBlogBodyList);
      } else if (action === "block-remove") {
        var sec4 = blogState.body[si]; if (!sec4) return;
        removeBlogArrayItem(sec4.blocks, bi, renderBlogBodyList);
      } else if (action === "rel-up") moveBlogArrayItem(blogState.related, ri, -1, renderBlogRelatedList);
      else if (action === "rel-down") moveBlogArrayItem(blogState.related, ri, 1, renderBlogRelatedList);
      else if (action === "rel-remove") removeBlogArrayItem(blogState.related, ri, renderBlogRelatedList);
      else return;

      onBlogFieldInput();
    });
  }

  function openNewBlogModal() {
    setupBlogDelegation();
    blogModalDocPublished = false;
    blogOriginalData = JSON.parse(JSON.stringify(EMPTY_BLOG_TEMPLATE));
    $("blogEditId").value = "";
    $("blogSlug").readOnly = false;
    applyBlogDataToForm(EMPTY_BLOG_TEMPLATE);
    setBlogModalMode(true, true);
    syncBlogButtons();
    flushBlogPendingSync();
    writeBlogJsonTextarea(buildBlogJsonViewPayload());
    setBlogJsonStatus("ok", "");
    blogLastEditedSide = "form";
    var cf = $("blogCoverFile"); if (cf) cf.value = "";
    var af = $("blogAuthorAvatarFile"); if (af) af.value = "";
    showBlogAiGenerator(true);
    clearBlogAiInputs();
    openModal("blogModal");
    $("blogSaveStatus").textContent = "";
    setTimeout(function () { $("blogTitle").focus(); }, 0);
  }

  function openEditBlogModal(data, docId) {
    setupBlogDelegation();
    blogModalDocPublished = !!data.published;
    blogOriginalData = JSON.parse(JSON.stringify(data || {}));
    $("blogEditId").value = docId;
    $("blogSlug").value = data.slug || docId || "";
    $("blogSlug").readOnly = true;
    applyBlogDataToForm(data);
    setBlogModalMode(false, !data.published);
    syncBlogButtons();
    flushBlogPendingSync();
    writeBlogJsonTextarea(buildBlogJsonViewPayload());
    setBlogJsonStatus("ok", "");
    blogLastEditedSide = "form";
    var cf = $("blogCoverFile"); if (cf) cf.value = "";
    var af = $("blogAuthorAvatarFile"); if (af) af.value = "";
    showBlogAiGenerator(false);
    openModal("blogModal");
    $("blogSaveStatus").textContent = "";
    setTimeout(function () { $("blogTitle").focus(); }, 0);
  }

  function buildBlogCard(doc, data, onEdit) {
    var card = document.createElement("article"); card.className = "project-card";
    var thumb = document.createElement("div"); thumb.className = "project-card-thumb";
    var coverUrl = (data.coverImage && data.coverImage.url) || data.coverImageUrl || "";
    if (coverUrl) {
      var img = document.createElement("img");
      img.src = coverUrl; img.alt = ""; img.loading = "lazy";
      thumb.appendChild(img);
    }
    var body = document.createElement("div"); body.className = "project-card-body";
    var h3 = document.createElement("h3"); h3.className = "project-card-title";
    h3.textContent = data.title || doc.id;
    var authorName = (data.author && typeof data.author === "object" && data.author.name) ||
      (typeof data.author === "string" ? data.author : "");
    var date = data.publishedAt || data.date || "";
    var meta = document.createElement("div"); meta.className = "project-card-meta";
    meta.textContent = (authorName || "") + ((authorName && date) ? "  \u00b7  " : "") + (date || "");
    var sum = document.createElement("p"); sum.className = "project-card-summary";
    sum.textContent = snippet(data.summary, 200);
    var btn = document.createElement("button"); btn.type = "button"; btn.textContent = "Edit"; btn.onclick = onEdit;
    body.appendChild(h3); body.appendChild(meta); body.appendChild(sum); body.appendChild(btn);
    card.appendChild(thumb); card.appendChild(body);
    return card;
  }

  function blogSortKey(d) {
    var raw = d.publishedAt || d.date;
    if (!raw) return 0;
    if (typeof raw === "object" && typeof raw.toMillis === "function") return raw.toMillis();
    var dt = raw instanceof Date ? raw : new Date(raw);
    return isNaN(dt.getTime()) ? 0 : dt.getTime();
  }

  async function refreshBlogPosts() {
    var listPub = $("blogListPublished"), listDraft = $("blogListDrafts");
    var pubEmpty = $("blogPubEmpty"), draftEmpty = $("blogDraftEmpty");
    if (listPub) listPub.innerHTML = "";
    if (listDraft) listDraft.innerHTML = "";
    var snap = await db.collection("blog_posts").get();
    var published = [], drafts = [];
    snap.forEach(function (doc) {
      var d = doc.data();
      (d.published ? published : drafts).push({ doc: doc, d: d });
    });
    published.sort(function (a, b) { return blogSortKey(b.d) - blogSortKey(a.d); });
    drafts.sort(function (a, b) { return blogSortKey(b.d) - blogSortKey(a.d); });
    if (pubEmpty) pubEmpty.hidden = published.length > 0;
    if (draftEmpty) draftEmpty.hidden = drafts.length > 0;
    published.forEach(function (r) {
      if (listPub) listPub.appendChild(buildBlogCard(r.doc, r.d, function () { openEditBlogModal(r.d, r.doc.id); }));
    });
    drafts.forEach(function (r) {
      if (listDraft) listDraft.appendChild(buildBlogCard(r.doc, r.d, function () { openEditBlogModal(r.d, r.doc.id); }));
    });
  }

  async function uploadBlogCover(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file || !auth.currentUser) return;
    var slug = slugify($("blogSlug").value) || "blog-" + Date.now();
    var path = "blog/" + slug + "/cover-" + Date.now() + "-" + file.name.replace(/\s/g, "_");
    $("blogUploadStatus").textContent = "Uploading\u2026";
    try {
      var ref = storage.ref(path);
      await ref.put(file);
      $("blogCoverImageUrl").value = await ref.getDownloadURL();
      $("blogUploadStatus").textContent = "Uploaded.";
      onBlogFieldInput();
    } catch (e) {
      console.error("blog cover upload error", e);
      $("blogUploadStatus").textContent = "Upload failed.";
    }
  }

  async function uploadBlogAuthorAvatar(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file || !auth.currentUser) return;
    var slug = slugify($("blogSlug").value) || "blog-" + Date.now();
    var path = "blog/" + slug + "/author-" + Date.now() + "-" + file.name.replace(/\s/g, "_");
    $("blogAuthorUploadStatus").textContent = "Uploading\u2026";
    try {
      var ref = storage.ref(path);
      await ref.put(file);
      $("blogAuthorAvatarUrl").value = await ref.getDownloadURL();
      $("blogAuthorUploadStatus").textContent = "Uploaded.";
      onBlogFieldInput();
    } catch (e) {
      console.error("blog author avatar upload error", e);
      $("blogAuthorUploadStatus").textContent = "Upload failed.";
    }
  }

  function validateBlogPayload(p) {
    if (!p.title) return "Title is required.";
    if (!p.slug) return "Set a URL slug.";
    if (!slugPatternOk(p.slug)) return "Slug must use lowercase letters, numbers, and single hyphens only.";
    for (var i = 0; i < (p.body || []).length; i++) {
      var s = p.body[i];
      if (!s.id) return "Section " + (i + 1) + " is missing an ID (anchor).";
      if (!s.heading) return "Section " + (i + 1) + " is missing a heading.";
    }
    for (var j = 0; j < (p.related || []).length; j++) {
      var r = p.related[j];
      if (!r.slug || !r.title) return "Related card " + (j + 1) + " needs a slug and a title.";
    }
    return null;
  }

  async function saveBlogPost(published) {
    $("blogSaveStatus").textContent = "";
    $("blogSaveStatus").className = "ok";

    flushBlogPendingSync();
    if (blogLastEditedSide === "json") {
      if (!tryApplyBlogJsonToForm()) {
        blogPendingSavePublished = published;
        openModal("blogJsonErrorModal");
        return;
      }
    } else {
      syncBlogJsonFromForm();
    }

    var form = $("blogForm"); if (form && !form.reportValidity()) return;
    // Strip any schema placeholders that exist only for the JSON-view documentation.
    var payload = stripBlogPlaceholders(readBlogPayloadFromForm());

    var err = validateBlogPayload(payload);
    if (err) { $("blogSaveStatus").textContent = err; $("blogSaveStatus").className = "err"; return; }

    if (!payload.toc.length && payload.body && payload.body.length) {
      payload.toc = payload.body
        .filter(function (s) { return s.id && s.heading; })
        .map(function (s) { return { id: s.id, label: s.heading }; });
    }
    payload.published = !!published;

    var editId = $("blogEditId").value;
    var docId = editId || payload.slug;
    var wasLive = blogModalDocPublished;
    try {
      // merge:false replaces the document with the new schema (migrate-now).
      await db.collection("blog_posts").doc(docId).set(
        Object.assign({}, payload, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }),
        { merge: false }
      );
      blogModalDocPublished = !!published;
      $("blogSaveStatus").textContent = published
        ? "Saved and published."
        : wasLive ? "Unpublished \u2014 saved as draft." : "Draft saved.";
      $("blogEditId").value = docId;
      $("blogSlug").readOnly = true;
      setBlogModalMode(false, !published);
      syncBlogButtons();
      writeBlogJsonTextarea(buildBlogJsonViewPayload());
      blogOriginalData = JSON.parse(JSON.stringify(payload));
      await refreshBlogPosts();
    } catch (e) {
      console.error(e);
      $("blogSaveStatus").textContent = "Save failed: " + (e.message || e);
      $("blogSaveStatus").className = "err";
    }
  }

  async function deleteBlogPost() {
    var editId = $("blogEditId").value; if (!editId) return;
    if (!confirm('Delete blog post "' + ($("blogTitle").value.trim() || editId) + '" permanently?')) return;
    try {
      await db.collection("blog_posts").doc(editId).delete();
      closeModal("blogModal");
      await refreshBlogPosts();
    } catch (e) {
      $("blogSaveStatus").textContent = "Delete failed: " + (e.message || e);
      $("blogSaveStatus").className = "err";
    }
  }

  // ─── AI blog generator ─────────────────────────────
  function showBlogAiGenerator(visible) {
    var el = $("blogAiGenerator"); if (!el) return;
    el.hidden = !visible;
    if (visible) el.open = true;
  }

  function setBlogAiStatus(kind, msg) {
    var el = $("blogAiStatus"); if (!el) return;
    el.textContent = msg || "";
    el.className = kind === "err" ? "err" : "ok";
  }

  function clearBlogAiInputs() {
    ["blogAiTopic", "blogAiAudience", "blogAiKeyword", "blogAiCategory", "blogAiNotes"].forEach(function (id) {
      var el = $(id); if (el) el.value = "";
    });
    var tone = $("blogAiTone"); if (tone) tone.value = "studio";
    var img = $("blogAiImageStyle"); if (img) img.value = "editorial";
    var sec = $("blogAiSections"); if (sec) sec.value = "4";
    var gen = $("blogAiGenerateImage"); if (gen) gen.checked = true;
    setBlogAiStatus("ok", "");
  }

  function describeBlogAiError(data, status) {
    var code = (data && data.error) || "unknown";
    var detail = (data && data.detail) || "";
    var httpStatus = (typeof status === "number" && status > 0)
      ? status
      : (data && data.status ? data.status : 0);
    var upstream = data && data.upstreamStatus ? " [HTTP " + data.upstreamStatus + "]" : "";
    var model = data && data.model ? " (model: " + data.model + ")" : "";
    var detailSuffix = detail ? " \u2014 " + detail : "";
    if (httpStatus === 503 || code === "service_unavailable" || code === "unavailable") {
      return "AI service is temporarily unavailable. Please try again in a minute." + detailSuffix;
    }
    switch (code) {
      case "missing_token":
      case "token_expired":
      case "invalid_token":
        return "Sign in again to use the AI generator.";
      case "not_admin":
        return "Your account is not in the admins list.";
      case "rate_limited":
        return "Too many generations recently. Wait a minute and try again.";
      case "missing_topic":
        return "Add a topic before generating.";
      case "openai_key_missing":
        return "OpenAI key isn\u2019t configured. Add OPENAI_API_KEY to functions/.env and redeploy.";
      case "openai_responses_failed":
      case "openai_chat_failed":
        return "OpenAI rejected the request" + upstream + model + detailSuffix;
      case "openai_responses_empty":
        return "OpenAI returned no text" + model + detailSuffix;
      case "openai_responses_invalid_json":
        return "OpenAI returned non-JSON" + model + detailSuffix;
      case "openai_refusal":
        return "OpenAI refused the request" + detailSuffix;
      case "ai_output_invalid":
        return "AI response didn\u2019t match the blog schema" + detailSuffix;
      case "existing_posts_failed":
        return "Couldn\u2019t read existing posts. Try again.";
      case "slug_check_failed":
        return "Couldn\u2019t reserve a unique slug. Try again.";
      default:
        return "Generation failed (" + code + ")" + (httpStatus ? " [HTTP " + httpStatus + "]" : "") + detailSuffix;
    }
  }

  async function generateBlogWithAi() {
    var btn = $("btnBlogAiGenerate");
    var topic = ($("blogAiTopic") && $("blogAiTopic").value || "").trim();
    if (!topic) {
      setBlogAiStatus("err", "Add a topic or working title first.");
      var t = $("blogAiTopic"); if (t) t.focus();
      return;
    }
    var user = auth && auth.currentUser;
    if (!user) {
      setBlogAiStatus("err", "Sign in again before generating.");
      return;
    }

    var payload = {
      topic: topic,
      audience: ($("blogAiAudience") && $("blogAiAudience").value || "").trim(),
      keyword: ($("blogAiKeyword") && $("blogAiKeyword").value || "").trim(),
      category: ($("blogAiCategory") && $("blogAiCategory").value || "").trim(),
      tone: ($("blogAiTone") && $("blogAiTone").value || "").trim(),
      imageStyle: ($("blogAiImageStyle") && $("blogAiImageStyle").value || "").trim(),
      sectionsCount: parseInt(($("blogAiSections") && $("blogAiSections").value) || "0", 10) || 0,
      notes: ($("blogAiNotes") && $("blogAiNotes").value || "").trim(),
      generateImage: !!($("blogAiGenerateImage") && $("blogAiGenerateImage").checked),
    };

    if (btn) btn.disabled = true;
    setBlogAiStatus("ok", "Reviewing the blog and drafting content\u2026 this can take ~30\u201360s.");

    try {
      var token = await user.getIdToken();
      var resp = await fetch("/api/generate-blog-post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(payload),
      });
      var data = await resp.json().catch(function () { return {}; });
      if (!resp.ok || !data.ok) {
        setBlogAiStatus("err", describeBlogAiError(data, resp.status));
        return;
      }
      if (!data.payload || typeof data.payload !== "object") {
        setBlogAiStatus("err", "The server returned an empty draft.");
        return;
      }

      // Reset modal state so we treat this as a fresh draft, then load the
      // generated content via the existing form-population path.
      blogModalDocPublished = false;
      blogOriginalData = JSON.parse(JSON.stringify(data.payload));
      $("blogEditId").value = "";
      $("blogSlug").readOnly = false;
      applyBlogDataToForm(data.payload);
      setBlogModalMode(true, true);
      syncBlogButtons();
      flushBlogPendingSync();
      syncBlogJsonFromForm();
      blogLastEditedSide = "form";

      var summary = "Draft loaded into the form. Review before saving.";
      summary += " Considered " + (data.existingPostsConsidered || 0) + " existing posts.";
      if (data.textModel) summary += " Text: " + data.textModel + ".";
      if (data.imageGenerated) {
        summary += " Cover image uploaded to Firebase Storage";
        if (data.imageModel) summary += " (" + data.imageModel + ")";
        summary += ".";
      } else if (payload.generateImage) {
        if (data.imageError && data.imageError.detail) {
          summary += " Cover image failed (" + (data.imageError.model || "image model") + "): "
            + data.imageError.detail
            + (data.imageError.status ? " [HTTP " + data.imageError.status + "]" : "")
            + ". Add a cover manually.";
        } else {
          summary += " Cover image generation skipped or failed — add one manually if needed.";
        }
      }
      setBlogAiStatus("ok", summary);

      var titleEl = $("blogTitle");
      if (titleEl) setTimeout(function () { titleEl.focus(); }, 0);
    } catch (e) {
      console.error("AI blog generation failed", e);
      setBlogAiStatus("err", "Network error: " + (e && e.message ? e.message : e));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ─── Blog JSON-error modal actions ───
  function onBlogJsonErrFix() {
    closeModal("blogJsonErrorModal");
    flushBlogPendingSync();
    syncBlogJsonFromForm();
    blogLastEditedSide = "form";
    var p = blogPendingSavePublished;
    blogPendingSavePublished = null;
    if (p !== null) saveBlogPost(!!p);
  }

  function onBlogJsonErrDiscard() {
    closeModal("blogJsonErrorModal");
    flushBlogPendingSync();
    blogPendingSavePublished = null;
    var orig = blogOriginalData || EMPTY_BLOG_TEMPLATE;
    var editId = $("blogEditId").value || "";
    applyBlogDataToForm(orig);
    if (editId) $("blogSlug").readOnly = true;
    writeBlogJsonTextarea(buildBlogJsonViewPayload());
    setBlogJsonStatus("ok", "");
    blogLastEditedSide = "form";
    closeModal("blogModal");
  }

  function onBlogJsonErrKeep() {
    closeModal("blogJsonErrorModal");
    blogPendingSavePublished = null;
    setTimeout(function () { var ta = $("blogJson"); if (ta) ta.focus(); }, 0);
  }

  // ═══════════════════════════════════
  //  AUTH
  // ═══════════════════════════════════
  async function ensureAdminUser(user) {
    try { return (await db.collection("admins").doc(user.uid).get()).exists; }
    catch (e) { return false; }
  }

  async function signIn(ev) {
    ev.preventDefault();
    $("auth-error").textContent = "";
    try {
      var cred = await auth.signInWithEmailAndPassword($("email").value.trim(), $("password").value);
      if (!(await ensureAdminUser(cred.user))) { show($("loginPanel"), false); show($("firstSetupPanel"), true); return; }
      show($("loginPanel"), false); show($("adminPanel"), true);
    } catch (e) { $("auth-error").textContent = e.message || String(e); }
  }

  async function completeFirstSetup() {
    $("firstSetupMsg").textContent = ""; $("firstSetupMsg").className = "ok";
    var user = auth.currentUser; if (!user) { $("firstSetupMsg").textContent = "Sign in first."; $("firstSetupMsg").className = "err"; return; }
    try {
      var token = await user.getIdToken();
      var r = await fetch("/api/bootstrap-admin", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: "{}" });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok || !data.ok) { $("firstSetupMsg").className = "err"; $("firstSetupMsg").textContent = data.message || data.error || "Setup failed."; return; }
      $("firstSetupMsg").textContent = "Done. Loading\u2026";
      show($("firstSetupPanel"), false); show($("adminPanel"), true);
    } catch (e) { $("firstSetupMsg").className = "err"; $("firstSetupMsg").textContent = e.message || String(e); }
  }

  async function signOut() {
    closeModal("projectModal"); closeModal("projectJsonErrorModal");
    closeModal("reviewModal"); closeModal("companyModal");
    closeModal("authorModal");
    closeModal("blogModal"); closeModal("blogJsonErrorModal");
    await auth.signOut();
    show($("loginPanel"), true); show($("firstSetupPanel"), false); show($("adminPanel"), false);
  }

  async function refreshAll() {
    await refreshCompanies();
    await Promise.all([refreshAuthors(), refreshList(), refreshReviews(), refreshBlogPosts()]);
  }

  // ═══════════════════════════════════
  //  INIT
  // ═══════════════════════════════════
  document.addEventListener("DOMContentLoaded", function () {
    if (!initFirebase()) return;

    // Auth
    $("loginForm").addEventListener("submit", signIn);
    $("logoutBtn").addEventListener("click", signOut);
    $("btnFirstAdmin").addEventListener("click", completeFirstSetup);
    $("btnFirstSetupSignOut").addEventListener("click", signOut);

    // Companies
    $("newCompanyBtn").addEventListener("click", openNewCompanyModal);
    $("btnCompanySave").addEventListener("click", saveCompany);
    $("btnCompanyCancel").addEventListener("click", function () { closeModal("companyModal"); });
    $("companyModalCloseBtn").addEventListener("click", function () { closeModal("companyModal"); });
    $("btnDeleteCompany").addEventListener("click", deleteCompany);
    $("companyLogoFile").addEventListener("change", uploadCompanyLogo);
    $("companyForm").addEventListener("submit", function (ev) { ev.preventDefault(); });
    var cm = $("companyModal");
    if (cm) cm.addEventListener("click", function (e) { if (e.target === cm) closeModal("companyModal"); });

    // Projects
    $("newBtn").addEventListener("click", openNewProjectModal);
    $("btnSaveDraft").addEventListener("click", function () { saveProject(false); });
    $("btnSavePublish").addEventListener("click", function () { saveProject(true); });
    $("btnUnpublish").addEventListener("click", function () { saveProject(false); });
    $("btnDeleteProject").addEventListener("click", deleteProject);
    function closeProjectModalCleanup() {
      flushPendingSync();
      pendingSavePublished = null;
      closeModal("projectJsonErrorModal");
      closeModal("projectModal");
    }
    $("btnModalCancel").addEventListener("click", closeProjectModalCleanup);
    $("modalCloseBtn").addEventListener("click", closeProjectModalCleanup);
    $("coverFile").addEventListener("change", uploadCover);
    $("galleryFiles").addEventListener("change", uploadGalleryImages);
    $("slugAuto").addEventListener("click", function () { $("slug").value = slugify($("title").value); });
    $("projectForm").addEventListener("submit", function (ev) { ev.preventDefault(); });
    var pm = $("projectModal");
    if (pm) pm.addEventListener("click", function (e) { if (e.target === pm) closeProjectModalCleanup(); });

    // JSON view ↔ form fields bidirectional sync (last edit wins)
    $("projectForm").addEventListener("input", function (e) {
      if (e.target && (e.target.id === "projectJson" || e.target.id === "coverFile" || e.target.id === "galleryFiles")) return;
      onProjectFieldInput();
    });
    $("projectForm").addEventListener("change", function (e) {
      if (e.target && (e.target.id === "projectJson" || e.target.id === "coverFile" || e.target.id === "galleryFiles")) return;
      onProjectFieldInput();
    });
    var pj = $("projectJson");
    if (pj) pj.addEventListener("input", onProjectJsonInput);
    $("btnJsonErrFix").addEventListener("click", onJsonErrFix);
    $("btnJsonErrDiscard").addEventListener("click", onJsonErrDiscard);
    $("btnJsonErrKeep").addEventListener("click", onJsonErrKeep);

    // Reviews
    $("newReviewBtn").addEventListener("click", openNewReviewModal);
    $("btnReviewSaveDraft").addEventListener("click", function () { saveReview(false); });
    $("btnReviewSavePublish").addEventListener("click", function () { saveReview(true); });
    $("btnReviewUnpublish").addEventListener("click", function () { saveReview(false); });
    $("btnDeleteReview").addEventListener("click", deleteReview);
    $("btnReviewCancel").addEventListener("click", function () { closeModal("reviewModal"); });
    $("reviewModalCloseBtn").addEventListener("click", function () { closeModal("reviewModal"); });
    $("reviewForm").addEventListener("submit", function (ev) { ev.preventDefault(); });
    var rm = $("reviewModal");
    if (rm) rm.addEventListener("click", function (e) { if (e.target === rm) closeModal("reviewModal"); });

    // Blog authors
    $("newAuthorBtn").addEventListener("click", openNewAuthorModal);
    $("btnAuthorSave").addEventListener("click", saveAuthor);
    $("btnAuthorCancel").addEventListener("click", function () { closeModal("authorModal"); });
    $("authorModalCloseBtn").addEventListener("click", function () { closeModal("authorModal"); });
    $("btnDeleteAuthor").addEventListener("click", deleteAuthor);
    $("authorAvatarFile").addEventListener("change", uploadAuthorAvatar);
    $("authorForm").addEventListener("submit", function (ev) { ev.preventDefault(); });
    var am = $("authorModal");
    if (am) am.addEventListener("click", function (e) { if (e.target === am) closeModal("authorModal"); });

    // Blog posts
    $("newBlogBtn").addEventListener("click", openNewBlogModal);
    var blogAuthorPick = $("blogAuthorPick");
    if (blogAuthorPick) blogAuthorPick.addEventListener("change", onBlogAuthorPickChange);
    $("btnBlogSaveDraft").addEventListener("click", function () { saveBlogPost(false); });
    $("btnBlogSavePublish").addEventListener("click", function () { saveBlogPost(true); });
    $("btnBlogUnpublish").addEventListener("click", function () { saveBlogPost(false); });
    $("btnDeleteBlog").addEventListener("click", deleteBlogPost);
    function closeBlogModalCleanup() {
      flushBlogPendingSync();
      blogPendingSavePublished = null;
      closeModal("blogJsonErrorModal");
      closeModal("blogModal");
    }
    $("btnBlogCancel").addEventListener("click", closeBlogModalCleanup);
    $("blogModalCloseBtn").addEventListener("click", closeBlogModalCleanup);
    $("blogCoverFile").addEventListener("change", uploadBlogCover);
    $("blogAuthorAvatarFile").addEventListener("change", uploadBlogAuthorAvatar);
    $("blogSlugAuto").addEventListener("click", function () {
      $("blogSlug").value = slugify($("blogTitle").value);
      onBlogFieldInput();
    });
    $("blogForm").addEventListener("submit", function (ev) { ev.preventDefault(); });
    var bm = $("blogModal");
    if (bm) bm.addEventListener("click", function (e) { if (e.target === bm) closeBlogModalCleanup(); });

    // Wire blog dynamic-list delegation now so events work whenever the modal opens.
    setupBlogDelegation();

    // Form ↔ JSON sync for the blog modal (mirrors the project modal pattern).
    $("blogForm").addEventListener("input", function (e) {
      if (!e.target) return;
      var id = e.target.id;
      if (id === "blogJson" || id === "blogCoverFile" || id === "blogAuthorAvatarFile" || id === "blogAuthorPick") return;
      if (id && id.indexOf("blogAi") === 0) return;
      if (id && id.indexOf("blogAuthor") === 0) setBlogAuthorPick("");
      onBlogFieldInput();
    });
    $("blogForm").addEventListener("change", function (e) {
      if (!e.target) return;
      var id = e.target.id;
      if (id === "blogJson" || id === "blogCoverFile" || id === "blogAuthorAvatarFile" || id === "blogAuthorPick") return;
      if (id && id.indexOf("blogAi") === 0) return;
      if (id && id.indexOf("blogAuthor") === 0 && id !== "blogAuthorPick") setBlogAuthorPick("");
      onBlogFieldInput();
    });
    var bj = $("blogJson");
    if (bj) bj.addEventListener("input", onBlogJsonInput);
    $("btnBlogJsonErrFix").addEventListener("click", onBlogJsonErrFix);
    $("btnBlogJsonErrDiscard").addEventListener("click", onBlogJsonErrDiscard);
    $("btnBlogJsonErrKeep").addEventListener("click", onBlogJsonErrKeep);

    // AI blog generator
    var btnAiGenerate = $("btnBlogAiGenerate");
    if (btnAiGenerate) btnAiGenerate.addEventListener("click", generateBlogWithAi);
    var btnAiClear = $("btnBlogAiClear");
    if (btnAiClear) btnAiClear.addEventListener("click", clearBlogAiInputs);

    // Escape key closes any open modal (top-most first)
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var jsonErr = $("projectJsonErrorModal");
      if (jsonErr && !jsonErr.hidden) { closeModal("projectJsonErrorModal"); pendingSavePublished = null; return; }
      var blogJsonErr = $("blogJsonErrorModal");
      if (blogJsonErr && !blogJsonErr.hidden) { closeModal("blogJsonErrorModal"); blogPendingSavePublished = null; return; }
      ["companyModal", "projectModal", "reviewModal", "authorModal", "blogModal"].forEach(function (id) {
        var m = $(id); if (m && !m.hidden) closeModal(id);
      });
    });

    auth.onAuthStateChanged(async function (user) {
      if (!user) { show($("loginPanel"), true); show($("firstSetupPanel"), false); show($("adminPanel"), false); return; }
      if (!(await ensureAdminUser(user))) { show($("loginPanel"), false); show($("firstSetupPanel"), true); show($("adminPanel"), false); return; }
      show($("loginPanel"), false); show($("firstSetupPanel"), false); show($("adminPanel"), true);
      await refreshAll();
    });
  });
})();
