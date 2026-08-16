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
import type { ClubProperties, Theme } from "./types";

// Centralized state for the map — selection, layer toggles, theme, dimming.
// Lives in a single provider so any component (FAB, sheet, popover, hooks)
// can flip toggles without prop drilling. Theme also persists to localStorage
// here so MapLibre listeners and Tailwind dark: utilities stay in sync.

interface MapState {
  // Selection
  selectedJls: number | null;
  selectedNaselje: number | null;
  // Filter / focus
  focusMode: boolean;
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
  showStadiums: boolean;
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
}

interface MapStateActions {
  setSelectedJls: (id: number | null) => void;
  setSelectedNaselje: (id: number | null) => void;
  setFocusMode: (on: boolean) => void;
  setActiveZup: (zup: string | null) => void;
  setShowNaselja: (on: boolean) => void;
  setShowKvartovi: (on: boolean) => void;
  setShowKolokvijalni: (on: boolean) => void;
  setShowClubs: (on: boolean) => void;
  setShowOrto: (on: boolean) => void;
  setShowPitches: (on: boolean) => void;
  setShowCrkve: (on: boolean) => void;
  setShowZupe: (on: boolean) => void;
  setShowStadiums: (on: boolean) => void;
  setShowAirports: (on: boolean) => void;
  setShowPinka: (on: boolean) => void;
  toggleZupBorders: () => void;
  toggleJlsBorders: () => void;
  setTheme: (t: Theme) => void;
  toggleColorMode: () => void;
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

export function MapStateProvider({ children }: { children: ReactNode }) {
  const [selectedJls, setSelectedJls] = useState<number | null>(null);
  const [selectedNaselje, setSelectedNaselje] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [activeZup, setActiveZup] = useState<string | null>(null);
  const [showNaselja, setShowNaselja] = useState(false);
  const [showKvartovi, setShowKvartovi] = useState(false);
  const [showKolokvijalni, setShowKolokvijalni] = useState(false);
  const [showClubs, setShowClubs] = useState(false);
  const [showOrto, setShowOrto] = useState(false);
  const [showPitches, setShowPitches] = useState(false);
  const [showCrkve, setShowCrkve] = useState(false);
  const [showZupe, setShowZupe] = useState(false);
  const [showStadiums, setShowStadiums] = useState(false);
  const [showAirports, setShowAirports] = useState(false);
  const [showPinka, setShowPinka] = useState(false);
  const [showZupBorders, setShowZupBorders] = useState(true);
  const [showJlsBorders, setShowJlsBorders] = useState(true);
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [colorMode, setColorMode] = useState<"zupanija" | "type">("zupanija");
  const [clubModal, setClubModal] = useState<ClubProperties | null>(null);

  // Mirror theme onto <html data-theme="..."> and persist.
  useEffect(() => {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem("domovina-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleZupBorders = useCallback(() => setShowZupBorders((b) => !b), []);
  const toggleJlsBorders = useCallback(() => setShowJlsBorders((b) => !b), []);
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
    setShowNaselja(false);
    setShowKvartovi(false);
    setShowKolokvijalni(false);
  }, []);

  const value = useMemo(
    () => ({
      selectedJls,
      selectedNaselje,
      focusMode,
      activeZup,
      showNaselja,
      showKvartovi,
      showKolokvijalni,
      showClubs,
      showOrto,
      showPitches,
      showCrkve,
      showZupe,
      showStadiums,
      showAirports,
      showPinka,
      showZupBorders,
      showJlsBorders,
      theme,
      colorMode,
      clubModal,
      setSelectedJls,
      setSelectedNaselje,
      setFocusMode,
      setActiveZup,
      setShowNaselja,
      setShowKvartovi,
      setShowKolokvijalni,
      setShowClubs,
      setShowOrto,
      setShowPitches,
      setShowCrkve,
      setShowZupe,
      setShowStadiums,
      setShowAirports,
      setShowPinka,
      toggleZupBorders,
      toggleJlsBorders,
      setTheme,
      toggleColorMode,
      openClubModal,
      closeClubModal,
      reset,
    }),
    [
      selectedJls,
      selectedNaselje,
      focusMode,
      activeZup,
      showNaselja,
      showKvartovi,
      showKolokvijalni,
      showClubs,
      showOrto,
      showPitches,
      showCrkve,
      showZupe,
      showStadiums,
      showAirports,
      showPinka,
      showZupBorders,
      showJlsBorders,
      theme,
      colorMode,
      clubModal,
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
