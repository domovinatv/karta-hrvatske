import { useMemo } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import type { JlsCollection, JlsFeature } from "@/lib/types";

interface Props {
  map: MapLibreMap | null;
  jls: JlsCollection | null;
}

// Sidebar list of 21 županije with swatch + JLS count + area. Click toggles
// the dimming filter and (if turning on) fits bounds to all JLS in that
// županija. Identical UX to the legacy template's .zup-list.
export function ZupList({ map, jls }: Props) {
  const { activeZup, setActiveZup } = useMapState();

  const rows = useMemo(() => {
    if (!jls) return [];
    const stats = new Map<
      string,
      { count: number; area: number; color: string }
    >();
    for (const f of jls.features as JlsFeature[]) {
      const z = f.properties.zupanija;
      if (!stats.has(z)) stats.set(z, { count: 0, area: 0, color: f.properties.color });
      const e = stats.get(z)!;
      e.count++;
      e.area += f.properties.area_m2;
    }
    return [...stats.entries()].sort((a, b) => b[1].area - a[1].area);
  }, [jls]);

  const onPick = (zup: string) => {
    if (!map || !jls) return;
    if (activeZup === zup) {
      setActiveZup(null);
      return;
    }
    setActiveZup(zup);
    const fs = (jls.features as JlsFeature[]).filter((f) => f.properties.zupanija === zup);
    if (!fs.length) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const f of fs) {
      const walk = (g: GeoJSON.Geometry) => {
        if (g.type === "Polygon")
          g.coordinates.forEach((r) =>
            r.forEach(([x, y]) => {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }),
          );
        else if (g.type === "MultiPolygon")
          g.coordinates.forEach((p) =>
            p.forEach((r) =>
              r.forEach(([x, y]) => {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }),
            ),
          );
      };
      walk(f.geometry);
    }
    map.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: 40, duration: 1000 },
    );
  };

  return (
    <div className="py-2">
      {rows.map(([z, s]) => (
        <button
          key={z}
          type="button"
          onClick={() => onPick(z)}
          className="grid w-full grid-cols-[12px_1fr_auto] items-center gap-2.5 border-l-2 px-4 py-1.5 text-left text-[11.5px] transition-colors hover:bg-[var(--bg-3)]"
          style={{
            borderLeftColor: activeZup === z ? "var(--ui-accent)" : "transparent",
            background: activeZup === z ? "var(--ui-accent-tint)" : "transparent",
          }}
        >
          <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
          <span className="truncate text-text">{z}</span>
          <span className="font-mono text-[10px] tabular-nums text-muted">
            {s.count} · {Math.round(s.area / 1e6)}km²
          </span>
        </button>
      ))}
    </div>
  );
}
