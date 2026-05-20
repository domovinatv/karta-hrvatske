import { useEffect, useMemo, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { computeBounds } from "@/lib/geo";
import type {
  JlsCollection,
  JlsFeature,
  NaseljaCollection,
  NaseljeFeature,
} from "@/lib/types";

interface Props {
  map: MapLibreMap | null;
  jls: JlsCollection | null;
  naselja: NaseljaCollection | null;
  naseljaLoading: boolean;
  /** When user searches and there are no naselja yet, kick the lazy load. */
  onKickNaseljaLoad: () => void;
}

interface JlsHit {
  kind: "jls";
  id: number;
  feature: JlsFeature;
}
interface NasHit {
  kind: "nas";
  id: number;
  feature: NaseljeFeature;
}
type Hit = JlsHit | NasHit;

export function SearchBox({ map, jls, naselja, naseljaLoading, onKickNaseljaLoad }: Props) {
  const { setSelectedJls, setSelectedNaselje, setFocusMode, setShowNaselja } = useMapState();
  const [q, setQ] = useState("");

  // Kick naselje load when query is non-trivial.
  useEffect(() => {
    if (q.trim().length >= 2 && !naselja && !naseljaLoading) {
      onKickNaseljaLoad();
    }
  }, [q, naselja, naseljaLoading, onKickNaseljaLoad]);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2 || !jls) return [];
    const out: Hit[] = [];
    for (const f of jls.features as JlsFeature[]) {
      if (f.properties.name.toLowerCase().includes(needle)) {
        out.push({ kind: "jls", id: f.id, feature: f });
        if (out.length >= 15) break;
      }
    }
    if (naselja) {
      for (const f of naselja.features as NaseljeFeature[]) {
        if (f.properties.name?.toLowerCase().includes(needle)) {
          out.push({ kind: "nas", id: f.id, feature: f });
          if (out.length >= 45) break;
        }
      }
    }
    return out;
  }, [q, jls, naselja]);

  const onPick = (hit: Hit) => {
    if (!map) return;
    if (hit.kind === "jls") {
      setSelectedNaselje(null);
      setSelectedJls(hit.id);
      setFocusMode(true);
      setShowNaselja(true);
      const b = computeBounds(hit.feature.geometry);
      map.fitBounds(b, { padding: 50, maxZoom: 12, duration: 800 });
    } else {
      // Naselje search → focus parent JLS first (focus + lazy naselja),
      // then select the naselje and zoom to it.
      const mb = hit.feature.properties.jls_maticni_broj;
      const parent = jls
        ? (jls.features as JlsFeature[]).find((f) => f.properties.maticni_broj === mb)
        : undefined;
      if (parent) {
        setSelectedJls(parent.id);
      }
      setFocusMode(true);
      setShowNaselja(true);
      setSelectedNaselje(hit.id);
      const b = computeBounds(hit.feature.geometry);
      map.fitBounds(b, { padding: 60, maxZoom: 14, duration: 800 });
    }
    setQ("");
  };

  return (
    <div className="border-b" style={{ borderColor: "var(--line)" }}>
      <div className="px-5 py-3">
        <input
          type="text"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Traži JLS ili naselje..."
          className="w-full rounded-md border bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-2)]"
          style={{ borderColor: "var(--line)", color: "var(--text)" }}
        />
      </div>
      {hits.length > 0 && (
        <div className="max-h-[280px] overflow-y-auto px-2 pb-2">
          {hits.map((h) =>
            h.kind === "jls" ? (
              <button
                key={`jls-${h.id}`}
                type="button"
                onClick={() => onPick(h)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[11px] hover:bg-[var(--bg-3)]"
              >
                <span>
                  <span
                    className="mr-2 inline-block rounded-full border px-[6px] py-[1px] text-[8.5px] font-semibold uppercase tracking-wider"
                    style={{
                      color:
                        h.feature.properties.type === "Grad"
                          ? "#d4322f"
                          : "var(--muted)",
                      borderColor: "var(--line)",
                    }}
                  >
                    {h.feature.properties.type}
                  </span>
                  <span className="text-text">{h.feature.properties.name}</span>
                </span>
                <span className="text-[10px] text-muted">{h.feature.properties.zupanija}</span>
              </button>
            ) : (
              <button
                key={`nas-${h.id}`}
                type="button"
                onClick={() => onPick(h)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[11px] hover:bg-[var(--bg-3)]"
              >
                <span>
                  <span
                    className="mr-2 inline-block rounded-full border px-[6px] py-[1px] text-[8.5px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--accent-2)", borderColor: "var(--line)" }}
                  >
                    naselje
                  </span>
                  <span className="text-text">{h.feature.properties.name}</span>
                  {h.feature.properties.stanovnistvo != null && (
                    <span className="ml-2 text-[9px] text-muted">
                      · {Number(h.feature.properties.stanovnistvo).toLocaleString("hr")}
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-muted">
                  {h.feature.properties.jls_type || ""} {h.feature.properties.jls_name || ""}
                </span>
              </button>
            ),
          )}
          {!naselja && (
            <div className="px-3 py-2 text-[10px] italic text-muted">
              {naseljaLoading
                ? "Učitavam naselja…"
                : "Naselja se učitavaju u pozadini za potpunu pretragu"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
