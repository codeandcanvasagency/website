// Lightweight static server that mirrors firebase.json hosting semantics:
//   - cleanUrls (strip .html, redirect /foo.html -> /foo)
//   - ignore _archive/**, dotfiles, node_modules
//   - rewrite /projects/** -> /project-detail.html
//   - rewrite /blog/** -> /blog-detail.html
// Run: node scripts/serve-local.mjs [port]

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || 5050);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function isIgnored(rel) {
  if (rel.startsWith("_archive/") || rel === "_archive") return true;
  if (rel.startsWith("node_modules/")) return true;
  if (rel.split("/").some((seg) => seg.startsWith("."))) return true;
  if (rel === "firebase.json") return true;
  return false;
}

function safeJoin(rel) {
  const p = path.normalize(path.join(ROOT, rel));
  if (!p.startsWith(ROOT)) return null;
  return p;
}

function tryFile(rel) {
  if (isIgnored(rel)) return null;
  const abs = safeJoin(rel);
  if (!abs) return null;
  try {
    const stat = fs.statSync(abs);
    if (stat.isFile()) return abs;
  } catch {}
  return null;
}

function resolvePath(reqPath) {
  // 1. cleanUrls: redirect /foo.html -> /foo (except root index.html)
  if (reqPath.endsWith(".html") && reqPath !== "/index.html") {
    const stripped = reqPath.replace(/\.html$/, "");
    return { redirect: stripped || "/" };
  }

  let rel = decodeURIComponent(reqPath.replace(/^\/+/, ""));
  if (rel === "" || reqPath === "/") rel = "index.html";

  // 2. exact file?
  let abs = tryFile(rel);
  if (abs) return { file: abs };

  // 3. cleanUrls: try rel + ".html"
  abs = tryFile(rel + ".html");
  if (abs) return { file: abs };

  // 4. directory? try rel/index.html
  const candidateDir = safeJoin(rel);
  if (candidateDir) {
    try {
      const st = fs.statSync(candidateDir);
      if (st.isDirectory()) {
        const idx = tryFile(path.posix.join(rel, "index.html"));
        if (idx) return { file: idx };
      }
    } catch {}
  }

  // 5. firebase rewrites
  if (reqPath.startsWith("/projects/")) {
    const f = tryFile("project-detail.html");
    if (f) return { file: f };
  }
  if (reqPath.startsWith("/blog/")) {
    const f = tryFile("blog-detail.html");
    if (f) return { file: f };
  }

  // 6. /api/* shows a friendly note (functions don't run locally without firebase emulator)
  if (reqPath.startsWith("/api/")) {
    return {
      inline: {
        status: 503,
        type: "application/json; charset=utf-8",
        body: JSON.stringify({
          error: "Cloud Function endpoint not running locally",
          hint: "Use firebase emulators:start --only functions,hosting to test the API",
        }),
      },
    };
  }

  return { notFound: true };
}

const server = http.createServer((req, res) => {
  const reqPath = decodeURI(req.url.split("?")[0]);
  const result = resolvePath(reqPath);

  if (result.redirect) {
    res.writeHead(301, { Location: result.redirect });
    res.end();
    return;
  }
  if (result.inline) {
    res.writeHead(result.inline.status, { "Content-Type": result.inline.type });
    res.end(result.inline.body);
    return;
  }
  if (result.notFound || !result.file) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><meta charset=utf-8><title>404</title>` +
        `<style>body{font-family:system-ui;padding:48px;color:#222}</style>` +
        `<h1>404 — ${reqPath}</h1>` +
        `<p><a href="/">Go home</a></p>`
    );
    return;
  }

  const ext = path.extname(result.file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(result.file).pipe(res);

  const rel = path.relative(ROOT, result.file);
  console.log(`${req.method} ${reqPath} -> ${rel}`);
});

server.listen(PORT, () => {
  console.log(`\nCode & Canvas — local preview\nhttp://localhost:${PORT}\n`);
  console.log(`Mirrors firebase.json: cleanUrls, _archive ignore, /projects/** and /blog/** rewrites.`);
  console.log(`Cloud Function endpoints (/api/*) return 503 — run firebase emulators for those.\n`);
});
