(function () {
  var cachedHtml = null;

  function applyMountDataAttrs(mount) {
    var section = mount.closest(".section.hero.v13.contact");
    if (!section) return;
    var maxW = mount.getAttribute("data-cnc-shell-max");
    if (maxW) section.style.setProperty("--cnc-contact-shell-max", maxW);
    var minH = mount.getAttribute("data-cnc-message-min-height");
    if (minH) section.style.setProperty("--cnc-contact-message-min-height", minH);
  }

  function setVisible(root, form, done, fail, which) {
    if (form) form.style.display = which === "form" ? "" : "none";
    if (done) done.style.display = which === "done" ? "" : "none";
    if (fail) fail.style.display = which === "fail" ? "" : "none";
  }

  function bindForm(mount) {
    var root = mount.querySelector("[data-cnc-contact-form]");
    if (!root) return;
    var form = root.querySelector(".cnc-contact-form__form");
    var done = root.querySelector(".cnc-contact-form__done");
    var fail = root.querySelector(".cnc-contact-form__fail");
    if (!form) return;

    setVisible(root, form, done, fail, "form");

    var messageEl = form.querySelector("#cnc-contact-message");
    function autoGrowTextarea(el) {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
    if (messageEl) {
      autoGrowTextarea(messageEl);
      messageEl.addEventListener("input", function () {
        autoGrowTextarea(messageEl);
      });
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!form.reportValidity()) return;

      var submitBtn = form.querySelector('input[type="submit"]');
      var waitText = submitBtn && submitBtn.getAttribute("data-wait");
      var defaultLabel = submitBtn && submitBtn.value;
      if (submitBtn) {
        submitBtn.disabled = true;
        if (waitText) submitBtn.value = waitText;
      }

      var body = {
        name: (form.querySelector("#cnc-contact-name") || {}).value || "",
        email: (form.querySelector("#cnc-contact-email") || {}).value || "",
        company: (form.querySelector("#cnc-contact-company") || {}).value || "",
        message: (form.querySelector("#cnc-contact-message") || {}).value || "",
        website: (form.querySelector('input[name="website"]') || {}).value || "",
      };

      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(function (r) {
          return r.json().then(function (data) {
            return { ok: r.ok, data: data };
          });
        })
        .then(function (res) {
          if (res.ok && res.data && res.data.ok) {
            setVisible(root, form, done, fail, "done");
            form.reset();
            if (messageEl) autoGrowTextarea(messageEl);
          } else {
            setVisible(root, form, done, fail, "fail");
          }
        })
        .catch(function () {
          setVisible(root, form, done, fail, "fail");
        })
        .then(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            if (defaultLabel) submitBtn.value = defaultLabel;
          }
        });
    });
  }

  function loadHtml() {
    if (cachedHtml) return Promise.resolve(cachedHtml);
    return fetch("/partials/contact-form.html", { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("contact_form_load_failed");
      return r.text();
    }).then(function (html) {
      cachedHtml = html;
      return html;
    });
  }

  function mountOne(el) {
    applyMountDataAttrs(el);
    return loadHtml()
      .then(function (html) {
        el.innerHTML = html;
        bindForm(el);
      })
      .catch(function () {
        el.innerHTML =
          '<p class="color-neutral-300">Contact form could not be loaded. Please try again or use the <a href="/contact">contact page</a>.</p>';
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var mounts = document.querySelectorAll("[data-contact-form-mount]");
    for (var i = 0; i < mounts.length; i++) {
      mountOne(mounts[i]);
    }
  });
})();
