/**
 * Cloudflare Pages Advanced Mode worker — gis.domovina.ai
 *
 * Responsibilities:
 *  1. SPA fallback — non-asset routes return index.html
 *  2. OG/social meta injection on /klub/:slug, /jls/:slug, /zupanija/:slug
 *  3. Cache-Control patching (CF Pages Advanced Mode: _headers is ignored
 *     while a worker handles the request)
 *
 * NOTE: Do NOT add a _redirects file — it shadows env.ASSETS.fetch() and
 * breaks OG injection (lesson from klubovi.domovina.ai).
 */

const SITE = "https://gis.domovina.ai";

let LOOKUP_CLUBS = null;
let LOOKUP_JLS = null;
let LOOKUP_ZUP = null;

function fetchLookup(env, name) {
  return env.ASSETS.fetch(new Request(`${SITE}/data/lookup-${name}.json`))
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
}
function loadClubsLookup(env) {
  if (!LOOKUP_CLUBS) LOOKUP_CLUBS = fetchLookup(env, "clubs");
  return LOOKUP_CLUBS;
}
function loadJlsLookup(env) {
  if (!LOOKUP_JLS) LOOKUP_JLS = fetchLookup(env, "jls");
  return LOOKUP_JLS;
}
function loadZupLookup(env) {
  if (!LOOKUP_ZUP) LOOKUP_ZUP = fetchLookup(env, "zupanije");
  return LOOKUP_ZUP;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

function applyCacheHeaders(res, path) {
  const headers = new Headers(res.headers);
  if (path === "/sw.js" || /^\/workbox-.*\.js$/.test(path) || path === "/registerSW.js") {
    // Service worker skripte NIKAD ne smiju na edge/browser cache — inače
    // korisnici nakon deploya satima dobivaju stari precache manifest
    // (stari app shell) iako je novi build live.
    headers.set("Cache-Control", "no-cache, must-revalidate");
  } else if (/^\/assets\//.test(path)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (/^\/logos\//.test(path)) {
    headers.set("Cache-Control", "public, max-age=2592000, immutable");
  } else if (/^\/data\//.test(path)) {
    headers.set("Cache-Control", "public, max-age=3600, must-revalidate");
  } else if (/\.(js|css|svg|woff2?|png|jpg|webp|ico|webmanifest)$/.test(path)) {
    headers.set("Cache-Control", "public, max-age=3600");
  } else {
    headers.set("Cache-Control", "public, max-age=60, must-revalidate");
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "interest-cohort=()");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

class OgInjector {
  constructor(meta, canonical) {
    this.meta = meta;
    this.canonical = canonical;
  }
  element(el) {
    if (el.tagName.toLowerCase() !== "head") return;
    const tags = [
      `<title>${escapeHtml(this.meta.title)}</title>`,
      `<meta name="description" content="${escapeHtml(this.meta.description)}" />`,
      `<meta property="og:title" content="${escapeHtml(this.meta.title)}" />`,
      `<meta property="og:description" content="${escapeHtml(this.meta.description)}" />`,
      `<meta property="og:url" content="${escapeHtml(this.canonical)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<link rel="canonical" href="${escapeHtml(this.canonical)}" />`,
    ];
    if (this.meta.image) {
      tags.push(
        `<meta property="og:image" content="${SITE}${escapeHtml(this.meta.image)}" />`,
      );
    }
    el.append(tags.join("\n"), { html: true });
  }
}

async function serveWithOg(env, request, meta) {
  const indexRes = await env.ASSETS.fetch(new Request(`${SITE}/index.html`));
  if (!indexRes.ok) return indexRes;
  const url = new URL(request.url);
  const canonical = `${SITE}${url.pathname}`;
  const transformed = new HTMLRewriter()
    .on("title", { element: (el) => el.remove() })
    .on('meta[property^="og:"], meta[name="description"], meta[name="twitter:card"]', {
      element: (el) => el.remove(),
    })
    .on("head", new OgInjector(meta, canonical))
    .transform(indexRes);
  const out = new Response(transformed.body, transformed);
  out.headers.set("Content-Type", "text/html; charset=utf-8");
  out.headers.set("Cache-Control", "public, max-age=300, must-revalidate");
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return out;
}

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS: { fetch: (req: Request) => Promise<Response> } }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Static assets — anything with a file extension. Cheaper than
    // path-prefix matching for /data/, /logos/, etc. — ASSETS.fetch
    // handles MIME types and 404s, we just patch cache headers on top.
    if (/\.\w{1,8}$/.test(path)) {
      const res = await env.ASSETS.fetch(request);
      return applyCacheHeaders(res, path);
    }

    // Entity routes — OG injection.
    let m;
    if ((m = path.match(/^\/klub\/([^/]+)\/?$/))) {
      const lookup = await loadClubsLookup(env);
      const meta = lookup[decodeURIComponent(m[1])];
      if (meta) return serveWithOg(env, request, meta);
    } else if ((m = path.match(/^\/jls\/([^/]+)\/?$/))) {
      const lookup = await loadJlsLookup(env);
      const meta = lookup[decodeURIComponent(m[1])];
      if (meta) return serveWithOg(env, request, meta);
    } else if ((m = path.match(/^\/zupanija\/([^/]+)\/?$/))) {
      const lookup = await loadZupLookup(env);
      const meta = lookup[decodeURIComponent(m[1])];
      if (meta) return serveWithOg(env, request, meta);
    }

    // SPA fallback — every other path serves index.html with 200 so the
    // client router can take over. Single-shot Response wrap to avoid
    // body stream lock issues across two new Response() calls.
    const indexRes = await env.ASSETS.fetch(new Request(`${SITE}/index.html`));
    const headers = new Headers(indexRes.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=300, must-revalidate");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return new Response(indexRes.body, {
      status: indexRes.status === 404 ? 200 : indexRes.status,
      headers,
    });
  },
};
