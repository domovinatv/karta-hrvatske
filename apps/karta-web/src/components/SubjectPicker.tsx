import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { PosterSubject } from "@/lib/poster";
import {
  buildIndex,
  flatten,
  groupEntries,
  type SubjectEntry,
} from "@/lib/subject-index";

interface Props {
  subjects: PosterSubject[];
  value: PosterSubject;
  onPick: (slug: string) => void;
}

/**
 * Odabir područja: gumb + panel s pretragom i grupama.
 *
 * Zamjenjuje <select>, koji je radio dok je subjekata bilo 18. S ulaskom svih
 * 556 JLS-ova nativna lista prestaje biti upotrebljiva — nema pretrage, nema
 * grupa, a na mobilnom postaje kotač od nekoliko stotina redaka.
 *
 * Lista se NE virtualizira: 556 redaka je oko 600 DOM čvorova, što Chrome
 * iscrtava ispod jednog framea, a virtualizacija bi razbila sticky zaglavlja
 * grupa i skakanje strelicama. Ako registar naraste preko ~2000, ovo je mjesto
 * gdje treba dodati prozor.
 */
export function SubjectPicker({ subjects, value, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const index = useMemo(() => buildIndex(subjects), [subjects]);
  const groups = useMemo(() => groupEntries(index, q), [index, q]);
  const flat = useMemo(() => flatten(groups), [groups]);
  const current = index.find((e) => e.subject.slug === value.slug);

  // Otvaranje: prazan upit i kursor na trenutnom subjektu, da Enter odmah ne
  // odvede negdje drugdje.
  useEffect(() => {
    if (!open) return;
    setQ("");
    const i = flat.findIndex((e) => e.subject.slug === value.slug);
    setCursor(i < 0 ? 0 : i);
    inputRef.current?.focus();
    // flat namjerno nije u depsu — ovo je efekt otvaranja, ne filtriranja.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value.slug]);

  // Nakon filtriranja kursor mora ostati u rasponu.
  useEffect(() => {
    setCursor((c) => (c >= flat.length ? 0 : c));
  }, [flat.length]);

  // Klik izvan i Escape zatvaraju.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Aktivni redak drži u vidnom polju dok se ide strelicama.
  useLayoutEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-active="1"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const commit = (entry: SubjectEntry | undefined) => {
    if (!entry) return;
    onPick(entry.subject.slug);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!flat.length) return;
      const d = e.key === "ArrowDown" ? 1 : -1;
      setCursor((c) => (c + d + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(flat[cursor]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const line = { borderColor: "var(--line)" };
  let flatIdx = -1;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left"
        style={{ background: "var(--overlay-strong)", borderColor: open ? "var(--ui-active)" : "var(--line)" }}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12px] text-ink">{value.label}</span>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
            {current?.group}
            {current?.kind ? ` · ${current.kind}` : ""}
          </span>
        </span>
        <ChevronDown size={14} className="shrink-0 text-muted" />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-md border shadow-2xl"
          style={{ background: "var(--bg-2)", ...line }}
        >
          <div className="flex items-center gap-2 border-b px-2.5 py-2" style={line}>
            <Search size={13} className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="traži grad, općinu ili županiju…"
              className="w-full bg-transparent font-mono text-[12px] text-ink outline-none placeholder:text-muted"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} className="shrink-0 text-muted hover:text-ink">
                <X size={13} />
              </button>
            )}
          </div>

          <div ref={listRef} className="max-h-[46vh] overflow-y-auto" role="listbox">
            {flat.length === 0 && (
              <p className="px-3 py-4 text-center font-mono text-[11px] text-muted">
                nema pogotka za „{q}”
              </p>
            )}
            {groups.map((g) => (
              <div key={g.name}>
                <div
                  className="sticky top-0 flex items-baseline justify-between px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted"
                  style={{ background: "var(--bg-2)" }}
                >
                  <span className="truncate">{g.name}</span>
                  <span className="ml-2 shrink-0 opacity-70">{g.entries.length}</span>
                </div>
                {g.entries.map((e) => {
                  flatIdx++;
                  const active = flatIdx === cursor;
                  const selected = e.subject.slug === value.slug;
                  return (
                    <button
                      key={e.subject.slug}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      data-active={active ? "1" : "0"}
                      onMouseEnter={() => setCursor(flat.indexOf(e))}
                      onClick={() => commit(e)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
                      style={{ background: active ? "var(--overlay-strong)" : "transparent" }}
                    >
                      <Check
                        size={12}
                        className="shrink-0"
                        style={{ opacity: selected ? 1 : 0, color: "var(--ui-active)" }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[12px] text-ink">
                          {e.subject.menuLabel}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-muted">
                          {e.subject.subtitle}
                        </span>
                      </span>
                      {e.kind && (
                        <span className="shrink-0 rounded px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted" style={{ background: "var(--overlay-strong)" }}>
                          {e.kind}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div
            className="flex items-baseline justify-between gap-2 border-t px-2.5 py-1.5 font-mono text-[10px] text-muted"
            style={line}
          >
            <span className="truncate">
              {flat.length} od {index.length}
            </span>
            <span className="shrink-0 whitespace-nowrap opacity-70">↑↓ ⏎ esc</span>
          </div>
        </div>
      )}
    </div>
  );
}
