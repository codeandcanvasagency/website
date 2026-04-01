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
    sortOrder: 1,
    title: "Hoddle",
    tagline: "Mobile App Development",
    summary:
      "Hoddle, a fintech startup, needed a secure yet intuitive mobile app with key tasks achievable in just two taps. Code & Canvas designed and developed a streamlined cross-platform app that balanced simplicity with robust functionality, positioning Hoddle for success in the fintech market.",
    coverImageUrl: "/images/hoddleweb.png",
    client: "Hoddle — Fintech",
    objective: "Develop an all-in-one mobile banking app",
    deliverables: "Mobile App",
    duration: "16 Weeks",
    bodyHtml: `<h2>The Challenge</h2><p>In a crowded fintech market, Hoddle knew their mobile app needed to be much more than just functional—it had to offer an exceptional user experience. With security at its core, the app had to allow users to navigate easily, performing critical banking tasks in just two taps. Hoddle's vision was ambitious: deliver an app that balanced cutting-edge technology with simplicity.</p><h2>Specific Requirements</h2><p>• Develop a cross-platform mobile app for both iOS and Android.<br/>• Ensure a secure, user-friendly interface for managing financial tasks.<br/>• Integrate real-time data synchronisation with Hoddle's backend systems.<br/>• Design the app so major tasks are achievable in just two taps for maximum efficiency.</p><h2>Our Process</h2><p>We approached Hoddle's mobile app with a user-first mindset and strong technical execution.</p><p><strong>Discovery &amp; Research</strong> — We analysed Hoddle's target users and competitor fintech apps to define features that would differentiate the product.</p><p><strong>UI/UX Design</strong> — Wireframes and interactive prototypes emphasised clarity and speed; the interface stays minimal so essential tasks stay within two taps.</p><p><strong>Development</strong> — Cross-platform delivery for iOS and Android with rigorous security for sensitive financial data.</p><p><strong>Integration &amp; Testing</strong> — Real-time sync with Hoddle's backend, full QA, and hardening before launch.</p><p><strong>Launch &amp; Support</strong> — Release on the App Store and Google Play with ongoing support for updates.</p><h2>The Outcome</h2><p>The app set a strong benchmark in fintech: modern design, high engagement, and trust built through security and reliability. Users consistently praised speed, ease of use, and completing key flows in two taps.</p>`,
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
    sortOrder: 2,
    title: "Shilaking",
    tagline: "Brand Identity and Product Packaging",
    summary:
      "End-to-end brand identity and packaging for Shilaking — from strategy and visual language to shelf-ready packaging and consistent assets across digital and physical touchpoints.",
    coverImageUrl: "/images/shil900.png",
    client: "Shilaking",
    objective: "Build a recognisable brand and packaging system that sells",
    deliverables: "Brand identity, packaging design, brand guidelines",
    duration: "—",
    bodyHtml: `<h2>The Brief</h2><p>Shilaking needed a cohesive brand that could carry from e-commerce and social through to physical product on shelf. The identity had to feel premium, memorable, and scalable as the product line grows.</p><h2>What We Delivered</h2><p><strong>Brand strategy &amp; positioning</strong> — Clarified tone of voice, audience, and differentiation.</p><p><strong>Visual identity</strong> — Logo system, colour palette, typography, and graphic motifs applied consistently across channels.</p><p><strong>Product packaging</strong> — Structural and graphic design for packaging that reads clearly at a glance and reinforces the brand on shelf.</p><p><strong>Guidelines</strong> — Practical rules so internal teams and partners can apply the brand correctly.</p><h2>Result</h2><p>A unified brand and packaging system that supports growth, strengthens recognition, and presents Shilaking professionally everywhere customers meet the brand.</p>`,
    galleryUrls: ["/images/shil900.png"],
    published: true,
  },
  {
    slug: "maal-monkeys",
    sortOrder: 3,
    title: "Maal Monkeys",
    tagline: "NFT Art Collection",
    summary:
      "Creative direction and production for the Maal Monkeys NFT collection — distinctive character art, trait layers for generative output, and assets ready for mint and marketplace presentation.",
    coverImageUrl: "/images/maalicon.png",
    client: "Maal Monkeys",
    objective: "Launch a cohesive, collectible NFT art series",
    deliverables: "Art direction, character & trait system, collection assets",
    duration: "—",
    bodyHtml: `<h2>Creative Direction</h2><p>We defined the visual world of Maal Monkeys — personality, style, and the rules that keep every piece feeling part of one family while allowing rarity and variation.</p><h2>Art &amp; Trait System</h2><p><strong>Base characters</strong> — Core designs that anchor the collection.<br/><strong>Trait layers</strong> — Clothing, accessories, backgrounds, and attributes balanced for visual interest and sensible rarity curves.<br/><strong>Output pipeline</strong> — Organised asset delivery suitable for generative composition and metadata.</p><h2>Go-to-market assets</h2><p>Key visuals and formats for launch, social teases, and marketplace presence so the collection presents consistently from reveal to secondary sales.</p><h2>Outcome</h2><p>A structured collection with a clear artistic identity, ready for mint and long-term community storytelling.</p>`,
    galleryUrls: ["/images/maalicon.png"],
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
    for (const p of SEED_PROJECTS) {
      const ref = db.collection("projects").doc(p.slug);
      batch.set(
        ref,
        {
          ...p,
          updatedAt: ts,
        },
        { merge: true },
      );
    }
    await batch.commit();
    res.status(200).json({ ok: true, seeded: SEED_PROJECTS.map((x) => x.slug) });
  } catch (error) {
    logger.error("seed projects failed", error);
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

