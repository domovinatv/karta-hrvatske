import {
  Baby,
  Blocks,
  Building2,
  Church,
  Cross,
  Focus,
  GraduationCap,
  HeartHandshake,
  House,
  LandPlot,
  Landmark,
  Map as MapIcon,
  Maximize,
  MapPinHouse,
  Palette,
  Plane,
  Rocket,
  Satellite,
  Shield,
  SquareDashed,
  SunMoon,
  Trophy,
  type LucideIcon,
} from "lucide-react";

// Registar slojeva — JEDINI izvor istine o tome što sučelje nudi.
//
// Prije ovoga svaki je sloj bio ručno pisan blok u ControlsPanel.tsx, pa je
// lista narasla na 18 vizualno jednako teških tipki bez grupa. Registar
// omogućuje grupiranje, legendu, brojeve i kratice bez diranja layer-hookova:
// `stateKey` pokazuje na postojeće polje u MapState, a useLayerControls ga
// razriješi u { value, set }. Nijedan od 12 use*Layer hookova ne zna za ovo.

export type LayerGroupId =
  | "prikaz"
  | "granice"
  | "naselja"
  | "vjera"
  | "obrazovanje"
  | "sport"
  | "gospodarstvo"
  | "infrastruktura";

export const GROUPS: { id: LayerGroupId; label: string }[] = [
  { id: "prikaz", label: "Prikaz" },
  { id: "granice", label: "Administrativne granice" },
  { id: "naselja", label: "Naselja i kvartovi" },
  { id: "vjera", label: "Vjerski objekti" },
  { id: "obrazovanje", label: "Odgoj i obrazovanje" },
  { id: "sport", label: "Sport" },
  { id: "gospodarstvo", label: "Gospodarstvo i poduzetništvo" },
  { id: "infrastruktura", label: "Infrastruktura" },
];

/** Booleovi u MapState koje panel smije prebacivati. */
export type LayerStateKey =
  | "showZupBorders"
  | "showJlsBorders"
  | "showNaselja"
  | "showKolokvijalni"
  | "showKvartovi"
  | "showClubs"
  | "showPitches"
  | "showStadiums"
  | "showInkubatori"
  | "showCrkve"
  | "showZupe"
  | "showBiskupije"
  | "showSkole"
  | "showVrtici"
  | "showUstanove"
  | "showAirports"
  | "showPinka"
  | "showOrto"
  | "focusMode";

export type LayerId =
  | "granice-zupanija"
  | "granice-jls"
  | "naselja"
  | "kvartovi"
  | "cetvrti"
  | "klubovi"
  | "igralista"
  | "stadioni"
  | "inkubatori"
  | "crkve"
  | "zupe"
  | "biskupije"
  | "skole"
  | "vrtici"
  | "ustanove"
  | "zracne-luke"
  | "pinka"
  | "ortofoto"
  | "fokus";

export interface LegendItem {
  color: string;
  label: string;
}

interface Base {
  id: string;
  group: LayerGroupId;
  /** Vidljiva labela. NE MIJENJATI bez ažuriranja e2e/smoke.spec.ts locatora. */
  label: string;
  icon: LucideIcon;
  /** Jednoslovna kratica; implementirana u useKeyboardShortcuts. */
  shortcut?: string;
  /** Kratko objašnjenje + provenance. Prije je živjelo u title="" (nevidljivo na dodiru). */
  blurb: string;
  source?: { label: string; href?: string };
}

export interface ToggleLayer extends Base {
  kind: "toggle";
  id: LayerId;
  stateKey: LayerStateKey;
  /** Statični broj zapisa; dinamični (klubovi, naselja) dolaze preko `counts` propa. */
  count?: number;
  /** Sloj se dohvaća tek na paljenje. */
  lazy?: boolean;
  legend?: LegendItem[];
  /**
   * Podloga koja je upaljena po defaultu (granice županija i JLS). Ne ulazi u
   * brojač aktivnih slojeva niti je gasi "Očisti" — inače svježe učitana karta
   * javlja "2 aktivna sloja" prije nego je korisnik išta dirao, a brisanje
   * slojeva ostavlja praznu podlogu.
   */
  baseline?: boolean;
}

export interface ChoiceControl extends Base {
  kind: "choice";
  id: "boja" | "tema";
}

export interface ActionControl extends Base {
  kind: "action";
  id: "fit";
}

