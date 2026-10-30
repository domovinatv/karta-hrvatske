/**
 * Cloudflare Pages Advanced Mode worker — gis.domovina.ai
 *
 * Responsibilities:
 *  1. SPA fallback — non-asset routes return index.html
 *  2. OG/social meta injection on /klub/:slug, /jls/:slug, /zupanija/:slug
 *  3. Cache-Control patching (_headers is ignored while a worker handles
 *     the request)
 *  4. Tekstualni sadržaj u <div id="root"> za entitetske rute i početnu —
 *     crawleri koji ne izvršavaju JS (AI botovi, pregledi linkova) inače
 *     vide prazan SPA. React ga pri prvom renderu zamijeni (createRoot
 *     prazni kontejner).
 *
 * Radi i kao Pages Advanced Mode (_worker.js u dist/) i kao Workers entry s
 * static assets (wrangler.toml → main). Index se uvijek dohvaća kao "/", ne
 * "/index.html": Workers assets s html_handling "auto-trailing-slash"
 * odgovara na /index.html redirectom na /.
 *
 * NOTE: Do NOT add a _redirects file — it shadows env.ASSETS.fetch() and
 * breaks OG injection (lesson from klubovi.domovina.ai).
 */

const SITE = "https://gis.domovina.ai";

let LOOKUP_CLUBS = null;
let LOOKUP_JLS = null;
let LOOKUP_ZUP = null;
let LOOKUP_POSTER = null;

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
function loadPosterLookup(env) {
  if (!LOOKUP_POSTER) LOOKUP_POSTER = fetchLookup(env, "poster");
  return LOOKUP_POSTER;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

// ── Sadržaj za #root ───────────────────────────────────────────────────────
// Inline stilovi jer CSS bundle još nije stigao; boje prate --bg/--text iz
// styles.css (dark default), da prijelaz na kartu ne bljesne bijelo.
const ROOT_STYLE =
  "min-height:100vh;margin:0;padding:32px 20px;box-sizing:border-box;" +
  "background:#0a0e14;color:#e6edf3;font:15px/1.5 system-ui,sans-serif";
const LINK_STYLE = "color:#8ab4f8";

function link(href, text) {
  return `<a href="${escapeHtml(href)}" style="${LINK_STYLE}">${escapeHtml(text)}</a>`;
}

function rootShell(heading, parts) {
  return (
    `<main style="${ROOT_STYLE}"><div style="max-width:720px;margin:0 auto">` +
    `<h1 style="font-size:24px;margin:0 0 8px">${escapeHtml(heading)}</h1>` +
    parts.filter(Boolean).join("") +
    `<p style="margin-top:24px">${link("/", "DOMOVINA GIS — interaktivna karta Hrvatske")}</p>` +
    `</div></main>`
  );
}

function p(text) {
  return `<p style="margin:0 0 8px">${text}</p>`;
}

function linkList(title, items) {
  if (!items.length) return "";
  return (
    `<h2 style="font-size:17px;margin:20px 0 6px">${escapeHtml(title)}</h2>` +
    `<ul style="margin:0;padding-left:20px">` +
    items.map(([href, text]) => `<li>${link(href, text)}</li>`).join("") +
    `</ul>`
  );
}

const byName = (a, b) => a[1].localeCompare(b[1], "hr");

async function entityBody(env, kind, slug, meta) {
  if (kind === "jls") {
    return rootShell(`${meta.type} ${meta.name}`, [
      p(escapeHtml(meta.description)),
      meta.zupanijaSlug &&
        p(`Županija: ${link(`/zupanija/${meta.zupanijaSlug}`, meta.zupanija)}`),
    ]);
  }
  if (kind === "zupanija") {
    const jls = await loadJlsLookup(env);
    const items = Object.entries(jls)
      .filter(([, j]) => j.zupanija === meta.name)
      .map(([s, j]) => [`/jls/${s}`, `${j.type} ${j.name}`])
      .sort(byName);
    return rootShell(`${meta.name} županija`, [
      p(escapeHtml(meta.description)),
      linkList(`Gradovi i općine (${items.length})`, items),
    ]);
  }
  if (kind === "klub") {
    return rootShell(meta.name, [
      p(escapeHtml(meta.description)),
      meta.stadium && p(`Stadion: ${escapeHtml(meta.stadium)}`),
      meta.jlsSlug && p(`Mjesto: ${link(`/jls/${meta.jlsSlug}`, meta.city)}`),
    ]);
  }
  // poster
  return rootShell(meta.title.replace(/ · DOMOVINA GIS$/, ""), [
    p(escapeHtml(meta.description)),
  ]);
}

async function homeBody(env) {
  const [zup, poster] = await Promise.all([loadZupLookup(env), loadPosterLookup(env)]);
  const zupItems = Object.entries(zup)
    .map(([s, z]) => [`/zupanija/${s}`, z.name])
    .sort(byName);
  const posterItems = Object.entries(poster).map(([s, c]) => [
    `/poster/${s}`,
    c.title.replace(/ · DOMOVINA GIS$/, ""),
  ]);
  return rootShell("DOMOVINA Karta — Geografija Hrvatske", [
    p(
      "Interaktivna karta Republike Hrvatske: županije, gradovi i općine, " +
        "naselja, nogometni klubovi i slojevi otvorenih podataka.",
    ),
    linkList("Županije", zupItems),
    linkList("Plakati po gradovima", posterItems),
  ]);
}

function applyCacheHeaders(res, path) {
  const headers = new Headers(res.headers);
  if (!res.ok) {
    // NIKAD ne cachiraj error odgovore: 404 tijekom deploy propagacije s
    // immutable headerom otruje edge za taj URL (MIME text/html za .js
    // module → mrtva stranica do evictiona).
    headers.set("Cache-Control", "no-store");
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  }
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

async function serveWithOg(env, request, meta, bodyHtml) {
  const indexRes = await env.ASSETS.fetch(new Request(`${SITE}/`));
  if (!indexRes.ok) return indexRes;
  const url = new URL(request.url);
  const canonical = `${SITE}${url.pathname}`;
  const transformed = new HTMLRewriter()
    .on("title", { element: (el) => el.remove() })
    .on('meta[property^="og:"], meta[name="description"], meta[name="twitter:card"]', {
      element: (el) => el.remove(),
    })
    .on("head", new OgInjector(meta, canonical))
    .on("div#root", { element: (el) => el.setInnerContent(bodyHtml, { html: true }) })
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
    if (path === "/index.html") {
      // Service worker precachira ovaj URL kao app shell (navigateFallback).
      // Mora biti čisti shell bez sadržaja početne, i 200 umjesto redirecta
      // koji assets daju za /index.html.
      const shell = await env.ASSETS.fetch(new Request(`${SITE}/`));
      const headers = new Headers(shell.headers);
      headers.set("Content-Type", "text/html; charset=utf-8");
      headers.set("Cache-Control", "public, max-age=60, must-revalidate");
      return new Response(shell.body, { status: shell.status, headers });
    }
    if (/\.\w{1,8}$/.test(path)) {
      const res = await env.ASSETS.fetch(request);
      // Pages ASSETS.fetch za NEPOSTOJEĆI path vraća 200 index.html (SPA
      // not_found_handling) — za file-like path to je otrov: modul dobije
      // MIME text/html, a edge bi HTML cachirao pod asset URL-om s
      // immutable headerom (deploy race). Vrati 404 no-store umjesto toga;
      // klijentski lazyReload tada povuče svježi shell.
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("text/html") && !/\.html?$/.test(path)) {
        return new Response("Not found", {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
      }
      return applyCacheHeaders(res, path);
    }

    // Entity routes — OG injection.
    let m;
    if ((m = path.match(/^\/klub\/([^/]+)\/?$/))) {
      const slug = decodeURIComponent(m[1]);
      const meta = (await loadClubsLookup(env))[slug];
      if (meta) return serveWithOg(env, request, meta, await entityBody(env, "klub", slug, meta));
    } else if ((m = path.match(/^\/jls\/([^/]+)\/?$/))) {
      const slug = decodeURIComponent(m[1]);
      const meta = (await loadJlsLookup(env))[slug];
      if (meta) return serveWithOg(env, request, meta, await entityBody(env, "jls", slug, meta));
    } else if ((m = path.match(/^\/zupanija\/([^/]+)\/?$/))) {
      const slug = decodeURIComponent(m[1]);
      const meta = (await loadZupLookup(env))[slug];
      if (meta) return serveWithOg(env, request, meta, await entityBody(env, "zupanija", slug, meta));
    } else if ((m = path.match(/^\/poster\/([^/]+)\/?$/))) {
      // Plakat po gradu se dijeli linkom (WhatsApp) — bez ovoga kartica
      // pokazuje generički naslov cijele karte, ne grad iz URL-a.
      const slug = decodeURIComponent(m[1]);
      const meta = (await loadPosterLookup(env))[slug];
      if (meta) return serveWithOg(env, request, meta, await entityBody(env, "poster", slug, meta));
    }

    // SPA fallback — every other path serves index.html with 200 so the
    // client router can take over. Single-shot Response wrap to avoid
    // body stream lock issues across two new Response() calls.
    let indexRes = await env.ASSETS.fetch(new Request(`${SITE}/`));
    if (path === "/" && indexRes.ok) {
      const body = await homeBody(env);
      indexRes = new HTMLRewriter()
        .on("div#root", { element: (el) => el.setInnerContent(body, { html: true }) })
        .transform(indexRes);
    }
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
