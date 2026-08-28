import { lazy, Suspense, type LazyExoticComponent } from "react";
import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "./components/RootLayout";
import { PageSpinner } from "./components/PageSpinner";

// Stale-chunk zaštita: nakon deploya stari shell (SW precache / edge cache)
// zna tražiti chunk koji više ne postoji → dynamic import padne. Jedan force
// reload povuče svježi index.html s novim hashevima; sessionStorage guard
// sprječava reload petlju ako ni reload ne pomogne.
const lazyReload = (importer: () => Promise<{ default: () => JSX.Element }>) =>
  lazy(() =>
    importer().catch((e: unknown) => {
      const KEY = "chunk-reload-at";
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
        return new Promise<{ default: () => JSX.Element }>(() => {});
      }
      throw e;
    }),
  );

const MapView = lazyReload(() => import("./routes/MapView"));
const PosterView = lazyReload(() => import("./routes/PosterView"));
const NotFound = lazyReload(() => import("./routes/NotFound"));

const lazyRoute = (Cmp: LazyExoticComponent<() => JSX.Element>) => (
  <Suspense fallback={<PageSpinner />}>
    <Cmp />
  </Suspense>
);

// Phased routing — only the index map view is wired in Phase 1.
// Deep-link routes (/klub/:slug, /jls/:slug, /zupanija/:slug) come in Phase 2.
export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <RootLayout error />,
    children: [
      { index: true, element: lazyRoute(MapView) },
      { path: "klub/:slug", element: lazyRoute(MapView) },
      { path: "kampanje", element: lazyRoute(MapView) },
      { path: "jls/:slug", element: lazyRoute(MapView) },
      // /poster redirecta na /poster/<default>; grad je u putanji da se
      // link na konkretan plakat može sherati (WhatsApp/OG).
      { path: "poster", element: lazyRoute(PosterView) },
      { path: "poster/:grad", element: lazyRoute(PosterView) },
      { path: "zupanija/:slug", element: lazyRoute(MapView) },
      { path: "*", element: lazyRoute(NotFound) },
    ],
  },
]);
