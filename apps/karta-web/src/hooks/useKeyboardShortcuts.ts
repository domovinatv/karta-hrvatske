import { useEffect } from "react";
import { useMapState } from "@/lib/MapState";
import { SHORTCUT_MAP, type ToggleLayer } from "@/lib/layers";
import { useLayerControls } from "./useLayerControls";

/**
 * Tipkovničke kratice iz registra slojeva.
 *
 * Panel je oduvijek ISPISIVAO kratice (C, L, B, J, N, Q, V, K, €, R, Ž, D, P,
 * T, A, S, O, F), ali handler nije postojao — jedini keydown u aplikaciji bio
 * je ESC u ClubModalu. Ovo ispunjava obećanje koje sučelje već daje.
 */
export function useKeyboardShortcuts({ onFitHome }: { onFitHome: () => void }) {
  const s = useMapState();
  const { toggle } = useLayerControls();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Ne otimaj tipke dok korisnik piše u pretragu.
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }

      const control = SHORTCUT_MAP[e.key.toLowerCase()];
      if (!control) return;
      e.preventDefault();

      if (control.kind === "toggle") toggle((control as ToggleLayer).stateKey);
      else if (control.id === "boja") s.toggleColorMode();
      else if (control.id === "tema") s.setTheme(s.theme === "dark" ? "light" : "dark");
      else if (control.id === "fit") onFitHome();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [s, toggle, onFitHome]);
}
