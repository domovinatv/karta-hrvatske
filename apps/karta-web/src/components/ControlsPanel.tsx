import { useMapState } from "@/lib/MapState";

interface CtrlBtnProps {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  shortcut?: string;
  title?: string;
}

function CtrlBtn({ active, onClick, children, shortcut, title }: CtrlBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex w-full min-w-[200px] items-center gap-2 rounded-md border px-3 py-2.5 text-left font-mono text-[11px] transition-colors"
      style={{
        background: "var(--overlay-strong)",
        borderColor: active ? "var(--ui-accent)" : "var(--line)",
        color: active ? "var(--ui-accent)" : "var(--text)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span className="flex-1">{children}</span>
      {shortcut && (
        <span className="ml-auto text-[9px] opacity-50">{shortcut}</span>
      )}
    </button>
  );
}

interface Props {
  /** Wrapped in absolute-positioned controls container or in a popover? */
  variant?: "desktop" | "popover";
  onAction?: () => void;
}

// Layer + view toggles. On desktop renders as a sticky panel top-right;
// on mobile the same buttons live inside the LayersFab popover (variant="popover").
export function ControlsPanel({ variant = "desktop", onAction }: Props) {
  const s = useMapState();

  const wrap = (fn: () => void) => () => {
    fn();
    onAction?.();
  };

  const cls =
    variant === "desktop"
      ? "absolute right-4 top-4 z-[500] hidden flex-col gap-1.5 md:flex"
      : "flex flex-col gap-1";

  return (
    <div className={cls}>
      <CtrlBtn onClick={wrap(s.toggleColorMode)} shortcut="C" title="Boja po županiji vs. po tipu">
        🎨 Color: {s.colorMode === "zupanija" ? "županija" : "tip"}
      </CtrlBtn>
      <CtrlBtn
        active={s.theme === "light"}
        onClick={wrap(() => s.setTheme(s.theme === "dark" ? "light" : "dark"))}
        shortcut="L"
        title="Prebaci svijetla/tamna tema"
      >
        🌓 Tema
      </CtrlBtn>
      <CtrlBtn
        active={s.showZupBorders}
        onClick={wrap(s.toggleZupBorders)}
        shortcut="B"
        title="Toggle DGU županije border overlay"
      >
        ▦ Granice županija
      </CtrlBtn>
      <CtrlBtn
        active={s.showJlsBorders}
        onClick={wrap(s.toggleJlsBorders)}
        shortcut="J"
        title="Toggle JLS border overlay"
      >
        ▦ Granice JLS
      </CtrlBtn>
      <CtrlBtn
        active={s.showNaselja}
        onClick={wrap(() => s.setShowNaselja(!s.showNaselja))}
        shortcut="N"
        title="Prikaži/sakrij 6759 naselja (lazy-loaded)"
      >
        ⊟ Naselja
      </CtrlBtn>
      <CtrlBtn
        active={s.showKolokvijalni}
        onClick={wrap(() => s.setShowKolokvijalni(!s.showKolokvijalni))}
        shortcut="Q"
        title="Kolokvijalni kvartovi (Jarun, Knežija, Špansko…) — derivirani iz mjesnih odbora + OSM imena (Zagreb, Velika Gorica; lazy-loaded)"
      >
        ⌂ Kvartovi
      </CtrlBtn>
      <CtrlBtn
        active={s.showKvartovi}
        onClick={wrap(() => s.setShowKvartovi(!s.showKvartovi))}
        shortcut="V"
        title="Službena mjesna samouprava — gradske četvrti + mjesni odbori (Zagreb, Velika Gorica; lazy-loaded)"
      >
        ▦ Četvrti i MO
      </CtrlBtn>
      <CtrlBtn
        active={s.showClubs}
        onClick={wrap(() => s.setShowClubs(!s.showClubs))}
        shortcut="K"
        title="Prikaži/sakrij nogometne klubove (lazy-loaded)"
      >
        ⚽ Klubovi
      </CtrlBtn>
      <CtrlBtn
        active={s.showPinka}
        onClick={wrap(() => s.setShowPinka(!s.showPinka))}
        shortcut="€"
        title="Aktivne pinka.io kampanje s lokacijom — klik na marker = donacija (lazy-loaded)"
      >
        💶 Pinka kampanje
      </CtrlBtn>
      <CtrlBtn
        active={s.showPitches}
        onClick={wrap(() => s.setShowPitches(!s.showPitches))}
        shortcut="P"
        title="Sva nogometna igrališta iz OSM-a (lazy-loaded, vidljivo od zoom 9)"
      >
        ▦ Igrališta
      </CtrlBtn>
      <CtrlBtn
        active={s.showStadiums}
        onClick={wrap(() => s.setShowStadiums(!s.showStadiums))}
        shortcut="T"
        title="Svi stadioni iz OSM-a (lazy-loaded)"
      >
        🏟 Stadioni
      </CtrlBtn>
      <CtrlBtn
        active={s.showAirports}
        onClick={wrap(() => s.setShowAirports(!s.showAirports))}
        shortcut="A"
        title="Zračne luke + runwayi + approach corridori (3° glide, 15 km, gradient pokazuje visinu)"
      >
        ✈ Zračne luke
      </CtrlBtn>
      <CtrlBtn
        active={s.showOrto}
        onClick={wrap(() => s.setShowOrto(!s.showOrto))}
        shortcut="S"
        title="Prikaži/sakrij ortofoto sloj (Esri World Imagery)"
      >
        🛰 Ortofoto
      </CtrlBtn>
      <CtrlBtn
        active={s.focusMode}
        onClick={wrap(() => s.setFocusMode(!s.focusMode))}
        shortcut="O"
        title="Sakrij sve osim odabrane JLS i naselja unutar nje"
      >
        ◎ Samo odabrana JLS
      </CtrlBtn>
      <CtrlBtn onClick={wrap(s.reset)} shortcut="F" title="Reset view">
        ⌖ Fit Hrvatska
      </CtrlBtn>
    </div>
  );
}
