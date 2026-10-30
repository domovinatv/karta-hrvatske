import { useState, type FocusEvent } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { SearchBox } from "./SearchBox";
import { ZupList } from "./ZupList";
import type { JlsCollection, NaseljaCollection } from "@/lib/types";

interface Props {
  map: MapLibreMap | null;
  jls: JlsCollection | null;
  naselja: NaseljaCollection | null;
  naseljaLoading: boolean;
  onKickNaseljaLoad: () => void;
}

// Pretraga nad kartom na `/`, gdje nema sidebara. Otkad je klik na JLS ugašen,
// pretraga je glavni put do JLS-a, pa ne smije nestati sa sidebarom. Prazno
// polje u fokusu nudi 21 županiju — popis koji je prije stalno stajao lijevo.
export function FloatingSearch(props: Props) {
  const [focused, setFocused] = useState(false);
  const [q, setQ] = useState("");

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  };

  return (
    <div
      data-testid="floating-search"
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      className="absolute left-4 top-4 z-[500] hidden max-h-[calc(100%-2rem)] w-[300px] flex-col overflow-hidden rounded-xl border shadow-panel md:flex"
      style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}
    >
      <SearchBox {...props} onQueryChange={setQ} />
      {focused && q.trim() === "" && (
        <div className="min-h-0 overflow-y-auto">
          <div className="px-5 pt-2 font-display text-[10px] font-semibold uppercase tracking-wider text-muted">
            Po županijama
          </div>
          <ZupList map={props.map} jls={props.jls} />
        </div>
      )}
    </div>
  );
}
