import { useEffect } from "react";
import { Layers, X } from "lucide-react";
import { LayersPanel } from "./LayersPanel";
import { useLayerControls } from "@/hooks/useLayerControls";
import type { LayerId } from "@/lib/layers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counts?: Partial<Record<LayerId, number>>;
  onFitHome: () => void;
}

// Mobilna kontrola slojeva: FAB gore desno + bottom sheet.
//
// Prije je ovo bio popover sidran na `top: safe-area + 64px` bez max-heighta i
// bez scrolla, pa je s 18 slojeva izlazio ispod ruba ekrana. Uz to se zatvarao
// nakon SVAKOG toggla, pa je paljenje tri sloja tražilo tri otvaranja izbornika.
//
// Sada: sheet ograničen na 72dvh, skrolabilan, ostaje otvoren dok korisnik ne
// zatvori. Backdrop je namjerno poluproziran i pokriva samo gornji dio — da se
// vidi kako se karta mijenja dok se slojevi pale.
export function LayersFab({ open, onOpenChange, counts, onFitHome }: Props) {
  const { activeCount } = useLayerControls();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <>
      <button
        type="button"
        aria-label="Slojevi"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="absolute right-3 z-[700] flex h-11 items-center gap-1.5 rounded-xl border px-3 shadow-panel backdrop-blur-md transition-colors md:hidden"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          background: "var(--overlay-strong)",
          borderColor: open ? "var(--ui-active)" : "var(--line)",
          color: open ? "var(--ui-active)" : "var(--text)",
        }}
      >
        <Layers size={19} />
        {activeCount > 0 && (
          <span
            className="rounded-full px-1.5 py-[1px] font-mono text-[10px] font-semibold tabular-nums"
            style={{ background: "var(--ui-active-tint)", color: "var(--ui-active)" }}
          >
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <button
          type="button"
          aria-label="Zatvori slojeve"
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-[790] md:hidden"
          style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(1.5px)" }}
        />
      )}

      <div
        role="dialog"
        aria-label="Slojevi"
        aria-hidden={open ? "false" : "true"}
        className="fixed inset-x-0 bottom-0 z-[800] flex flex-col rounded-t-2xl border-t shadow-2xl transition-transform duration-250 ease-out md:hidden"
        style={{
          background: "var(--overlay-strong)",
          borderColor: "var(--line)",
          backdropFilter: "blur(18px)",
          height: "72dvh",
          maxHeight: "72dvh",
          transform: open ? "translateY(0)" : "translateY(calc(100% + 24px))",
          paddingBottom: "env(safe-area-inset-bottom, 0)",
          visibility: open ? "visible" : "hidden",
        }}
      >
        <div className="flex flex-none items-center justify-center pb-1 pt-2.5">
          <span
            className="block h-1 w-10 rounded-full"
            style={{ background: "var(--line)" }}
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Zatvori"
            className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-3)]"
            style={{ color: "var(--muted)" }}
          >
            <X size={16} />
          </button>
        </div>
        <LayersPanel variant="sheet" counts={counts} onFitHome={onFitHome} />
      </div>
    </>
  );
}
