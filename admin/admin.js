(function () {
  var auth, db, storage;
  var companiesCache = [];

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
      $("companyUploadStatus").textContent = "Upload failed.";
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
  }

  function readForm(published) {
    var companyId = $("projectCompany").value;
    var company = getCompanyById(companyId);
    return {
      companyId: companyId,
      client: company ? company.name + (company.industry ? " \u2014 " + company.industry : "") : "",
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
    fillForm({}, "");
    $("slug").readOnly = false;
    setModalMode(true, true);
    syncModalActionButtons();
    openModal("projectModal");
    $("saveStatus").textContent = "";
    setTimeout(function () { $("projectCompany").focus(); }, 0);
  }

  function openEditProjectModal(data, docId) {
    modalDocPublished = !!data.published;
    fillForm(data, docId);
    setModalMode(false, !data.published);
    syncModalActionButtons();
    openModal("projectModal");
    $("saveStatus").textContent = "";
    setTimeout(function () { $("title").focus(); }, 0);
  }

  function buildProjectCard(row, onEdit) {
    var doc = row.doc, d = row.d;
    var card = document.createElement("article");
    card.className = "project-card";
    var thumb = document.createElement("div");
    thumb.className = "project-card-thumb";
    if (d.coverImageUrl) { var img = document.createElement("img"); img.src = d.coverImageUrl; img.alt = ""; img.loading = "lazy"; thumb.appendChild(img); }
    var body = document.createElement("div");
    body.className = "project-card-body";
    var h3 = document.createElement("h3"); h3.className = "project-card-title"; h3.textContent = d.title || doc.id;
    var meta = document.createElement("div"); meta.className = "project-card-meta"; meta.textContent = "/" + (d.slug || doc.id) + (d.client ? "  \u00b7  " + d.client : "");
    var sum = document.createElement("p"); sum.className = "project-card-summary"; sum.textContent = snippet(d.summary, 200);
    var btn = document.createElement("button"); btn.type = "button"; btn.textContent = "Edit"; btn.onclick = onEdit;
    body.appendChild(h3); body.appendChild(meta); body.appendChild(sum); body.appendChild(btn);
    card.appendChild(thumb); card.appendChild(body);
    return card;
  }

  async function refreshList() {
    var listPub = $("projectListPublished"), listDraft = $("projectListDrafts");
    var metaEl = $("projectListMeta"), pubEmpty = $("publishedEmpty"), draftsEmpty = $("draftsEmpty");
    if (listPub) listPub.innerHTML = "";
    if (listDraft) listDraft.innerHTML = "";
    if (metaEl) metaEl.textContent = "";
    var snap = await db.collection("projects").get();
    var groups = new Map();
    snap.forEach(function (doc) {
      var d = doc.data(), slugKey = (d.slug || doc.id || "").trim() || doc.id;
      var arr = groups.get(slugKey) || [];
      arr.push({ doc: doc, d: d });
      groups.set(slugKey, arr);
    });
    var hiddenDupes = 0, rows = [];
    groups.forEach(function (items) { if (items.length > 1) hiddenDupes += items.length - 1; rows.push(pickCanonicalRow(items)); });
    rows.sort(function (a, b) { return (a.d.sortOrder || 0) - (b.d.sortOrder || 0); });
    if (metaEl && hiddenDupes > 0) metaEl.textContent = hiddenDupes + " duplicate document(s) hidden (same slug).";
    var pubRows = rows.filter(function (r) { return !!r.d.published; });
    var draftRows = rows.filter(function (r) { return !r.d.published; });
    if (pubEmpty) pubEmpty.hidden = pubRows.length > 0;
    if (draftsEmpty) draftsEmpty.hidden = draftRows.length > 0;
    pubRows.forEach(function (r) { if (listPub) listPub.appendChild(buildProjectCard(r, function () { openEditProjectModal(r.d, r.doc.id); })); });
    draftRows.forEach(function (r) { if (listDraft) listDraft.appendChild(buildProjectCard(r, function () { openEditProjectModal(r.d, r.doc.id); })); });
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

  async function saveProject(published) {
    $("saveStatus").textContent = ""; $("saveStatus").className = "ok";
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
  //  BLOG POSTS
  // ═══════════════════════════════════
  var blogModalDocPublished = false;

  function fillBlogForm(data, id) {
    $("blogEditId").value = id || "";
    $("blogTitle").value = data.title || "";
    $("blogSlug").value = data.slug || "";
    $("blogSlug").readOnly = !!id;
    $("blogSummary").value = data.summary || "";
    $("blogCategory").value = data.category || "";
    $("blogCoverImageUrl").value = data.coverImageUrl || "";
    $("blogBodyHtml").value = data.bodyHtml || "";
    $("blogAuthor").value = data.author || "";
    var dateEl = $("blogDate"); if (dateEl) dateEl.value = (data.date || "").slice(0, 10);
    var cf = $("blogCoverFile"); if (cf) cf.value = "";
  }

  function readBlogForm(published) {
    return {
      slug: slugify($("blogSlug").value) || slugify($("blogTitle").value),
      title: $("blogTitle").value.trim(),
      category: $("blogCategory").value.trim(),
      summary: $("blogSummary").value.trim(),
      coverImageUrl: $("blogCoverImageUrl").value.trim(),
      bodyHtml: $("blogBodyHtml").value,
      author: $("blogAuthor").value.trim(),
      date: $("blogDate") && $("blogDate").value ? String($("blogDate").value).slice(0, 10) : "",
      published: !!published,
    };
  }

  function syncBlogButtons() {
    var editId = $("blogEditId").value;
    var unpub = $("btnBlogUnpublish"), draft = $("btnBlogSaveDraft"), del = $("btnDeleteBlog");
    if (del) del.hidden = !editId;
    if (unpub && draft) { var live = !!editId && blogModalDocPublished; unpub.hidden = !live; draft.hidden = live; }
  }

  function openNewBlogModal() {
    blogModalDocPublished = false;
    fillBlogForm({}, "");
    $("blogSlug").readOnly = false;
    $("blogModalTitle").textContent = "New blog post";
    syncBlogButtons();
    openModal("blogModal");
    $("blogSaveStatus").textContent = "";
    setTimeout(function () { $("blogTitle").focus(); }, 0);
  }

  function openEditBlogModal(data, docId) {
    blogModalDocPublished = !!data.published;
    fillBlogForm(data, docId);
    $("blogModalTitle").textContent = "Edit blog post";
    syncBlogButtons();
    openModal("blogModal");
    $("blogSaveStatus").textContent = "";
    setTimeout(function () { $("blogTitle").focus(); }, 0);
  }

  function buildBlogCard(doc, data, onEdit) {
    var card = document.createElement("article"); card.className = "project-card";
    var thumb = document.createElement("div"); thumb.className = "project-card-thumb";
    if (data.coverImageUrl) { var img = document.createElement("img"); img.src = data.coverImageUrl; img.alt = ""; img.loading = "lazy"; thumb.appendChild(img); }
    var body = document.createElement("div"); body.className = "project-card-body";
    var h3 = document.createElement("h3"); h3.className = "project-card-title"; h3.textContent = data.title || doc.id;
    var meta = document.createElement("div"); meta.className = "project-card-meta"; meta.textContent = (data.author || "") + (data.date ? "  \u00b7  " + data.date : "");
    var sum = document.createElement("p"); sum.className = "project-card-summary"; sum.textContent = snippet(data.summary, 200);
    var btn = document.createElement("button"); btn.type = "button"; btn.textContent = "Edit"; btn.onclick = onEdit;
    body.appendChild(h3); body.appendChild(meta); body.appendChild(sum); body.appendChild(btn);
    card.appendChild(thumb); card.appendChild(body);
    return card;
  }

  async function refreshBlogPosts() {
    var listPub = $("blogListPublished"), listDraft = $("blogListDrafts");
    var pubEmpty = $("blogPubEmpty"), draftEmpty = $("blogDraftEmpty");
    if (listPub) listPub.innerHTML = "";
    if (listDraft) listDraft.innerHTML = "";
    var snap = await db.collection("blog_posts").orderBy("date", "desc").get();
    var published = [], drafts = [];
    snap.forEach(function (doc) { var d = doc.data(); (d.published ? published : drafts).push({ doc: doc, d: d }); });
    if (pubEmpty) pubEmpty.hidden = published.length > 0;
    if (draftEmpty) draftEmpty.hidden = drafts.length > 0;
    published.forEach(function (r) { if (listPub) listPub.appendChild(buildBlogCard(r.doc, r.d, function () { openEditBlogModal(r.d, r.doc.id); })); });
    drafts.forEach(function (r) { if (listDraft) listDraft.appendChild(buildBlogCard(r.doc, r.d, function () { openEditBlogModal(r.d, r.doc.id); })); });
  }

  async function uploadBlogCover(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file || !auth.currentUser) return;
    var slug = slugify($("blogSlug").value) || "blog-" + Date.now();
    var path = "blog/" + slug + "/cover-" + Date.now() + "-" + file.name.replace(/\s/g, "_");
    $("blogUploadStatus").textContent = "Uploading\u2026";
    try { var ref = storage.ref(path); await ref.put(file); $("blogCoverImageUrl").value = await ref.getDownloadURL(); $("blogUploadStatus").textContent = "Uploaded."; }
    catch (e) { $("blogUploadStatus").textContent = "Upload failed."; }
  }

  async function saveBlogPost(published) {
    $("blogSaveStatus").textContent = ""; $("blogSaveStatus").className = "ok";
    var form = $("blogForm"); if (form && !form.reportValidity()) return;
    var payload = readBlogForm(published);
    if (!payload.title) { $("blogSaveStatus").textContent = "Title is required."; $("blogSaveStatus").className = "err"; return; }
    if (!payload.slug) { $("blogSaveStatus").textContent = "Set a URL slug."; $("blogSaveStatus").className = "err"; return; }
    if (!slugPatternOk(payload.slug)) { $("blogSaveStatus").textContent = "Slug must use lowercase letters, numbers, and single hyphens only."; $("blogSaveStatus").className = "err"; return; }
    var editId = $("blogEditId").value, docId = editId || payload.slug;
    try {
      await db.collection("blog_posts").doc(docId).set({ ...payload, slug: payload.slug, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      blogModalDocPublished = published;
      $("blogSaveStatus").textContent = published ? "Saved and published." : "Draft saved.";
      $("blogEditId").value = docId; $("blogSlug").readOnly = true;
      $("blogModalTitle").textContent = "Edit blog post";
      syncBlogButtons();
      await refreshBlogPosts();
    } catch (e) { console.error(e); $("blogSaveStatus").textContent = "Save failed: " + (e.message || e); $("blogSaveStatus").className = "err"; }
  }

  async function deleteBlogPost() {
    var editId = $("blogEditId").value; if (!editId) return;
    if (!confirm('Delete blog post "' + ($("blogTitle").value.trim() || editId) + '" permanently?')) return;
    try { await db.collection("blog_posts").doc(editId).delete(); closeModal("blogModal"); await refreshBlogPosts(); }
    catch (e) { $("blogSaveStatus").textContent = "Delete failed: " + (e.message || e); $("blogSaveStatus").className = "err"; }
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
    closeModal("projectModal"); closeModal("reviewModal"); closeModal("companyModal"); closeModal("blogModal");
    await auth.signOut();
    show($("loginPanel"), true); show($("firstSetupPanel"), false); show($("adminPanel"), false);
  }

  async function refreshAll() {
    await refreshCompanies();
    await Promise.all([refreshList(), refreshReviews(), refreshBlogPosts()]);
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
    $("btnModalCancel").addEventListener("click", function () { closeModal("projectModal"); });
    $("modalCloseBtn").addEventListener("click", function () { closeModal("projectModal"); });
    $("coverFile").addEventListener("change", uploadCover);
    $("slugAuto").addEventListener("click", function () { $("slug").value = slugify($("title").value); });
    $("projectForm").addEventListener("submit", function (ev) { ev.preventDefault(); });
    var pm = $("projectModal");
    if (pm) pm.addEventListener("click", function (e) { if (e.target === pm) closeModal("projectModal"); });

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

    // Blog posts
    $("newBlogBtn").addEventListener("click", openNewBlogModal);
    $("btnBlogSaveDraft").addEventListener("click", function () { saveBlogPost(false); });
    $("btnBlogSavePublish").addEventListener("click", function () { saveBlogPost(true); });
    $("btnBlogUnpublish").addEventListener("click", function () { saveBlogPost(false); });
    $("btnDeleteBlog").addEventListener("click", deleteBlogPost);
    $("btnBlogCancel").addEventListener("click", function () { closeModal("blogModal"); });
    $("blogModalCloseBtn").addEventListener("click", function () { closeModal("blogModal"); });
    $("blogCoverFile").addEventListener("change", uploadBlogCover);
    $("blogSlugAuto").addEventListener("click", function () { $("blogSlug").value = slugify($("blogTitle").value); });
    $("blogForm").addEventListener("submit", function (ev) { ev.preventDefault(); });
    var bm = $("blogModal");
    if (bm) bm.addEventListener("click", function (e) { if (e.target === bm) closeModal("blogModal"); });

    // Escape key closes any open modal
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      ["companyModal", "projectModal", "reviewModal", "blogModal"].forEach(function (id) {
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
