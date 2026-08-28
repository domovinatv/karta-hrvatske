import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { v } from "@/lib/version";
import {
  DEFAULT_SUBJECT_SLUG,
  POSTER_FONTS,
  POSTER_FORMATS,
  POSTER_PALETTES,
  POSTER_SOURCES,
  POSTER_SUBJECTS,
  downloadBlob,
  fontFaceCss,
  labelColorFor,
  parsePoints,
  pluralUnit,
  projectSubject,
  subjectBySlug,
  svgToPng,
  type PosterPoint,
  type PosterSubject,
} from "@/lib/poster";
import { fitLabel, type LabelFit, type LineInk } from "@/lib/label-fit";
import {
  LINE_H,
  MIN_LABEL,
  labelCap,
  posterFrame,
  type ProjectedSubject,
} from "@/lib/poster-geom";
import type { PosterCollection } from "@/lib/types";
import { ArrowLeft, Crosshair, Download, Minus, Plus } from "lucide-react";



/**
 * Mjerenje retka STVARNIM fontom.
 *
 * Prva verzija je pretpostavljala 0.6 × font-size po znaku i redak visok
 * 1.15 em; za Fraunces je oboje bilo krivo pa su duga imena izlazila iz
 * poligona. Mjeri se canvasom, i to NA VELIČINI NA KOJOJ SE CRTA: Fraunces je
 * varijabilni font s optičkom osi (opsz), pa su mu glifovi na 4 px osjetno
 * širi nego na 40 px i mjera s jedne veličine ne vrijedi za drugu.
 */
function makeMeasurer(family: string): (line: string, size: number) => LineInk {
  const ctx = document.createElement("canvas").getContext("2d");
  const css = family.includes(",") ? family : `"${family}"`;
  const cache = new Map<string, LineInk>();
  if (!ctx) return (line) => ({ w: line.length * 0.6, asc: 0.7, desc: 0.2 });
  ctx.textBaseline = "alphabetic";
  return (line: string, size: number) => {
    // Zaokruženo na 0.1 px zbog cachea; mjere se ionako traže iterativno.
    const px = Math.max(0.5, Math.round(size * 10) / 10);
    const key = `${px}|${line}`;
    const hit = cache.get(key);
    if (hit) return hit;
    ctx.font = `600 ${px}px ${css}`;
    const m = ctx.measureText(line);
    const ink: LineInk = {
      w: m.width / px,
      asc: m.actualBoundingBoxAscent / px,
      desc: m.actualBoundingBoxDescent / px,
    };
    cache.set(key, ink);
    return ink;
  };
}

/** Projekcija + smješteni natpisi; računa se jednom po (subjekt, format, font). */
export interface PosterLayout {
  projected: ProjectedSubject;
  /** Poravnato s projected.units; null ako oblik nije primio ni jedno slovo. */
  labels: (LabelFit | null)[];
}

/**
 * Za svako naselje traži najveći natpis koji stane U SAM OBLIK (label-fit.ts).
 *
 * Klizač veličine ulazi u sam fit, a ne u naknadno skaliranje: kod fonta s
 * optičkom osi mjere nisu proporcionalne veličini, pa bi natpis smanjen nakon
 * fita bio relativno širi i mogao bi izaći iz poligona.
 */
export function layoutPoster(
  fc: PosterCollection,
  subject: PosterSubject,
  formatKey: string,
  fontKey: string,
  hasTitle: boolean,
  labelScale: number,
): PosterLayout {
  const format = POSTER_FORMATS.find((f) => f.key === formatKey) ?? POSTER_FORMATS[0];
  const font = POSTER_FONTS.find((f) => f.key === fontKey) ?? POSTER_FONTS[0];
  const { mapW, mapH } = posterFrame(format, hasTitle);
  const projected = projectSubject(fc, subject, mapW, mapH);
  const measure = makeMeasurer(font.family);
  const labels = projected.units.map((k) =>
    fitLabel(k.rings, k.name, {
      measure,
      lineHeight: LINE_H,
      maxSize: labelCap(k.areaPx) * labelScale,
    }),
  );
  return { projected, labels };
}

