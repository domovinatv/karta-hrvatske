import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Loader2, MapPin, Search, X, type LucideIcon } from "lucide-react";
import { CONTROLS } from "@/lib/layers";
import { useSearch } from "@/search/useSearch";
import { useSearchActions } from "@/search/useSearchActions";
import type { Hit } from "@/search/engine";

interface Props {
  map: MapLibreMap | null;
  /** FloatingSearch prikazuje popis županija dok je polje prazno. */
  onQueryChange?: (q: string) => void;
}

// Pretraga kroz sve slojeve karte. Indeks i upiti žive u Web Workeru
// (src/search/), ovdje je samo prikaz. Arhitektura: docs/2026-10-30-trazilica.md.

const LAYER_META = new Map<string, { label: string; icon: LucideIcon }>(
  CONTROLS.map((c) => [c.id as string, { label: c.label, icon: c.icon }]),
);
const LABEL_OVERRIDE: Record<string, string> = {
  "granice-zupanija": "Županija",
  "granice-jls": "Grad / općina",
  naselja: "Naselje",
  kvartovi: "Kvart",
  cetvrti: "Četvrt / MO",
  croai: "CroAI",
};

function meta(layer: string): { label: string; icon: LucideIcon } {
  const m = LAYER_META.get(layer);
  return { label: LABEL_OVERRIDE[layer] ?? m?.label ?? layer, icon: m?.icon ?? MapPin };
}

export function SearchBox({ map, onQueryChange }: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const center = map ? (map.getCenter().toArray() as [number, number]) : undefined;
  const zoom = map?.getZoom();
  const { res, status, warm } = useSearch(q, { center, zoom });
  const { pick, showAll, clear } = useSearchActions(map);

  useEffect(() => {
    onQueryChange?.(q);
  }, [q, onQueryChange]);

  useEffect(() => setSel(0), [res]);
  useEffect(() => {
    if (q.trim() === "") clear();
  }, [q, clear]);

  const hits = res?.hits ?? [];

  const onPick = (h: Hit) => {
    pick(h);
    setQ("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && hits[sel]) {
      e.preventDefault();
      onPick(hits[sel]);
    } else if (e.key === "Escape") {
      setQ("");
    }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const loading = status === "loading" && q.trim().length >= 2;
  const interp = res?.interp;
  const showAllLabel =
    res && res.total > 1 && res.bounds
      ? `Prikaži ${res.total > 3000 ? "prvih 3000" : res.total.toLocaleString("hr")} na karti`
      : null;

  return (
    <div className="border-b" style={{ borderColor: "var(--line)" }} data-testid="search">
      <div className="px-5 py-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={q}
            onFocus={warm}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Traži mjesto, AI firmu, školu, župu…"
            aria-label="Pretraga karte"
            className="w-full rounded-md border bg-[var(--bg)] py-2 pl-8 pr-8 text-sm outline-none focus:border-[var(--accent-2)]"
            style={{ borderColor: "var(--line)", color: "var(--text)" }}
          />
          {q && (
            <button
              type="button"
              aria-label="Očisti pretragu"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-text"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 px-5 pb-3 text-[10px] text-muted">
          <Loader2 size={12} className="animate-spin" /> Učitavam indeks pretrage…
        </div>
      )}

      {res && q.trim().length >= 2 && (
        <>
          {(interp || showAllLabel) && (
            <div
              data-testid="search-interp"
              className="mx-5 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted"
            >
              {interp && (
                <span>
                  Tumačim kao:{" "}
                  {[...interp.labels, interp.place ? `u: ${interp.place.name}` : null]
                    .filter(Boolean)
                    .map((l) => (
                      <span
                        key={l}
                        className="mr-1 inline-block rounded-full border px-[6px] py-[1px] text-[9px] font-semibold"
                        style={{ borderColor: "var(--line)", color: "var(--accent-2)" }}
                      >
                        {l}
                      </span>
                    ))}
                </span>
              )}
              {showAllLabel && (
                <button
                  type="button"
                  data-testid="search-show-all"
                  onClick={() => showAll(res)}
                  className="ml-auto rounded border px-2 py-[2px] font-semibold text-text hover:bg-[var(--bg-3)]"
                  style={{ borderColor: "var(--line)" }}
                >
                  {showAllLabel}
                </button>
              )}
            </div>
          )}

          {hits.length === 0 ? (
            <div className="px-5 pb-3 text-[11px] italic text-muted">Nema pogodaka.</div>
          ) : (
            <div ref={listRef} role="listbox" className="max-h-[360px] overflow-y-auto px-2 pb-2">
              {hits.map((h, idx) => {
                const m = meta(h.layer);
                const Icon = m.icon;
                return (
                  <button
                    key={`${h.layer}:${h.fid}`}
                    data-idx={idx}
                    role="option"
                    aria-selected={idx === sel}
                    type="button"
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => onPick(h)}
                    className="flex w-full items-start gap-2 rounded-md px-3 py-[7px] text-left text-[11px]"
                    style={{ background: idx === sel ? "var(--bg-3)" : undefined }}
                  >
                    <Icon size={13} className="mt-[1px] shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${h.dead ? "text-muted line-through" : "text-text"}`}>
                        {h.name}
                      </span>
                      {h.ctx && <span className="block truncate text-[10px] text-muted">{h.ctx}</span>}
                    </span>
                    <span className="shrink-0 pt-[1px] text-[8.5px] font-semibold uppercase tracking-wider text-muted">
                      {m.label}
                    </span>
                  </button>
                );
              })}
              {res.total > hits.length && (
                <div className="px-3 pt-1 text-[10px] italic text-muted">
                  + još {(res.total - hits.length).toLocaleString("hr")} — suzi upit ili prikaži sve na karti
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
