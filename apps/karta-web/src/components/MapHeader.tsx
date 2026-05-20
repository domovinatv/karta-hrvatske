// Compact header — collapses to single line on phone portrait via the
// same CSS strategy as the legacy template (badges/subtitle hidden ≤640px).
export function MapHeader() {
  return (
    <header
      className="flex items-center gap-3 border-b px-4 py-2 md:gap-6 md:px-6 md:py-3.5"
      style={{
        background: "linear-gradient(180deg, var(--bg-2) 0%, var(--bg) 100%)",
        borderColor: "var(--line)",
      }}
    >
      <h1 className="m-0 flex min-w-0 items-baseline gap-2 text-sm md:gap-3 md:text-base">
        <span
          className="font-extrabold tracking-[0.06em] text-ink md:text-lg"
          style={{ fontSize: "1rem" }}
        >
          DOMOVINA
          <span style={{ color: "var(--brand-red)", letterSpacing: 0 }}>.ai</span>
        </span>
        <span className="text-muted" style={{ fontWeight: 400 }}>
          ·
        </span>
        <span
          className="truncate font-display font-semibold tracking-tight"
          style={{ color: "var(--ink)" }}
        >
          Karta Hrvatske
        </span>
      </h1>
      <div
        className="ml-auto hidden text-xs uppercase tracking-[0.18em] md:block"
        style={{ color: "var(--muted)" }}
      >
        556 JLS · 21 županija · WebGL
      </div>
    </header>
  );
}
