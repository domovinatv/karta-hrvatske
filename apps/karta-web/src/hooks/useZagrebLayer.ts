import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { v } from "@/lib/version";
import { svgArrowUpRight } from "@/lib/svgIcons";
import type { ZgSadrzajProperties } from "@/lib/types";

// Gradski sadržaji Zagreba iz portala otvorenih podataka — 5354 točke iz 33
// skupa, jedna datoteka, šest prekidača.
//
// Zašto NE `usePointLayer`: taj hook radi jedan sloj po datoteci i namijenjen
// je malim skupovima (82 i 11 točaka, bez klasteriranja i bez minzooma). Ovdje
// bi šest skupina značilo šest izvora nad ISTOM datotekom — šest fetcheva i
// šest kopija istog GeoJSON-a u memoriji. Umjesto toga: jedan izvor, jedan
// circle sloj, a prekidači mijenjaju `filter`.
//
// Podatke gradi `apps/data-pipeline/scripts/31_fetch_zg_open_data.py`.
// Provenance po skupu je u `data/zg_provenance.json`.

const SRC = "hr-zg-sadrzaji";
const CIRCLE = `${SRC}-circle`;

export const ZG_BOJE: Record<string, string> = {
  obrazovanje: "#2563eb",
  zdravlje: "#dc2626",
  kretanje: "#0891b2",
  svakodnevno: "#16a34a",
  otpad: "#a16207",
  sigurnost: "#7c3aed",
};

const COLOR_EXPR = [
  "match",
  ["get", "skupina"],
  ...Object.entries(ZG_BOJE).flat(),
  "#64748b",
];

// Sitnije nego kod inkubatora: ovdje se na jednom ekranu zna naći tisuću
// točaka, pa krug koji je čitak za 82 subjekta postane mrlja.
const RADIUS_EXPR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  9, 2,
  11, 3,
  13, 4.5,
  15, 6.5,
  17, 9,
];

export function useZagrebLayer({
  map,
  loaded,
  styleRev,
}: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const {
    showZgObrazovanje,
    showZgZdravlje,
    showZgKretanje,
    showZgSvakodnevno,
    showZgOtpad,
    showZgSigurnost,
  } = useMapState();

  const aktivne = useMemo(() => {
    const s: string[] = [];
    if (showZgObrazovanje) s.push("obrazovanje");
    if (showZgZdravlje) s.push("zdravlje");
    if (showZgKretanje) s.push("kretanje");
    if (showZgSvakodnevno) s.push("svakodnevno");
    if (showZgOtpad) s.push("otpad");
    if (showZgSigurnost) s.push("sigurnost");
    return s;
  }, [
    showZgObrazovanje,
    showZgZdravlje,
    showZgKretanje,
    showZgSvakodnevno,
    showZgOtpad,
    showZgSigurnost,
  ]);
  const visible = aktivne.length > 0;

  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  const loadingRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // ── Lazy fetch ──────────────────────────────────────────────────────────
  // `loadingRef` je ref, ne state — state bi ušao u deps i vrtio efekt.
  useEffect(() => {
    if (!visible || data || loadingRef.current) return;
    loadingRef.current = true;
    fetch(v("/data/zagreb-sadrzaji.geojson"))
      .then((r) => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        fc.features.forEach((f) => {
          const id = (f.properties as { id?: number } | null)?.id;
          if (f.id == null && id != null) f.id = id;
        });
        setData(fc);
      })
      .catch((e) => console.error("zagreb-sadrzaji.geojson fetch failed", e))
      .finally(() => {
        loadingRef.current = false;
      });
  }, [visible, data]);

  // ── Izgradnja ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !loaded || !data) return;
    if (map.getSource(SRC)) return;
    map.addSource(SRC, { type: "geojson", data });
    map.addLayer({
      id: CIRCLE,
      type: "circle",
      source: SRC,
      layout: { visibility: "none" },
      paint: {
        "circle-color": COLOR_EXPR as never,
        "circle-radius": RADIUS_EXPR as never,
        "circle-opacity": 0.9,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          2.2,
          0.8,
        ],
        "circle-stroke-opacity": 0.85,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, data]);

  // ── Vidljivost i filtar ─────────────────────────────────────────────────
  useEffect(() => {
    if (!map?.getLayer(CIRCLE)) return;
    map.setLayoutProperty(CIRCLE, "visibility", visible ? "visible" : "none");
    if (visible) {
      map.setFilter(CIRCLE, ["in", ["get", "skupina"], ["literal", aktivne]] as never);
    } else if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, visible, aktivne, styleRev, data]);

  // ── Interakcija ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map?.getLayer(CIRCLE) || !data) return;
    let hovered: number | null = null;

    const onMove = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      if (hovered !== null && hovered !== id) {
        map.setFeatureState({ source: SRC, id: hovered }, { hover: false });
      }
      hovered = id;
      map.setFeatureState({ source: SRC, id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      if (hovered !== null) {
        map.setFeatureState({ source: SRC, id: hovered }, { hover: false });
        hovered = null;
      }
      map.getCanvas().style.cursor = "";
    };
    const onClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      if (popupRef.current) popupRef.current.remove();
      // `detalji` je ugniježđeni objekt; MapLibre ga kroz izraze provuče kao
      // JSON string. Ista zamka kao `vrste` u sloju Inkubatori.
      const raw = { ...(f.properties as Record<string, unknown>) };
      if (typeof raw.detalji === "string") {
        try {
          raw.detalji = JSON.parse(raw.detalji as string);
        } catch {
          raw.detalji = null;
        }
      }
      popupRef.current = new maplibregl.Popup({ offset: 10, maxWidth: "320px" })
        .setLngLat(coords)
        .setHTML(popupHtml(raw as unknown as ZgSadrzajProperties))
        .addTo(map);
    };

    map.on("mousemove", CIRCLE, onMove);
    map.on("mouseleave", CIRCLE, onLeave);
    map.on("click", CIRCLE, onClick);
    return () => {
      map.off("mousemove", CIRCLE, onMove);
      map.off("mouseleave", CIRCLE, onLeave);
      map.off("click", CIRCLE, onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, styleRev, data]);
}

