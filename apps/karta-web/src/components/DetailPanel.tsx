import { useMapState } from "@/lib/MapState";
import type { JlsCollection, JlsFeature, NaseljaCollection, NaseljeFeature } from "@/lib/types";

interface Props {
  jls: JlsCollection | null;
  naselja: NaseljaCollection | null;
  /** Total Croatia area (m²) for "Udio HR" computation. */
  totalArea: number;
}

// Detail panel — shows selected naselje first (more specific), else selected
// JLS, else placeholder. Same content shape as the legacy template's #detail
// element. Used in both desktop right aside and mobile bottom sheet (same
// component, different shell).
export function DetailPanel({ jls, naselja, totalArea }: Props) {
  const { selectedJls, selectedNaselje } = useMapState();

  if (selectedNaselje !== null && naselja) {
    const f = (naselja.features as NaseljeFeature[]).find((x) => x.id === selectedNaselje);
    if (f) return <NaseljeBody f={f} />;
  }
  if (selectedJls !== null && jls) {
    const f = (jls.features as JlsFeature[]).find((x) => x.id === selectedJls);
    if (f) return <JlsBody f={f} totalArea={totalArea} />;
  }
  return (
    <div className="px-5 pt-16 text-center text-muted">
      Klikni JLS na karti
      <br />
      ili pretraži ime
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div
      className="flex justify-between border-b border-dashed py-2 last:border-0"
      style={{ borderColor: "var(--line)" }}
    >
      <span className="text-[11px] uppercase tracking-wider text-muted">{k}</span>
      <span className="text-right tabular-nums text-text">{v}</span>
    </div>
  );
}

function Name({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div
      className="mb-1 font-display text-2xl font-semibold tracking-tight text-ink"
      style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10 }}
    >
      {children}
    </div>
  );
}

function JlsBody({ f, totalArea }: { f: JlsFeature; totalArea: number }) {
  const p = f.properties;
  return (
    <div className="p-5">
      <Name color={p.color}>{p.name}</Name>
      <div className="mb-4 text-[11px] text-muted">
        {p.name_full || p.shapeName || `${p.type} ${p.name}`}
      </div>
      <Row k="Tip" v={p.type} />
      <Row k="Županija" v={p.zupanija} />
      {p.roa && <Row k="Sjedište" v={p.roa} />}
      {p.maticni_broj && <Row k="Matični broj" v={p.maticni_broj} />}
      <Row k="Površina" v={`${p.area_km2.toFixed(2)} km²`} />
      <Row k="U m²" v={p.area_m2.toLocaleString("hr")} />
      <Row k="Udio HR" v={`${((p.area_m2 / totalArea) * 100).toFixed(3)} %`} />
      {p.inspire_id && (
        <Row k="INSPIRE ID" v={<span className="text-[9px]">{p.inspire_id}</span>} />
      )}
      {p.source && (
        <Row k="Izvor" v={<span className="text-[10px] text-muted">{p.source}</span>} />
      )}
    </div>
  );
}

function NaseljeBody({ f }: { f: NaseljeFeature }) {
  const p = f.properties;
  return (
    <div className="p-5">
      <Name color={p.color || "#06aed5"}>{p.name}</Name>
      <div className="mb-4 text-[11px] text-muted">
        Naselje · {p.jls_type || "JLS"} {p.jls_name || ""}
      </div>
      {p.stanovnistvo != null && (
        <Row k="Stanovništvo" v={Number(p.stanovnistvo).toLocaleString("hr")} />
      )}
      <Row k="JLS" v={`${p.jls_type || ""} ${p.jls_name || ""}`} />
      <Row k="Županija" v={p.zupanija || ""} />
      {p.area_km2 != null && <Row k="Površina" v={`${Number(p.area_km2).toFixed(2)} km²`} />}
      {p.maticni_broj && <Row k="Matični broj" v={p.maticni_broj} />}
    </div>
  );
}
