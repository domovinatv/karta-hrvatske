// Geometry walkers/bounds — pure functions, no MapLibre deps.

export type LngLatBounds = [[number, number], [number, number]];

export function walkCoords(g: GeoJSON.Geometry, cb: (x: number, y: number) => void): void {
  if (g.type === "Point") {
    const [x, y] = g.coordinates;
    cb(x, y);
    return;
  }
  if (g.type === "Polygon") {
    g.coordinates.forEach((ring) => ring.forEach(([x, y]) => cb(x, y)));
    return;
  }
  if (g.type === "MultiPolygon") {
    g.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach(([x, y]) => cb(x, y))));
    return;
  }
  if (g.type === "LineString") {
    g.coordinates.forEach(([x, y]) => cb(x, y));
    return;
  }
  if (g.type === "MultiLineString") {
    g.coordinates.forEach((line) => line.forEach(([x, y]) => cb(x, y)));
    return;
  }
  if (g.type === "MultiPoint") {
    g.coordinates.forEach(([x, y]) => cb(x, y));
    return;
  }
  // GeometryCollection: recurse.
  if (g.type === "GeometryCollection") {
    g.geometries.forEach((sub) => walkCoords(sub, cb));
  }
}

export function computeBounds(g: GeoJSON.Geometry): LngLatBounds {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  walkCoords(g, (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}
