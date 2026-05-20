// Build-time version stamp. Vite injects __BUILD_VERSION__ at compile time
// (see vite.config.ts define block). In dev the placeholder falls back to
// "dev", which is fine — dev server reloads on every change.
//
// Used as ?v=__VERSION__ query param on lazy-fetched geojson so a redeploy
// invalidates the Service Worker's runtime cache (StaleWhileRevalidate
// would otherwise show users last-build data on first visit after deploy).
declare const __BUILD_VERSION__: string;

export const BUILD_VERSION =
  typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "dev";

export const v = (path: string): string =>
  `${path}${path.includes("?") ? "&" : "?"}v=${BUILD_VERSION}`;
