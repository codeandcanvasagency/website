(function () {
  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDate(d) {
    if (!d) return "";
    var raw = d;
    if (typeof d === "object" && typeof d.toDate === "function") raw = d.toDate();
    var dt = raw instanceof Date ? raw : new Date(raw);
    if (isNaN(dt.getTime())) return esc(String(d));
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var label = dt.getDate() + " " + months[dt.getMonth()];
    if (dt.getFullYear() !== new Date().getFullYear()) {
      label += " " + dt.getFullYear();
    }
    return label;
  }

  function readMinutesText(n) {
    var mins = parseInt(n, 10);
    if (!mins || mins < 1) return "";
    return mins + " min read";
  }

  function metaHtml(post) {
    if (!post) return "";
    var category = esc(post.category || "");
    var date = fmtDate(post.publishedAt);
    var read = readMinutesText(post.readingTimeMinutes);
    var parts = [];
    if (category) parts.push("<span>" + category + "</span>");
    if (date) parts.push("<span>" + date + "</span>");
    if (read) parts.push("<span>" + read + "</span>");
    if (!parts.length) return "";
    return '<div class="post-meta">' + parts.join("<span>\u00b7</span>") + "</div>";
  }

  window.ccBlogCard = {
    fmtDate: fmtDate,
    readMinutesText: readMinutesText,
    metaHtml: metaHtml,
  };
})();
