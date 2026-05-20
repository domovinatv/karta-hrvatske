/**
 * Cloudflare Pages Advanced Mode worker — gis.domovina.ai
 *
 * Responsibilities (matched to klubovi.domovina.ai pattern):
 *  1. SPA fallback — unknown routes return index.html with 200
 *  2. OG/social meta injection — /klub/:slug, /jls/:slug, /zupanija/:slug
 *     enrich index.html with og:* + <title> from lookup JSON before the
 *     crawler ever sees the response (avoids JS-render dependency)
 *  3. Cache-Control patching — _headers is NOT applied while a worker
 *     handles the request (CF Pages Advanced Mode contract), so headers
 *     are set here
 *
 * NOTE: Do NOT add a _redirects file — it would shadow env.ASSETS.fetch()
 * and break OG injection (lesson reused from klubovi.domovina.ai).
 */

const SITE = "https://gis.domovina.ai";

let LOOKUP_CLUBS = null;
let LOOKUP_JLS = null;
let LOOKUP_ZUP = null;

async function loadLookup(env, name) {
  // Each lookup is fetched at most once per worker isolate.
  const url = `${SITE}/data/lookup-${name}.json`;
  const res = await env.ASSETS.fetch(new Request(url));
  if (!res.ok) return {};
  try {
    return await res.json();
  } catch {
    return {};
  }
}
async function loadClubsLookup(env) {
  if (!LOOKUP_CLUBS) LOOKUP_CLUBS = loadLookup(env, "clubs");
  return LOOKUP_CLUBS;
}
async function loadJlsLookup(env) {
  if (!LOOKUP_JLS) LOOKUP_JLS = loadLookup(env, "jls");
  return LOOKUP_JLS;
}
async function loadZupLookup(env) {
  if (!LOOKUP_ZUP) LOOKUP_ZUP = loadLookup(env, "zupanije");
  return LOOKUP_ZUP;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

function applyCacheHeaders(res, path) {
  const headers = new Headers(res.headers);
  if (/^\/assets\//.test(path)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (/^\/logos\//.test(path)) {
    headers.set("Cache-Control", "public, max-age=2592000, immutable");
  } else if (/^\/data\//.test(path)) {
    headers.set("Cache-Control", "public, max-age=3600, must-revalidate");
  } else if (/^\/icons\//.test(path)) {
    headers.set("Cache-Control", "public, max-age=86400");
  } else if (/\.(js|css|svg|woff2?|png|jpg|webp|ico)$/.test(path)) {
    headers.set("Cache-Control", "public, max-age=3600");
  } else {
    // HTML — keep short cache so OG updates propagate.
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
    this.replaced = false;
  }
  element(el) {
    if (el.tagName !== "head") return;
    const tags = [];
    tags.push(`<title>${escapeHtml(this.meta.title)}</title>`);
    tags.push(`<meta name="description" content="${escapeHtml(this.meta.description)}" />`);
    tags.push(`<meta property="og:title" content="${escapeHtml(this.meta.title)}" />`);
    tags.push(
      `<meta property="og:description" content="${escapeHtml(this.meta.description)}" />`,
    );
    if (this.meta.image) {
      tags.push(`<meta property="og:image" content="${SITE}${escapeHtml(this.meta.image)}" />`);
    }
    tags.push(`<meta property="og:url" content="${escapeHtml(this.canonical)}" />`);
    tags.push(`<meta property="og:type" content="website" />`);
    tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
    tags.push(`<link rel="canonical" href="${escapeHtml(this.canonical)}" />`);
    el.append(tags.join("\n"), { html: true });
  }
}

async function serveWithOg(env, request, meta) {
  const indexReq = new Request(`${SITE}/index.html`, request);
  const indexResp = await env.ASSETS.fetch(indexReq);
  if (!indexResp.ok) return indexResp;

  const url = new URL(request.url);
  const canonical = `${SITE}${url.pathname}`;

  // Strip the static <title> + og/description meta from the source HTML so
  // crawlers don't see duplicate tags after our injector appends fresh ones.
  const transformed = new HTMLRewriter()
    .on("title", { element: (el) => el.remove() })
    .on('meta[property^="og:"], meta[name="description"], meta[name="twitter:card"]', {
      element: (el) => el.remove(),
    })
    .on("head", new OgInjector(meta, canonical))
    .transform(indexResp);

  return applyCacheHeaders(
    new Response(transformed.body, {
      status: 200,
      statusText: "OK",
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    }),
    url.pathname,
  );
}

async function spaFallback(env, request) {
  const indexReq = new Request(`${SITE}/index.html`, request);
  const indexResp = await env.ASSETS.fetch(indexReq);
  return applyCacheHeaders(
    new Response(indexResp.body, {
      status: 200,
      statusText: "OK",
      headers: indexResp.headers,
    }),
    "/index.html",
  );
}

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS: { fetch: (req: Request) => Promise<Response> } }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Static asset pass-through with cache headers.
    if (
      path.startsWith("/data/") ||
      path.startsWith("/logos/") ||
      path.startsWith("/assets/") ||
      path.startsWith("/icons/") ||
      /\.(css|js|svg|png|jpg|webp|json|geojson|ico|woff2?|ttf|webmanifest)$/.test(path)
    ) {
      const res = await env.ASSETS.fetch(request);
      return applyCacheHeaders(res, path);
    }

    // Entity routes — inject OG, fall back to SPA shell on miss.
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

    // Root + everything else → SPA shell (200, not 404, so client router runs).
    return spaFallback(env, request);
  },
};
