import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:5174";

test.beforeEach(async ({ page }) => {
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
