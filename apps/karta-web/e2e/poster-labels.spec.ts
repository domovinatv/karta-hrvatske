import { test, expect, type Page } from "@playwright/test";

/**
 * Natpis naselja NE SMIJE izaći iz svog poligona.
 *
 * Provjera je nezavisna od koda koji natpise smješta: uzima ono što je
 * stvarno nacrtano (tspan x/y, font-size, rotacija), izmjeri otisak slova
 * canvasom i svaki vrh te kutije testira s SVGGeometryElement.isPointInFill
 * nad poligonom istog naselja (par se poznaje po data-unit).
 *
 * Zašto e2e, a ne unit test: mjere fonta se dobiju tek u pregledniku, a upravo
 * su one bile izvor grešaka — Fraunces je varijabilni font s optičkom osi, pa
 * mu širina po em-u ovisi o veličini na kojoj se crta.
 */

const SVG = ".shadow-2xl > svg";

interface LabelReport {
  total: number;
  outside: { name: string; corners: number; size: number }[];
  minSize: number;
}

async function checkLabels(page: Page): Promise<LabelReport> {
  return page.evaluate((sel) => {
    const svg = document.querySelector(sel) as SVGSVGElement;
    const ctx = document.createElement("canvas").getContext("2d")!;
    const outside: { name: string; corners: number; size: number }[] = [];
    let minSize = Infinity;
    const texts = svg.querySelectorAll<SVGTextElement>("text[data-unit]");
    for (const t of texts) {
      const path = svg.querySelector<SVGPathElement>(
        `path[data-unit="${t.getAttribute("data-unit")}"]`,
      )!;
      const size = Number(t.getAttribute("font-size"));
      const family = t.getAttribute("font-family")!;
      minSize = Math.min(minSize, size);
      ctx.font = `600 ${size}px ${family.includes(",") ? family : `"${family}"`}`;

      const rot = /rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)/.exec(t.getAttribute("transform") || "");
      const a = rot ? (Number(rot[1]) * Math.PI) / 180 : 0;
      const rx = rot ? Number(rot[2]) : 0;
      const ry = rot ? Number(rot[3]) : 0;
      const cos = Math.cos(a);
      const sin = Math.sin(a);

      let bad = 0;
      for (const sp of t.querySelectorAll("tspan")) {
        const x = Number(sp.getAttribute("x"));
        const y = Number(sp.getAttribute("y"));
        const m = ctx.measureText(sp.textContent || "");
        // y je pismovna linija retka (renderer ne koristi dominant-baseline).
        const top = y - m.actualBoundingBoxAscent;
        const bot = y + m.actualBoundingBoxDescent;
        for (const [cx, cy] of [
          [x - m.width / 2, top],
          [x + m.width / 2, top],
          [x + m.width / 2, bot],
          [x - m.width / 2, bot],
        ]) {
          const dx = cx - rx;
          const dy = cy - ry;
          const px = rot ? rx + dx * cos - dy * sin : cx;
          const py = rot ? ry + dx * sin + dy * cos : cy;
          if (!path.isPointInFill(new DOMPoint(px, py))) bad++;
        }
      }
      if (bad) outside.push({ name: t.textContent || "?", corners: bad, size });
    }
    return { total: texts.length, outside, minSize };
  }, SVG);
}

/**
 * Plakat je gotov tek kad su natpisi izmjereni STVARNIM fontom — do tada su
 * mjere zamjenskog fonta i natpisi su privremeno prekrupni. Renderer to javlja
 * kroz data-labels, pa se ne čeka tajmerom.
 */
async function waitForPoster(page: Page) {
  await page.waitForSelector(`${SVG}[data-labels="measured"]`, { timeout: 20000 });
}

async function openPoster(page: Page, slug: string) {
  await page.goto(`/poster/${slug}`);
  await waitForPoster(page);
}

// Turopolje je najgori slučaj (115 naselja, od toga par tankih dijagonalnih),
// Kravarsko je nekad prelijevalo "Barbarići Kravarski" u susjeda. Sisak i
// okolica dodaje drugi oblik problema: posavska naselja uz Savu su uske
// trake okomite na rijeku ("Lijevo Trebarjevo", "Desno Željezno"), pa im
// natpis ovisi o rotaciji, a Grad Sisak se proteže u Lonjsko polje.
for (const slug of ["kravarsko", "velika-gorica", "turopolje", "sisak-okolica"]) {
  test(`plakat ${slug}: nijedan natpis ne izlazi iz poligona`, async ({ page }) => {
    await openPoster(page, slug);
    for (const format of ["kvadrat", "portret", "pejzaz"]) {
      await page.selectOption("select >> nth=2", format);
      await waitForPoster(page);
      const r = await checkLabels(page);
      expect(r.total, `${slug}/${format}: nema natpisa`).toBeGreaterThan(0);
      expect(r.outside, `${slug}/${format} izvan poligona`).toEqual([]);
    }
  });
}

test("svako naselje dobije ime na svim fontovima i veličinama", async ({ page }) => {
  await openPoster(page, "velika-gorica");
  for (const font of ["fraunces", "mono", "sans"]) {
    await page.selectOption("select >> nth=1", font);
    await waitForPoster(page);
    for (const scale of ["0.5", "1", "1.8"]) {
      await page.locator('input[type="range"]').fill(scale);
      await waitForPoster(page);
      const r = await checkLabels(page);
      // 58 naselja Velike Gorice — svako mora biti imenovano.
      expect(r.total, `${font} @ ${scale}`).toBe(58);
      expect(r.outside, `${font} @ ${scale} izvan poligona`).toEqual([]);
    }
  }
});