export type Control = ToggleLayer | ChoiceControl | ActionControl;

export const CONTROLS: Control[] = [
  // ── Prikaz ───────────────────────────────────────────────────────────────
  {
    kind: "choice",
    id: "boja",
    group: "prikaz",
    label: "Boja",
    icon: Palette,
    shortcut: "C",
    blurb:
      "Kako se boje ispune jedinica lokalne samouprave: po županiji kojoj pripadaju ili po tipu (grad / općina / otok).",
  },
  {
    kind: "choice",
    id: "tema",
    group: "prikaz",
    label: "Tema",
    icon: SunMoon,
    shortcut: "L",
    blurb:
      "Tamna (CARTO dark matter) ili svijetla (OpenFreeMap positron) podloga. Izbor se pamti u pregledniku.",
  },
  {
    kind: "toggle",
    id: "ortofoto",
    group: "prikaz",
    label: "Ortofoto",
    icon: Satellite,
    stateKey: "showOrto",
    shortcut: "S",
    blurb:
      "Satelitska snimka ispod vektorskih slojeva. Ispune granica automatski postaju prozirnije da se snimka vidi.",
    source: { label: "Esri World Imagery" },
  },

  // ── Administrativne granice ──────────────────────────────────────────────
  {
    kind: "toggle",
    id: "granice-zupanija",
    group: "granice",
    label: "Granice županija",
    icon: MapIcon,
    stateKey: "showZupBorders",
    shortcut: "B",
    count: 21,
    baseline: true,
    blurb: "Službene granice 21 županije (uključujući Grad Zagreb).",
    source: { label: "DGU — Državna geodetska uprava" },
  },
  {
    kind: "toggle",
    id: "granice-jls",
    group: "granice",
    label: "Granice JLS",
    icon: SquareDashed,
    stateKey: "showJlsBorders",
    shortcut: "J",
    count: 556,
    baseline: true,
    blurb: "Granice svih 556 jedinica lokalne samouprave — gradova i općina.",
    source: { label: "DGU — Državna geodetska uprava" },
  },

  // ── Naselja i kvartovi ───────────────────────────────────────────────────
  {
    kind: "toggle",
    id: "naselja",
    group: "naselja",
    label: "Naselja",
    icon: MapPinHouse,
    stateKey: "showNaselja",
    shortcut: "N",
    count: 6759,
    lazy: true,
    blurb:
      "Sva službena naselja u Republici Hrvatskoj, s brojem stanovnika iz popisa. Potrebna su i za pretragu po imenu naselja.",
    source: { label: "DGU — Registar prostornih jedinica" },
  },
  {
    kind: "toggle",
    id: "kvartovi",
    group: "naselja",
    label: "Kvartovi",
    icon: House,
    stateKey: "showKolokvijalni",
    shortcut: "Q",
    lazy: true,
    blurb:
      "Kolokvijalni kvartovi — Jarun, Knežija, Špansko… Nisu službena kategorija: derivirani su iz granica mjesnih odbora i imena iz OpenStreetMapa. Zasad Zagreb i Velika Gorica.",
  },
  {
    kind: "toggle",
    id: "cetvrti",
    group: "naselja",
    label: "Četvrti i MO",
    icon: Blocks,
    stateKey: "showKvartovi",
    shortcut: "V",
    lazy: true,
    blurb:
      "Službena mjesna samouprava — gradske četvrti i mjesni odbori. Za razliku od sloja Kvartovi, ovo su granice s pravnim učinkom. Zasad Zagreb i Velika Gorica.",
    source: { label: "data.zagreb.hr + OpenStreetMap" },
  },

  // ── Vjerski objekti ──────────────────────────────────────────────────────
  {
    kind: "toggle",
    id: "crkve",
    group: "vjera",
    label: "Crkve",
    icon: Church,
    stateKey: "showCrkve",
    shortcut: "R",
    count: 6966,
    lazy: true,
    blurb:
      "Sve crkve, kapele, samostani, džamije i sinagoge u Hrvatskoj. Vidljivo od zoom razine 7.",
    source: { label: "katalog crkve.domovina.ai", href: "https://crkve.domovina.ai" },
  },
  {
    kind: "toggle",
    id: "zupe",
    group: "vjera",
    label: "Župe",
    icon: Landmark,
    stateKey: "showZupe",
    shortcut: "Ž",
    count: 2928,
    lazy: true,
    blurb:
      "Vjerske pravne osobe — katoličke župe, samostani, biskupije, crkvene općine i džemati. Crveni prsten označava župu kojoj u katalogu još nije spojena župna crkva.",
    source: { label: "data.gov.hr", href: "https://data.gov.hr" },
    legend: [
      { color: "#ef4444", label: "župna crkva nije spojena" },
    ],
  },
  {
    kind: "toggle",
    id: "biskupije",
    group: "vjera",
    label: "Biskupije",
    icon: Cross,
    stateKey: "showBiskupije",
    shortcut: "D",
    count: 15,
    lazy: true,
    blurb:
      "Teritoriji 15 latinskih (nad)biskupija. Granice su DERIVIRANE iz sjedišta župa preko granica naselja — službene ne postoje kao javna geometrija. Slaganje s granicama koje ima OpenStreetMap iznosi 96,6 – 98,6 %.",
    source: { label: "derivirano — crkve.domovina.ai" },
  },

  // ── Odgoj i obrazovanje ──────────────────────────────────────────────────
  {
    kind: "toggle",
    id: "skole",
    group: "obrazovanje",
    label: "Škole",
    icon: GraduationCap,
    stateKey: "showSkole",
    shortcut: "Š",
    lazy: true,
    blurb:
      "Osnovne i srednje škole, glazbene i umjetničke škole, centri za odgoj i obrazovanje te učenički domovi — uključujući PODRUČNE škole po selima, kojih u državnim otvorenim podacima nema. Vidljivo od zoom razine 7.",
    source: { label: "oou.domovina.ai — MZO, OpenStreetMap, CARNET" },
    legend: [
      { color: "#2563eb", label: "osnovna škola" },
      { color: "#7c3aed", label: "srednja škola" },
      { color: "#db2777", label: "glazbena / umjetnička" },
      { color: "#ea580c", label: "centar za odgoj i obrazovanje" },
      { color: "#0891b2", label: "učenički dom" },
    ],
  },
  {
    kind: "toggle",
    id: "vrtici",
    group: "obrazovanje",
    label: "Vrtići",
    icon: Baby,
    stateKey: "showVrtici",
    shortcut: "Đ",
    lazy: true,
    blurb:
      "Dječji vrtići i jaslice, s pojedinačnim objektima gdje ih OpenStreetMap ima. Prigušene točke stoje na težištu naselja, ne na adresi — vrtići su jedina kategorija bez ijednog službenog identifikatora, pa im je i geokodiranje najslabije.",
    source: { label: "oou.domovina.ai — MZO, OpenStreetMap" },
  },
  {
    kind: "toggle",
    id: "ustanove",
    group: "obrazovanje",
    label: "Ustanove",
    icon: Building2,
    stateKey: "showUstanove",
    shortcut: "U",
    lazy: true,
    blurb:
      "Odgojno-obrazovne ustanove kao PRAVNE OSOBE — sjedišta, sa šifrom ustanove i osnivačem. Drugi skup od sloja Škole, koji crta zgrade: jedna ustanova ima matičnu zgradu i do desetak područnih. Crveni prsten označava ustanovu kojoj u OpenStreetMapu nema nijedne mapirane zgrade.",
    source: { label: "data.gov.hr — MZO", href: "https://data.gov.hr" },
    legend: [
      { color: "#ef4444", label: "zgrada nije mapirana u OSM-u" },
    ],
  },

  // ── Sport ────────────────────────────────────────────────────────────────
  {
    kind: "toggle",
    id: "klubovi",
    group: "sport",
    label: "Klubovi",
    icon: Shield,
    stateKey: "showClubs",
    shortcut: "K",
    lazy: true,
    blurb:
      "Nogometni klubovi s ligaškim rangom, poviješću natjecanja i poveznicama na registre. Klik na marker otvara karticu kluba.",
    source: { label: "klubovi.domovina.ai", href: "https://klubovi.domovina.ai" },
  },
  {
    kind: "toggle",
    id: "igralista",
    group: "sport",
    label: "Igrališta",
    icon: LandPlot,
    stateKey: "showPitches",
    shortcut: "P",
    lazy: true,
    blurb: "Sva nogometna igrališta iz OpenStreetMapa. Vidljivo od zoom razine 9.",
    source: { label: "OpenStreetMap" },
  },
  {
    kind: "toggle",
    id: "stadioni",
    group: "sport",
    label: "Stadioni",
    icon: Trophy,
    stateKey: "showStadiums",
    shortcut: "T",
    lazy: true,
    blurb: "Svi stadioni iz OpenStreetMapa.",
    source: { label: "OpenStreetMap" },
  },

  // ── Gospodarstvo i poduzetništvo ─────────────────────────────────────────
  {
    kind: "toggle",
    id: "inkubatori",
    group: "gospodarstvo",
    label: "Inkubatori",
    icon: Rocket,
    stateKey: "showInkubatori",
    shortcut: "I",
    count: 82,
    lazy: true,
    blurb:
      "Poduzetnički inkubatori, inkubatori za nove tehnologije, akceleratori, znanstveno-tehnologijski parkovi i centri kompetencije — uži izbor iz Jedinstvenog registra poduzetničke infrastrukture. Registar nema koordinate (5 od 236 zapisa), pa su točke geokodirane iz adrese preko DGU-a. Prsten označava subjekt koji prema FINA-i više ne posluje.",
    source: {
      label: "JRPI — Ministarstvo gospodarstva + FINA info.BIZ",
      href: "https://jrpi.mingo.gov.hr/",
    },
    legend: [
      { color: "#0891b2", label: "poduzetnički inkubator" },
      { color: "#7c3aed", label: "inkubator za nove tehnologije" },
      { color: "#db2777", label: "poduzetnički akcelerator" },
      { color: "#ea580c", label: "znanstveno-tehnologijski park" },
      { color: "#16a34a", label: "centar kompetencije" },
      { color: "#ef4444", label: "u likvidaciji / stečaju / brisan" },
    ],
  },

  // ── Infrastruktura ───────────────────────────────────────────────────────
  {
    kind: "toggle",
    id: "zracne-luke",
    group: "infrastruktura",
    label: "Zračne luke",
    icon: Plane,
    stateKey: "showAirports",
    shortcut: "A",
    lazy: true,
    blurb:
      "Zračne luke s uzletno-sletnim stazama i prilaznim koridorima (3° glide, 15 km). Gradijent na koridoru pokazuje visinu leta.",
    source: { label: "OpenStreetMap" },
  },
  {
    kind: "toggle",
    id: "pinka",
    group: "infrastruktura",
    label: "Pinka kampanje",
    icon: HeartHandshake,
    stateKey: "showPinka",
    shortcut: "€",
    lazy: true,
    blurb:
      "Aktivne pinka.io humanitarne kampanje koje imaju lokaciju. Klik na marker vodi na doniranje.",
    source: { label: "pinka.io", href: "https://pinka.io" },
  },
  {
    kind: "toggle",
    id: "fokus",
    group: "prikaz",
    label: "Samo odabrana JLS",
    icon: Focus,
    stateKey: "focusMode",
    shortcut: "O",
    blurb:
      "Sakrij sve jedinice osim odabrane i naselja unutar nje. Korisno za izradu prikaza pojedinog grada ili općine.",
  },
];

