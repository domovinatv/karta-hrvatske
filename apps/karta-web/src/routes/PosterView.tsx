import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { v } from "@/lib/version";
import {
  POSTER_CITIES,
  POSTER_FONTS,
  POSTER_FORMATS,
  POSTER_PALETTES,
  downloadBlob,
  fontFaceCss,
  labelColorFor,
  parsePoints,
  projectCity,
  svgToPng,
  type PosterPoint,
} from "@/lib/poster";
import type { KvartCollection } from "@/lib/types";
import { ArrowLeft, Crosshair, Download, Minus, Plus } from "lucide-react";

// Piksela po centimetru u SVG koordinatnom sustavu (preview/viewBox skala).
// PNG export skalira na 300 DPI neovisno o ovome.
const PX_PER_CM = 10;

interface BuildOpts {
  fc: KvartCollection;
  cityKey: string;
  paletteKey: string;
  fontKey: string;
  formatKey: string;
  title: string;
  subtitle: string;
  showLabels: boolean;
  labelScale: number;
  points: PosterPoint[];
  pointColor: string;
  /** Embedani @font-face CSS (samo za export; preview koristi web fontove). */
  embeddedCss?: string;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function buildPosterSvg(o: BuildOpts): string {
  const city = POSTER_CITIES.find((c) => c.key === o.cityKey) ?? POSTER_CITIES[0];
  const palette = POSTER_PALETTES.find((p) => p.key === o.paletteKey) ?? POSTER_PALETTES[0];
  const font = POSTER_FONTS.find((f) => f.key === o.fontKey) ?? POSTER_FONTS[0];
  const format = POSTER_FORMATS.find((f) => f.key === o.formatKey) ?? POSTER_FORMATS[0];

  const W = format.wCm * PX_PER_CM;
  const H = format.hCm * PX_PER_CM;
  const margin = W * 0.06;
  const hasTitle = o.title.trim().length > 0;
  const titleBlockH = hasTitle ? H * 0.13 : H * 0.03;
  const mapX = margin;
  const mapY = hasTitle ? titleBlockH : margin;
  const mapW = W - margin * 2;
  const mapH = H - mapY - margin * 1.4;

  const projected = projectCity(o.fc, city.jlsMb, mapW, mapH);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
  );
  if (o.embeddedCss) parts.push(`<style>${o.embeddedCss}</style>`);
  parts.push(`<rect width="${W}" height="${H}" fill="${palette.bg}"/>`);

  // Naslov + podnaslov.
  if (hasTitle) {
    const titleSize = Math.min(W * 0.09, titleBlockH * 0.52);
    parts.push(
      `<text x="${W / 2}" y="${titleBlockH * 0.52}" text-anchor="middle" font-family="${esc(
        font.family,
      )}" font-weight="800" font-size="${titleSize.toFixed(1)}" letter-spacing="${(
        titleSize * 0.12
      ).toFixed(1)}" fill="${palette.title}">${esc(o.title.toUpperCase())}</text>`,
    );
    if (o.subtitle.trim()) {
      parts.push(
        `<text x="${W / 2}" y="${(titleBlockH * 0.78).toFixed(1)}" text-anchor="middle" font-family="${esc(
          font.family,
        )}" font-weight="600" font-size="${(titleSize * 0.22).toFixed(1)}" letter-spacing="${(
          titleSize * 0.06
        ).toFixed(1)}" fill="${palette.text}">${esc(o.subtitle.toUpperCase())}</text>`,
      );
    }
  }

