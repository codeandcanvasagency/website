const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

setGlobalOptions({ region: "europe-west2" });

admin.initializeApp();
const db = admin.firestore();

const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5.4";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const OPENAI_IMAGE_SIZE = process.env.OPENAI_IMAGE_SIZE || "1536x864";

const ALLOWED_ORIGINS = new Set([
  "https://code-and-canvas.web.app",
  "https://code-and-canvas.firebaseapp.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const SITE_ORIGIN = "https://code-and-canvas.web.app";
const DEFAULT_OG_IMAGE = SITE_ORIGIN + "/images/meta-webstudio-x-webflow-template.png";

let blogDetailShellCache = null;
let blogIndexShellCache = null;
let sitemapCache = null;
let sitemapCacheAt = 0;
const SITEMAP_CACHE_MS = 60 * 60 * 1000;

const PUBLISHER_ORG = {
  "@type": "Organization",
  name: "Code & Canvas",
  url: SITE_ORIGIN,
  logo: {
    "@type": "ImageObject",
    url: SITE_ORIGIN + "/images/favicon.png",
  },
};

/** Static site paths for sitemap (blog article URLs come from Firestore). */
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

function getBlogDetailShell() {
  if (!blogDetailShellCache) {
    blogDetailShellCache = fs.readFileSync(
      path.join(__dirname, "blog-detail-shell.html"),
      "utf8",
    );
  }
  return blogDetailShellCache;
}

function getBlogIndexShell() {
  if (!blogIndexShellCache) {
    blogIndexShellCache = fs.readFileSync(
      path.join(__dirname, "blog-index-shell.html"),
      "utf8",
    );
  }
  return blogIndexShellCache;
}

function escHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(value) {
  return String(value == null ? "" : value).replace(/<[^>]*>/g, "").trim();
}

function absoluteAssetUrl(url, origin) {
  if (!url) return DEFAULT_OG_IMAGE;
  if (/^https?:\/\//i.test(url)) return url;
  return origin + (url.startsWith("/") ? url : "/" + url);
}

function extractBlogSlug(reqPath) {
  const match = (reqPath || "").match(/^\/blog\/([^/?#]+)/);
  if (!match) return "";
  return decodeURIComponent(match[1]).replace(/\.html$/i, "");
}

function buildBlogMetaHtml(post, slug, origin) {
  const seo = post && post.seo ? post.seo : {};
  const title = stripHtml(seo.metaTitle || (post && post.title) || "Article");
  const description =
    (seo.metaDescription || (post && post.summary) || "An article from the Code & Canvas studio.")
      .trim()
      .slice(0, 300);
  const pageTitle = title + " | Code & Canvas";
  const canonical = origin + "/blog/" + encodeURIComponent(slug || "");
  const cover = post && post.coverImage ? post.coverImage : {};
  const image = absoluteAssetUrl(cover.url, origin);

  return (
    "<title>" + escHtml(pageTitle) + "</title>\n" +
    '<meta name="description" content="' + escHtml(description) + '" />\n' +
    '<link rel="canonical" href="' + escHtml(canonical) + '" />\n' +
    '<meta property="og:title" content="' + escHtml(title) + '" />\n' +
    '<meta property="og:description" content="' + escHtml(description) + '" />\n' +
    '<meta property="og:type" content="article" />\n' +
    '<meta property="og:url" content="' + escHtml(canonical) + '" />\n' +
    '<meta property="og:image" content="' + escHtml(image) + '" />\n' +
    '<meta name="twitter:card" content="summary_large_image" />\n' +
    '<meta name="twitter:title" content="' + escHtml(title) + '" />\n' +
    '<meta name="twitter:description" content="' + escHtml(description) + '" />\n' +
    '<meta name="twitter:image" content="' + escHtml(image) + '" />'
  );
}

function toIsoDate(value) {
  if (!value) return "";
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString();
  return "";
}

function sitemapLastmod(value) {
  const iso = toIsoDate(value);
  return iso ? iso.slice(0, 10) : "";
}

function buildBlogJsonLd(post, slug, origin) {
  if (!post) return "";
  const seo = post.seo || {};
  const headline = stripHtml(seo.metaTitle || post.title || "Article");
  const description = (seo.metaDescription || post.summary || "").trim().slice(0, 500);
  const canonical = origin + "/blog/" + encodeURIComponent(slug || "");
  const cover = post.coverImage || {};
  const image = absoluteAssetUrl(cover.url, origin);
  const datePublished = toIsoDate(post.publishedAt);
  const dateModified = toIsoDate(post.updatedAt) || datePublished;
  const author = post.author || {};
  const authorNode = author.name
    ? {
        "@type": "Person",
        name: author.name,
        ...(author.linkedinUrl ? { url: author.linkedinUrl } : {}),
      }
    : PUBLISHER_ORG;

  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline,
    description,
    image: [image],
    url: canonical,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    author: authorNode,
    publisher: PUBLISHER_ORG,
  };
  if (datePublished) data.datePublished = datePublished;
  if (dateModified) data.dateModified = dateModified;

  return '<script type="application/ld+json">\n' + JSON.stringify(data) + "\n</script>";
}

function buildBlogIndexMetaHtml(featured, origin) {
  const canonical = origin + "/blog";
  let pageTitle = "Blog | Code & Canvas";
  let description =
    "Articles, field notes and resources from Code & Canvas — a London & Dubai digital agency.";
  let ogTitle = "Blog | Code & Canvas";
  let ogDescription = description;
  let image = DEFAULT_OG_IMAGE;

  if (featured) {
    const seo = featured.seo || {};
    const articleTitle = stripHtml(seo.metaTitle || featured.title || "");
    const articleSummary = (seo.metaDescription || featured.summary || "").trim().slice(0, 300);
    if (articleTitle) ogTitle = articleTitle;
    if (articleSummary) {
      description = articleSummary;
      ogDescription = articleSummary;
    }
    const cover = featured.coverImage || {};
    image = absoluteAssetUrl(cover.url, origin);
    if (articleTitle) {
      pageTitle = "Blog — Latest: " + articleTitle + " | Code & Canvas";
    }
  }

  return (
    "<title>" + escHtml(pageTitle) + "</title>\n" +
    '<meta name="description" content="' + escHtml(description) + '" />\n' +
    '<link rel="canonical" href="' + escHtml(canonical) + '" />\n' +
    '<meta property="og:title" content="' + escHtml(ogTitle) + '" />\n' +
    '<meta property="og:description" content="' + escHtml(ogDescription) + '" />\n' +
    '<meta property="og:type" content="website" />\n' +
    '<meta property="og:url" content="' + escHtml(canonical) + '" />\n' +
    '<meta property="og:image" content="' + escHtml(image) + '" />\n' +
    '<meta name="twitter:card" content="summary_large_image" />\n' +
    '<meta name="twitter:title" content="' + escHtml(ogTitle) + '" />\n' +
    '<meta name="twitter:description" content="' + escHtml(ogDescription) + '" />\n' +
    '<meta name="twitter:image" content="' + escHtml(image) + '" />'
  );
}

function buildBlogIndexJsonLd(recentPosts, origin) {
  const blogPost = (recentPosts || [])
    .filter((p) => p && p.slug)
    .map((p) => {
      const entry = {
        "@type": "BlogPosting",
        headline: stripHtml(p.title || ""),
        url: origin + "/blog/" + encodeURIComponent(p.slug),
      };
      const published = toIsoDate(p.publishedAt);
      if (published) entry.datePublished = published;
      return entry;
    });

  const data = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Code & Canvas Blog",
    url: origin + "/blog",
    description:
      "Articles, field notes and resources from Code & Canvas — brand, product, engineering, and digital experience.",
    publisher: PUBLISHER_ORG,
    blogPost,
  };

  return '<script type="application/ld+json">\n' + JSON.stringify(data) + "\n</script>";
}

function buildStaticSitemapXml(staticPaths, origin) {
  const entries = [];
  const seen = new Set();

  for (const p of staticPaths) {
    const loc = p === "" ? origin + "/" : origin + p;
    const key = loc.replace(/\/$/, "") || origin;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      loc,
      lastmod: "",
      priority: p === "" ? "1.0" : "0.8",
    });
  }

  return buildUrlsetXml(entries);
}

function buildBlogSitemapXml(blogPosts, origin) {
  const entries = [];
  const seen = new Set();

  for (const post of blogPosts || []) {
    const slug = post.slug;
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    entries.push({
      loc: origin + "/blog/" + encodeURIComponent(slug),
      lastmod: sitemapLastmod(post.updatedAt || post.publishedAt),
      priority: "0.7",
    });
  }

  return buildUrlsetXml(entries);
}

function buildUrlsetXml(entries) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const e of entries) {
    xml += "  <url>";
    xml += "<loc>" + escHtml(e.loc) + "</loc>";
    if (e.lastmod) xml += "<lastmod>" + escHtml(e.lastmod) + "</lastmod>";
    if (e.priority) xml += "<priority>" + escHtml(e.priority) + "</priority>";
    xml += "</url>\n";
  }
  xml += "</urlset>";
  return xml;
}

