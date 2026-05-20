import { lazy, Suspense, type LazyExoticComponent } from "react";
import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "./components/RootLayout";
import { PageSpinner } from "./components/PageSpinner";

const MapView = lazy(() => import("./routes/MapView"));
const NotFound = lazy(() => import("./routes/NotFound"));

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
      { path: "jls/:slug", element: lazyRoute(MapView) },
      { path: "zupanija/:slug", element: lazyRoute(MapView) },
      { path: "*", element: lazyRoute(NotFound) },
    ],
  },
]);
