import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import type { ClubProperties, Theme } from "./types";
import {
  defaultLayers,
  parseColorMode,
  parseLayers,
  parseTheme,
  sceneKey,
  URL_LAYERS,
  writeScene,
  type ColorMode,
  type LayerFlags,
  type SceneState,
} from "./urlState";

// Centralized state for the map — selection, layer toggles, theme, dimming.
// Slojevi, boja i tema su "prizor" i žive u URL-u (lib/urlState.ts); ovdje
// je samo zrcalo da 20-ak use*Layer hookova zadrži imenovani API.
// Lives in a single provider so any component (FAB, sheet, popover, hooks)
// can flip toggles without prop drilling. Theme also persists to localStorage
// here so MapLibre listeners and Tailwind dark: utilities stay in sync.

interface MapState {
  // Selection
  selectedJls: number | null;
  selectedNaselje: number | null;
  // Filter / focus
  focusMode: boolean;
  /**
   * Klik na kartu bira JLS (fitBounds + detalj + naselja). Po defaultu
   * ugašeno: s toliko slojeva klik je za marker, a JLS se bira pretragom.
   */
  jlsClick: boolean;
  activeZup: string | null;
  // Layer visibility
  showNaselja: boolean;
  showKvartovi: boolean;
  showKolokvijalni: boolean;
  showClubs: boolean;
  showOrto: boolean;
  showPitches: boolean;
  showCrkve: boolean;
  /** Župe (vjerske pravne osobe) — NE županije, to je showZupBorders. */
  showZupe: boolean;
  /** Katoličke udruge (udruge.domovina.ai) — treći sloj grupe „vjera". */
  showUdruge: boolean;
  showBiskupije: boolean;
  /** Škole — osnovne, srednje, glazbene, posebne ustanove, učenički domovi. */
  showSkole: boolean;
  showVrtici: boolean;
  /** Odgojno-obrazovne ustanove kao PRAVNE OSOBE (drugi skup od showSkole). */
  showUstanove: boolean;
  showStadiums: boolean;
  /** Inkubatori, akceleratori i tehnološki parkovi (JRPI). */
  showInkubatori: boolean;
  /**
   * Gradski sadržaji Zagreba iz data.zagreb.hr. Šest zastavica nad JEDNOM
   * datotekom — hook ih pretvara u `filter` po skupini, ne u šest izvora.
   */
  showZgObrazovanje: boolean;
  showZgZdravlje: boolean;
  showZgKretanje: boolean;
  showZgSvakodnevno: boolean;
  showZgOtpad: boolean;
  showZgSigurnost: boolean;
  /** Privatni ekosustav — kurirano, nije registar. */
  showEkosustav: boolean;
  /** Croatian AI Landscape (map.croai.org) — imenik, ne članstvo. */
  showCroai: boolean;
  showAirports: boolean;
  showPinka: boolean;
  showZupBorders: boolean;
  showJlsBorders: boolean;
  // Theme
  theme: Theme;
  // Color mode for JLS fill
  colorMode: "zupanija" | "type";
  // Rich-card modal target (or null when closed)
  clubModal: ClubProperties | null;
  /** Slojevi + boja + tema, za upis u URL (useUrlSync). */
  scene: SceneState;
}

interface MapStateActions {
  setSelectedJls: (id: number | null) => void;
  setSelectedNaselje: (id: number | null) => void;
  setFocusMode: (on: boolean) => void;
  setJlsClick: (on: boolean) => void;
  setActiveZup: (zup: string | null) => void;
  setShowNaselja: (on: boolean) => void;
  setShowKvartovi: (on: boolean) => void;
  setShowKolokvijalni: (on: boolean) => void;
  setShowClubs: (on: boolean) => void;
  setShowOrto: (on: boolean) => void;
  setShowPitches: (on: boolean) => void;
  setShowCrkve: (on: boolean) => void;
  setShowZupe: (on: boolean) => void;
  setShowUdruge: (on: boolean) => void;
  setShowBiskupije: (on: boolean) => void;
  setShowSkole: (on: boolean) => void;
  setShowVrtici: (on: boolean) => void;
  setShowUstanove: (on: boolean) => void;
  setShowStadiums: (on: boolean) => void;
  setShowInkubatori: (on: boolean) => void;
  setShowZgObrazovanje: (on: boolean) => void;
  setShowZgZdravlje: (on: boolean) => void;
  setShowZgKretanje: (on: boolean) => void;
  setShowZgSvakodnevno: (on: boolean) => void;
  setShowZgOtpad: (on: boolean) => void;
  setShowZgSigurnost: (on: boolean) => void;
  setShowEkosustav: (on: boolean) => void;
  setShowCroai: (on: boolean) => void;
  setShowAirports: (on: boolean) => void;
  setShowPinka: (on: boolean) => void;
  toggleZupBorders: () => void;
  toggleJlsBorders: () => void;
  setTheme: (t: Theme) => void;
  toggleColorMode: () => void;
  /** Više slojeva odjednom (npr. "Očisti") — jedan zapis u URL. */
  setLayerFlags: (patch: Partial<LayerFlags>) => void;
  openClubModal: (p: ClubProperties) => void;
  closeClubModal: () => void;
  /** Reset everything to defaults (Fit Hrvatska). */
  reset: () => void;
}

const Ctx = createContext<(MapState & MapStateActions) | null>(null);

const initialTheme = (): Theme => {
  try {
    if (localStorage.getItem("domovina-theme") === "light") return "light";
  } catch {
    /* ignore */
  }
  return "dark";
};

const JLS_CLICK_KEY = "domovina-jls-click";

