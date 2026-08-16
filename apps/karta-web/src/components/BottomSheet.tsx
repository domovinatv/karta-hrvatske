import { useEffect, useState } from "react";
import { Info, Map as MapIcon, Search } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import type { JlsCollection, NaseljaCollection } from "@/lib/types";
import { DetailPanel } from "./DetailPanel";
import { SearchBox } from "./SearchBox";
import { ZupList } from "./ZupList";

type Tab = "pretraga" | "zupanije" | "detalji";

interface Props {
  map: MapLibreMap | null;
  jls: JlsCollection | null;
  naselja: NaseljaCollection | null;
  naseljaLoading: boolean;
  onKickNaseljaLoad: () => void;
  totalArea: number;
}

// Bottom sheet s peek (~100px: ručka + tabovi) i expand (~78dvh) stanjem.
// Auto-otvara Detalje kad se odabere JLS ili naselje.
//
// Vidljiv je do `lg`, ne do `md`: DetailPanel u desnom asideu pojavljuje se tek
// na `lg`, pa je na širinama 768–1023 px odabir JLS-a prikazivao detalje
// nigdje. Lijevi sidebar se u tom rasponu djelomično preklapa s tabovima
// Pretraga/Županije, što je prihvatljivo — sheet je tad ionako u peek stanju.
export function BottomSheet({
  map,
  jls,
  naselja,
  naseljaLoading,
  onKickNaseljaLoad,
  totalArea,
}: Props) {
  const { selectedJls, selectedNaselje } = useMapState();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("pretraga");
  const hasSelection = selectedJls !== null || selectedNaselje !== null;

  // Auto-expand to Detalji on first selection event.
  useEffect(() => {
    if (hasSelection) {
      setTab("detalji");
      setOpen(true);
    }
  }, [hasSelection, selectedJls, selectedNaselje]);

  // Collapse to peek when selection is cleared (Fit Hrvatska reset).
  useEffect(() => {
    if (!hasSelection && tab === "detalji") {
      setTab("pretraga");
      setOpen(false);
    }
  }, [hasSelection, tab]);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[600] flex flex-col rounded-t-2xl border-t shadow-2xl transition-transform duration-300 ease-out lg:hidden"
      style={{
        background: "var(--bg-2)",
        borderColor: "var(--line)",
        height: "78dvh",
        maxHeight: "78dvh",
        transform: open ? "translateY(0)" : "translateY(calc(100% - 100px))",
        paddingBottom: "env(safe-area-inset-bottom, 0)",
        boxShadow: "0 -10px 30px rgba(0,0,0,0.45)",
      }}
      aria-hidden={open ? "false" : "true"}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Otvori / zatvori"
        className="flex justify-center pt-2.5 pb-1.5"
      >
        <span
          className="block h-1 w-10 rounded-full"
          style={{ background: "var(--line)" }}
        />
      </button>
      <div
        className="flex flex-none gap-1 border-b px-2.5 pb-2.5"
        role="tablist"
        style={{ borderColor: "var(--line)" }}
      >
        <TabBtn t="pretraga" active={tab} onClick={(t) => { setTab(t); setOpen(true); }}>
          <Search size={14} /> Pretraga
        </TabBtn>
        <TabBtn t="zupanije" active={tab} onClick={(t) => { setTab(t); setOpen(true); }}>
          <MapIcon size={14} /> Županije
        </TabBtn>
        <TabBtn
          t="detalji"
          active={tab}
          disabled={!hasSelection}
          onClick={(t) => { setTab(t); setOpen(true); }}
        >
          <Info size={14} /> Detalji
        </TabBtn>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        {tab === "pretraga" && (
          <SearchBox
            map={map}
            jls={jls}
            naselja={naselja}
            naseljaLoading={naseljaLoading}
            onKickNaseljaLoad={onKickNaseljaLoad}
          />
        )}
        {tab === "zupanije" && <ZupList map={map} jls={jls} />}
        {tab === "detalji" && (
          <DetailPanel jls={jls} naselja={naselja} totalArea={totalArea} />
        )}
      </div>
    </div>
  );
}

function TabBtn({
  t,
  active,
  disabled,
  onClick,
  children,
}: {
  t: Tab;
  active: Tab;
  disabled?: boolean;
  onClick: (t: Tab) => void;
  children: React.ReactNode;
}) {
  const isActive = t === active;
  return (
    <button
      type="button"
      role="tab"
      disabled={disabled}
      onClick={() => !disabled && onClick(t)}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 font-medium transition-colors"
      style={{
        background: isActive ? "var(--bg-3)" : "transparent",
        borderColor: isActive ? "var(--line)" : "transparent",
        color: isActive ? "var(--ink)" : "var(--muted)",
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}
