import { useMemo } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { X } from "lucide-react";
import { useMapState } from "@/lib/MapState";
import { computeBounds } from "@/lib/geo";
import type { JlsCollection, JlsFeature } from "@/lib/types";
import { fitAfterLayout } from "@/lib/fit";

interface Props {
  map: MapLibreMap | null;
  jls: JlsCollection | null;
  zupanija: string;
}

// Lijevi sidebar na /zupanija/:slug i /jls/:slug — JLS-ovi jedne županije.
// Na /jls/ daje kontekst: odabrana je istaknuta, susjedna je jedan klik dalje.
// X briše odabir pa ruta pada na `/`, gdje sidebara nema.
export function ZupJlsList({ map, jls, zupanija }: Props) {
  const {
    selectedJls,
    setSelectedJls,
    setSelectedNaselje,
    setFocusMode,
    setShowNaselja,
    setActiveZup,
  } = useMapState();

  const rows = useMemo(
    () =>
      jls
        ? (jls.features as JlsFeature[])
            .filter((f) => f.properties.zupanija === zupanija)
            .sort((a, b) => a.properties.name.localeCompare(b.properties.name, "hr"))
        : [],
    [jls, zupanija],
  );

  const onPick = (f: JlsFeature) => {
    setSelectedNaselje(null);
    setSelectedJls(f.id);
    setFocusMode(true);
    setShowNaselja(true);
    if (!map) return;
    fitAfterLayout(map, computeBounds(f.geometry), { padding: 50, maxZoom: 12, duration: 800 });
  };

  const onClose = () => {
    setSelectedNaselje(null);
    setSelectedJls(null);
    setFocusMode(false);
    setActiveZup(null);
  };

  return (
    <div data-testid="zup-jls-list">
      <h2
        className="m-0 flex items-center justify-between gap-2 border-b px-5 py-3 font-display text-[13px] font-semibold uppercase tracking-wider text-muted"
        style={{ borderColor: "var(--line)" }}
      >
        <span className="min-w-0 truncate">{zupanija}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[10px] normal-case text-[var(--accent-2)]">
            {rows.length} JLS
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zatvori županiju"
            title="Zatvori — natrag na cijelu Hrvatsku"
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-[var(--bg-3)]"
          >
            <X size={14} />
          </button>
        </span>
      </h2>
      <div className="py-2">
        {rows.map((f) => {
          const active = selectedJls === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onPick(f)}
              className="grid w-full grid-cols-[1fr_auto] items-center gap-2.5 border-l-2 px-4 py-1.5 text-left text-[11.5px] transition-colors hover:bg-[var(--bg-3)]"
              style={{
                borderLeftColor: active ? "var(--ui-accent)" : "transparent",
                background: active ? "var(--ui-accent-tint)" : "transparent",
              }}
            >
              <span className="truncate text-text">{f.properties.name}</span>
              <span
                className="font-mono text-[9px] uppercase tracking-wider"
                style={{ color: f.properties.type === "Grad" ? "#d4322f" : "var(--muted)" }}
              >
                {f.properties.type}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