  // Kvartovi.
  parts.push(`<g transform="translate(${mapX} ${mapY})">`);
  for (const k of projected.kvarts) {
    const fill = palette.fills[k.paletteIdx % palette.fills.length];
    parts.push(
      `<path d="${k.d}" fill="${fill}" stroke="${palette.stroke}" stroke-width="1.2" stroke-linejoin="round"/>`,
    );
  }
  if (o.showLabels) {
    const CHAR_W = 0.6; // širina znaka ≈ 0.6 × font-size
    const LINE_H = 1.15;
    const MARGIN = 0.05; // 5% margina unutar bboxa poligona
    for (const k of projected.kvarts) {
      const fill = palette.fills[k.paletteIdx % palette.fills.length];
      const color = labelColorFor(fill, palette); // kontrast prema svjetlini filla
      const maxW = k.bw * (1 - 2 * MARGIN);
      const maxH = k.bh * (1 - 2 * MARGIN);
      const cap = Math.max(4.5, Math.min(16, Math.sqrt(k.areaPx) * 0.15)) * o.labelScale;

      // Kandidat layouti: jedan redak, ili balansirani lom u 2 retka —
      // biramo onaj koji dopušta najveći font unutar bboxa.
      const words = k.name.split(" ");
      const layouts: string[][] = [[k.name]];
      if (words.length > 1) {
        let best: string[] | null = null;
        let bestLen = Infinity;
        for (let i = 1; i < words.length; i++) {
          const a = words.slice(0, i).join(" ");
          const b = words.slice(i).join(" ");
          const len = Math.max(a.length, b.length);
          if (len < bestLen) {
            bestLen = len;
            best = [a, b];
          }
        }
        if (best) layouts.push(best);
      }

      let lines: string[] = layouts[0];
      let size = 0;
      for (const cand of layouts) {
        const maxLen = Math.max(...cand.map((l) => l.length));
        const fit = Math.min(cap, maxW / (maxLen * CHAR_W), maxH / (cand.length * LINE_H));
        if (fit > size) {
          size = fit;
          lines = cand;
        }
      }
      if (size < 2.6) continue; // ispod ovoga je nečitljivo i na printu

      // Clamp: text box (centriran) mora ostati unutar bboxa s marginom.
      const textW = Math.max(...lines.map((l) => l.length)) * CHAR_W * size;
      const textH = lines.length * LINE_H * size;
      const clamp = (v: number, lo: number, hi: number) =>
        hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
      const x = clamp(k.cx, k.bx + k.bw * MARGIN + textW / 2, k.bx + k.bw * (1 - MARGIN) - textW / 2);
      const y = clamp(k.cy, k.by + k.bh * MARGIN + textH / 2, k.by + k.bh * (1 - MARGIN) - textH / 2);

      const spans = lines
        .map(
          (l, i) =>
            `<tspan x="${x.toFixed(1)}" y="${(y + (i - (lines.length - 1) / 2) * LINE_H * size).toFixed(1)}">${esc(l)}</tspan>`,
        )
        .join("");
      parts.push(
        `<text text-anchor="middle" dominant-baseline="middle" font-family="${esc(
          font.family,
        )}" font-weight="600" font-size="${size.toFixed(1)}" fill="${color}" opacity="0.95">${spans}</text>`,
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
    )}" font-size="${(W * 0.011).toFixed(1)}" fill="${palette.text}" opacity="0.55">gis.domovina.ai · podaci: data.zagreb.hr (OD) · © OpenStreetMap (ODbL)</text>`,
  );
  parts.push(`</svg>`);
  return parts.join("");
}

export default function PosterView() {
  const [fc, setFc] = useState<KvartCollection | null>(null);
  const [cityKey, setCityKey] = useState("zagreb");
  const [paletteKey, setPaletteKey] = useState("retro");
  const [fontKey, setFontKey] = useState("fraunces");
  const [formatKey, setFormatKey] = useState("kvadrat");
  const [title, setTitle] = useState("Zagreb");
  const [subtitle, setSubtitle] = useState("anatomija grada · kvartovi");
  const [showLabels, setShowLabels] = useState(true);
  const [labelScale, setLabelScale] = useState(1);
  const [pointsText, setPointsText] = useState("");
  const [pointColor, setPointColor] = useState("#c8102e");
  const [exporting, setExporting] = useState<string | null>(null);
  const titleTouched = useRef(false);
  // Preview zoom/pan — čisti CSS transform, ne dira SVG ni export.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    document.title = "Poster generator — anatomija grada · DOMOVINA Karta";
  }, []);

  useEffect(() => {
    fetch(v("/data/kvartovi-kolokvijalni.geojson"))
      .then((r) => r.json())
      .then((d: KvartCollection) => setFc(d))
      .catch((e: unknown) => console.error("kvartovi fetch failed", e));
  }, []);

  // Promjena grada mijenja default naslov dok ga korisnik ne dira.
  const onCityChange = (key: string) => {
    setCityKey(key);
    if (!titleTouched.current) {
      setTitle(POSTER_CITIES.find((c) => c.key === key)?.label ?? key);
    }
  };

  const points = useMemo(() => parsePoints(pointsText), [pointsText]);

  const svg = useMemo(() => {
    if (!fc) return null;
    return buildPosterSvg({
      fc,
      cityKey,
      paletteKey,
      fontKey,
      formatKey,
      title,
      subtitle,
      showLabels,
      labelScale,
      points,
      pointColor,
    });
  }, [fc, cityKey, paletteKey, fontKey, formatKey, title, subtitle, showLabels, labelScale, points, pointColor]);

  const doExport = async (kind: "svg" | "png") => {
    if (!fc || exporting) return;
    setExporting(kind);
    try {
      const font = POSTER_FONTS.find((f) => f.key === fontKey) ?? POSTER_FONTS[0];
      const embeddedCss = await fontFaceCss(font);
      const full = buildPosterSvg({
        fc,
        cityKey,
        paletteKey,
        fontKey,
        formatKey,
        title,
        subtitle,
        showLabels,
        labelScale,
        points,
        pointColor,
        embeddedCss,
      });
      const base = `${cityKey}-kvartovi-${formatKey}`;
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
          Anatomija grada — kvartovi kao print-ready vektorska karta. Odaberi grad, paletu i
          tipografiju, dodaj svoje točke, skini SVG ili PNG (300 dpi) i nosi u tiskaru.
        </p>

        <label className={label}>Grad</label>
        <select className={field} style={fieldStyle} value={cityKey} onChange={(e) => onCityChange(e.target.value)}>
          {POSTER_CITIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>

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

        <label className={label}>Imena kvartova</label>
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
          placeholder={"45.807, 15.967, Moj ured\n45.796, 15.937, Podružnica Jarun"}
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
          data.zagreb.hr (Otvorena dozvola), OpenStreetMap (ODbL).
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
