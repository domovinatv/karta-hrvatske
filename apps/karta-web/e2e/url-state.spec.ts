import { test, expect, type Page } from "@playwright/test";
import { parseLayers, sceneKey, serializeLayers, writeScene } from "../src/lib/urlState";

// Stanje karte u URL-u (docs/2026-10-30-url-stanje-plan.md): slojevi u `?l=`
// kao diff od defaulta, kamera u `#map=`, raspored ploča ovisi o odabiru.

const BASE = process.env.BASE_URL || "http://localhost:5174";

test.describe("urlState (čiste funkcije)", () => {
  test("prazan l = default; diff pali i gasi", () => {
    const d = parseLayers(null);
    expect(d.showJlsBorders).toBe(true);
    expect(d.showCrkve).toBe(false);
    expect(serializeLayers(d)).toBeNull();

    const f = parseLayers("zupe,CRKVE,-granice-jls,nepostojeci,");
    expect(f.showCrkve).toBe(true);
    expect(f.showZupe).toBe(true);
    expect(f.showJlsBorders).toBe(false);
    // Kanonski redoslijed = registar, ne redoslijed u linku.
    expect(serializeLayers(f)).toBe("-granice-jls,crkve,zupe");
  });

  test("osobne postavke ne idu u URL", () => {
    expect(parseLayers("odabir-jls,fokus").jlsClick).toBeUndefined();
    expect(parseLayers("odabir-jls,fokus").focusMode).toBeUndefined();
  });

  test("writeScene čuva ostale parametre i čitljive zareze", () => {
    const s = writeScene("?c=neka-kampanja&tema=svijetla", {
      layers: parseLayers("crkve,zupe"),
      colorMode: "type",
      theme: "dark",
    });
    expect(s).toBe("?c=neka-kampanja&l=crkve,zupe&boja=tip");
    expect(sceneKey("?l=zupe,crkve&x=1")).toBe("?l=crkve,zupe");
  });
});

async function waitForMap(page: Page) {
  await page.waitForFunction(
    () => {
      const map = (window as unknown as { _gisMap?: import("maplibre-gl").Map })._gisMap;
      if (!map) return false;
      try {
        return map.queryRenderedFeatures({ layers: ["hr-fill"] } as never).length > 0;
      } catch {
        return false;
      }
    },
    { timeout: 15000 },
  );
}

const sw = (page: Page, label: RegExp) =>
  page.locator('[role="switch"]', { hasText: label }).first();

test("link ?l= pali i gasi slojeve", async ({ page }) => {
  await page.goto(BASE + "/?l=crkve,-granice-jls");
  await waitForMap(page);
  await expect(sw(page, /^Crkve/)).toHaveAttribute("aria-checked", "true");
  await expect(sw(page, /Granice JLS/)).toHaveAttribute("aria-checked", "false");
  await expect(sw(page, /Župe/)).toHaveAttribute("aria-checked", "false");
});

test("toggle mijenja ?l= bez novog unosa u povijest", async ({ page }) => {
  await page.goto(BASE + "/");
  await waitForMap(page);
  const len = await page.evaluate(() => history.length);
  await sw(page, /Župe/).click();
  await expect(page).toHaveURL(/[?&]l=zupe/);
  await sw(page, /Granice JLS/).click();
  await expect(page).toHaveURL(/[?&]l=-granice-jls,zupe/);
  expect(await page.evaluate(() => history.length)).toBe(len);
});

test("odabir JLS-a iz pretrage zadržava slojeve; Back vraća početnu", async ({ page }) => {
  await page.goto(BASE + "/?l=crkve");
  await waitForMap(page);
  await expect(page.getByTestId("sidebar-left")).toHaveCount(0);
  await expect(page.getByTestId("sidebar-right")).toHaveCount(0);

  const input = page.getByTestId("floating-search").locator("input");
  await input.fill("Samobor");
  await page.getByTestId("floating-search").getByRole("button", { name: /Samobor/ }).first().click();

  await expect(page).toHaveURL(/\/jls\/samobor\?.*l=[^&#]*crkve/);
  await expect(page.getByTestId("sidebar-left")).toBeVisible();
  await expect(page.getByTestId("sidebar-right")).toBeVisible();
  await expect(page.getByTestId("zup-jls-list")).toContainText("Zagrebačka");

  // Tipkanje u pretragu (≥2 znaka) pali naselja radi pretrage naselja, pa
  // početni unos legitimno nosi i `naselja`; bitno je da crkve ostanu.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`^${BASE}/\\?l=[^#]*crkve`));
  await expect(page.getByTestId("sidebar-right")).toHaveCount(0);
  await expect(sw(page, /^Crkve/)).toHaveAttribute("aria-checked", "true");
});

test("županija iz praznog polja pretrage otvara lijevi popis", async ({ page }) => {
  await page.goto(BASE + "/");
  await waitForMap(page);
  await page.getByTestId("floating-search").locator("input").focus();
  await page.getByTestId("floating-search").getByRole("button", { name: /Istarska/ }).click();
  await expect(page).toHaveURL(/\/zupanija\/istarska/);
  await expect(page.getByTestId("zup-jls-list")).toContainText("Poreč");
  await expect(page.getByTestId("sidebar-right")).toHaveCount(0);

  await page.getByRole("button", { name: "Zatvori županiju" }).click();
  await expect(page).toHaveURL(new RegExp(`^${BASE}/(#.*)?$`));
  await expect(page.getByTestId("sidebar-left")).toHaveCount(0);
});

test("kamera iz #map= pobjeđuje auto-fit deep linka", async ({ page }) => {
  await page.goto(BASE + "/jls/grad-zagreb#map=9.5/45.3/14.4");
  await waitForMap(page);
  await page.waitForTimeout(1200); // fitBounds bi trajao 800 ms
  const cam = await page.evaluate(() => {
    const map = (window as unknown as { _gisMap: import("maplibre-gl").Map })._gisMap;
    return { z: map.getZoom(), lat: map.getCenter().lat, lng: map.getCenter().lng };
  });
  expect(cam.z).toBeCloseTo(9.5, 1);
  expect(cam.lat).toBeCloseTo(45.3, 1);
  expect(cam.lng).toBeCloseTo(14.4, 1);
});

test("Podijeli kopira trenutni URL", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(BASE + "/?l=zupe");
  await waitForMap(page);
  await page.getByTestId("share").click();
  await expect(page.getByTestId("share")).toContainText("Kopirano");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe(page.url());
  expect(clip).toContain("l=zupe");
});
