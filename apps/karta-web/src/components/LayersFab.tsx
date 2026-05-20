import { useEffect, useRef, useState } from "react";
import { ControlsPanel } from "./ControlsPanel";

// Mobile FAB ☰ top-right that opens a popover with the full controls panel.
// Hidden on ≥md viewport via Tailwind responsive utilities — desktop uses
// the side panel from <ControlsPanel variant="desktop" /> instead.
export function LayersFab() {
  const [open, setOpen] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || fabRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        aria-label="Slojevi"
        title="Slojevi"
        onClick={() => setOpen((o) => !o)}
        className="absolute right-3 top-3 z-[700] flex h-11 w-11 items-center justify-center rounded-[10px] border text-lg backdrop-blur-md md:hidden"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          background: "var(--overlay-strong)",
          borderColor: open ? "var(--ui-accent)" : "var(--line)",
          color: open ? "var(--ui-accent)" : "var(--text)",
        }}
      >
        ☰
      </button>
      {open && (
        <div
          ref={popRef}
          role="menu"
          className="absolute right-3 z-[700] flex max-w-[calc(100vw-24px)] min-w-[230px] flex-col gap-1 rounded-[10px] border p-2 shadow-2xl backdrop-blur-lg md:hidden"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 64px)",
            background: "var(--overlay-strong)",
            borderColor: "var(--line)",
          }}
        >
          <ControlsPanel variant="popover" onAction={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
