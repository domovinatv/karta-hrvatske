import { CONTROLS, type LayerId, type LayerStateKey, type ToggleLayer } from "./layers";
import type { Theme } from "./types";

// Dijeljivo stanje karte u query stringu. Plan: docs/2026-10-30-url-stanje-plan.md
//
//   ?l=crkve,zupe,-granice-jls   slojevi kao DIFF od defaulta (id pali, -id gasi)
//   &boja=tip                    colorMode; default "zupanija" se ne piše
//   &tema=svijetla               override teme; default (tamna) se ne piše
//
// Diff, a ne puni popis: ručni link `?l=crkve` mora značiti "uobičajeno + crkve",
// a ne "samo crkve, bez granica". Kamera je u hashu (MapLibre `hash: "map"`).
//
// Id-jevi slojeva iz layers.ts su time JAVNI API — preimenovanje ide kroz
// LAYER_ID_ALIASES, inače podijeljeni linkovi tiho izgube sloj.

/** Prekidači koji su osobna postavka ili posljedica odabira, ne dio prizora. */
const NOT_IN_URL: LayerStateKey[] = ["focusMode", "jlsClick"];

/** Prekidači koji idu u `?l=`, redoslijedom iz registra (kanonski URL). */
export const URL_LAYERS: { id: LayerId; key: LayerStateKey; on: boolean }[] = CONTROLS.filter(
  (c): c is ToggleLayer => c.kind === "toggle" && !NOT_IN_URL.includes(c.stateKey),
).map((c) => ({ id: c.id, key: c.stateKey, on: c.baseline === true }));

export type UrlLayerKey = (typeof URL_LAYERS)[number]["key"];
export type LayerFlags = Record<LayerStateKey, boolean>;

/** Stari id → novi id. Dodaj ovdje kad preimenuješ sloj. */
export const LAYER_ID_ALIASES: Record<string, LayerId> = {};

const BY_ID = new Map(URL_LAYERS.map((l) => [l.id as string, l]));

export function defaultLayers(): Partial<LayerFlags> {
  return Object.fromEntries(URL_LAYERS.map((l) => [l.key, l.on]));
}

/** `?l=` → potpune zastavice (default + diff). Nepoznat id se ignorira. */
export function parseLayers(raw: string | null): Partial<LayerFlags> {
  const out = defaultLayers();
  if (!raw) return out;
  for (const tok of raw.split(",")) {
    const t = tok.trim().toLowerCase();
    if (!t) continue;
    const off = t.startsWith("-");
    const id = off ? t.slice(1) : t;
    const l = BY_ID.get(LAYER_ID_ALIASES[id] ?? id);
    if (l) out[l.key] = !off;
  }
  return out;
}

/** Zastavice → vrijednost `l`, ili null kad je sve default. */
export function serializeLayers(flags: Partial<LayerFlags>): string | null {
  const toks: string[] = [];
  for (const l of URL_LAYERS) {
    const v = flags[l.key] ?? l.on;
    if (v !== l.on) toks.push(v ? l.id : `-${l.id}`);
  }
  return toks.length ? toks.join(",") : null;
}

export type ColorMode = "zupanija" | "type";

export function parseColorMode(raw: string | null): ColorMode {
  return raw === "tip" ? "type" : "zupanija";
}

export function parseTheme(raw: string | null): Theme | null {
  if (raw === "svijetla") return "light";
  if (raw === "tamna") return "dark";
  return null;
}

export interface SceneState {
  layers: Partial<LayerFlags>;
  colorMode: ColorMode;
  theme: Theme;
}

/**
 * Upiši prizor u postojeći query; ostale parametre (`c` kampanje, budući
 * `naselje`) ostavi netaknute. Vraća "?…" ili "" — spremno za usporedbu s
 * `location.search`.
 */
export function writeScene(search: string, s: SceneState): string {
  const p = new URLSearchParams(search);
  const set = (k: string, v: string | null) => (v === null ? p.delete(k) : p.set(k, v));
  set("l", serializeLayers(s.layers));
  set("boja", s.colorMode === "type" ? "tip" : null);
  set("tema", s.theme === "light" ? "svijetla" : null);
  // URLSearchParams kodira zarez u %2C — vrati ga, link je čitljiviji.
  const q = p.toString().replace(/%2C/gi, ",");
  return q ? `?${q}` : "";
}

/** Samo scenski dio queryja, normaliziran — za usporedbu "je li se prizor promijenio". */
export function sceneKey(search: string): string {
  const p = new URLSearchParams(search);
  return writeScene("", {
    layers: parseLayers(p.get("l")),
    colorMode: parseColorMode(p.get("boja")),
    theme: parseTheme(p.get("tema")) ?? "dark",
  });
}