// Ljudska imena ključeva iz `detalji`. Manifest ih piše strojno (`radno_vrijeme`,
// `pristup_rampa`), a popup ih mora čitati.
const DETALJ_LABEL: Record<string, string> = {
  vrsta: "Vrsta",
  tip: "Tip",
  ucenika: "Učenika",
  razreda: "Razreda",
  korisnika: "Korisnika",
  kreveta: "Kreveta",
  paviljona: "Paviljona",
  kapacitet: "Kapacitet",
  linije: "Linije",
  nadstresnica: "Nadstrešnica",
  klupa: "Klupa",
  displej: "Displej",
  peron: "Peron",
  parking: "Parking",
  pristup_rampa: "Pristupna rampa",
  taktilna_crta: "Taktilna crta",
  stajaliste_u_razini: "Stajalište u razini",
  stalaka: "Stalaka",
  bicikala: "Bicikala",
  godina: "Godina",
  invalidska_mjesta: "Mjesta za invalide",
  punionica_ev: "Punionica za EV",
  parkiraliste_za_bicikle: "Parkiralište za bicikle",
  vlasnistvo: "Vlasništvo",
  uticnica: "Utičnica",
  tip_uticnice: "Tip utičnice",
  radno_vrijeme: "Radno vrijeme",
  osnivac: "Osnivač",
  sportovi: "Sportovi",
  upravljac: "Upravljač",
  kategorija_objekta: "Kategorija",
  parcela: "Parcela",
  otvoren: "Otvoren",
  aktivan: "Aktivan",
  upravitelj: "Upravitelj",
  status_odrzavanja: "Status održavanja",
  status: "Status",
  naplata: "Naplata",
  smjenski_rad: "Smjenski rad",
  produzeni_boravak: "Produženi boravak",
  sportska_dvorana: "Sportska dvorana",
  vrsta_programa: "Vrsta programa",
  sadrzaji: "Sadržaji",
  kampus: "Kampus",
  mjesni_odbor_izvor: "Mjesni odbor (izvor)",
  telefon: "Telefon",
  web: "Web",
  email: "E-pošta",
};

function popupHtml(p: ZgSadrzajProperties): string {
  const color = ZG_BOJE[p.skupina] ?? "#64748b";
  const d = p.detalji ?? {};

  // Kontakti idu u linkove na dno, ne u tablicu — inače popup ponovi isti
  // podatak dvaput.
  const kontaktni = new Set(["telefon", "web", "email"]);
  const redovi = [
    row("Adresa", p.adresa),
    row("Gradska četvrt", p.gradska_cetvrt),
    row("Mjesni odbor", p.mjesni_odbor),
    ...Object.entries(d)
      .filter(([k]) => !kontaktni.has(k))
      .map(([k, val]) => row(DETALJ_LABEL[k] ?? k, val as string | number)),
  ].join("");

  const links = [
    d.web ? link(String(d.web), "Web") : "",
    d.telefon ? link(`tel:${d.telefon}`, String(d.telefon)) : "",
    d.email ? link(`mailto:${d.email}`, "E-pošta") : "",
    link(`https://data.zagreb.hr/dataset/${p.dataset}`, "Izvorni skup"),
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="club-popup">
      <div class="club-head">
        <div class="club-title">
          <div class="club-name">${esc(p.naziv)}</div>
          <div class="club-league" style="border-left:3px solid ${color};padding-left:6px;">
            ${esc(p.label)}
          </div>
        </div>
      </div>
      ${redovi}
      ${links ? `<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">${links}</div>` : ""}
    </div>`;
}

function row(k: string, val?: string | number | null): string {
  if (val === undefined || val === null || val === "") return "";
  return `<div class="club-row"><span class="k">${esc(k)}</span><span class="v">${esc(String(val))}</span></div>`;
}

function link(href: string, label: string): string {
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
     style="font-size:11px;text-decoration:underline;opacity:.85">${esc(label)} ${svgArrowUpRight()}</a>`;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
