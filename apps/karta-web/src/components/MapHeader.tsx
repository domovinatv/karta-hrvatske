import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, Image, Share2 } from "lucide-react";

// Kompaktno zaglavlje — na uskom ekranu se svodi na jednu liniju
// (statistika je skrivena ispod md). Naslov je link na početnu: ruta `/`
// sama čisti odabir (useUrlSync), a onHome vraća kameru na Hrvatsku.
// Upaljeni slojevi (`?l=`) ostaju — početna je "bez odabira", ne "bez slojeva".
export function MapHeader({ onHome }: { onHome?: () => void }) {
  const { search } = useLocation();
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
          to={{ pathname: "/", search }}
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
      <ShareButton />
      <Link
        to="/poster"
        className=" flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] no-underline transition-colors hover:border-[var(--ui-active)]"
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

// URL već nosi cijeli prizor (odabir, slojevi, kamera), pa je dijeljenje samo
// location.href. Na dodirnim uređajima sistemski share sheet, inače clipboard.
function ShareButton() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);

  const onShare = async () => {
    const url = window.location.href;
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    if (touch && navigator.share) {
      try {
        await navigator.share({ url, title: document.title });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Kopiraj link:", url);
    }
  };

  return (
    <button
      type="button"
      onClick={onShare}
      data-testid="share"
      aria-label="Podijeli"
      className="ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-colors hover:border-[var(--ui-active)]"
      style={{ borderColor: "var(--line)", color: copied ? "var(--ui-active)" : "var(--text)" }}
      title="Kopiraj link na ovaj prizor — odabir, slojevi i kamera"
    >
      {copied ? <Check size={14} /> : <Share2 size={14} />}
      <span className="hidden sm:inline">{copied ? "Kopirano" : "Podijeli"}</span>
    </button>
  );
}
