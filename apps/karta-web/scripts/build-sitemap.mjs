#!/usr/bin/env node
// Generates public/sitemap.xml + public/robots.txt with every entity URL
// (klub/jls/zupanija). Run after build-lookups.mjs in deploy pipeline.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dirname, "../public");
const PUBLIC_DATA = join(PUBLIC, "data");
const SITE = "https://gis.domovina.ai";

function urlEntry(loc, priority = 0.5, changefreq = "monthly") {
  return `  <url><loc>${loc}</loc><priority>${priority}</priority><changefreq>${changefreq}</changefreq></url>`;
}

const now = new Date().toISOString().split("T")[0];
const urls = [];
urls.push(urlEntry(`${SITE}/`, 1.0, "weekly"));

if (existsSync(join(PUBLIC_DATA, "lookup-jls.json"))) {
  const lk = JSON.parse(readFileSync(join(PUBLIC_DATA, "lookup-jls.json"), "utf-8"));
  for (const slug of Object.keys(lk)) {
    urls.push(urlEntry(`${SITE}/jls/${encodeURIComponent(slug)}`, 0.7, "monthly"));
  }
}
if (existsSync(join(PUBLIC_DATA, "lookup-zupanije.json"))) {
  const lk = JSON.parse(readFileSync(join(PUBLIC_DATA, "lookup-zupanije.json"), "utf-8"));
  for (const slug of Object.keys(lk)) {
    urls.push(urlEntry(`${SITE}/zupanija/${encodeURIComponent(slug)}`, 0.6, "monthly"));
  }
}
if (existsSync(join(PUBLIC_DATA, "lookup-clubs.json"))) {
  const lk = JSON.parse(readFileSync(join(PUBLIC_DATA, "lookup-clubs.json"), "utf-8"));
  for (const slug of Object.keys(lk)) {
    urls.push(urlEntry(`${SITE}/klub/${encodeURIComponent(slug)}`, 0.7, "monthly"));
  }
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
writeFileSync(join(PUBLIC, "sitemap.xml"), xml);
console.log(`  sitemap.xml (${urls.length} URLs, generated ${now})`);

const robots = `User-agent: *
Allow: /
Sitemap: ${SITE}/sitemap.xml
`;
writeFileSync(join(PUBLIC, "robots.txt"), robots);
console.log(`  robots.txt`);