function corsHeaders(req) {
  const origin = req.headers.origin || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://code-and-canvas.web.app";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
}

function normalizeText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

const ipHits = new Map();
function isRateLimited(ip, key, maxPerMinute = 8) {
  const now = Date.now();
  const bucket = `${ip}:${key}`;
  const events = (ipHits.get(bucket) || []).filter((ts) => now - ts < 60_000);
  events.push(now);
  ipHits.set(bucket, events);
  return events.length > maxPerMinute;
}

function handlePreflight(req, res, headers) {
  if (req.method !== "OPTIONS") return false;
  res.set(headers).status(204).send("");
  return true;
}

exports.contact = onRequest(async (req, res) => {
  const headers = corsHeaders(req);
  if (handlePreflight(req, res, headers)) return;
  if (req.method !== "POST") {
    res.set(headers).status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  if (isRateLimited(String(ip), "contact", 5)) {
    res.set(headers).status(429).json({ ok: false, error: "rate_limited" });
    return;
  }

  const honeypot = normalizeText(req.body?.website || "", 128);
  if (honeypot) {
    res.set(headers).status(200).json({ ok: true });
    return;
  }

  const name = normalizeText(req.body?.name, 120);
  const email = normalizeText(req.body?.email, 190).toLowerCase();
  const phone = normalizeText(req.body?.phone, 60);
  const company = normalizeText(req.body?.company, 140);
  const message = normalizeText(req.body?.message, 5000);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!name || !emailOk || !message) {
    res.set(headers).status(400).json({ ok: false, error: "invalid_payload" });
    return;
  }

  try {
    await db.collection("contact_submissions").add({
      name,
      email,
      phone,
      company,
      message,
      source: "website",
      ip: String(ip).slice(0, 150),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.set(headers).status(200).json({ ok: true });
  } catch (error) {
    logger.error("contact submission failed", error);
    res.set(headers).status(500).json({ ok: false, error: "server_error" });
  }
});

const SEED_PROJECTS = [
  {
    slug: "hoddle",
    companyId: "hoddle",
    sortOrder: 1,
    featured: true,
    date: "2026-04-02",
    title: "Hoddle",
    tagline: "Mobile App Development",
    summary:
      "Hoddle, a fintech startup, needed a secure yet intuitive mobile app with key tasks achievable in just two taps. Code & Canvas designed and developed a streamlined cross-platform app that balanced simplicity with robust functionality, positioning Hoddle for success in the fintech market.",
    coverImageUrl: "/images/hoddleweb.png",
    client: "Hoddle",
    objective: "Develop an all-in-one mobile banking app",
    deliverables: "Mobile App",
    duration: "16 Weeks",
    caseBrief: `In a crowded fintech market, Hoddle knew their mobile app needed to be much more than just functional—it had to offer an exceptional user experience. With security at its core, the app had to allow users to navigate easily, performing critical banking tasks in just two taps. Hoddle's vision was ambitious: deliver an app that balanced cutting-edge technology with simplicity.

Specific requirements:
• Develop a cross-platform mobile app for both iOS and Android.
• Ensure a secure, user-friendly interface for managing financial tasks.
• Integrate real-time data synchronisation with Hoddle's backend systems.
• Design the app so major tasks are achievable in just two taps for maximum efficiency.`,
    caseDelivered: `We approached Hoddle's mobile app with a user-first mindset and strong technical execution.

Discovery & Research — We analysed Hoddle's target users and competitor fintech apps to define features that would differentiate the product.

UI/UX Design — Wireframes and interactive prototypes emphasised clarity and speed; the interface stays minimal so essential tasks stay within two taps.

Development — Cross-platform delivery for iOS and Android with rigorous security for sensitive financial data.

Integration & Testing — Real-time sync with Hoddle's backend, full QA, and hardening before launch.

Launch & Support — Release on the App Store and Google Play with ongoing support for updates.`,
    caseOutcome: `The app set a strong benchmark in fintech: modern design, high engagement, and trust built through security and reliability. Users consistently praised speed, ease of use, and completing key flows in two taps.`,
    bodyHtml: "",
    galleryUrls: [
      "/images/overview-blockchain-x-webstudio-x-webflow-template.png",
      "/images/execution-blockchain-x-webstudio-x-webflow-template.png",
      "/images/result-first-blockchain-x-webstudio-x-webflow-template.png",
      "/images/result-second-blockchain-x-webstudio-x-webflow-template.png",
      "/images/result-third-blockchain-x-webstudio-x-webflow-template.png",
    ],
    published: true,
  },
  {
    slug: "shilaking",
    companyId: "shilaking",
    sortOrder: 2,
    featured: true,
    date: "2026-04-01",
    title: "Shilaking",
    tagline: "Brand Identity and Product Packaging",
    summary:
      "End-to-end brand identity and packaging for Shilaking — from strategy and visual language to shelf-ready packaging and consistent assets across digital and physical touchpoints.",
    coverImageUrl: "/images/shareweb.png",
    client: "Shilaking",
    objective: "Build a recognisable brand and packaging system that sells",
    deliverables: "Brand identity, packaging design, brand guidelines",
    duration: "—",
    caseBrief: `Shilaking needed a cohesive brand that could carry from e-commerce and social through to physical product on shelf. The identity had to feel premium, memorable, and scalable as the product line grows.`,
    caseDelivered: `Brand strategy & positioning — Clarified tone of voice, audience, and differentiation.

Visual identity — Logo system, colour palette, typography, and graphic motifs applied consistently across channels.

Product packaging — Structural and graphic design for packaging that reads clearly at a glance and reinforces the brand on shelf.

Guidelines — Practical rules so internal teams and partners can apply the brand correctly.`,
    caseOutcome: `A unified brand and packaging system that supports growth, strengthens recognition, and presents Shilaking professionally everywhere customers meet the brand.`,
    bodyHtml: "",
    galleryUrls: ["/images/shareweb.png"],
    published: true,
  },
  {
    slug: "maal-monkeys",
    companyId: "maal-monkeys",
    sortOrder: 3,
    featured: true,
    date: "2026-03-31",
    title: "Maal Monkeys",
    tagline: "NFT Art Collection",
    summary:
      "Creative direction and production for the Maal Monkeys NFT collection — distinctive character art, trait layers for generative output, and assets ready for mint and marketplace presentation.",
    coverImageUrl: "/images/maalking-20copy.png",
    client: "Maal Monkeys",
    objective: "Launch a cohesive, collectible NFT art series",
    deliverables: "Art direction, character & trait system, collection assets",
    duration: "—",
    caseBrief: `We defined the visual world of Maal Monkeys — personality, style, and the rules that keep every piece feeling part of one family while allowing rarity and variation.`,
    caseDelivered: `Base characters — Core designs that anchor the collection.

Trait layers — Clothing, accessories, backgrounds, and attributes balanced for visual interest and sensible rarity curves.

Output pipeline — Organised asset delivery suitable for generative composition and metadata.

Go-to-market assets — Key visuals and formats for launch, social teases, and marketplace presence so the collection presents consistently from reveal to secondary sales.`,
    caseOutcome: `A structured collection with a clear artistic identity, ready for mint and long-term community storytelling.`,
    bodyHtml: "",
    galleryUrls: [
      "/images/maalking-20copy.png",
      "/images/maalicon.png",
    ],
    published: true,
  },
  {
    slug: "check-a-car",
    companyId: "check-a-car",
    sortOrder: 4,
    featured: true,
    date: "2026-03-30",
    title: "Check A Car",
    tagline: "Automotive Platform",
    summary:
      "A streamlined digital platform for checking car details quickly — designed for clarity, speed, and confidence at every step.",
    coverImageUrl: "/images/placeholder.jpg",
    client: "Check A Car",
    objective: "Make vehicle checks fast, clear, and trustworthy",
    deliverables: "Product design, web development",
    duration: "—",
    caseBrief:
      "Check A Car needed a simple, conversion-focused experience that makes it easy for users to run vehicle checks and understand results without friction.",
    caseDelivered:
      "We shaped the user journeys, designed a clean interface, and implemented a lightweight front-end that keeps the check flow fast and readable across devices.",
    caseOutcome:
      "A clear end-to-end experience that reduces drop-off and helps users reach answers quickly — with a platform foundation ready to scale.",
    bodyHtml: "",
    galleryUrls: [],
    published: true,
  },
  {
    slug: "departing",
    companyId: "departing",
    sortOrder: 5,
    featured: true,
    date: "2026-03-29",
    title: "Departing",
    tagline: "Travel Brand & Digital Experience",
    summary:
      "Brand and digital experience for Departing — helping a travel concept communicate clearly and convert interest into action.",
    coverImageUrl: "/images/placeholder.jpg",
    client: "Departing",
    objective: "Create a polished brand and digital presence",
    deliverables: "Brand direction, UI/UX, website build",
    duration: "—",
    caseBrief:
      "Departing required a modern presence that feels premium and approachable, with a structure that can grow as offerings expand.",
    caseDelivered:
      "We defined the visual direction and built a focused site experience with clean navigation, strong hierarchy, and mobile-first performance.",
    caseOutcome:
      "A cohesive brand and web presence that supports launch, builds trust, and creates a strong base for future growth.",
    bodyHtml: "",
    galleryUrls: [],
    published: true,
  },
  {
    slug: "tool-world",
    companyId: "tool-world",
    sortOrder: 6,
    featured: false,
    date: "2026-03-28",
    title: "Tool World",
    tagline: "E-commerce & Website Development",
    summary:
      "A conversion-focused website experience for Tool World — clear product discovery, strong merchandising, and fast performance across devices.",
    coverImageUrl: "/images/placeholder.jpg",
    client: "Tool World",
    objective: "Build a modern storefront that drives enquiries and sales",
    deliverables: "UI/UX, website build, performance optimisation",
    duration: "—",
    caseBrief:
      "Tool World needed a polished digital presence that makes it easy for customers to browse, compare, and take action — without friction.",
    caseDelivered:
      "We mapped user journeys, refined information architecture, and implemented a clean interface optimised for product browsing and mobile usability.",
    caseOutcome:
      "A clearer shopping experience with improved navigation and a scalable foundation for future catalog growth.",
    bodyHtml: "",
    galleryUrls: [],
    published: true,
  },
  {
    slug: "onyx-ascot",
    companyId: "onyx-ascot",
    sortOrder: 7,
    featured: false,
    date: "2026-03-27",
    title: "Onyx Ascot",
    tagline: "Brand & Digital Experience",
    summary:
      "A premium brand and web experience for Onyx Ascot — designed to communicate quality, build trust, and convert high-intent visitors.",
    coverImageUrl: "/images/placeholder.jpg",
    client: "Onyx Ascot",
    objective: "Present a premium brand online with clarity and confidence",
    deliverables: "Brand direction, UI/UX, website build",
    duration: "—",
    caseBrief:
      "Onyx Ascot required a refined, high-end look and feel with strong hierarchy and a smooth path to conversion.",
    caseDelivered:
      "We established the visual direction and crafted a responsive site with clean layouts, crisp typography, and performance-first implementation.",
    caseOutcome:
      "A cohesive digital presence that elevates perception and supports growth through clearer messaging and stronger calls to action.",
    bodyHtml: "",
    galleryUrls: [],
    published: true,
  },
  {
    slug: "ask-glazing",
    companyId: "ask-glazing",
    sortOrder: 8,
    featured: false,
    date: "2026-03-26",
    title: "ASK Glazing",
    tagline: "Lead-Gen Website",
    summary:
      "A lead-generation website for ASK Glazing — built to showcase services clearly, highlight trust signals, and convert enquiries.",
    coverImageUrl: "/images/placeholder.jpg",
    client: "ASK Glazing",
    objective: "Increase qualified enquiries with a clear, credible site",
    deliverables: "Website design, build, SEO foundations",
    duration: "—",
    caseBrief:
      "ASK Glazing needed a straightforward site that communicates services quickly and makes it easy for customers to request a quote.",
    caseDelivered:
      "We designed a clean service-first structure, added conversion CTAs throughout, and ensured mobile-first usability with fast load times.",
    caseOutcome:
      "A clearer, more credible online presence that helps visitors understand offerings and convert into enquiries.",
    bodyHtml: "",
    galleryUrls: [],
    published: true,
  },
  {
    slug: "stessa-by-sarah",
    companyId: "stessa-by-sarah",
    sortOrder: 9,
    featured: false,
    date: "2026-03-25",
    title: "Stessa By Sarah",
    tagline: "Brand Identity & Website",
    summary:
      "A cohesive brand and website for Stessa By Sarah — balancing elegance with clarity to support discovery, trust, and conversion.",
    coverImageUrl: "/images/placeholder.jpg",
    client: "Stessa By Sarah",
    objective: "Launch a brand presence that feels premium and approachable",
    deliverables: "Brand identity, UI/UX, website build",
    duration: "—",
    caseBrief:
      "Stessa By Sarah needed a consistent visual identity and a website experience that reflects the brand’s personality while remaining easy to navigate.",
    caseDelivered:
      "We shaped the brand direction and created a modern, responsive site with clear hierarchy, strong visuals, and scalable page structure.",
    caseOutcome:
      "A unified brand and digital presence that strengthens trust and provides a solid foundation for growth.",
    bodyHtml: "",
    galleryUrls: [],
    published: true,
  },
  {
    slug: "casa-ascot",
    companyId: "casa-ascot",
    sortOrder: 10,
    featured: false,
    date: "2026-03-24",
    title: "Casa Ascot",
    tagline: "Brand & Website",
    summary:
      "A refined brand and web presence for Casa Ascot — designed to communicate quality, build trust, and convert enquiries with a clear, modern structure.",
    coverImageUrl: "/images/placeholder.jpg",
    client: "Casa Ascot",
    objective: "Launch a premium, conversion-focused online presence",
    deliverables: "Brand direction, UI/UX, website build",
    duration: "—",
    caseBrief:
      "Casa Ascot needed a polished digital experience that feels premium while staying simple to navigate, with strong hierarchy and a clear path to enquiry.",
    caseDelivered:
      "We established the visual direction and built a responsive site experience with clean layouts, clear messaging, and performance-first delivery.",
    caseOutcome:
      "A cohesive brand and website foundation that supports launch, improves clarity, and strengthens trust with prospective customers.",
    bodyHtml: "",
    galleryUrls: [],
    published: true,
  },
];

/**
 * Create admins/{uid} using the Admin SDK (client rules forbid writes to `admins`).
 *
 * • First staff: POST with Authorization: Bearer <Firebase ID token> — only allowed
 *   while Firestore has zero documents in `admins`.
 * • Any time: POST with header x-seed-secret (same env SEED_SECRET as seed-projects)
 *   and JSON body { "uid": "<Firebase Auth UID>" }.
 */
exports.bootstrapAdmin = onRequest(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  if (isRateLimited(String(ip), "bootstrapAdmin", 6)) {
    res.status(429).json({ ok: false, error: "rate_limited" });
    return;
  }

  const setAdmin = async (uid) => {
    const clean = normalizeText(uid, 128);
    if (!clean || clean.length < 10 || clean.length > 128) {
      return { error: "invalid_uid" };
    }
    await db
      .collection("admins")
      .doc(clean)
      .set(
        {
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    return { uid: clean };
  };

  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (bearer) {
    try {
      const decoded = await admin.auth().verifyIdToken(bearer);
      const any = await db.collection("admins").limit(1).get();
      if (!any.empty) {
        res.status(403).json({
          ok: false,
          error: "admins_already_exist",
          message: "Ask an existing admin to add your UID in Firestore, or use the secret endpoint.",
        });
        return;
      }
      const result = await setAdmin(decoded.uid);
      if (result.error) {
        res.status(400).json({ ok: false, error: result.error });
        return;
      }
      res.status(200).json({ ok: true, uid: result.uid, mode: "first_admin" });
      return;
    } catch (e) {
      if (e.code === "auth/argument-error" || e.code === "auth/id-token-expired") {
        logger.warn("bootstrapAdmin token verify failed", e);
        res.status(401).json({ ok: false, error: "invalid_token" });
        return;
      }
      logger.error("bootstrapAdmin (bearer) failed", e);
      res.status(500).json({ ok: false, error: "server_error" });
      return;
    }
  }

  const secret = process.env.SEED_SECRET || "";
  if (!secret || req.headers["x-seed-secret"] !== secret) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }

  try {
    const uidField = req.body && (req.body.uid || req.body.userId);
    const result = await setAdmin(typeof uidField === "string" ? uidField : "");
    if (result.error) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }
    res.status(200).json({ ok: true, uid: result.uid, mode: "secret" });
  } catch (error) {
    logger.error("bootstrapAdmin (secret) failed", error);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

const SEED_COMPANIES = [
  { id: "hoddle", name: "Hoddle", industry: "Fintech", logoUrl: "/images/icon1200.png" },
  { id: "shilaking", name: "Shilaking", industry: "E-commerce", logoUrl: "/images/shil900.png" },
  { id: "maal-monkeys", name: "Maal Monkeys", industry: "NFTs", logoUrl: "/images/maalicon.png" },
  { id: "check-a-car", name: "Check A Car", industry: "Automotive", logoUrl: "/images/placeholder.jpg" },
  { id: "departing", name: "Departing", industry: "Travel", logoUrl: "/images/placeholder.jpg" },
  { id: "tool-world", name: "Tool World", industry: "E-commerce", logoUrl: "/images/placeholder.jpg" },
  { id: "onyx-ascot", name: "Onyx Ascot", industry: "Luxury", logoUrl: "/images/placeholder.jpg" },
  { id: "ask-glazing", name: "ASK Glazing", industry: "Home Improvement", logoUrl: "/images/placeholder.jpg" },
  { id: "stessa-by-sarah", name: "Stessa By Sarah", industry: "Beauty", logoUrl: "/images/placeholder.jpg" },
  { id: "casa-ascot", name: "Casa Ascot", industry: "Property", logoUrl: "/images/placeholder.jpg" },
  { id: "viking-cars", name: "Viking Cars", industry: "Transport", logoUrl: "/images/vikingiconbg.png" },
];

const SEED_REVIEWS = [
  {
    id: "hoddle",
    companyId: "hoddle",
    heading: "A True Partnership in Innovation",
    body: "Partnering with Code & Canvas has been a game-changer. Their collaborative approach helped us refine and enhance our architecture, platform, and mobile app. The expertise and support they brought to the table have been invaluable to our growth.",
    clientName: "Hoddle",
    clientIndustry: "Fintech",
    avatarUrl: "/images/icon1200.png",
    sortOrder: 1,
    published: true,
  },
  {
    id: "shilaking",
    companyId: "shilaking",
    heading: "Branding and E-commerce Done Right",
    body: "From creating our brand identity to developing a top-notch dropshipping store, Code & Canvas delivered outstanding results. They captured our vision perfectly and brought it to life.",
    clientName: "Shilaking",
    clientIndustry: "E-commerce",
    avatarUrl: "/images/shil900.png",
    sortOrder: 2,
    published: true,
  },
  {
    id: "viking-cars",
    companyId: "viking-cars",
    heading: "A Reliable Partner in Our Success",
    body: "Code & Canvas has been a critical partner in enhancing our telephone systems, driving our marketing efforts, and advancing our app development. Their collaborative approach and consistent support make them a valuable part of our team.",
    clientName: "Viking Cars",
    clientIndustry: "Transport",
    avatarUrl: "/images/vikingiconbg.png",
    sortOrder: 3,
    published: true,
  },
  {
    id: "maal-monkeys",
    companyId: "maal-monkeys",
    heading: "Creative Vision Brought to Life",
    body: "Code & Canvas understood our creative vision from day one and translated it into a stunning NFT collection. Their attention to detail and artistic expertise made the entire process seamless and the results speak for themselves.",
    clientName: "Maal Monkeys",
    clientIndustry: "NFTs",
    avatarUrl: "/images/maalicon.png",
    sortOrder: 4,
    published: true,
  },
];

const STUDIO_AUTHOR = {
  name: "Code & Canvas",
  role: "Studio",
  avatarUrl: "",
  bio: "Notes from the studio on brand, product, engineering and growth.",
  linkedinUrl: "",
  moreArticlesUrl: "/blog",
};

const SEED_BLOG_POSTS = [
  {
    id: "future-of-branding-in-digital-age",
    slug: "future-of-branding-in-digital-age",
    title: "The Future of Branding in the Digital Age",
    summary: "How emerging technologies and shifting consumer expectations are reshaping brand identity — and what businesses can do to stay ahead.",
    category: "Branding",
    tags: ["Branding", "Strategy"],
    publishedAt: "2026-03-28",
    readingTimeMinutes: 4,
    author: STUDIO_AUTHOR,
    coverImage: { url: "/images/placeholder.jpg", alt: "Future of branding cover" },
    toc: [],
    body: [
      {
        type: "section",
        id: "overview",
        number: "01",
        heading: "Beyond logos and palettes",
        blocks: [
          { type: "lead", text: "Branding has evolved far beyond logos and colour palettes." },
          { type: "paragraph", text: "In a hyper-connected world, your brand is every interaction a customer has with your business — from social feeds to product packaging. We explore the trends shaping modern brand strategy." },
          { type: "callout", tag: "→ Studio practice", text: "We treat every customer touchpoint as a brand surface, not just the marketing site." },
        ],
      },
    ],
    related: [],
    seo: { metaTitle: "", metaDescription: "" },
    published: true,
  },
  {
    id: "why-mobile-first-matters",
    slug: "why-mobile-first-matters",
    title: "Why Mobile-First Design Still Matters in 2026",
    summary: "With over 60% of web traffic coming from mobile devices, designing for small screens first isn't optional — it's essential.",
    category: "Design",
    tags: ["Design", "Mobile", "UX"],
    publishedAt: "2026-03-20",
    readingTimeMinutes: 5,
    author: STUDIO_AUTHOR,
    coverImage: { url: "/images/placeholder.jpg", alt: "Mobile-first design" },
    toc: [],
    body: [
      {
        type: "section",
        id: "why-it-matters",
        number: "01",
        heading: "Why it still matters",
        blocks: [
          { type: "paragraph", text: "Mobile-first design ensures your product is accessible, performant, and usable across every device." },
        ],
      },
      {
        type: "section",
        id: "principles",
        number: "02",
        heading: "Three principles we follow",
        blocks: [
          { type: "list", style: "bullet", items: [
            "Design constraints first, expand later",
            "Performance is a feature",
            "Tap targets and thumb reach are non-negotiable",
          ] },
        ],
      },
    ],
    related: [],
    seo: { metaTitle: "", metaDescription: "" },
    published: true,
  },
  {
    id: "building-scalable-web-apps-with-firebase",
    slug: "building-scalable-web-apps-with-firebase",
    title: "Building Scalable Web Apps with Firebase",
    summary: "Firebase offers a powerful toolkit for startups and agencies alike. Here's how we use it to ship fast without sacrificing quality.",
    category: "Engineering",
    tags: ["Engineering", "Firebase"],
    publishedAt: "2026-03-12",
    readingTimeMinutes: 6,
    author: STUDIO_AUTHOR,
    coverImage: { url: "/images/placeholder.jpg", alt: "Firebase architecture" },
    toc: [],
    body: [
      {
        type: "section",
        id: "stack",
        number: "01",
        heading: "Our default stack",
        blocks: [
          { type: "paragraph", text: "From Firestore to Cloud Functions, Firebase lets small teams punch above their weight." },
          { type: "subheading", text: "What we reach for" },
          { type: "list", style: "number", items: [
            "Firestore for documents and reactive data",
            "Cloud Functions for serverless APIs",
            "Firebase Auth for identity",
          ] },
        ],
      },
    ],
    related: [],
    seo: { metaTitle: "", metaDescription: "" },
    published: true,
  },
  {
    id: "design-systems-save-time",
    slug: "design-systems-save-time",
    title: "How Design Systems Save Time and Money",
    summary: "A well-crafted design system isn't a luxury — it's an investment that pays for itself on every project.",
    category: "Design",
    tags: ["Design Systems", "Process"],
    publishedAt: "2026-03-05",
    readingTimeMinutes: 4,
    author: STUDIO_AUTHOR,
    coverImage: { url: "/images/placeholder.jpg", alt: "Design system tokens" },
    toc: [],
    body: [
      {
        type: "section",
        id: "the-case",
        number: "01",
        heading: "The case for systems",
        blocks: [
          { type: "paragraph", text: "Design systems bring consistency, speed, and collaboration to product development." },
          { type: "quote", text: "A system is a contract between yesterday's decisions and tomorrow's pace.", cite: "— Studio notes" },
        ],
      },
    ],
    related: [],
    seo: { metaTitle: "", metaDescription: "" },
    published: true,
  },
  {
    id: "from-concept-to-launch-our-process",
    slug: "from-concept-to-launch-our-process",
    title: "From Concept to Launch: Our End-to-End Process",
    summary: "A behind-the-scenes look at how we take ideas from the whiteboard to a live, polished product.",
    category: "Process",
    tags: ["Process", "Studio"],
    publishedAt: "2026-02-25",
    readingTimeMinutes: 5,
    author: STUDIO_AUTHOR,
    coverImage: { url: "/images/placeholder.jpg", alt: "Studio process" },
    toc: [],
    body: [
      {
        type: "section",
        id: "framework",
        number: "01",
        heading: "Our five-phase framework",
        blocks: [
          { type: "lead", text: "Every project at Code & Canvas follows a proven framework: discover, define, design, develop, and deliver." },
          { type: "list", style: "bullet", items: [
            "Discover — research and alignment",
            "Define — scope and success metrics",
            "Design — flows and visual systems",
            "Develop — production and integration",
            "Deliver — launch and iterate",
          ] },
        ],
      },
    ],
    related: [],
    seo: { metaTitle: "", metaDescription: "" },
    published: true,
  },
];

exports.seedProjects = onRequest(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const secret = process.env.SEED_SECRET || "";
  if (!secret || req.headers["x-seed-secret"] !== secret) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }

  try {
    const batch = db.batch();
    const ts = admin.firestore.FieldValue.serverTimestamp();

    const ADMIN_UIDS = ["BtRM9rvKEtf5Y7L0PPmjz4N4AVz1"];
    for (const uid of ADMIN_UIDS) {
      batch.set(db.collection("admins").doc(uid), { createdAt: ts }, { merge: true });
    }

    for (const c of SEED_COMPANIES) {
      const { id: cId, ...cData } = c;
      batch.set(db.collection("companies").doc(cId), { ...cData, updatedAt: ts }, { merge: true });
    }
    for (const p of SEED_PROJECTS) {
      batch.set(db.collection("projects").doc(p.slug), { ...p, updatedAt: ts }, { merge: true });
    }
    for (const r of SEED_REVIEWS) {
      const { id: rId, ...rData } = r;
      batch.set(db.collection("reviews").doc(rId), { ...rData, updatedAt: ts }, { merge: true });
    }
    for (const b of SEED_BLOG_POSTS) {
      const { id: bId, ...bData } = b;
      // Replace blog documents with the new structured schema (migrate-now).
      batch.set(db.collection("blog_posts").doc(bId), { ...bData, updatedAt: ts });
    }
    await batch.commit();
    res.status(200).json({
      ok: true,
      admins: ADMIN_UIDS,
      companies: SEED_COMPANIES.map((x) => x.id),
      seeded: SEED_PROJECTS.map((x) => x.slug),
      reviews: SEED_REVIEWS.map((x) => x.id),
      blog_posts: SEED_BLOG_POSTS.map((x) => x.id),
    });
  } catch (error) {
    logger.error("seed failed", error);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

exports.backfillCompanyReviews = onRequest(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const secret = process.env.SEED_SECRET || "";
  if (!secret || req.headers["x-seed-secret"] !== secret) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }

  try {
    const ts = admin.firestore.FieldValue.serverTimestamp();

    const [companiesSnap, reviewsSnap] = await Promise.all([
      db.collection("companies").get(),
      db.collection("reviews").select("companyId").get(),
    ]);

    const companyIds = [];
    companiesSnap.forEach((doc) => companyIds.push(doc.id));

    const companyIdsWithAnyReview = new Set();
    reviewsSnap.forEach((doc) => {
      const companyId = (doc.data() || {}).companyId;
      if (typeof companyId === "string" && companyId.trim()) companyIdsWithAnyReview.add(companyId.trim());
    });

    const missing = companyIds.filter((id) => !companyIdsWithAnyReview.has(id));
    const created = [];

    // Firestore batch limit is 500 operations.
    for (let i = 0; i < missing.length; i += 450) {
      const chunk = missing.slice(i, i + 450);
      const batch = db.batch();
      for (const companyId of chunk) {
        const cDoc = await db.collection("companies").doc(companyId).get();
        const c = cDoc.data() || {};

        const reviewId = `${companyId}-auto`;
        batch.set(
          db.collection("reviews").doc(reviewId),
          {
            companyId,
            clientName: c.name || companyId,
            clientIndustry: c.industry || "",
            avatarUrl: c.logoUrl || "",
            heading: "Review pending",
            body: "This review is a placeholder draft created automatically. Edit and publish it in the admin panel.",
            sortOrder: 9999,
            published: false,
            updatedAt: ts,
          },
          { merge: true },
        );
        created.push(reviewId);
      }
      await batch.commit();
    }

    res.status(200).json({
      ok: true,
      companies: companyIds.length,
      companiesWithReview: companyIds.length - missing.length,
      companiesMissingReview: missing.length,
      created,
    });
  } catch (error) {
    logger.error("backfillCompanyReviews failed", error);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

exports.publishAutoReviews = onRequest(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const secret = process.env.SEED_SECRET || "";
  if (!secret || req.headers["x-seed-secret"] !== secret) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }

  try {
    const ts = admin.firestore.FieldValue.serverTimestamp();

    // We only want the placeholder drafts created by our backfill:
    // - sortOrder: 9999
    // - published: false
    // - doc id ends with "-auto" (checked client-side)
    const snap = await db
      .collection("reviews")
      .where("published", "==", false)
      .where("sortOrder", "==", 9999)
      .get();

    const toPublish = [];
    snap.forEach((doc) => {
      if (String(doc.id || "").endsWith("-auto")) toPublish.push(doc.ref);
    });

    const updated = [];
    for (let i = 0; i < toPublish.length; i += 450) {
      const batch = db.batch();
      const chunk = toPublish.slice(i, i + 450);
      for (const ref of chunk) {
        batch.set(ref, { published: true, updatedAt: ts }, { merge: true });
        updated.push(ref.id);
      }
      await batch.commit();
    }

    res.status(200).json({
      ok: true,
      matchedDraftPlaceholders: toPublish.length,
      published: updated.length,
      updated,
    });
  } catch (error) {
    logger.error("publishAutoReviews failed", error);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

exports.blogArticle = onRequest(async (req, res) => {
  const slug = extractBlogSlug(req.path || "");
  if (!slug) {
    res.status(404).send("Not found");
    return;
  }

  const origin = SITE_ORIGIN;
  let post = null;

  try {
    const snap = await db
      .collection("blog_posts")
      .where("slug", "==", slug)
      .where("published", "==", true)
      .limit(1)
      .get();
    if (!snap.empty) post = snap.docs[0].data();
  } catch (error) {
    logger.error("blogArticle meta lookup failed", { slug, error });
  }

  const meta = buildBlogMetaHtml(post, slug, origin);
  const jsonLd = buildBlogJsonLd(post, slug, origin);
  const html = getBlogDetailShell()
    .replace("<!--BLOG_META-->", meta)
    .replace("<!--BLOG_JSON_LD-->", jsonLd);
  res
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", "public, max-age=300, s-maxage=600")
    .status(post ? 200 : 404)
    .send(html);
});

exports.blogIndex = onRequest(async (req, res) => {
  const origin = SITE_ORIGIN;
  let featured = null;
  const recent = [];

  try {
    const snap = await db
      .collection("blog_posts")
      .where("published", "==", true)
      .orderBy("publishedAt", "desc")
      .limit(12)
      .get();
    snap.forEach((doc, i) => {
      const data = doc.data();
      data.slug = data.slug || doc.id;
      if (i === 0) featured = data;
      recent.push(data);
    });
  } catch (error) {
    logger.error("blogIndex lookup failed", error);
  }

  const meta = buildBlogIndexMetaHtml(featured, origin);
  const jsonLd = buildBlogIndexJsonLd(recent, origin);
  const html = getBlogIndexShell()
    .replace("<!--BLOG_INDEX_META-->", meta)
    .replace("<!--BLOG_INDEX_JSON_LD-->", jsonLd);

  res
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", "public, max-age=300, s-maxage=600")
    .status(200)
    .send(html);
});

exports.sitemap = onRequest(async (req, res) => {
  const now = Date.now();
  if (sitemapCache && now - sitemapCacheAt < SITEMAP_CACHE_MS) {
    res
      .set("Content-Type", "application/xml; charset=utf-8")
      .set("Cache-Control", "public, max-age=3600, s-maxage=3600")
      .send(sitemapCache);
    return;
  }

  let blogPosts = [];
  try {
    const snap = await db
      .collection("blog_posts")
      .where("published", "==", true)
      .orderBy("publishedAt", "desc")
      .get();
    snap.forEach((doc) => {
      const data = doc.data();
      data.slug = data.slug || doc.id;
      blogPosts.push(data);
    });
  } catch (error) {
    logger.error("sitemap blog_posts lookup failed", error);
  }

  const xml = buildBlogSitemapXml(blogPosts, SITE_ORIGIN);
  sitemapCache = xml;
  sitemapCacheAt = now;

  res
    .set("Content-Type", "application/xml; charset=utf-8")
    .set("Cache-Control", "public, max-age=3600, s-maxage=3600")
    .send(xml);
});

exports.newsletter = onRequest(async (req, res) => {
  const headers = corsHeaders(req);
  if (handlePreflight(req, res, headers)) return;
  if (req.method !== "POST") {
    res.set(headers).status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  if (isRateLimited(String(ip), "newsletter", 10)) {
    res.set(headers).status(429).json({ ok: false, error: "rate_limited" });
    return;
  }

  const honeypot = normalizeText(req.body?.website || "", 128);
  if (honeypot) {
    res.set(headers).status(200).json({ ok: true });
    return;
  }

  const email = normalizeText(req.body?.email, 190).toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    res.set(headers).status(400).json({ ok: false, error: "invalid_payload" });
    return;
  }

  try {
    const id = Buffer.from(email).toString("base64url");
    await db.collection("newsletter_subscribers").doc(id).set(
      {
        email,
        source: "website",
        ip: String(ip).slice(0, 150),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    res.set(headers).status(200).json({ ok: true });
  } catch (error) {
    logger.error("newsletter submission failed", error);
    res.set(headers).status(500).json({ ok: false, error: "server_error" });
  }
});

// ═══════════════════════════════════
//  AI BLOG POST GENERATION
// ═══════════════════════════════════
//
// Secured endpoint that drafts a structured blog post (matching the
// `blog_posts` schema used by the admin panel and public site), generates a
// cover image, uploads the image to Firebase Storage and returns the full
// payload to the admin UI for review before saving/publishing.

const BLOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_BLOG_TONES = new Set([
  "studio",
  "expert",
  "friendly",
  "conversational",
  "practical",
  "thought-leader",
]);
const ALLOWED_IMAGE_STYLES = new Set([
  "editorial",
  "abstract",
  "minimal",
  "illustrative",
  "photography",
  "studio",
]);
const ALLOWED_BLOCK_TYPES = new Set([
  "lead",
  "paragraph",
  "subheading",
  "list",
  "quote",
  "callout",
  "image",
]);

function slugifyBlog(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function verifyAdminRequest(req) {
  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer) return { ok: false, status: 401, error: "missing_token" };
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(bearer);
  } catch (err) {
    if (err.code === "auth/id-token-expired") {
      return { ok: false, status: 401, error: "token_expired" };
    }
    return { ok: false, status: 401, error: "invalid_token" };
  }
  const adminDoc = await db.collection("admins").doc(decoded.uid).get();
  if (!adminDoc.exists) return { ok: false, status: 403, error: "not_admin" };
  return { ok: true, uid: decoded.uid };
}

async function loadBlogPostsForReview() {
  const snap = await db.collection("blog_posts").get();
  const posts = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    posts.push({
      slug: d.slug || doc.id,
      title: d.title || "",
      summary: d.summary || "",
      category: d.category || "",
      tags: Array.isArray(d.tags) ? d.tags : [],
      published: !!d.published,
      publishedAt: d.publishedAt || "",
    });
  });
  posts.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  return posts;
}

async function ensureUniqueBlogSlug(initialSlug, fallbackTitle) {
  let base = slugifyBlog(initialSlug) || slugifyBlog(fallbackTitle) || "post";
  if (!BLOG_SLUG_PATTERN.test(base)) base = slugifyBlog(base) || "post";
  let candidate = base;
  for (let i = 0; i < 25; i += 1) {
    const exists = await db.collection("blog_posts").doc(candidate).get();
    if (!exists.exists) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now()}`;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeBlogBlockForFunction(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "").toLowerCase().trim();
  if (!ALLOWED_BLOCK_TYPES.has(type)) return null;
  switch (type) {
    case "lead":
    case "paragraph":
    case "subheading": {
      const text = String(raw.text || "").trim();
      if (!text) return null;
      return { type, text };
    }
    case "list": {
      const items = Array.isArray(raw.items)
        ? raw.items.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
      if (!items.length) return null;
      return { type, style: raw.style === "number" ? "number" : "bullet", items };
    }
    case "quote": {
      const text = String(raw.text || "").trim();
      if (!text) return null;
      return { type, text, cite: String(raw.cite || "").trim() };
    }
    case "callout": {
      const text = String(raw.text || "").trim();
      const tag = String(raw.tag || "").trim();
      if (!text && !tag) return null;
      return { type, text, tag };
    }
    case "image": {
      const url = String(raw.url || "").trim();
      const alt = String(raw.alt || "").trim();
      const caption = String(raw.caption || "").trim();
      if (!url && !alt && !caption) return null;
      return { type, url, alt, caption };
    }
    default:
      return null;
  }
}

function normalizeBlogCtaForFunction(raw) {
  if (raw === false) {
    return {
      enabled: false,
      eyebrow: "",
      title: "",
      text: "",
      primaryLabel: "",
      primaryUrl: "",
      secondaryLabel: "",
      secondaryUrl: "",
    };
  }
  const c = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: c.enabled === false ? false : true,
    eyebrow: String(c.eyebrow || "").slice(0, 80),
    title: String(c.title || "").slice(0, 140),
    text: String(c.text || "").slice(0, 400),
    primaryLabel: String(c.primaryLabel || "").slice(0, 60),
    primaryUrl: String(c.primaryUrl || "").slice(0, 240),
    secondaryLabel: String(c.secondaryLabel || "").slice(0, 60),
    secondaryUrl: String(c.secondaryUrl || "").slice(0, 240),
  };
}

function normalizeBlogPayloadFromAi(raw, ctx) {
  if (!raw || typeof raw !== "object") throw new Error("ai_output_not_object");
  const title = String(raw.title || "").trim().slice(0, 180);
  if (!title) throw new Error("ai_output_missing_title");
  const summary = String(raw.summary || "").trim().slice(0, 400);
  const category = String(raw.category || ctx.category || "").trim().slice(0, 60);
  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .map((t) => String(t || "").trim())
        .filter((t) => t.length > 0)
        .slice(0, 10)
    : [];
  const readingTimeMinutes = Math.max(0, Math.min(60, Number(raw.readingTimeMinutes) || 0));

  const authorRaw = raw.author && typeof raw.author === "object" ? raw.author : {};
  const author = {
    name: String(authorRaw.name || ctx.defaultAuthor.name || "").trim().slice(0, 120),
    role: String(authorRaw.role || ctx.defaultAuthor.role || "").trim().slice(0, 120),
    avatarUrl: String(authorRaw.avatarUrl || ctx.defaultAuthor.avatarUrl || "").trim(),
    bio: String(authorRaw.bio || ctx.defaultAuthor.bio || "").trim().slice(0, 400),
    linkedinUrl: String(authorRaw.linkedinUrl || ctx.defaultAuthor.linkedinUrl || "").trim(),
    moreArticlesUrl: String(authorRaw.moreArticlesUrl || ctx.defaultAuthor.moreArticlesUrl || "").trim(),
  };

  const coverRaw = raw.coverImage && typeof raw.coverImage === "object" ? raw.coverImage : {};
  const coverImage = {
    url: "",
    alt: String(coverRaw.alt || "").trim().slice(0, 240),
  };

  const bodyRaw = Array.isArray(raw.body) ? raw.body : [];
  const body = [];
  bodyRaw.forEach((sectionRaw, index) => {
    if (!sectionRaw || typeof sectionRaw !== "object") return;
    const heading = String(sectionRaw.heading || "").trim().slice(0, 200);
    if (!heading) return;
    let id = slugifyBlog(sectionRaw.id || heading) || `section-${index + 1}`;
    if (!BLOG_SLUG_PATTERN.test(id)) id = `section-${index + 1}`;
    const numRaw = sectionRaw.number;
    const numberStr =
      numRaw == null || numRaw === ""
        ? String(index + 1).padStart(2, "0")
        : String(numRaw).trim().slice(0, 4);
    const blocks = Array.isArray(sectionRaw.blocks)
      ? sectionRaw.blocks.map(normalizeBlogBlockForFunction).filter(Boolean)
      : [];
    if (!blocks.length) return;
    body.push({ type: "section", id, number: numberStr, heading, blocks });
  });
  if (!body.length) throw new Error("ai_output_missing_body");

  const tocRaw = Array.isArray(raw.toc) ? raw.toc : [];
  let toc = tocRaw
    .map((t) => ({
      id: slugifyBlog(t && t.id) || "",
      label: String((t && t.label) || "").trim().slice(0, 160),
    }))
    .filter((t) => t.id && t.label);
  if (!toc.length) {
    toc = body.map((s) => ({ id: s.id, label: s.heading }));
  }

  const relatedRaw = Array.isArray(raw.related) ? raw.related : [];
  const knownSlugs = new Set(ctx.existingSlugs || []);
  const related = relatedRaw
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const slug = slugifyBlog(r.slug);
      if (!slug || !knownSlugs.has(slug)) return null;
      return {
        slug,
        title: String(r.title || "").trim().slice(0, 180),
        summary: String(r.summary || "").trim().slice(0, 300),
        category: String(r.category || "").trim().slice(0, 60),
        readingTimeMinutes: Math.max(0, Math.min(60, Number(r.readingTimeMinutes) || 0)),
        publishedAt: String(r.publishedAt || "").slice(0, 10),
        coverImage: { url: "", alt: "" },
      };
    })
    .filter(Boolean)
    .slice(0, 3);

  const seoRaw = raw.seo && typeof raw.seo === "object" ? raw.seo : {};
  const seo = {
    metaTitle: String(seoRaw.metaTitle || "").trim().slice(0, 70),
    metaDescription: String(seoRaw.metaDescription || "").trim().slice(0, 200),
  };

  const midCta = normalizeBlogCtaForFunction(raw.midCta);
  const finalCta = normalizeBlogCtaForFunction(raw.finalCta);

  const slug = ctx.slug;
  const publishedAtRaw = String(raw.publishedAt || "").trim();
  const publishedAt = /^\d{4}-\d{2}-\d{2}$/.test(publishedAtRaw)
    ? publishedAtRaw
    : todayIsoDate();

  return {
    slug,
    title,
    summary,
    category,
    tags,
    publishedAt,
    readingTimeMinutes,
    authorId: "",
    author,
    coverImage,
    toc,
    body,
    midCta,
    finalCta,
    related,
    seo,
    coverImagePrompt: String(raw.coverImagePrompt || "").trim().slice(0, 600),
  };
}

// Extracts the assistant's text content from a Responses API payload.
// Prefers the SDK-style `output_text` convenience field; falls back to walking
// the `output` array for the first `message` item with `output_text` content.
function extractResponsesApiText(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }
  if (!Array.isArray(data.output)) return "";
  for (const item of data.output) {
    if (!item || item.type !== "message") continue;
    if (!Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part && part.type === "output_text" && typeof part.text === "string") {
        return part.text;
      }
      if (part && part.type === "refusal" && typeof part.refusal === "string") {
        const err = new Error("openai_refusal");
        err.detail = part.refusal.slice(0, 500);
        throw err;
      }
    }
  }
  return "";
}

// Parses the OpenAI error body and returns a short human-readable message
// (`error.message` when available) plus the original body for logging.
function parseOpenAiErrorBody(text) {
  if (!text) return { message: "", body: "" };
  let message = "";
  try {
    const data = JSON.parse(text);
    if (data && data.error && typeof data.error.message === "string") {
      message = data.error.message;
    }
  } catch (e) {
    // not JSON — return raw text
  }
  return { message: message || text.slice(0, 400), body: text.slice(0, 1500) };
}

async function callOpenAiResponsesJson({ apiKey, instructions, input, model, timeoutMs }) {
  const requestModel = model || OPENAI_TEXT_MODEL;
  const requestBody = {
    model: requestModel,
    instructions,
    input,
    text: {
      format: { type: "json_object" },
      verbosity: "medium",
    },
    reasoning: { effort: "low" },
    store: false,
  };
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 45000));
  let resp;
  try {
    resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutHandle);
    if (err && err.name === "AbortError") {
      const e = new Error("openai_responses_timeout");
      e.detail = "Timed out waiting for text generation";
      e.model = requestModel;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    const parsed = parseOpenAiErrorBody(errText);
    const err = new Error("openai_responses_failed");
    err.status = resp.status;
    err.detail = parsed.message || `HTTP ${resp.status}`;
    err.body = parsed.body;
    err.model = requestModel;
    throw err;
  }
  const data = await resp.json();
  const content = extractResponsesApiText(data);
  if (!content) {
    const err = new Error("openai_responses_empty");
    err.detail = "OpenAI returned no text output";
    err.body = JSON.stringify(data).slice(0, 1500);
    err.model = requestModel;
    throw err;
  }
  try {
    return JSON.parse(content);
  } catch (parseErr) {
    const e = new Error("openai_responses_invalid_json");
    e.detail = "OpenAI returned non-JSON text";
    e.body = String(content).slice(0, 1500);
    e.model = requestModel;
    throw e;
  }
}

async function callOpenAiImageBase64({ apiKey, prompt, size, timeoutMs }) {
  const requestModel = OPENAI_IMAGE_MODEL;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 15000));
  let resp;
  try {
    resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: requestModel,
        prompt,
        size: size || OPENAI_IMAGE_SIZE,
        n: 1,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutHandle);
    if (err && err.name === "AbortError") {
      const e = new Error("openai_image_timeout");
      e.detail = "Timed out waiting for image generation";
      e.model = requestModel;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    const parsed = parseOpenAiErrorBody(errText);
    const err = new Error("openai_image_failed");
    err.status = resp.status;
    err.detail = parsed.message || `HTTP ${resp.status}`;
    err.body = parsed.body;
    err.model = requestModel;
    throw err;
  }
  const data = await resp.json();
  const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
  if (!b64) {
    const err = new Error("openai_image_empty_response");
    err.detail = "OpenAI returned no image data";
    err.body = JSON.stringify(data).slice(0, 1500);
    err.model = requestModel;
    throw err;
  }
  return Buffer.from(b64, "base64");
}

async function uploadCoverImageToStorage(slug, buffer) {
  const bucket = admin.storage().bucket();
  const filePath = `blog/${slug}/cover-${Date.now()}-openai.png`;
  const downloadToken = crypto.randomUUID();
  await bucket.file(filePath).save(buffer, {
    contentType: "image/png",
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000",
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });
  const url =
    `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}` +
    `/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`;
  return { url, path: filePath };
}

function buildBlogGenerationSystemPrompt() {
  return [
    "You are a senior editor and writer at Code & Canvas, a London and Dubai digital studio that ships brand,",
    "product, engineering and growth work. Write in clear British English, avoid hype, use confident but humble",
    "studio voice, prefer short paragraphs and concrete examples.",
    "",
    "You MUST respond with a single JSON object that matches this shape exactly (no commentary, no markdown):",
    "{",
    '  "slug": "kebab-case-suggested-slug",',
    '  "title": "Article title",',
    '  "summary": "1-2 sentence deck shown under the headline and on cards",',
    '  "category": "Branding|Design|Engineering|Process|Strategy|Growth|...",',
    '  "tags": ["Tag1", "Tag2"],',
    '  "publishedAt": "YYYY-MM-DD",',
    '  "readingTimeMinutes": 5,',
    '  "author": { "name": "", "role": "", "avatarUrl": "", "bio": "", "linkedinUrl": "", "moreArticlesUrl": "" },',
    '  "coverImage": { "alt": "Accessible description of the cover image" },',
    '  "coverImagePrompt": "Detailed visual prompt to generate a 16:9 editorial cover image",',
    '  "toc": [ { "id": "section-id", "label": "Section heading" } ],',
    '  "body": [',
    "    {",
    '      "id": "section-id",',
    '      "number": "01",',
    '      "heading": "Section heading",',
    '      "blocks": [',
    '        { "type": "lead", "text": "..." },',
    '        { "type": "paragraph", "text": "..." },',
    '        { "type": "subheading", "text": "..." },',
    '        { "type": "list", "style": "bullet|number", "items": ["...", "..."] },',
    '        { "type": "quote", "text": "...", "cite": "..." },',
    '        { "type": "callout", "tag": "Studio practice", "text": "..." }',
    "      ]",
    "    }",
    "  ],",
    '  "midCta": { "enabled": true, "eyebrow": "...", "title": "...", "text": "...", "primaryLabel": "...", "primaryUrl": "/contact", "secondaryLabel": "", "secondaryUrl": "" },',
    '  "finalCta": { "enabled": true, "eyebrow": "...", "title": "...", "text": "...", "primaryLabel": "...", "primaryUrl": "/contact", "secondaryLabel": "", "secondaryUrl": "" },',
    '  "related": [ { "slug": "existing-post-slug", "title": "", "summary": "", "category": "", "readingTimeMinutes": 0, "publishedAt": "" } ],',
    '  "seo": { "metaTitle": "<=60 chars", "metaDescription": "<=160 chars" }',
    "}",
    "",
    "Rules:",
    "- The slug must be lowercase, hyphen-separated, and must NOT match any existing slug provided to you.",
    "- The body must contain between 3 and 6 sections. Each section needs a unique slugified id and at least 2 blocks.",
    "- Start the first section with a `lead` block, then paragraphs. Use lists, callouts and quotes where they add value.",
    "- Do not invent statistics or quote real people; attribute any quotes to `Code & Canvas` or remove the cite.",
    "- The `related` array must only reference slugs from the provided existing posts; otherwise leave it empty.",
    "- Keep the cover image prompt concrete, editorial, and brand-appropriate (no text or logos in the image).",
  ].join("\n");
}

function buildBlogGenerationUserPrompt({ brief, existingPosts }) {
  const briefLines = [
    `Topic: ${brief.topic}`,
    brief.audience ? `Audience: ${brief.audience}` : "",
    brief.keyword ? `Target keyword / SEO focus: ${brief.keyword}` : "",
    brief.category ? `Suggested category: ${brief.category}` : "",
    brief.tone ? `Tone preference: ${brief.tone}` : "",
    brief.sectionsCount ? `Target number of sections: ${brief.sectionsCount}` : "",
    brief.imageStyle ? `Cover image visual style preference: ${brief.imageStyle}` : "",
    brief.notes ? `Additional notes: ${brief.notes}` : "",
  ].filter(Boolean);

  const recent = existingPosts.slice(0, 30).map((p) => ({
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    category: p.category,
    tags: p.tags,
    publishedAt: p.publishedAt,
    published: p.published,
  }));

  return [
    "Write the next blog post for the Code & Canvas studio blog based on this brief:",
    "",
    briefLines.join("\n"),
    "",
    "Existing posts (avoid repeating these angles and only use these slugs in `related`):",
    JSON.stringify(recent, null, 2),
    "",
    "Return ONLY the JSON object described in the system instructions.",
  ].join("\n");
}

function buildCoverImagePrompt(payload, brief) {
  const styleHint = brief.imageStyle
    ? `${brief.imageStyle} style`
    : "modern editorial style";
  const sectionHeadings = Array.isArray(payload.toc)
    ? payload.toc
        .map((item) => item && item.label ? String(item.label).trim() : "")
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const articleContext = [
    `Article title: ${payload.title || brief.topic}`,
    payload.summary ? `Article summary: ${payload.summary}` : "",
    payload.category ? `Category: ${payload.category}` : "",
    sectionHeadings.length ? `Main sections: ${sectionHeadings.join("; ")}` : "",
  ].filter(Boolean).join(". ");
  const base = payload.coverImagePrompt
    ? `${payload.coverImagePrompt}. Use this article context: ${articleContext}`
    : `An evocative hero illustration for this article. ${articleContext}`;
  return [
    base,
    `Visual direction: ${styleHint}, sophisticated colour palette, generous negative space,`,
    "no text, no typography, no logos, no watermarks, 16:9 framing.",
    "Suitable as a website hero banner for a design and engineering studio.",
  ].join(" ");
}

exports.generateBlogPost = onRequest(
  { timeoutSeconds: 540, memory: "1GiB" },
  async (req, res) => {
    const headers = corsHeaders(req);
    res.set(headers);
    const requestStartedAt = Date.now();
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    if (isRateLimited(String(ip), "generateBlogPost", 6)) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const auth = await verifyAdminRequest(req).catch((err) => {
      logger.error("generateBlogPost auth error", err);
      return { ok: false, status: 500, error: "server_error" };
    });
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      res.status(500).json({ ok: false, error: "openai_key_missing" });
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const brief = {
      topic: normalizeText(body.topic, 240),
      audience: normalizeText(body.audience, 240),
      keyword: normalizeText(body.keyword, 120),
      notes: normalizeText(body.notes, 2000),
      category: normalizeText(body.category, 60),
      tone: ALLOWED_BLOG_TONES.has(String(body.tone || "").toLowerCase())
        ? String(body.tone).toLowerCase()
        : "",
      sectionsCount: (() => {
        const n = Number(body.sectionsCount);
        if (!Number.isFinite(n)) return 0;
        return Math.max(2, Math.min(8, Math.round(n)));
      })(),
      imageStyle: ALLOWED_IMAGE_STYLES.has(String(body.imageStyle || "").toLowerCase())
        ? String(body.imageStyle).toLowerCase()
        : "",
      generateImage: body.generateImage === false ? false : true,
    };
    if (!brief.topic) {
      res.status(400).json({ ok: false, error: "missing_topic" });
      return;
    }

    let existingPosts;
    try {
      existingPosts = await loadBlogPostsForReview();
    } catch (err) {
      logger.error("generateBlogPost: failed to load existing posts", err);
      res.status(500).json({ ok: false, error: "existing_posts_failed" });
      return;
    }

    const defaultAuthor = STUDIO_AUTHOR;
    const existingSlugs = existingPosts.map((p) => p.slug);

    let aiPayload;
    try {
      const instructions = buildBlogGenerationSystemPrompt();
      const input = buildBlogGenerationUserPrompt({ brief, existingPosts });
      aiPayload = await callOpenAiResponsesJson({
        apiKey,
        instructions,
        input,
        timeoutMs: 180000,
      });
    } catch (err) {
      logger.error("generateBlogPost: openai responses call failed", {
        message: err.message,
        status: err.status,
        detail: err.detail,
        body: err.body,
        model: err.model || OPENAI_TEXT_MODEL,
      });
      res.status(502).json({
        ok: false,
        error: err.message || "openai_chat_failed",
        detail: err.detail || "",
        upstreamStatus: err.status || null,
        model: err.model || OPENAI_TEXT_MODEL,
      });
      return;
    }

    let slug;
    try {
      slug = await ensureUniqueBlogSlug(aiPayload.slug, aiPayload.title);
    } catch (err) {
      logger.error("generateBlogPost: slug check failed", err);
      res.status(500).json({ ok: false, error: "slug_check_failed" });
      return;
    }

    let normalized;
    try {
      normalized = normalizeBlogPayloadFromAi(aiPayload, {
        slug,
        category: brief.category,
        defaultAuthor,
        existingSlugs,
      });
    } catch (err) {
      logger.error("generateBlogPost: normalize failed", {
        message: err.message,
        aiPayload,
      });
      res.status(502).json({ ok: false, error: "ai_output_invalid", detail: err.message });
      return;
    }

    let coverInfo = null;
    let imageError = null;
    if (brief.generateImage) {
      try {
        const imagePrompt = buildCoverImagePrompt(normalized, brief);
        const buffer = await callOpenAiImageBase64({
          apiKey,
          prompt: imagePrompt,
          size: OPENAI_IMAGE_SIZE,
          timeoutMs: 240000,
        });
        coverInfo = await uploadCoverImageToStorage(slug, buffer);
        normalized.coverImage.url = coverInfo.url;
        if (!normalized.coverImage.alt) {
          normalized.coverImage.alt = `Cover image for ${normalized.title}`;
        }
      } catch (err) {
        const errorMessage = err && err.message ? String(err.message) : "unknown_image_error";
        const errorDetail = err && err.detail
          ? String(err.detail)
          : errorMessage;
        logger.error("generateBlogPost: required image generation/upload failed", {
          errorMessage,
          errorCode: err && err.code ? String(err.code) : "",
          status: err.status,
          detail: errorDetail,
          body: err.body,
          stack: err && err.stack ? String(err.stack).slice(0, 3000) : "",
          model: err.model || OPENAI_IMAGE_MODEL,
          elapsedMs: Date.now() - requestStartedAt,
        });
        res.status(502).json({
          ok: false,
          error: errorMessage || "image_failed",
          detail: errorDetail || "",
          upstreamStatus: err.status || null,
          model: err.model || OPENAI_IMAGE_MODEL,
        });
        return;
      }
    }

    delete normalized.coverImagePrompt;

    res.status(200).json({
      ok: true,
      slug,
      payload: normalized,
      cover: coverInfo,
      existingPostsConsidered: existingPosts.length,
      imageGenerated: !!(coverInfo && coverInfo.url),
      imageError,
      textModel: OPENAI_TEXT_MODEL,
      imageModel: OPENAI_IMAGE_MODEL,
    });
  },
);