interface BuildOpts {
  fc: PosterCollection;
  subject: PosterSubject;
  layout: PosterLayout;
  paletteKey: string;
  fontKey: string;
  formatKey: string;
  title: string;
  subtitle: string;
  showLabels: boolean;
  labelScale: number;
  points: PosterPoint[];
  pointColor: string;
  /**
   * Je li font stvarno učitan kad su se natpisi mjerili. Ide u SVG kao
   * data-labels, pa se izvana (e2e, screenshot servis) zna kad je plakat
   * gotov, umjesto da se pogađa tajmerom.
   */
  fontMeasured: boolean;
  /** Embedani @font-face CSS (samo za export; preview koristi web fontove). */
  embeddedCss?: string;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function buildPosterSvg(o: BuildOpts): string {
  const subject = o.subject;
  const palette = POSTER_PALETTES.find((p) => p.key === o.paletteKey) ?? POSTER_PALETTES[0];
  const font = POSTER_FONTS.find((f) => f.key === o.fontKey) ?? POSTER_FONTS[0];
  const format = POSTER_FORMATS.find((f) => f.key === o.formatKey) ?? POSTER_FORMATS[0];

  const hasTitle = o.title.trim().length > 0;
  const { W, H, margin, titleBlockH, mapX, mapY, mapW, mapH } = posterFrame(format, hasTitle);
  // Projekcija i smještaj natpisa dolaze predračunati (layoutPoster) — isti
  // objekt koristi i preview i export, da se ne razlikuju ni za piksel.
  const projected = o.layout.projected;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-labels="${
      o.fontMeasured ? "measured" : "pending"
    }">`,
  );
  if (o.embeddedCss) parts.push(`<style>${o.embeddedCss}</style>`);
  parts.push(`<rect width="${W}" height="${H}" fill="${palette.bg}"/>`);

  // Naslov + podnaslov.
  if (hasTitle) {
    // Naslov se skalira i po ŠIRINI, ne samo po visini bloka: "PLEMENITA
    // OPČINA TUROPOLJSKA" je dvostruko duži od "ZAGREB" i bez ovoga bi
    // jednostavno izašao iz papira. 0.72 = širina znaka (0.6) + letter-spacing
    // (0.12), oboje izraženo u jedinicama font-sizea niže.
    const titleChars = Math.max(o.title.trim().length, 1);
    const titleSize = Math.min(
      W * 0.09,
      titleBlockH * 0.52,
      (W - margin * 2) / (titleChars * 0.72),
    );
    parts.push(
      `<text x="${W / 2}" y="${titleBlockH * 0.52}" text-anchor="middle" font-family="${esc(
        font.family,
      )}" font-weight="800" font-size="${titleSize.toFixed(1)}" letter-spacing="${(
        titleSize * 0.12
      ).toFixed(1)}" fill="${palette.title}">${esc(o.title.toUpperCase())}</text>`,
    );
    if (o.subtitle.trim()) {
      // Isti fit za podnaslov — on zna biti duži od naslova.
      const subSize = Math.min(
        titleSize * 0.22,
        (W - margin * 2) / (o.subtitle.trim().length * 0.87),
      );
      parts.push(
        `<text x="${W / 2}" y="${(titleBlockH * 0.78).toFixed(1)}" text-anchor="middle" font-family="${esc(
          font.family,
        )}" font-weight="600" font-size="${subSize.toFixed(1)}" letter-spacing="${(
          subSize * 0.27
        ).toFixed(1)}" fill="${palette.text}">${esc(o.subtitle.toUpperCase())}</text>`,
      );
    }
  }

  // Kvartovi. data-unit povezuje poligon i njegov natpis — po tome e2e test
  // provjerava da nijedno slovo nije izašlo van (isPointInFill).
  parts.push(`<g transform="translate(${mapX} ${mapY})">`);
  projected.units.forEach((k, i) => {
    const fill = palette.fills[k.paletteIdx % palette.fills.length];
    parts.push(
      `<path data-unit="${i}" d="${k.d}" fill="${fill}" stroke="${palette.stroke}" stroke-width="1.2" stroke-linejoin="round"/>`,
    );
  });
  if (o.showLabels) {
    for (let i = 0; i < projected.units.length; i++) {
      const k = projected.units[i];
      const fit = o.layout.labels[i];
      if (!fit) continue;
      // fit.size je već konačna veličina (klizač je ušao u fit).
      const size = fit.size;
      if (size < MIN_LABEL) continue;
      const fill = palette.fills[k.paletteIdx % palette.fills.length];
      const color = labelColorFor(fill, palette); // kontrast prema svjetlini filla
      // y je PISMOVNA LINIJA retka: središte pravokutnika pomaknuto tako da
      // tinta sjedne po sredini (dyEm), pa svaki sljedeći redak za LINE_H
      // niže. Bez dominant-baselinea — v. label-fit.ts.
      const spans = fit.lines
        .map(
          (l, j) =>
            `<tspan x="${fit.x.toFixed(2)}" y="${(
              fit.y + (fit.dyEm + j * LINE_H) * size
            ).toFixed(2)}">${esc(l)}</tspan>`,
        )
        .join("");
      // Rotacija oko središta bloka — isti kut pod kojim je okvir nađen.
      const rot = fit.angle
        ? ` transform="rotate(${fit.angle} ${fit.x.toFixed(1)} ${fit.y.toFixed(1)})"`
        : "";
      parts.push(
        `<text data-unit="${i}"${rot} text-anchor="middle" font-family="${esc(
          font.family,
        )}" font-weight="600" font-size="${size.toFixed(1)}" fill="${color}" opacity="0.95">${spans}</text>`,
      );
    }
  }
  // Obrisi preko naselja i imena — samo na objedinjenom plakatu (Turopolje):
  // tanje granice JLS-ova od kojih je regija složena, pa deblji vanjski
  // obuhvat cijele regije preko svega. Obuhvat ide zadnji da ga granice ne
  // presijecaju na rubu.
  for (const razina of ["jls", "regija"] as const) {
    for (const o2 of projected.outlines.filter((x) => x.razina === razina)) {
      const isRegion = razina === "regija";
      parts.push(
        `<path d="${o2.d}" fill="none" stroke="${palette.text}" stroke-width="${(
          W * (isRegion ? 0.008 : 0.0035)
        ).toFixed(1)}" stroke-linejoin="round" opacity="${isRegion ? 0.9 : 0.55}"/>`,
      );
    }
  }

  // Custom točke.
  for (const p of o.points) {
    const [x, y] = projected.project(p.lng, p.lat);
    if (x < -10 || y < -10 || x > mapW + 10 || y > mapH + 10) continue;
    parts.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(W * 0.005).toFixed(1)}" fill="${
        o.pointColor
      }" stroke="${palette.bg}" stroke-width="1.5"/>`,
    );
    if (p.label) {
      parts.push(
        `<text x="${x.toFixed(1)}" y="${(y - W * 0.009).toFixed(1)}" text-anchor="middle" font-family="${esc(
          font.family,
        )}" font-weight="600" font-size="${(W * 0.011).toFixed(1)}" fill="${
          o.pointColor
        }">${esc(p.label)}</text>`,
      );
    }
  }
  parts.push(`</g>`);

  // Attribution (licence traže naznaku izvora; ujedno diskretan branding).
  parts.push(
    `<text x="${W - margin * 0.5}" y="${H - margin * 0.45}" text-anchor="end" font-family="${esc(
      font.family,
    )}" font-size="${(W * 0.011).toFixed(1)}" fill="${palette.text}" opacity="0.55">gis.domovina.ai · ${esc(subject.attribution)}</text>`,
  );
  parts.push(`</svg>`);
  return parts.join("");
}

