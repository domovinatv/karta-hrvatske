import { useEffect } from "react";
import { useMapState } from "@/lib/MapState";
import type { ClubProperties, ClubSeason } from "@/lib/types";
import { ArrowUpRight, Check, X } from "lucide-react";

const TIER_CHIP_COLOR: Record<number, string> = {
  1: "#d4322f",
  2: "#e8853c",
  3: "#e2b94f",
  4: "#a8c256",
  5: "#5fa8a8",
  6: "#5b8aaa",
  7: "#7e7eb8",
  8: "#8d99ae",
};

function fmtSeason(s: string): string {
  const m = s.match(/^hrnogomet-season-(\d+)$/);
  if (m) return `#${m[1]}`;
  return s;
}

// Rich-card modal. Backdrop respects iOS safe-area via 100dvh + env() padding
// (CSS at the bottom of this file via global styles import). Sections that
// have no data render nothing — cleaner than rendering "—" placeholders.
export function ClubModal() {
  const { clubModal, closeClubModal } = useMapState();

  useEffect(() => {
    if (!clubModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeClubModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [clubModal, closeClubModal]);

  if (!clubModal) return null;
  const p = clubModal;

  const shortDiff = p.short_name && p.short_name !== p.canonical_name ? p.short_name : null;

  return (
    <div
      className="club-modal-backdrop open"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains("club-modal-backdrop")) closeClubModal();
      }}
    >
      <div className="club-modal">
        <div className="cm-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="cm-logo"
            src={`/logos/${p.slug}.png`}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
            alt=""
          />
          <div className="cm-title">
            <div className="cm-name">{p.canonical_name}</div>
            <div className="cm-short">{shortDiff ? `${shortDiff} · ${p.slug}` : p.slug}</div>
          </div>
          <button className="cm-close" aria-label="Zatvori" onClick={closeClubModal}>
            <X size={15} />
          </button>
        </div>

        <SeasonsSection seasons={p.seasons} />
        <LokacijaSection p={p} />
        <StadionSection p={p} />
        <KontaktSection p={p} />
        <SocialsSection p={p} />
        <AliasesSection p={p} />
        <ExtSources p={p} />
        <MetaSection p={p} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  // Empty children — return null so the section is skipped entirely.
  if (!children) return null;
  // We can't reliably detect "all children are null" without rendering,
  // but each subsection below renders null when empty.
  return (
    <div className="cm-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  if (v == null || v === "") return null;
  return (
    <div className="cm-row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function SeasonsSection({ seasons }: { seasons?: ClubSeason[] }) {
  if (!seasons?.length) return null;
  const byLeague = new Map<
    string,
    { league?: string; tier?: number; county?: string; entries: ClubSeason[] }
  >();
  for (const s of seasons) {
    const key = `${s.tier ?? 99}|${s.league || ""}`;
    if (!byLeague.has(key))
      byLeague.set(key, { league: s.league, tier: s.tier, county: s.league_county, entries: [] });
    byLeague.get(key)!.entries.push(s);
  }
  const blocks = [...byLeague.values()].sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99));
  return (
    <Section title="Sezone / lige">
      {blocks.map((g, i) => {
        const chipColor = g.tier ? TIER_CHIP_COLOR[g.tier] || "#8d99ae" : "#8d99ae";
        return (
          <div className="cm-league-block" key={i}>
            <div className="cm-league-name">
              {g.tier && (
                <span className="cm-tier-chip" style={{ background: chipColor }}>
                  T{g.tier}
                </span>
              )}{" "}
              {g.league || "—"}
              {g.county && <span className="cm-tag">{g.county}</span>}
            </div>
            <div>
              {g.entries.map((s, j) => (
                <span className="cm-season-pill" key={j}>
                  {fmtSeason(s.season) || "—"}
                  {s.source && <span className="cm-tag">{s.source}</span>}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </Section>
  );
}

function LokacijaSection({ p }: { p: ClubProperties }) {
  const hasCoords = p._lat != null && p._lng != null;
  if (!p.city && !p.county && !p.address && !hasCoords && !p.google_place_id) return null;
  const verifiedTag =
    p.geo_source === "both" ? (
      <span
        className="cm-tag"
        title="Potvrđeno: Google + Nominatim daju istu lokaciju"
        style={{
          color: "var(--good)",
          borderColor: "color-mix(in srgb, var(--good) 40%, transparent)",
        }}
      >
        <Check size={11} /> verified
      </span>
    ) : p.geo_source ? (
      <span className="cm-tag">{p.geo_source}</span>
    ) : null;
  return (
    <Section title="Lokacija">
      <Row k="Grad" v={p.city} />
      <Row k="Županija" v={p.county} />
      <Row k="Adresa" v={p.address} />
      {hasCoords && (
        <Row
          k="Koordinate"
          v={
            <>
              <a
                href={`https://www.openstreetmap.org/?mlat=${p._lat}&mlon=${p._lng}#map=16/${p._lat}/${p._lng}`}
                target="_blank"
                rel="noopener"
              >
                {p._lat!.toFixed(5)}, {p._lng!.toFixed(5)}
              </a>{" "}
              {verifiedTag}
            </>
          }
        />
      )}
      {p.google_place_id && (
        <Row
          k="Google Maps"
          v={
            <a
              href={`https://www.google.com/maps/place/?q=place_id:${p.google_place_id}`}
              target="_blank"
              rel="noopener"
            >
              Otvori u Google Maps <ArrowUpRight size={12} />
            </a>
          }
        />
      )}
    </Section>
  );
}

function StadionSection({ p }: { p: ClubProperties }) {
  if (!p.stadium_name && !p.stadium_capacity && !p.founded_year) return null;
  return (
    <Section title="Stadion">
      <Row k="Stadion" v={p.stadium_name} />
      {p.stadium_capacity && <Row k="Kapacitet" v={Number(p.stadium_capacity).toLocaleString("hr")} />}
      {p.founded_year && <Row k="Osnovan" v={p.founded_year} />}
    </Section>
  );
}

function KontaktSection({ p }: { p: ClubProperties }) {
  if (!p.website && !p.email && !p.phone && !p.president) return null;
  return (
    <Section title="Kontakt">
      {p.website && (
        <Row
          k="Web"
          v={
            <a href={p.website} target="_blank" rel="noopener">
              {p.website}
            </a>
          }
        />
      )}
      {p.email && <Row k="Email" v={<a href={`mailto:${p.email}`}>{p.email}</a>} />}
      {p.phone && (
        <Row
          k="Telefon"
          v={
            <>
              <a href={`tel:${p.phone_e164 || p.phone}`}>{p.phone}</a>
              {p.phone_kind && <span className="cm-tag">{p.phone_kind}</span>}
            </>
          }
        />
      )}
      {p.president && (
        <Row
          k="Predsjednik"
          v={
            <>
              {p.president}
              {p.president_role && <span className="cm-tag">{p.president_role}</span>}
            </>
          }
        />
      )}
    </Section>
  );
}

function SocialsSection({ p }: { p: ClubProperties }) {
  const links: React.ReactNode[] = [];
  if (p.fb_url)
    links.push(
      <a href={p.fb_url} target="_blank" rel="noopener" key="fb">
        Facebook
      </a>,
    );
  if (p.ig_url)
    links.push(
      <a href={p.ig_url} target="_blank" rel="noopener" key="ig">
        Instagram
      </a>,
    );
  if (p.x_url)
    links.push(
      <a href={p.x_url} target="_blank" rel="noopener" key="x">
        X / Twitter
      </a>,
    );
  if (!links.length) return null;
  return (
    <Section title="Društvene mreže">
      <div className="cm-socials">{links}</div>
    </Section>
  );
}

function AliasesSection({ p }: { p: ClubProperties }) {
  if (!p.aliases?.length) return null;
  return (
    <Section title="Aliasi">
      <div className="cm-aliases-list">
        {p.aliases.map((a, i) => (
          <span className="cm-season-pill" key={i}>
            {a.alias}
            <span className="cm-tag">{a.source}</span>
          </span>
        ))}
      </div>
    </Section>
  );
}

function ExtSources({ p }: { p: ClubProperties }) {
  const sourceLinks: React.ReactNode[] = [];
  const rows: React.ReactNode[] = [];

  if (p.sofascore_url) {
    sourceLinks.push(
      <a href={p.sofascore_url} target="_blank" rel="noopener" key="sf-btn">
        SofaScore
      </a>,
    );
    rows.push(
      <div className="cm-row" key="sf-row">
        <span className="k">sofascore</span>
        <span className="v">
          <a href={p.sofascore_url} target="_blank" rel="noopener">
            {p.sofascore_url}
          </a>
        </span>
      </div>,
    );
  } else if (p.source_ids?.length) {
    for (const s of p.source_ids) {
      if (s.source === "sofascore-id") {
        const url = `https://www.sofascore.com/team/football/${p.slug}/${s.id}`;
        sourceLinks.push(
          <a href={url} target="_blank" rel="noopener" key="sfid-btn">
            SofaScore
          </a>,
        );
        rows.push(
          <div className="cm-row" key={`sfid-${s.id}`}>
            <span className="k">{s.source}</span>
            <span className="v">
              <a href={url} target="_blank" rel="noopener">
                {s.id}
              </a>
            </span>
          </div>,
        );
      } else {
        rows.push(
          <div className="cm-row" key={`${s.source}-${s.id}`}>
            <span className="k">{s.source}</span>
            <span className="v">{s.id}</span>
          </div>,
        );
      }
    }
  }
  if (p.semafor_url) {
    sourceLinks.push(
      <a href={p.semafor_url} target="_blank" rel="noopener" key="sm-btn">
        HNS semafor
      </a>,
    );
    rows.push(
      <div className="cm-row" key="sm-row">
        <span className="k">semafor</span>
        <span className="v">
          <a href={p.semafor_url} target="_blank" rel="noopener">
            {p.semafor_url}
          </a>
        </span>
      </div>,
    );
  }
  if (p.registry_url) {
    const isCw = p.registry_url.includes("companywall");
    const label = isCw ? "Companywall (SDD)" : "Registar udruga RH";
    sourceLinks.push(
      <a href={p.registry_url} target="_blank" rel="noopener" key="reg-btn">
        {label}
      </a>,
    );
    rows.push(
      <div className="cm-row" key="reg-row">
        <span className="k">{isCw ? "companywall" : "udruge"}</span>
        <span className="v">
          <a href={p.registry_url} target="_blank" rel="noopener">
            {p.registry_url}
          </a>
          {p.registry_status && <span className="cm-tag">{p.registry_status}</span>}
        </span>
      </div>,
    );
    if (p.registry_naziv && p.registry_naziv !== p.canonical_name) {
      rows.push(
        <div
          className="cm-row"
          key="reg-naziv"
          style={{ fontSize: 10, color: "var(--muted)", paddingTop: 0 }}
        >
          <span className="k"></span>
          <span className="v">{p.registry_naziv}</span>
        </div>,
      );
    }
  }
  if (p.oib) rows.push(<Row k="OIB" v={p.oib} key="oib" />);
  if (p.udruga_id && !p.registry_url)
    rows.push(<Row k="udruga_id" v={p.udruga_id} key="udruga_id" />);

  if (!sourceLinks.length && !rows.length) return null;
  return (
    <Section title="Vanjski izvori">
      {sourceLinks.length > 0 && <div className="cm-socials">{sourceLinks}</div>}
      {rows}
    </Section>
  );
}

function MetaSection({ p }: { p: ClubProperties }) {
  if (!p.notes && !p.created_at && !p.updated_at) return null;
  return (
    <Section title="Meta">
      <Row k="Bilješke" v={p.notes} />
      <Row k="Dodano" v={p.created_at} />
      <Row k="Ažurirano" v={p.updated_at} />
    </Section>
  );
}
