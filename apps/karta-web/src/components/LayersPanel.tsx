import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Info, PanelRightClose, PanelRightOpen, RotateCcw } from "lucide-react";
import { useMapState } from "@/lib/MapState";
import {
  CONTROLS,
  FIT_ACTION,
  controlsByGroup,
  type Control,
  type LayerId,
  type ToggleLayer,
} from "@/lib/layers";
import { useLayerControls } from "@/hooks/useLayerControls";

const GROUPS_KEY = "domovina-layer-groups";
const OPEN_KEY = "domovina-layers-open";

function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

interface Props {
  /** "desktop" = plutajući dock desno na karti; "sheet" = sadržaj mobilnog sheeta. */
  variant: "desktop" | "sheet";
  /** Dinamični brojevi zapisa (klubovi, naselja) — točniji od statičnih u registru. */
  counts?: Partial<Record<LayerId, number>>;
  /** Vrati kameru na cijelu Hrvatsku + poništi sve. */
  onFitHome: () => void;
}

export function LayersPanel({ variant, counts, onFitHome }: Props) {
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);
  const [info, setInfo] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, panelOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [panelOpen]);

  const toggleGroup = useCallback((id: string) => {
    setCollapsed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }, []);

  const { activeCount, clearDataLayers } = useLayerControls();
  const isDesktop = variant === "desktop";

  // Sklopljeni desktop dock — samo uska pilula s brojem aktivnih slojeva, da
  // karta dobije punu širinu ali stanje ostane vidljivo.
  if (isDesktop && !panelOpen) {
    return (
      <div className="pointer-events-none absolute right-4 top-4 z-[500] hidden md:block">
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-label="Otvori slojeve"
          className="pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[12px] font-medium shadow-panel transition-colors hover:border-[var(--ui-active)]"
          style={{
            background: "var(--overlay-strong)",
            borderColor: "var(--line)",
            color: "var(--text)",
            backdropFilter: "blur(14px)",
          }}
        >
          <PanelRightOpen size={17} />
          Slojevi
          {activeCount > 0 && <CountBadge n={activeCount} />}
        </button>
      </div>
    );
  }

  const body = (
    <>
      <div
        className="flex flex-none items-center gap-2 border-b px-3 py-2.5"
        style={{ borderColor: "var(--line)" }}
      >
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
          Slojevi
        </span>
        {activeCount > 0 && <CountBadge n={activeCount} />}
        <span className="ml-auto flex items-center gap-1">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearDataLayers}
              title="Ugasi sve podatkovne slojeve"
              aria-label="Ugasi sve podatkovne slojeve"
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-3)]"
              style={{ color: "var(--muted)" }}
            >
              <RotateCcw size={14} />
            </button>
          )}
          {isDesktop && (
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              title="Sklopi panel"
              aria-label="Sklopi panel"
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-3)]"
              style={{ color: "var(--muted)" }}
            >
              <PanelRightClose size={15} />
            </button>
          )}
        </span>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--line) transparent" }}
      >
        {controlsByGroup().map(({ group, items }) => {
          const isCollapsed = collapsed.includes(group.id);
          return (
            <section key={group.id}>
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={!isCollapsed}
                className="sticky top-0 z-10 flex w-full items-center gap-1.5 px-2 pb-1 pt-3 text-left text-[9.5px] font-semibold uppercase tracking-[0.16em] backdrop-blur-md"
                style={{ background: "var(--overlay-strong)", color: "var(--muted)" }}
              >
                <ChevronDown
                  size={12}
                  className="transition-transform duration-200"
                  style={{ transform: isCollapsed ? "rotate(-90deg)" : "none" }}
                />
                {group.label}
              </button>
              {!isCollapsed &&
                items.map((c) => (
                  <ControlRow
                    key={c.id}
                    control={c}
                    counts={counts}
                    infoOpen={info === c.id}
                    onInfo={() => setInfo((v) => (v === c.id ? null : c.id))}
                  />
                ))}
            </section>
          );
        })}

        <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
          <button
            type="button"
            onClick={onFitHome}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[12.5px] transition-colors hover:bg-[var(--bg-3)]"
            style={{ color: "var(--text)" }}
          >
            <FIT_ACTION.icon size={17} style={{ color: "var(--muted)" }} />
            <span className="flex-1">{FIT_ACTION.label}</span>
            <Kbd>{FIT_ACTION.shortcut}</Kbd>
          </button>
        </div>
      </div>
    </>
  );

  if (!isDesktop) return <div className="flex min-h-0 flex-1 flex-col">{body}</div>;

  return (
    <div
      data-testid="layers-panel"
      className="absolute right-4 top-4 z-[500] hidden w-[292px] flex-col rounded-xl border shadow-panel md:flex"
      style={{
        // Ključni popravak: panel više ne raste preko dna ekrana.
        maxHeight: "calc(100% - 2rem)",
        background: "var(--overlay-strong)",
        borderColor: "var(--line)",
        backdropFilter: "blur(14px)",
      }}
    >
      {body}
    </div>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span
      className="rounded-full px-1.5 py-[1px] font-mono text-[10px] font-semibold tabular-nums"
      style={{ background: "var(--ui-active-tint)", color: "var(--ui-active)" }}
    >
      {n}
    </span>
  );
}

