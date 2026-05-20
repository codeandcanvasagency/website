#!/usr/bin/env node
/**
 * Regenerates sitemap.xml (index) and sitemap-site.xml from functions/sitemap paths.
 * Run: node scripts/generate-sitemap-files.js
 */
const fs = require("fs");
const path = require("path");

const SITE_ORIGIN = "https://code-and-canvas.web.app";

const SITEMAP_STATIC_PATHS = [
  "",
  "/about",
  "/blog",
  "/blog-category/branding",
  "/blog-category/design",
  "/blog-category/ui-ux",
  "/contact",
  "/projects",
  "/projects/hoddle",
  "/projects/shilaking",
  "/projects/maal-monkeys",
  "/service-categories/ai-automation",
  "/service-categories/brand-design",
  "/service-categories/business-development",
  "/service-categories/data-optimisation",
  "/service-categories/development",
  "/service-categories/ui-ux-design",
  "/services",
  "/services/bespoke-it-solutions",
  "/services/branding-strategy",
  "/services/data-driven-optimisation",
  "/services/platform-app-development",
  "/services/search-optimisation",
  "/services/technical-innovation-automation",
  "/services/website-development",
  "/team/john-carter",
  "/team/lily-woods",
  "/team/sophie-moore",
];

function escXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSiteUrlset() {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const p of SITEMAP_STATIC_PATHS) {
    const loc = p === "" ? SITE_ORIGIN + "/" : SITE_ORIGIN + p;
    const priority = p === "" ? "1.0" : "0.8";
    xml += "  <url>";
    xml += "<loc>" + escXml(loc) + "</loc>";
    xml += "<priority>" + priority + "</priority>";
    xml += "</url>\n";
  }
  xml += "</urlset>\n";
  return xml;
}

function buildSitemapIndex() {
  const today = new Date().toISOString().slice(0, 10);
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  xml += "  <sitemap><loc>" + escXml(SITE_ORIGIN + "/sitemap-site.xml") + "</loc>";
  xml += "<lastmod>" + today + "</lastmod></sitemap>\n";
  xml += "  <sitemap><loc>" + escXml(SITE_ORIGIN + "/sitemap-blog.xml") + "</loc>";
  xml += "<lastmod>" + today + "</lastmod></sitemap>\n";
  xml += "</sitemapindex>\n";
  return xml;
}

const root = path.join(__dirname, "..");
fs.writeFileSync(path.join(root, "sitemap-site.xml"), buildSiteUrlset());
fs.writeFileSync(path.join(root, "sitemap.xml"), buildSitemapIndex());
console.log("Wrote sitemap.xml and sitemap-site.xml");