export default function PosterView() {
  const { grad } = useParams();
  const navigate = useNavigate();
  // Subjekt je stanje RUTE, ne komponente — /poster/turopolje je shareable
  // permalink.
  const subject = subjectBySlug(grad);
  // Sloj se lazy-loada po subjektu i ostaje u memoriji: prebacivanje
  // Zagreb ↔ Turopolje ne skida isti file dvaput.
  const [sources, setSources] = useState<Record<string, PosterCollection>>({});
  const requested = useRef<Record<string, boolean>>({});
  const [paletteKey, setPaletteKey] = useState("retro");
  const [fontKey, setFontKey] = useState("fraunces");
  const [formatKey, setFormatKey] = useState("kvadrat");
  const [title, setTitle] = useState(subject?.label ?? "Zagreb");
  const [subtitle, setSubtitle] = useState(subject?.subtitle ?? "");
  const [showLabels, setShowLabels] = useState(true);
  const [labelScale, setLabelScale] = useState(1);
  const [pointsText, setPointsText] = useState("");
  const [pointColor, setPointColor] = useState("#c8102e");
  const [exporting, setExporting] = useState<string | null>(null);
  // Natpisi se fitaju izmjerenom širinom teksta. Dok Fraunces nije stvarno
  // učitan, canvas mjeri zamjenski serif — oko 20 % uže — pa natpisi ispadnu
  // preveliki i izađu iz poligona. Drži se koji je font POTVRĐENO spreman.
  const [fontReadyKey, setFontReadyKey] = useState<string | null>(null);
  const titleTouched = useRef(false);
  const subtitleTouched = useRef(false);
  // Preview zoom/pan — čisti CSS transform, ne dira SVG ni export.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const sourceKey = subject?.source ?? "";
  const fc = sources[sourceKey] ?? null;

  useEffect(() => {
    if (!subject) return;
    document.title = `${subject.label} — ${subject.subtitle} · DOMOVINA Karta`;
  }, [subject]);

  // Naslov i podnaslov prate subjekt dok ih korisnik ne prepiše — i kad se
  // subjekt promijeni navigacijom (back/forward, sherani link), ne samo
  // dropdownom.
  useEffect(() => {
    if (!subject) return;
    if (!titleTouched.current) setTitle(subject.label);
    if (!subtitleTouched.current) setSubtitle(subject.subtitle);
  }, [subject]);

  // requested ref umjesto `sources` u depsu: sources se mijenja svakim
  // učitavanjem, pa bi efekt s njim u depsu vrtio novi fetch za svaki sloj.
  useEffect(() => {
    if (!sourceKey || requested.current[sourceKey]) return;
    requested.current[sourceKey] = true;
    fetch(v(POSTER_SOURCES[sourceKey]))
      .then((r) => r.json())
      .then((d: PosterCollection) => setSources((prev) => ({ ...prev, [sourceKey]: d })))
      .catch((e: unknown) => {
        requested.current[sourceKey] = false; // dopusti retry na sljedeći render
        console.error("poster source fetch failed", sourceKey, e);
      });
  }, [sourceKey]);

  useEffect(() => {
    const f = POSTER_FONTS.find((x) => x.key === fontKey) ?? POSTER_FONTS[0];
    const family = f.family.includes(",") ? f.family : `"${f.family}"`;
    let live = true;
    // fonts.load() je bitan: fonts.ready čeka samo font koji je NEŠTO već
    // zatražilo, a canvas mjerenje ga samo po sebi ne zatraži.
    Promise.resolve(document.fonts?.load(`600 100px ${family}`))
      .catch(() => undefined)
      .then(() => {
        if (live) setFontReadyKey(fontKey);
      });
    return () => {
      live = false;
    };
  }, [fontKey]);

  const points = useMemo(() => parsePoints(pointsText), [pointsText]);

  // Skup: rasterizacija svakog poligona po 7 kutova. Ovisi SAMO o geometriji,
  // fontu i formatu — ne o paleti, naslovu ni klizaču veličine, pa se ne
  // ponavlja pri svakoj promjeni boje.
  const hasTitle = title.trim().length > 0;
  const layout = useMemo(() => {
    if (!fc || !subject) return null;
    return layoutPoster(fc, subject, formatKey, fontKey, hasTitle, labelScale);
    // fontReadyKey nije pročitan u tijelu, ali mijenja mjere teksta — namjerno
    // je u depsu da se natpisi preračunaju kad font stvarno stigne.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fc, subject, formatKey, fontKey, hasTitle, labelScale, fontReadyKey]);

  // Brojke ispod dropdowna — potvrda da plakat pokriva ono što misliš da
  // pokriva (VG po naseljima je 327 km², po četvrtima 37 km²).
  const stats = useMemo(() => {
    if (!fc || !subject) return null;
    const units = fc.features.filter(
      (f) =>
        ["kvart", "cetvrt", "naselje"].includes(f.properties.razina) &&
        subject.jlsMb.includes(f.properties.jls_maticni_broj) &&
        // Mora zrcaliti filtar iz projectSubject(), inače brojke ispod
        // dropdowna opisuju nešto što plakat ne crta.
        (!subject.unitFilter ||
          (f.properties as unknown as Record<string, unknown>)[subject.unitFilter] === true),
    );
    return {
      n: units.length,
      km2: units.reduce((a, f) => a + (f.properties.area_km2 ?? 0), 0),
      pop: units.reduce((a, f) => a + (f.properties.stanovnistvo ?? 0), 0),
    };
  }, [fc, subject]);

  const svg = useMemo(() => {
    if (!fc) return null;
    if (!subject) return null;
    if (!layout) return null;
    return buildPosterSvg({
      fc,
      subject,
      layout,
      paletteKey,
      fontKey,
      formatKey,
      title,
      subtitle,
      showLabels,
      labelScale,
      points,
      pointColor,
      fontMeasured: fontReadyKey === fontKey,
    });
  }, [fc, subject, layout, fontReadyKey, paletteKey, fontKey, formatKey, title, subtitle, showLabels, labelScale, points, pointColor]);

  const doExport = async (kind: "svg" | "png") => {
    if (!fc || !subject || !layout || exporting) return;
    setExporting(kind);
    try {
      const font = POSTER_FONTS.find((f) => f.key === fontKey) ?? POSTER_FONTS[0];
      const embeddedCss = await fontFaceCss(font);
      const full = buildPosterSvg({
        fc,
        subject,
        layout,
        paletteKey,
        fontKey,
        formatKey,
        title,
        subtitle,
        showLabels,
        labelScale,
        points,
        pointColor,
        fontMeasured: fontReadyKey === fontKey,
        embeddedCss,
      });
      const base = `${subject.slug}-${formatKey}`;
      if (kind === "svg") {
        downloadBlob(new Blob([full], { type: "image/svg+xml" }), `${base}.svg`);
      } else {
        const format = POSTER_FORMATS.find((f) => f.key === formatKey) ?? POSTER_FORMATS[0];
        const pxW = Math.round((format.wCm / 2.54) * 300);
        const pxH = Math.round((format.hCm / 2.54) * 300);
        const blob = await svgToPng(full, pxW, pxH);
        downloadBlob(blob, `${base}-300dpi.png`);
      }
    } catch (e) {
      console.error("Export failed", e);
      alert("Export nije uspio — probaj ponovno (ili SVG umjesto PNG-a).");
    } finally {
      setExporting(null);
    }
  };

  // /poster bez subjekta i nepoznat slug → kanonski URL, da sherani link
  // uvijek pokazuje što prikazuje. replace: ne trujemo back gumb.
  if (!subject) return <Navigate to={`/poster/${DEFAULT_SUBJECT_SLUG}`} replace />;

  const field = "w-full rounded-md border px-2.5 py-1.5 font-mono text-[12px]";
  const fieldStyle = {
    background: "var(--overlay-strong)",
    borderColor: "var(--line)",
    color: "var(--text)",
  } as const;
  const label = "mb-1 mt-3 block font-mono text-[10px] uppercase tracking-wider text-muted";

  return (
    <main className="grid flex-1 overflow-hidden md:grid-cols-[320px_1fr]">
      {/* Kontrole */}
      <aside
        className="overflow-y-auto border-r px-5 py-4"
        style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}
      >
        <div className="flex items-baseline justify-between">
          <h1 className="m-0 font-display text-lg font-semibold text-ink">Poster generator</h1>
          <Link to="/" className="inline-flex items-center gap-1 font-mono text-[11px] text-muted hover:text-ink">
            <ArrowLeft size={13} /> karta
          </Link>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-muted">
          Anatomija grada i kraja — kvartovi, gradske četvrti i naselja kao print-ready
          vektorska karta. Odaberi područje, paletu i tipografiju, dodaj svoje točke, skini
          SVG ili PNG (300 dpi) i nosi u tiskaru.
        </p>

        <label className={label}>Područje</label>
        <select
          className={field}
          style={fieldStyle}
          value={subject.slug}
          onChange={(e) => navigate(`/poster/${e.target.value}`)}
        >
          {POSTER_SUBJECTS.map((c) => (
            <option key={c.slug} value={c.slug}>{c.menuLabel}</option>
          ))}
        </select>
        <p className="mt-1 font-mono text-[10px] text-muted">
          {stats
            ? `${stats.n} ${pluralUnit(stats.n, subject.unit)} · ${stats.km2.toFixed(0)} km²` +
              (stats.pop ? ` · ${stats.pop.toLocaleString("hr-HR")} st.` : "")
            : "učitavam…"}
        </p>

        <label className={label}>Paleta</label>
        <div className="flex flex-col gap-1">
          {POSTER_PALETTES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPaletteKey(p.key)}
              className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left font-mono text-[11px]"
              style={{
                background: "var(--overlay-strong)",
                borderColor: paletteKey === p.key ? "var(--ui-accent)" : "var(--line)",
                color: paletteKey === p.key ? "var(--ui-accent)" : "var(--text)",
              }}
            >
              <span className="flex gap-0.5">
                {p.fills.slice(0, 4).map((f) => (
                  <span key={f} className="inline-block h-3 w-3 rounded-sm" style={{ background: f }} />
                ))}
              </span>
              {p.label}
            </button>
          ))}
        </div>

        <label className={label}>Tipografija</label>
        <select className={field} style={fieldStyle} value={fontKey} onChange={(e) => setFontKey(e.target.value)}>
          {POSTER_FONTS.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>

        <label className={label}>Format</label>
        <select className={field} style={fieldStyle} value={formatKey} onChange={(e) => setFormatKey(e.target.value)}>
          {POSTER_FORMATS.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>

        <label className={label}>Naslov</label>
        <input
          className={field}
          style={fieldStyle}
          value={title}
          onChange={(e) => {
            titleTouched.current = true;
            setTitle(e.target.value);
          }}
        />
        <label className={label}>Podnaslov</label>
        <input className={field} style={fieldStyle} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />

        <label className={label}>Imena ({subject.unit[1]})</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowLabels(!showLabels)}
            className="rounded-md border px-2.5 py-1.5 font-mono text-[11px]"
            style={{
              background: "var(--overlay-strong)",
              borderColor: showLabels ? "var(--ui-accent)" : "var(--line)",
              color: showLabels ? "var(--ui-accent)" : "var(--text)",
            }}
          >
            {showLabels ? "uključena" : "isključena"}
          </button>
          <input
            type="range"
            min={0.5}
            max={1.8}
            step={0.1}
            value={labelScale}
            onChange={(e) => setLabelScale(Number(e.target.value))}
            className="flex-1"
            title="Veličina imena"
          />
        </div>

        <label className={label}>Tvoje točke (lat, lng, naziv — po retku)</label>
        <textarea
          className={field}
          style={{ ...fieldStyle, minHeight: 84 }}
          placeholder={subject.samplePoints}
          value={pointsText}
          onChange={(e) => setPointsText(e.target.value)}
        />
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted">{points.length} točaka · boja</span>
          <input type="color" value={pointColor} onChange={(e) => setPointColor(e.target.value)} />
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={!svg || exporting !== null}
            onClick={() => doExport("svg")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 font-mono text-[12px] font-semibold disabled:opacity-50"
            style={{ background: "var(--ui-accent)", borderColor: "var(--ui-accent)", color: "#fff" }}
          >
            {exporting === "svg" ? "…" : <><Download size={14} /> SVG</>}
          </button>
          <button
            type="button"
            disabled={!svg || exporting !== null}
            onClick={() => doExport("png")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 font-mono text-[12px] font-semibold disabled:opacity-50"
            style={{ background: "var(--overlay-strong)", borderColor: "var(--line)", color: "var(--text)" }}
          >
            {exporting === "png" ? "renderiram…" : <><Download size={14} /> PNG 300 dpi</>}
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-snug text-muted">
          SVG = vektor za tiskare i dizajnere · PNG = 300 dpi raster spreman za print. Izvori:
          {" "}{subject.sources}.
        </p>
      </aside>

      {/* Preview — wheel = zoom, drag = pan */}
      <section
        className="relative flex items-center justify-center overflow-hidden p-6"
        style={{ background: "var(--map-bg)" }}
        onWheel={(e) => {
          e.preventDefault();
          setZoom((z) => Math.min(8, Math.max(1, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
        }}
        onPointerDown={(e) => {
          dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          setPan({
            x: dragRef.current.panX + (e.clientX - dragRef.current.startX),
            y: dragRef.current.panY + (e.clientY - dragRef.current.startY),
          });
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
      >
        {svg ? (
          <div
            className="max-h-full max-w-full shadow-2xl [&>svg]:h-auto [&>svg]:max-h-[calc(100vh-140px)] [&>svg]:w-auto [&>svg]:max-w-full"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center",
              cursor: dragRef.current ? "grabbing" : zoom > 1 ? "grab" : "default",
            }}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="font-mono text-sm text-muted">Učitavam kvartove…</div>
        )}
        {/* Zoom kontrole */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1">
          {[
            { k: "in", label: "Približi", icon: Plus, fn: () => setZoom((z) => Math.min(8, z * 1.4)) },
            { k: "out", label: "Oddalji", icon: Minus, fn: () => setZoom((z) => Math.max(1, z / 1.4)) },
            {
              k: "reset",
              label: "Vrati prikaz",
              icon: Crosshair,
              fn: () => { setZoom(1); setPan({ x: 0, y: 0 }); },
            },
          ].map((b) => (
            <button
              key={b.k}
              type="button"
              onClick={b.fn}
              aria-label={b.label}
              title={b.label}
              className="flex h-8 w-8 items-center justify-center rounded-md border"
              style={{ background: "var(--overlay-strong)", borderColor: "var(--line)", color: "var(--text)" }}
            >
              <b.icon size={15} />
            </button>
          ))}
        </div>
        <div
          className="absolute bottom-4 left-4 font-mono text-[10px]"
          style={{ color: "var(--muted)" }}
        >
          scroll = zoom · povuci = pomak · {Math.round(zoom * 100)}%
        </div>
      </section>
    </main>
  );
}
