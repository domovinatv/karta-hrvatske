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
  razina: "cetvrt" | "mjesni_odbor";
  name: string;
  mb: string;
  parent_mb: string | null;
  jls_name: string;
  jls_maticni_broj: string;
  zupanija: string;
  area_km2: number;
  color: string;
  source: string;
}

export type KvartFeature = GeoJSON.Feature<GeoJSON.Geometry, KvartProperties> & { id: number };
export type KvartCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, KvartProperties>;

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