/** Akcija — nije sloj, ne ulazi u brojač aktivnih. */
export const FIT_ACTION: ActionControl = {
  kind: "action",
  id: "fit",
  group: "prikaz",
  label: "Fit Hrvatska",
  icon: Maximize,
  shortcut: "F",
  blurb:
    "Poništi odabir i fokus te vrati kameru na cijelu Hrvatsku. Upaljene podatkovne slojeve ne dira — za to služi tipka za brisanje uz brojač gore.",
};

/** Kontrole grupirane redoslijedom iz GROUPS. */
export function controlsByGroup(): { group: (typeof GROUPS)[number]; items: Control[] }[] {
  return GROUPS.map((group) => ({
    group,
    items: CONTROLS.filter((c) => c.group === group.id),
  })).filter((g) => g.items.length > 0);
}

/** Slojevi koji se broje u "aktivno" — prikaz/tema/boja nisu podatkovni slojevi. */
export const DATA_LAYER_KEYS: LayerStateKey[] = CONTROLS.filter(
  (c): c is ToggleLayer => c.kind === "toggle" && c.group !== "prikaz" && !c.baseline,
).map((c) => c.stateKey);

export const SHORTCUT_MAP: Record<string, Control> = Object.fromEntries(
  [...CONTROLS, FIT_ACTION]
    .filter((c) => c.shortcut)
    .map((c) => [c.shortcut!.toLowerCase(), c]),
);
