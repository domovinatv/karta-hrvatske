// Feature property shapes — mirror what the apps/data-pipeline Python pipeline emits.
// Keeping these explicit means hooks and components don't have to do `any` casts.

export interface JlsProperties {
  name: string;
  name_full?: string;
  shapeName?: string;
  type: "Grad" | "Općina" | "Otok" | string;
  zupanija: string;
  roa?: string;
  maticni_broj?: string;
  area_km2: number;
  area_m2: number;
  inspire_id?: string;
  source?: string;
  color: string;
  is_jls?: boolean;
}

export type JlsFeature = GeoJSON.Feature<GeoJSON.Geometry, JlsProperties> & { id: number };
export type JlsCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, JlsProperties>;

export interface NaseljeProperties {
  name: string;
  color?: string;
  nas_color?: string;
  zupanija?: string;
  jls_name?: string;
  jls_type?: string;
  jls_maticni_broj?: string;
  maticni_broj?: string;
  stanovnistvo?: number;
  area_km2?: number;
  inspire_id?: string;
}

export type NaseljeFeature = GeoJSON.Feature<GeoJSON.Geometry, NaseljeProperties> & { id: number };
export type NaseljaCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, NaseljeProperties>;

// Kvartovi unutar gradova (pipeline 23_fetch_kvartovi.py) — gradske četvrti
// + mjesni odbori. `parent_mb` veže MO na matičnu GČ; MO nasljeđuje njenu boju.
export interface KvartProperties {
  id: number;
  razina: "cetvrt" | "mjesni_odbor" | "kvart";
  name: string;
  mb?: string;
  parent_mb?: string | null;
  /** razina="kvart": broj mjesnih odbora iz kojih je kvart dissolvean. */
  mo_count?: number;
  /** razina="kvart": greedy coloring indeks — susjedi nikad ne dijele isti. */
  palette_idx?: number;
  jls_name: string;
  jls_maticni_broj: string;
  zupanija: string;
  area_km2: number;
  color: string;
  source: string;
}

export type KvartFeature = GeoJSON.Feature<GeoJSON.Geometry, KvartProperties> & { id: number };
export type KvartCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, KvartProperties>;

// Jedinica koju poster boja. Namjerno šira od KvartProperties: isti render
// crta kvartove (Zagreb), gradske četvrti (VG) i naselja (Turopolje), plus
// razina="jls" — granice JLS-a koje idu preko naselja na objedinjenom
// plakatu. `color` se ovdje NE koristi; boja dolazi iz palette_idx + palete.
export interface PosterUnitProperties {
  id: number;
  razina: "kvart" | "cetvrt" | "naselje" | "jls";
  name: string;
  /** Greedy coloring indeks — susjedi nikad ne dijele isti. */
  palette_idx?: number;
  jls_name: string;
  jls_maticni_broj: string;
  zupanija: string;
  area_km2: number;
  stanovnistvo?: number | null;
  naselja_count?: number;
  source: string;
}

export type PosterFeature = GeoJSON.Feature<GeoJSON.Geometry, PosterUnitProperties>;
export type PosterCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, PosterUnitProperties>;

export interface ClubSeason {
  league: string;
  tier?: number;
  league_county?: string;
  season: string;
  source?: string;
}

export interface ClubAlias {
  alias: string;
  source: string;
}

export interface ClubSourceId {
  id: string;
  source: string;
}

export interface ClubProperties {
  id: number;
  slug: string;
  canonical_name: string;
  short_name?: string;
  city?: string;
  county?: string;
  address?: string;
  stadium_name?: string;
  stadium_capacity?: number;
  founded_year?: number;
  website?: string;
  email?: string;
  phone?: string;
  phone_e164?: string;
  phone_kind?: string;
  president?: string;
  president_role?: string;
  fb_url?: string;
  ig_url?: string;
  x_url?: string;
  semafor_url?: string;
  sofascore_url?: string;
  oib?: string;
  udruga_id?: string;
  registry_url?: string;
  registry_status?: string;
  registry_naziv?: string;
  google_place_id?: string;
  geo_source?: "both" | "nominatim" | string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  top_tier?: number;
  top_league_name?: string;
  seasons?: ClubSeason[];
  aliases?: ClubAlias[];
  source_ids?: ClubSourceId[];
  // Injected by caller right before opening the rich-card modal — geometry
  // coordinates aren't in properties, so we copy them onto the dict.
  _lat?: number;
  _lng?: number;
}

export type ClubFeature = GeoJSON.Feature<GeoJSON.Point, ClubProperties> & { id?: number };
export type ClubCollection = GeoJSON.FeatureCollection<GeoJSON.Point, ClubProperties>;

// pinka.io kampanja s lokacijom (live fetch s api.domovina.ai, vidi lib/pinka.ts)
export interface PinkaCampaignProperties {
  /** Sequential numeric id (feature-state hover needs a number). */
  num_id: number;
  id: string;
  slug: string;
  type: string;
  title: string;
  description: string | null;
  goal_cents: number | null;
  state: string;
  cover_image_url: string | null;
  location_name: string | null;
  total_raised_cents: number;
  contribution_count: number;
  contributor_count: number;
}

