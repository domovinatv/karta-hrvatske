import { Link } from "react-router-dom";
import { Image } from "lucide-react";

// Kompaktno zaglavlje — na uskom ekranu se svodi na jednu liniju
// (statistika je skrivena ispod md). Naslov je link na početnu: ruta `/`
// sama čisti odabir (useUrlSync), a onHome vraća kameru na Hrvatsku.
export function MapHeader({ onHome }: { onHome?: () => void }) {
  return (
    <header
      className="flex items-center gap-3 border-b px-4 py-2 md:gap-6 md:px-6 md:py-3.5"
      style={{
        background: "linear-gradient(180deg, var(--bg-2) 0%, var(--bg) 100%)",
        borderColor: "var(--line)",
      }}
    >
      <h1 className="m-0 min-w-0 text-sm md:text-base">
        <Link
          to="/"
          onClick={onHome}
          title="Početna — cijela Hrvatska"
          className="flex min-w-0 items-baseline gap-2 no-underline md:gap-3"
        >
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
        </Link>
      </h1>
      <Link
        to="/poster"
        className="ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] no-underline transition-colors hover:border-[var(--ui-active)]"
        style={{ borderColor: "var(--line)", color: "var(--text)" }}
        title="Poster generator — anatomija grada iz kvartova"
      >
        <Image size={14} />
        Poster
      </Link>
      {/* "WEBGL" je bio interni tehnički detalj koji ništa ne prodaje — zamijenjen
          opsegom dataseta, što je ono čime se karta zapravo razlikuje. */}
      <div
        className="hidden text-xs uppercase tracking-[0.18em] md:block"
        style={{ color: "var(--muted)" }}
      >
        556 JLS · 6.759 naselja · 21 županija
      </div>
    </header>
  );
}
