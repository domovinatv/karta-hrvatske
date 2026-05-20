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
// translucent ortofoto preset.
// Cast to never: MapLibre's typed ExpressionSpecification union is unwieldy
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

export const JLS_FILL_OPACITY_ORTO = [
  "case",
  ["boolean", ["feature-state", "hover"], false],
  0.28,
  ["boolean", ["feature-state", "focus_hidden"], false],
  0.0,
  ["boolean", ["feature-state", "selected"], false],
  0.22,
  ["boolean", ["feature-state", "dimmed"], false],
  0.04,
  0.14,
] as never;

export const NAS_FILL_OPACITY_DEFAULT = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  0.85,
  ["boolean", ["feature-state", "hover"], false],
  0.7,
  0.45,
] as never;

export const NAS_FILL_OPACITY_ORTO = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  0.4,
  ["boolean", ["feature-state", "hover"], false],
  0.3,
  0.15,
] as never;

export const TIER_COLOR: Record<number, string> = {
  1: "#d4322f",
  2: "#e8853c",
  3: "#e2b94f",
  4: "#a8c256",
  5: "#5fa8a8",
  6: "#5b8aaa",
  7: "#7e7eb8",
  8: "#8d99ae",
};

export const TYPE_COLOR: Record<string, string> = {
  Grad: "#d4322f",
  Općina: "#588b8b",
  Otok: "#06aed5",
  Other: "#8d99ae",
};
