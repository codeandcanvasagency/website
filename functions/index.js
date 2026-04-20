const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

setGlobalOptions({ region: "europe-west2" });

admin.initializeApp();
const db = admin.firestore();

const ALLOWED_ORIGINS = new Set([
  "https://code-and-canvas.web.app",
  "https://code-and-canvas.firebaseapp.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsHeaders(req) {
  const origin = req.headers.origin || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://code-and-canvas.web.app";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

const SEED_BLOG_POSTS = [
  {
    id: "future-of-branding-in-digital-age",
    slug: "future-of-branding-in-digital-age",
    title: "The Future of Branding in the Digital Age",
    summary: "How emerging technologies and shifting consumer expectations are reshaping brand identity — and what businesses can do to stay ahead.",
    category: "Branding",
    coverImageUrl: "/images/placeholder.jpg",
    bodyHtml: "<p>Branding has evolved far beyond logos and colour palettes. In a hyper-connected world, your brand is every interaction a customer has with your business — from social feeds to product packaging. We explore the trends shaping modern brand strategy.</p>",
    author: "Code & Canvas",
    date: "2026-03-28",
    published: true,
  },
  {
    id: "why-mobile-first-matters",
    slug: "why-mobile-first-matters",
    title: "Why Mobile-First Design Still Matters in 2026",
    summary: "With over 60% of web traffic coming from mobile devices, designing for small screens first isn't optional — it's essential.",
    category: "Design",
    coverImageUrl: "/images/placeholder.jpg",
    bodyHtml: "<p>Mobile-first design ensures your product is accessible, performant, and usable across every device. We break down why the approach remains the gold standard and share practical tips for getting it right.</p>",
    author: "Code & Canvas",
    date: "2026-03-20",
    published: true,
  },
  {
    id: "building-scalable-web-apps-with-firebase",
    slug: "building-scalable-web-apps-with-firebase",
    title: "Building Scalable Web Apps with Firebase",
    summary: "Firebase offers a powerful toolkit for startups and agencies alike. Here's how we use it to ship fast without sacrificing quality.",
    category: "Development",
    coverImageUrl: "/images/placeholder.jpg",
    bodyHtml: "<p>From Firestore to Cloud Functions, Firebase lets small teams punch above their weight. In this post, we walk through our favourite patterns for authentication, real-time data, and serverless APIs.</p>",
    author: "Code & Canvas",
    date: "2026-03-12",
    published: true,
  },
  {
    id: "design-systems-save-time",
    slug: "design-systems-save-time",
    title: "How Design Systems Save Time and Money",
    summary: "A well-crafted design system isn't a luxury — it's an investment that pays for itself on every project.",
    category: "Design",
    coverImageUrl: "/images/placeholder.jpg",
    bodyHtml: "<p>Design systems bring consistency, speed, and collaboration to product development. We look at how creating reusable component libraries and tokens has transformed our workflow and our clients' products.</p>",
    author: "Code & Canvas",
    date: "2026-03-05",
    published: true,
  },
  {
    id: "from-concept-to-launch-our-process",
    slug: "from-concept-to-launch-our-process",
    title: "From Concept to Launch: Our End-to-End Process",
    summary: "A behind-the-scenes look at how we take ideas from the whiteboard to a live, polished product.",
    category: "Process",
    coverImageUrl: "/images/placeholder.jpg",
    bodyHtml: "<p>Every project at Code & Canvas follows a proven framework: discover, define, design, develop, and deliver. We share how each phase works and why having a structured process leads to better outcomes for our clients.</p>",
    author: "Code & Canvas",
    date: "2026-02-25",
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
      batch.set(db.collection("blog_posts").doc(bId), { ...bData, updatedAt: ts }, { merge: true });
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

