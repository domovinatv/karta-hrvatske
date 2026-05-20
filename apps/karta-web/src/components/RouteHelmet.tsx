import { Helmet } from "react-helmet-async";
import { useMapState } from "@/lib/MapState";
import type { ClubCollection, JlsCollection, JlsFeature } from "@/lib/types";

interface Props {
  jls: JlsCollection | null;
  clubs: ClubCollection | null;
}

// Per-route title + description + og:* meta. Client-side fallback — the
// authoritative SEO/OG values for crawlers will be injected by the CF
// Worker (Phase 3) reading lookup JSON before the bundle even loads.
// Once the React app hydrates, react-helmet-async sets the same values
// for SPA navigations (since the Worker can't re-inject on client routes).
export function RouteHelmet({ jls, clubs }: Props) {
  const { selectedJls, activeZup, clubModal } = useMapState();

  let title = "DOMOVINA GIS — Geografija Hrvatske";
  let description =
    "Interaktivna karta RH s 556 JLS, 6759 naselja i 901 nogometnim klubom.";

  if (clubModal) {
    const c = clubModal;
    title = `${c.canonical_name} — DOMOVINA GIS`;
    description = [
      c.top_league_name,
      c.city,
      c.founded_year && `osn. ${c.founded_year}`,
    ]
      .filter(Boolean)
      .join(" · ") || description;
  } else if (selectedJls !== null && jls) {
    const f = (jls.features as JlsFeature[]).find((x) => x.id === selectedJls);
    if (f) {
      title = `${f.properties.type} ${f.properties.name} — DOMOVINA GIS`;
      description = `${f.properties.zupanija} · ${f.properties.area_km2.toFixed(2)} km² · DGU Registar prostornih jedinica`;
    }
  } else if (activeZup) {
    title = `${activeZup} — DOMOVINA GIS`;
    description = `Pregled JLS-ova u ${activeZup} županiji.`;
  }

  const ogImage = clubModal
    ? `/logos/${clubModal.slug}.png`
    : "/og-default.png";

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:type" content="website" />
      <link
        rel="canonical"
        href={typeof window !== "undefined" ? window.location.href : ""}
      />
      {/* clubs/jls counts unused here — kept for future per-route stats */}
      {clubs && null}
    </Helmet>
  );
}