const initialJlsClick = (): boolean => {
  try {
    return localStorage.getItem(JLS_CLICK_KEY) === "1";
  } catch {
    return false;
  }
};

// Ime settera za stateKey: showCrkve → setShowCrkve.
const setterName = (k: string) => `set${k[0].toUpperCase()}${k.slice(1)}`;

type LayerSetters = Record<string, (on: boolean) => void>;

export function MapStateProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navType = useNavigationType();

  const [selectedJls, setSelectedJls] = useState<number | null>(null);
  const [selectedNaselje, setSelectedNaselje] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [jlsClick, setJlsClick] = useState<boolean>(initialJlsClick);
  const [activeZup, setActiveZup] = useState<string | null>(null);
  const [clubModal, setClubModal] = useState<ClubProperties | null>(null);

  // Prizor (slojevi, boja, tema) — inicijalno iz URL-a, dalje URL prati stanje.
  const initial = useMemo(() => new URLSearchParams(location.search), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [layers, setLayers] = useState<Partial<LayerFlags>>(() => parseLayers(initial.get("l")));
  const [colorMode, setColorMode] = useState<ColorMode>(() => parseColorMode(initial.get("boja")));
  const [theme, setThemeState] = useState<Theme>(
    () => parseTheme(initial.get("tema")) ?? initialTheme(),
  );

  // Zadnji prizor koji je stanje upisalo u URL (samo scenski parametri).
  const lastScene = useRef(sceneKey(location.search));

  // URL → stanje: Back/Forward i tuđi linkovi. Primjenjuje se samo prizor koji
  // se razlikuje od zadnjeg upisanog: useUrlSync i header link rade PUSH s
  // queryjem od prije klika, pa bi inače vratili npr. naselja koja je reset()
  // upravo ugasio. Naši zapisi su REPLACE i preskaču se iz istog razloga.
  useEffect(() => {
    if (navType === "REPLACE") return;
    const key = sceneKey(location.search);
    if (key === lastScene.current) return;
    lastScene.current = key;
    const p = new URLSearchParams(location.search);
    setLayers(parseLayers(p.get("l")));
    setColorMode(parseColorMode(p.get("boja")));
    const t = parseTheme(p.get("tema"));
    if (t) setThemeState(t);
  }, [location.search, navType]);

  // URL piše useUrlSync (putanja + prizor u JEDNOJ navigaciji, inače se
  // zasebni replace utrkuje s njegovim pushom i prepiše krivi unos povijesti).
  const scene = useMemo<SceneState>(() => ({ layers, colorMode, theme }), [layers, colorMode, theme]);
  useEffect(() => {
    lastScene.current = writeScene("", scene);
  }, [scene]);

  // Mirror theme onto <html data-theme="...">.
  useEffect(() => {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(JLS_CLICK_KEY, jlsClick ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [jlsClick]);

  // Tema se pamti samo kad je korisnik sam promijeni — `?tema=` iz tuđeg
  // linka ne smije pregaziti primateljevu postavku.
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("domovina-theme", t);
    } catch {
      /* ignore */
    }
  }, []);

  const layerSetters = useMemo<LayerSetters>(
    () =>
      Object.fromEntries(
        URL_LAYERS.map(({ key }) => [
          setterName(key),
          (on: boolean) => setLayers((cur) => (cur[key] === on ? cur : { ...cur, [key]: on })),
        ]),
      ),
    [],
  );
  const setLayerFlags = useCallback(
    (patch: Partial<LayerFlags>) => setLayers((cur) => ({ ...cur, ...patch })),
    [],
  );
  const toggleZupBorders = useCallback(
    () => setLayers((cur) => ({ ...cur, showZupBorders: !cur.showZupBorders })),
    [],
  );
  const toggleJlsBorders = useCallback(
    () => setLayers((cur) => ({ ...cur, showJlsBorders: !cur.showJlsBorders })),
    [],
  );
  const toggleColorMode = useCallback(
    () => setColorMode((m) => (m === "zupanija" ? "type" : "zupanija")),
    [],
  );
  const openClubModal = useCallback((p: ClubProperties) => setClubModal(p), []);
  const closeClubModal = useCallback(() => setClubModal(null), []);
  const reset = useCallback(() => {
    setSelectedJls(null);
    setSelectedNaselje(null);
    setFocusMode(false);
    setActiveZup(null);
    setLayers((cur) => ({ ...cur, showNaselja: false, showKvartovi: false, showKolokvijalni: false }));
  }, []);

  const value = useMemo(
    () =>
      ({
        ...defaultLayers(),
        ...layers,
        ...layerSetters,
        selectedJls,
        selectedNaselje,
        focusMode,
        jlsClick,
        activeZup,
        theme,
        colorMode,
        clubModal,
        scene,
        setSelectedJls,
        setSelectedNaselje,
        setFocusMode,
        setJlsClick,
        setActiveZup,
        setLayerFlags,
        toggleZupBorders,
        toggleJlsBorders,
        setTheme,
        toggleColorMode,
        openClubModal,
        closeClubModal,
        reset,
      }) as MapState & MapStateActions,
    [
      layers,
      layerSetters,
      selectedJls,
      selectedNaselje,
      focusMode,
      jlsClick,
      activeZup,
      theme,
      colorMode,
      clubModal,
      scene,
      setLayerFlags,
      toggleZupBorders,
      toggleJlsBorders,
      setTheme,
      toggleColorMode,
      openClubModal,
      closeClubModal,
      reset,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMapState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMapState must be used inside <MapStateProvider>");
  return ctx;
}

// Track the previous value of a state so hooks can detect transitions
// (e.g. show → hide). React's lifecycle doesn't give this for free.
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}