export type PinkaCampaignFeature = GeoJSON.Feature<GeoJSON.Point, PinkaCampaignProperties> & {
  id?: number;
};
export type PinkaCampaignCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  PinkaCampaignProperties
>;

export type Theme = "light" | "dark";

export interface PitchProperties {
  id: number;
  osm_type: "way" | "relation";
  osm_id: number;
  name?: string;
  surface?: string;
  linked_club_slug?: string;
  linked_club_name?: string;
}
export type PitchFeature = GeoJSON.Feature<GeoJSON.Point, PitchProperties> & { id: number };
export type PitchCollection = GeoJSON.FeatureCollection<GeoJSON.Point, PitchProperties>;

// Crkve i sakralni objekti — generira ../../crkve.domovina.ai
// (scripts/31_export_geojson.py → 33_sync_karta.py). Prazna polja izostavljena
// iz GeoJSON-a radi veličine, pa je gotovo sve opcionalno.
export interface CrkvaProperties {
  id: number;
  slug: string;
  name: string;
  /** crkva | kapela | katedrala | bazilika | svetiste | samostan |
   *  pravoslavna-crkva | dzamija | sinagoga | poklonac | ostalo */
  kind: string;
  religion?: string;
  denomination?: string;
  titular?: string;
  address?: string;
  city?: string;
  settlement?: string;
  municipality?: string;
  county?: string;
  parish_id?: number;
  parish_name?: string;
  parish_slug?: string;
  diocese?: string;
  is_parish_church?: number;
  osm_type?: "node" | "way" | "relation";
  osm_id?: number;
  wikidata_id?: string;
  wikipedia_url?: string;
  commons_image?: string;
  heritage_id?: string;
  heritage_status?: string;
  year_built?: string;
  architect?: string;
  style?: string;
  phone?: string;
  email?: string;
  website?: string;
  source?: string[];
}
export type CrkvaFeature = GeoJSON.Feature<GeoJSON.Point, CrkvaProperties> & { id: number };
export type CrkvaCollection = GeoJSON.FeatureCollection<GeoJSON.Point, CrkvaProperties>;

/**
 * Vjerska PRAVNA OSOBA (župa, samostan, biskupija, crkvena općina, džemat) —
 * drugi skup od CrkvaProperties, koje su građevine. Isti izvor podataka
 * (crkve.domovina.ai), ali 1:N: župa ima župnu crkvu + filijale + kapele, a
 * mnoga crkva nema župu.
 *
 * PAŽNJA na naziv: `Zup*` drugdje u ovom repou (`activeZup`, `showZupBorders`,
 * `ZupList`) znači ŽUPANIJA. `Zupa*` je župa — vjerska pravna osoba.
 */
export interface ZupaProperties {
  id: number;
  slug: string;
  /** Puni naziv iz državne evidencije, VELIKIM SLOVIMA. */
  name: string;
  /** Naziv bez prefiksa "ŽUPA", title-case — za prikaz. */
  short_name?: string;
  /** zupa | samostan | crkvena-opcina | provincija | biskupija | eparhija |
   *  parohija | dzemat | caritas | svetiste | ostalo */
  kind: string;
  religion?: string;
  denomination?: string;
  titular?: string;
  oib?: string;
  diocese?: string;
  /** Naziv vjerske zajednice — popunjeno za nekatoličke pravne osobe. */
  community?: string;
  address?: string;
  city?: string;
  county?: string;
  /** church = koordinate spojene crkve (najtočnije) | places | naselje-centroid */
  geocode_source?: string;
  registry_no?: string;
  registry_status?: string;
  leader_title?: string;
  phone?: string;
  email?: string;
  website?: string;
  google_maps_uri?: string;
  /** Broj građevina spojenih na ovu pravnu osobu. 0 je nalaz, ne "nema podatka". */
  church_count: number;
  /** Župna crkva — izostaje kad je matcher nije našao (489 župa). */
  church_slug?: string;
  church_name?: string;
  church_kind?: string;
  /** 1 = Google Places nezavisno potvrdio taj match. */
  church_verified?: number;
  source?: string[];
}
export type ZupaFeature = GeoJSON.Feature<GeoJSON.Point, ZupaProperties> & { id: number };
export type ZupaCollection = GeoJSON.FeatureCollection<GeoJSON.Point, ZupaProperties>;

/**
 * Teritorij (nad)biskupije — jedini poligoni iz crkve.domovina.ai i jedini
 * DERIVIRANI sloj na karti: službene granice biskupija ne postoje kao javna
 * geometrija (OSM ih ima 3 od 15, Wikidata nijednu), pa su izračunate iz
 * sjedišta župa preko granica naselja. Zato `osm_agreement` — izmjereno
 * slaganje s onim granicama koje u OSM-u postoje.
 */
