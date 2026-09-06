import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:5174";

test.beforeEach(async ({ page }) => {
  // Glyph fetchevi (cartocdn/openfreemap) u sandbox okruženju povremeno dođu
  // bez CORS headera → "Failed to fetch" → tile-ovi sa symbol layerima se
  // nikad ne dovrše i layer izgleda "mrtav". Proxy s ACAO headerom to
  // deterministički eliminira (samo u testovima; prod nema taj problem).
  await page.route("**/fonts/**", async (route) => {
    try {
      const resp = await route.fetch();
      await route.fulfill({
        response: resp,
        headers: { ...resp.headers(), "access-control-allow-origin": "*" },
      });
    } catch {
      await route.abort();
    }
  });
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning" || msg.text().includes("[gis-debug]")) {
      console.log(`[browser:${type}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.log(`[browser:pageerror] ${err.message}`);
  });
});

async function waitForMapIdle(page: Page) {
  await page.waitForFunction(
    () => {
      const c = document.querySelector(".maplibregl-canvas") as HTMLCanvasElement | null;
      return c && c.width > 100 && c.height > 100;
    },
    { timeout: 15000 },
  );
  // Wait until the JLS source is loaded AND has features queryable
  await page.waitForFunction(
    () => {
      const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
      const map = w._gisMap;
      if (!map) return false;
      try {
        const feats = map.queryRenderedFeatures({ layers: ["hr-fill"] } as never);
        return feats.length > 0;
      } catch {
        return false;
      }
    },
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
}

// Find a screen point under which there is a JLS feature, by walking a grid
// across the visible canvas. Returns {x,y} or null if no JLS visible.
async function findJlsPoint(page: Page): Promise<{ x: number; y: number; name: string } | null> {
  return await page.evaluate(() => {
    const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
    const map = w._gisMap!;
    const canvas = map.getCanvas();
    const rect = canvas.getBoundingClientRect();
    const steps = 12;
    for (let iy = 1; iy < steps; iy++) {
      for (let ix = 1; ix < steps; ix++) {
        const px = (ix / steps) * rect.width;
        const py = (iy / steps) * rect.height;
        // map.queryRenderedFeatures expects point relative to the map container,
        // which equals canvas inset; box screen point = client + rect.
        const feats = map.queryRenderedFeatures([px, py] as never, {
          layers: ["hr-fill"],
        } as never);
        if (feats.length) {
          return {
            x: rect.left + px,
            y: rect.top + py,
            name: (feats[0].properties as { name: string }).name,
          };
        }
      }
    }
    return null;
  });
}

test("map renders + JLS click selects + URL updates", async ({ page }) => {
  await page.goto(BASE + "/");
  await waitForMapIdle(page);

  const pt = await findJlsPoint(page);
  expect(pt, "no JLS found under any grid point").not.toBeNull();
  console.log("Clicking JLS:", pt);
  await page.mouse.click(pt!.x, pt!.y);

  await expect(page).toHaveURL(/\/jls\/[^/]+/, { timeout: 5000 });
  console.log("After JLS click, URL =", page.url());

  // Verify feature-state selected is set on the clicked feature.
  const selectedExists = await page.evaluate(() => {
    const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
    const map = w._gisMap!;
    // Find any feature with selected feature-state via queryRenderedFeatures
    const all = map.queryRenderedFeatures({ layers: ["hr-fill"] } as never);
    return all.some((f) => {
      const fs = map.getFeatureState({ source: "hr", id: f.id as number });
      return fs.selected === true;
    });
  });
  expect(selectedExists).toBe(true);
});

test("Klubovi toggle loads clubs.geojson and renders markers", async ({ page }) => {
  await page.goto(BASE + "/");
  await waitForMapIdle(page);

  const klubovi = page.locator("button", { hasText: /Klubovi/ }).first();
  await expect(klubovi).toBeVisible();

  const reqPromise = page.waitForRequest((req) => req.url().includes("/data/clubs.geojson"));
  await klubovi.click();
  const req = await reqPromise;
  const resp = await req.response();
  expect(resp?.status()).toBe(200);

  // Wait for the circle layer to be visible AND have features rendered.
  await page.waitForFunction(
    () => {
      const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
      const map = w._gisMap;
      if (!map?.getLayer("hr-clubs-circle")) return false;
      const vis = map.getLayoutProperty("hr-clubs-circle", "visibility");
      if (vis === "none") return false;
      const feats = map.queryRenderedFeatures({ layers: ["hr-clubs-circle"] } as never);
      return feats.length > 0;
    },
    { timeout: 10000 },
  );
  const visibleClubs = await page.evaluate(() => {
    const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
    return w._gisMap!.queryRenderedFeatures({ layers: ["hr-clubs-circle"] } as never).length;
  });
  console.log("Visible club markers:", visibleClubs);
  expect(visibleClubs).toBeGreaterThan(0);
});

test("deep link /klub/dinamo-zagreb opens modal", async ({ page }) => {
  await page.goto(BASE + "/klub/dinamo-zagreb");
  await waitForMapIdle(page);

  const modal = page.locator(".club-modal");
  await expect(modal).toBeVisible({ timeout: 15000 });
  const name = await modal.locator(".cm-name").textContent();
  console.log("Modal opened for:", name);
  expect(name).toMatch(/Dinamo/i);
});

test("deep link /jls/grad-zagreb selects and fits", async ({ page }) => {
  await page.goto(BASE + "/jls/grad-zagreb");
  await waitForMapIdle(page);
  // After deep link, selected feature should exist
  await page.waitForFunction(
    () => {
      const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
      const map = w._gisMap;
      if (!map) return false;
      const all = map.queryRenderedFeatures({ layers: ["hr-fill"] } as never);
      return all.some((f) => {
        const fs = map.getFeatureState({ source: "hr", id: f.id as number });
        return fs.selected === true;
      });
    },
    { timeout: 10000 },
  );
});

test("Igrališta toggle loads pitches and renders at zoom ≥ 9", async ({ page }) => {
  await page.goto(BASE + "/");
  await waitForMapIdle(page);

  // Zoom to a populated area so the minzoom=9 layer renders features.
  await page.evaluate(() => {
    const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
    w._gisMap!.jumpTo({ center: [15.97, 45.81], zoom: 11 });
  });
  await page.waitForTimeout(500);

  const igralista = page.locator("button", { hasText: /Igrališta/ }).first();
  await expect(igralista).toBeVisible();
  const reqPromise = page.waitForRequest((req) => req.url().includes("/data/pitches.geojson"));
  await igralista.click();
  const resp = await (await reqPromise).response();
  expect(resp?.status()).toBe(200);

  await page.waitForFunction(
    () => {
      const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
      const map = w._gisMap;
      if (!map?.getLayer("hr-pitches-circle")) return false;
      return map.queryRenderedFeatures({ layers: ["hr-pitches-circle"] } as never).length > 0;
    },
    { timeout: 10000 },
  );
});

test("Stadioni toggle loads stadiums and renders at HR zoom", async ({ page }) => {
  await page.goto(BASE + "/");
  await waitForMapIdle(page);

  const stadioni = page.locator("button", { hasText: /Stadioni/ }).first();
  const reqPromise = page.waitForRequest((req) => req.url().includes("/data/stadiums.geojson"));
  await stadioni.click();
  const resp = await (await reqPromise).response();
  expect(resp?.status()).toBe(200);

  await page.waitForFunction(
    () => {
      const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
      const map = w._gisMap;
      if (!map?.getLayer("hr-stadiums-circle")) return false;
      return map.queryRenderedFeatures({ layers: ["hr-stadiums-circle"] } as never).length > 0;
    },
    { timeout: 10000 },
  );
});

test("Inkubatori toggle: sloj se učita, renderira i popup otvara", async ({ page }) => {
  await page.goto(BASE + "/");
  await waitForMapIdle(page);

  const btn = page.locator("button", { hasText: /Inkubatori/ }).first();
  const reqPromise = page.waitForRequest((req) => req.url().includes("/data/inkubatori.geojson"));
  await btn.click();
  const resp = await (await reqPromise).response();
  expect(resp?.status()).toBe(200);

  await page.waitForFunction(
    () => {
      const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
      const map = w._gisMap;
      if (!map?.getLayer("hr-inkubatori-circle")) return false;
      return map.queryRenderedFeatures({ layers: ["hr-inkubatori-circle"] } as never).length > 0;
    },
    { timeout: 10000 },
  );

  // Popup mora izdržati `vrste` kao polje objekata: MapLibre ga kroz izraze
  // provuče kao JSON string, pa je ovo test za `normalize()`, ne kozmetika.
  //
  // Isti obrazac kao kod klubova: panel je plutajući dock nad kartom, pa se
  // prvo sklapa, a onda se skoči na točku da krug bude dovoljno velik za
  // pogodak. Klik se računa od bounding recta canvasa, ne od ishodišta stranice.
  await page.locator('button[aria-label="Sklopi panel"]').click();
  await expect(page.getByTestId("layers-panel")).toHaveCount(0);

  const pt = await page.evaluate(async () => {
    const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
    const map = w._gisMap!;
    const feats = map.queryRenderedFeatures({ layers: ["hr-inkubatori-circle"] } as never);
    if (!feats.length) return null;
    const f = feats[0];
    const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    map.jumpTo({ center: coords, zoom: 13 });
    await new Promise((r) => setTimeout(r, 600));
    const px = map.project(coords);
    const rect = map.getCanvas().getBoundingClientRect();
    return {
      x: rect.left + px.x,
      y: rect.top + px.y,
      brand: (f.properties as { brand: string }).brand,
    };
  });
  expect(pt).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y);

  await expect(page.locator(".maplibregl-popup-content .club-popup")).toBeVisible({
    timeout: 5000,
  });
  await expect(page.locator(".club-popup .club-name").first()).toHaveText(pt!.brand);
  // `vrste` je stiglo kao JSON string i mora biti raspakirano u čitljiv niz,
  // a ne ispisano kao `[object Object]`.
  await expect(page.locator(".club-popup .club-league").first()).not.toContainText("object");
});

test("Privatni ekosustav: kurirani sloj se učita i popup nosi oznaku izvora", async ({
  page,
}) => {
  await page.goto(BASE + "/");
  await waitForMapIdle(page);

  const btn = page.locator("button", { hasText: /Privatni ekosustav/ }).first();
  const reqPromise = page.waitForRequest((req) => req.url().includes("/data/ekosustav.geojson"));
  await btn.click();
  expect((await (await reqPromise).response())?.status()).toBe(200);

  await page.waitForFunction(
    () => {
      const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
      const map = w._gisMap;
      if (!map?.getLayer("hr-ekosustav-circle")) return false;
      return map.queryRenderedFeatures({ layers: ["hr-ekosustav-circle"] } as never).length > 0;
    },
    { timeout: 10000 },
  );

  await page.locator('button[aria-label="Sklopi panel"]').click();
  await expect(page.getByTestId("layers-panel")).toHaveCount(0);

  const pt = await page.evaluate(async () => {
    const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
    const map = w._gisMap!;
    const feats = map.queryRenderedFeatures({ layers: ["hr-ekosustav-circle"] } as never);
    if (!feats.length) return null;
    const f = feats[0];
    const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    map.jumpTo({ center: coords, zoom: 13 });
    await new Promise((r) => setTimeout(r, 600));
    const px = map.project(coords);
    const rect = map.getCanvas().getBoundingClientRect();
    return {
      x: rect.left + px.x,
      y: rect.top + px.y,
      brand: (f.properties as { brand: string }).brand,
    };
  });
  expect(pt).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y);

  await expect(page.locator(".maplibregl-popup-content .club-popup")).toBeVisible({
    timeout: 5000,
  });
  await expect(page.locator(".club-popup .club-name").first()).toHaveText(pt!.brand);
  // Provenijencija mora biti vidljiva: ovo nije registar i popup to mora reći.
  await expect(page.locator(".club-popup .club-league").first()).toContainText("kurirano");
});

// Dva sloja u grupi Gospodarstvo drže odvojene izvore i ne smiju se
// preklapati — isti subjekt na obje karte je dvostruko brojanje. Provjeru radi
// i pipeline (33_fetch_ppi_privatni.py izađe s 1), ovo je druga brana.
test("Inkubatori i Privatni ekosustav nemaju zajednički OIB", async ({ page }) => {
  await page.goto(BASE + "/");
  const [a, b] = await Promise.all([
    page.evaluate(() => fetch("/data/inkubatori.geojson").then((r) => r.json())),
    page.evaluate(() => fetch("/data/ekosustav.geojson").then((r) => r.json())),
  ]);
  const oibsA = new Set(
    (a.features as { properties: { oib?: string } }[]).map((f) => f.properties.oib),
  );
  const preklop = (b.features as { properties: { oib?: string; brand: string } }[])
    .filter((f) => oibsA.has(f.properties.oib))
    .map((f) => f.properties.brand);
  expect(preklop).toEqual([]);
});

test("Zračne luke toggle loads airports + runways + approaches", async ({ page }) => {
  await page.goto(BASE + "/");
  await waitForMapIdle(page);

  const airports = page.locator("button", { hasText: /Zračne luke/ }).first();
  await expect(airports).toBeVisible();
  const reqs = Promise.all([
    page.waitForRequest((r) => r.url().includes("/data/airports.geojson")),
    page.waitForRequest((r) => r.url().includes("/data/runways.geojson")),
    page.waitForRequest((r) => r.url().includes("/data/approaches.geojson")),
  ]);
  await airports.click();
  const [aReq, rReq, appReq] = await reqs;
  const statuses = await Promise.all([
    aReq.response().then((r) => r?.status()),
    rReq.response().then((r) => r?.status()),
    appReq.response().then((r) => r?.status()),
  ]);
  expect(statuses).toEqual([200, 200, 200]);

  // Verify all three layers exist + have features rendered
  await page.waitForFunction(
    () => {
      const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
      const map = w._gisMap;
      if (!map) return false;
      const needed = ["hr-airports-circle", "hr-runways-line", "hr-approaches-line"];
      return needed.every((id) => {
        if (!map.getLayer(id)) return false;
        return map.queryRenderedFeatures({ layers: [id] } as never).length > 0;
      });
    },
    { timeout: 10000 },
  );
});

test("klub click activates JLS + opens popup (no modal)", async ({ page }) => {
  await page.goto(BASE + "/");
  await waitForMapIdle(page);

  // Enable Klubovi
  await page.locator("button", { hasText: /Klubovi/ }).first().click();
  await page.waitForFunction(
    () => {
      const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
      const map = w._gisMap;
      if (!map?.getLayer("hr-clubs-circle")) return false;
      return map.queryRenderedFeatures({ layers: ["hr-clubs-circle"] } as never).length > 0;
    },
    { timeout: 10000 },
  );

  // Sklopi panel slojeva prije klika na kartu. Panel je plutajući dock nad
  // kartom, pa marker koji padne ispod njega nije klikabilan — što je i razlog
  // zašto sklapanje postoji. Bez ovoga test ovisi o širini panela.
  await page.locator('button[aria-label="Sklopi panel"]').click();
  await expect(page.getByTestId("layers-panel")).toHaveCount(0);

  // Pick a club, zoom to it (so the circle is large enough to hit), then click.
  const pt = await page.evaluate(async () => {
    const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
    const map = w._gisMap!;
    const feats = map.queryRenderedFeatures({ layers: ["hr-clubs-circle"] } as never);
    if (!feats.length) return null;
    const f = feats[0];
    const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    map.jumpTo({ center: coords, zoom: 13 });
    await new Promise((r) => setTimeout(r, 600));
    const px = map.project(coords);
    const rect = map.getCanvas().getBoundingClientRect();
    return { x: rect.left + px.x, y: rect.top + px.y, slug: (f.properties as { slug: string }).slug };
  });
  expect(pt).not.toBeNull();
  console.log("Clicking club:", pt!.slug, "at", pt!.x, pt!.y);
  await page.mouse.click(pt!.x, pt!.y);

  // Expect popup to appear, modal stays closed
  await expect(page.locator(".maplibregl-popup-content .club-popup")).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".club-modal")).toHaveCount(0);
});

// ─── Panel slojeva: dohvatljivost na niskim viewportima ──────────────────────
//
// Regresija koju ovi testovi čuvaju: panel je bio `absolute right-4 top-4` bez
// max-heighta i bez overflowa, pa su s 18 kontrola donje tipke ispadale ispod
// ruba ekrana i bile potpuno nedohvatljive. Mobilni popover je uz to imao i
// auto-close nakon svakog toggla.

test("desktop: zadnja kontrola u panelu dohvatljiva na niskom viewportu", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 620 });
  await page.goto(BASE + "/");
  await waitForMapIdle(page);

  // Panel mora skrolati unutar sebe, a ne rasti preko dna prozora.
  const panel = page.getByTestId("layers-panel");
  const fit = page.locator("button", { hasText: /Fit Hrvatska/ }).first();

  await fit.scrollIntoViewIfNeeded();
  await expect(fit).toBeInViewport();
  await fit.click();

  // Kamera se stvarno vraća na cijelu Hrvatsku (prije je reset() samo brisao
  // selekciju — HR_BOUNDS se koristio isključivo pri inicijalizaciji karte).
  await page.waitForTimeout(1200);
  const zoom = await page.evaluate(() => {
    const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
    return w._gisMap!.getZoom();
  });
  expect(zoom).toBeLessThan(9);
  await expect(panel).toBeVisible();
});

test("Zagreb otvoreni podaci: filtar po skupini, popup, poveznica na izvor", async ({ page }) => {
  await page.goto(BASE + "/");
  await waitForMapIdle(page);

  // Šest prekidača dijeli JEDNU datoteku. Prvi klik je mora dohvatiti,
  // drugi (druga skupina) NE SMIJE ponovno — inače je hook napravio šest
  // izvora umjesto jednog filtra.
  let fetcheva = 0;
  page.on("request", (req) => {
    if (req.url().includes("/data/zagreb-sadrzaji.geojson")) fetcheva++;
  });

  const obrazovanje = page.locator("button", { hasText: /ZG odgoj i obrazovanje/ }).first();
  await obrazovanje.scrollIntoViewIfNeeded();
  const reqPromise = page.waitForRequest((req) =>
    req.url().includes("/data/zagreb-sadrzaji.geojson"),
  );
  await obrazovanje.click();
  const resp = await (await reqPromise).response();
  expect(resp?.status()).toBe(200);

  await page.waitForFunction(
    () => {
      const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
      const map = w._gisMap;
      if (!map?.getLayer("hr-zg-sadrzaji-circle")) return false;
      return map.queryRenderedFeatures({ layers: ["hr-zg-sadrzaji-circle"] } as never).length > 0;
    },
    { timeout: 15000 },
  );

  // Upaljena je samo jedna skupina — ništa drugo se ne smije crtati.
  const skupine = await page.evaluate(() => {
    const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
    const map = w._gisMap!;
    map.jumpTo({ center: [15.98, 45.81], zoom: 12 });
    return map
      .queryRenderedFeatures({ layers: ["hr-zg-sadrzaji-circle"] } as never)
      .map((f) => (f.properties as { skupina: string }).skupina);
  });
  expect(skupine.length).toBeGreaterThan(0);
  expect([...new Set(skupine)]).toEqual(["obrazovanje"]);

  await page.locator("button", { hasText: /ZG otpad/ }).first().click();
  await page.waitForFunction(
    () => {
      const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
      const map = w._gisMap!;
      const s = map
        .queryRenderedFeatures({ layers: ["hr-zg-sadrzaji-circle"] } as never)
        .map((f) => (f.properties as { skupina: string }).skupina);
      return new Set(s).size === 2;
    },
    { timeout: 10000 },
  );
  expect(fetcheva, "druga skupina je ponovno dohvatila istu datoteku").toBe(1);

  await page.locator('button[aria-label="Sklopi panel"]').click();
  await expect(page.getByTestId("layers-panel")).toHaveCount(0);

  const pt = await page.evaluate(async () => {
    const w = window as unknown as { _gisMap?: import("maplibre-gl").Map };
    const map = w._gisMap!;
    const feats = map.queryRenderedFeatures({ layers: ["hr-zg-sadrzaji-circle"] } as never);
    if (!feats.length) return null;
    const f = feats[0];
    const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    map.jumpTo({ center: coords, zoom: 16 });
    await new Promise((r) => setTimeout(r, 600));
    const px = map.project(coords);
    const rect = map.getCanvas().getBoundingClientRect();
    const p = f.properties as { naziv: string; dataset: string };
    return { x: rect.left + px.x, y: rect.top + px.y, naziv: p.naziv, dataset: p.dataset };
  });
  expect(pt).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y);

  const popup = page.locator(".maplibregl-popup-content .club-popup");
  await expect(popup).toBeVisible({ timeout: 5000 });
  await expect(popup.locator(".club-name").first()).toHaveText(pt!.naziv);
  // `detalji` je ugniježđeni objekt — MapLibre ga provuče kao JSON string.
  // Ako se ne raspakira, popup ispiše `[object Object]`.
  await expect(popup).not.toContainText("object Object");
  await expect(
    popup.locator(`a[href="https://data.zagreb.hr/dataset/${pt!.dataset}"]`),
  ).toHaveCount(1);
});

test("desktop: svaka kontrola iz registra je dohvatljiva klikom", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(BASE + "/");
  await waitForMapIdle(page);

  for (const label of ["Ortofoto", "Naselja", "Crkve", "Biskupije", "Inkubatori", "Privatni ekosustav", "ZG kretanje gradom", "Zračne luke"]) {
    const btn = page.locator("button", { hasText: new RegExp(label) }).first();
    await btn.scrollIntoViewIfNeeded();
    await expect(btn, `kontrola "${label}" nije u viewportu`).toBeInViewport();
  }
});

test("mobile: sheet slojeva skrola i ostaje otvoren nakon toggla", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto(BASE + "/");
  await waitForMapIdle(page);

  await page.locator('button[aria-label="Slojevi"]').click();
  const sheet = page.locator('div[role="dialog"][aria-label="Slojevi"]');
  await expect(sheet).toBeVisible();

  // Sheet ne smije biti viši od 72dvh — inače je opet izvan ekrana.
  const box = await sheet.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(667 * 0.75);

  const crkve = sheet.locator('[role="switch"]', { hasText: /Crkve/ }).first();
  await crkve.scrollIntoViewIfNeeded();
  await crkve.click();

  // Ključno: prije se popover zatvarao nakon SVAKOG toggla.
  await expect(sheet).toBeVisible();
  await expect(crkve).toHaveAttribute("aria-checked", "true");

  // Brojač aktivnih slojeva na FAB-u se osvježava.
  await expect(page.locator('button[aria-label="Slojevi"]')).toContainText("1");
});

test("tipkovničke kratice stvarno rade (i ne otimaju tipkanje u pretragu)", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(BASE + "/");
  await waitForMapIdle(page);

  // Ciljamo role=switch, ne "button": naslov grupe "Naselja i kvartovi" je i sam
  // <button>, pa bi ga hasText:/^Naselja/ uhvatio prije reda samog sloja.
  const orto = page.locator('[role="switch"]', { hasText: /Ortofoto/ }).first();
  await expect(orto).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("s");
  await expect(orto).toHaveAttribute("aria-checked", "true");

  // Tipkanje u pretragu ne smije prebacivati slojeve.
  const search = page.locator('input[placeholder*="Traži"]').first();
  await search.fill("split");
  await expect(orto).toHaveAttribute("aria-checked", "true");
  const naselja = page.locator('[role="switch"]', { hasText: /Naselja/ }).first();
  const before = await naselja.getAttribute("aria-checked");
  await search.press("n");
  await expect(naselja).toHaveAttribute("aria-checked", before!);
});