function Kbd({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    // Skriveno ispod md: mobilni sheet je jedina instanca panela na toj širini,
    // a ondje kratica nema što raditi — nema tipkovnice.
    <kbd
      className="hidden rounded border px-1 py-[1px] font-mono text-[9px] font-medium not-italic md:inline-block"
      style={{ borderColor: "var(--line)", color: "var(--muted)", background: "var(--bg)" }}
    >
      {children}
    </kbd>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-[16px] w-[28px] flex-none rounded-full transition-colors duration-200"
      style={{
        background: on ? "var(--ui-active)" : "var(--line)",
      }}
    >
      <span
        className="absolute top-[2px] h-[12px] w-[12px] rounded-full bg-white transition-transform duration-200"
        style={{ transform: on ? "translateX(14px)" : "translateX(2px)" }}
      />
    </span>
  );
}

interface RowProps {
  control: Control;
  counts?: Partial<Record<LayerId, number>>;
  infoOpen: boolean;
  onInfo: () => void;
}

function ControlRow({ control, counts, infoOpen, onInfo }: RowProps) {
  const s = useMapState();
  const { map, toggle } = useLayerControls();

  const isToggle = control.kind === "toggle";
  const entry = isToggle ? map[(control as ToggleLayer).stateKey] : null;
  const on = entry?.value ?? false;

  // "choice" kontrole nisu on/off nego prikazuju trenutnu vrijednost.
  const choiceValue =
    control.id === "boja"
      ? s.colorMode === "zupanija"
        ? "po županiji"
        : "po tipu"
      : control.id === "tema"
        ? s.theme === "dark"
          ? "tamna"
          : "svijetla"
        : null;

  const activate = () => {
    if (isToggle) toggle((control as ToggleLayer).stateKey);
    else if (control.id === "boja") s.toggleColorMode();
    else if (control.id === "tema") s.setTheme(s.theme === "dark" ? "light" : "dark");
  };

  const count = isToggle
    ? (counts?.[(control as ToggleLayer).id] ?? (control as ToggleLayer).count)
    : undefined;
  const legend = isToggle ? (control as ToggleLayer).legend : undefined;
  const Ico = control.icon;

  return (
    <div>
      <div className="group flex items-center">
        <button
          type="button"
          onClick={activate}
          role={isToggle ? "switch" : undefined}
          aria-checked={isToggle ? on : undefined}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-2 pl-2 pr-1 text-left text-[12.5px] transition-colors hover:bg-[var(--bg-3)]"
          style={{ color: on ? "var(--ink)" : "var(--text)" }}
        >
          <Ico
            size={17}
            className="flex-none transition-colors"
            style={{ color: on ? "var(--ui-active)" : "var(--muted)" }}
          />
          <span className="min-w-0 flex-1 truncate">
            {control.label}
            {choiceValue && (
              <span className="ml-1.5 text-[11px] text-muted">· {choiceValue}</span>
            )}
          </span>
          {count != null && (
            <span className="flex-none font-mono text-[9.5px] tabular-nums text-muted">
              {count.toLocaleString("hr")}
            </span>
          )}
          <Kbd>{control.shortcut}</Kbd>
          {isToggle ? <Switch on={on} /> : <span className="w-[28px] flex-none" />}
        </button>
        <button
          type="button"
          onClick={onInfo}
          aria-expanded={infoOpen}
          aria-label={`Objašnjenje: ${control.label}`}
          className="flex h-7 w-6 flex-none items-center justify-center rounded transition-colors hover:bg-[var(--bg-3)] hover:opacity-100"
          style={{
            color: infoOpen ? "var(--ui-active)" : "var(--muted)",
            opacity: infoOpen ? 1 : 0.5,
          }}
        >
          <Info size={13} />
        </button>
      </div>

      {infoOpen && (
        <div
          className="mx-2 mb-1.5 rounded-lg border px-2.5 py-2 text-[11px] leading-[1.5]"
          style={{
            background: "var(--bg)",
            borderColor: "var(--line)",
            color: "var(--muted)",
          }}
        >
          {control.blurb}
          {legend && (
            <div className="mt-2 flex flex-col gap-1">
              {legend.map((l) => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ background: l.color }}
                  />
                  {l.label}
                </span>
              ))}
            </div>
          )}
          {control.source && (
            <div className="mt-2 text-[10px]">
              Izvor:{" "}
              {control.source.href ? (
                <a
                  href={control.source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--ui-active)" }}
                >
                  {control.source.label}
                </a>
              ) : (
                control.source.label
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Broj kontrola u registru — koristi ga e2e da uhvati regresiju u registru. */
export const CONTROL_COUNT = CONTROLS.length;