export interface BiskupijaProperties {
  id: number;
  slug: string;
  name: string;
  /** nadbiskupija | biskupija */
  kind: string;
  seat?: string;
  oib?: string;
  area_km2?: number;
  /** Stanovnika na području (DGU/DZS) — NE broj vjernika. */
  population?: number;
  settlement_count?: number;
  parish_count?: number;
  church_count?: number;
  /** Kako je granica derivirana. */
  method?: string;
  /** % naselja koja se slažu s OSM granicom; izostaje kad je OSM nema. */
  osm_agreement?: number;
}
export type BiskupijaCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  BiskupijaProperties
>;

export interface StadiumProperties {
  id: number;
  osm_type: "way" | "relation";
  osm_id: number;
  name?: string;
  capacity?: number;
}
export type StadiumFeature = GeoJSON.Feature<GeoJSON.Point, StadiumProperties> & { id: number };
export type StadiumCollection = GeoJSON.FeatureCollection<GeoJSON.Point, StadiumProperties>;

export interface AirportProperties {
  id: string;
  osm_type: string;
  osm_id: number;
  aeroway: string;
  name?: string;
  icao?: string;
  iata?: string;
  aerodrome_type?: string;
}
export type AirportCollection = GeoJSON.FeatureCollection<GeoJSON.Point, AirportProperties>;

export interface RunwayProperties {
  id: number;
  osm_id: number;
  ref?: string;
  surface?: string;
  length_m: number;
  heading_fwd: number;
  heading_rev: number;
  name?: string;
}
export type RunwayCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, RunwayProperties>;

export interface ApproachProperties {
  runway_id: number;
  runway_ref?: string;
  heading_deg: number;
  heading_label: string;
  end_alt_m: number;
  length_km: number;
  glide_slope_deg: number;
}
export type ApproachCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, ApproachProperties>;

/**
 * Odgojno-obrazovna ustanova — škola, vrtić ili ustanova kao pravna osoba.
 * Generira ../../oou.domovina.ai (scripts/31_export_geojson.py →
 * 33_sync_karta.py). Prazna polja izostavljena iz GeoJSON-a radi veličine,
 * pa je gotovo sve opcionalno.
 *
 * Jedan tip za sva tri sloja (skole/vrtici/ustanove) jer dijele shemu: sloj
 * Ustanove je isti zapis viđen kao PRAVNA OSOBA, ne drukčiji objekt.
 *
 * PAŽNJA na `src`: feature nastaje iz OSM/CARNET OBJEKTA (`"objekt"`) ili iz
 * državnog popisa USTANOVA (`"ustanova"`), ovisno o tome što je za tu točku
 * dostupno. Kombinacija je namjerna — nijedan izvor sam nije potpun.
 */
export interface OouProperties {
  id: number;
  slug: string;
  name: string;
  /** objekt | ustanova — koji je izvor dao ovu točku. */
  src?: "objekt" | "ustanova";
  /** vrtic | osnovna-skola | srednja-skola | glazbena-skola |
   *  posebna-ustanova | ucenicki-dom | skola-nepoznata-razina |
   *  predskolski-program */
  kind: string;
  /** samo srednje: gimnazija | strukovna | umjetnicka | mjesovita */
  program?: string;
  /** maticna | podrucna | objekt | dom */
  facility_kind?: string;
  /** javna | privatna | vjerska */
  operator_type?: string;
  founder?: string;
  /** Šifra ustanove iz e-Matice, format ŽŽ-OOO-NNN. Područne škole nose
   *  šifru svoje matične. */
  mzo_code?: string;
  oib?: string;
  address?: string;
  settlement?: string;
  municipality?: string;
  county?: string;
  postal_code?: string;
  /** Kako je koordinata dobivena: zgrada | dgu-adresa | dgu-ulica-fuzzy |
   *  naselje. Sloj crta „naselje" prigušeno — točnost je razine mjesta. */
  geo_source?: string;
  phone?: string;
  email?: string;
  website?: string;
  capacity?: number;
  wheelchair?: string;
  osm_type?: "node" | "way" | "relation";
  osm_id?: number;
  wikidata_id?: string;
  wikipedia_url?: string;
  /** Naziv pravne osobe kojoj objekt pripada (kad se razlikuje od `name`). */
  ustanova?: string;
  ustanova_slug?: string;
  /** Samo u sloju Ustanove. NULA JE NALAZ („OSM nema nijednu zgradu ove
   *  ustanove"), ne odsutan podatak — zato se ne izostavlja iz GeoJSON-a. */
  objekt_count?: number;
  match_method?: string;
  source?: string[];
}
export type OouFeature = GeoJSON.Feature<GeoJSON.Point, OouProperties> & { id: number };
export type OouCollection = GeoJSON.FeatureCollection<GeoJSON.Point, OouProperties>;
