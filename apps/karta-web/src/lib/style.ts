// MapLibre style URLs — same basemaps used by the legacy HTML.
// Dark = CartoCDN dark-matter, Light = OpenFreeMap positron. Free, no key.
export const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
export const STYLE_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// HR bounding box used for default fitBounds — same constants as the legacy app.
export const HR_BOUNDS: [[number, number], [number, number]] = [
  [13.4, 42.3],
  [19.5, 46.6],
];

// JLS / naselje fill-opacity expressions — toggle between default and the
// translucent ortofoto preset (Phase 2 will wire the toggle).
// Cast to any: MapLibre's typed ExpressionSpecification union is unwieldy
// for hand-written arrays; the runtime parser accepts these unchanged.
export const JLS_FILL_OPACITY_DEFAULT = [
  "case",
  ["boolean", ["feature-state", "hover"], false],
  0.5,
  ["boolean", ["feature-state", "focus_hidden"], false],
  0.0,
  ["boolean", ["feature-state", "selected"], false],
  0.75,
  ["boolean", ["feature-state", "dimmed"], false],
  0.08,
  0.4,
] as never;
