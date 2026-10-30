import { test, expect, type Page } from "@playwright/test";

// Pretraga kroz sve slojeve (src/search/, docs/2026-10-30-trazilica.md).
// Indeks se gradi u Web Workeru nad pravim public/data/search-index.json,
// pa test pokriva cijeli lanac: dohvat → MiniSearch → tumačenje → odabir.

const BASE = process.env.BASE_URL || "http://localhost:5174";

async function openSearch(page: Page) {
  await page.goto(BASE + "/");
  await page.waitForFunction(() => !!(window as unknown as { _gisMap?: unknown })._gisMap, null, {
    timeout: 15000,
  });
  return page.getByTestId("floating-search").getByRole("textbox", { name: "Pretraga karte" });
}

test("CroAI: „ai zdravstvo u zagrebu“ tumači upit i nalazi firme", async ({ page }) => {
  const input = await openSearch(page);
  await input.fill("ai zdravstvo u zagrebu");
  const interp = page.getByTestId("search-interp");
  await expect(interp).toContainText("AI", { timeout: 15000 });
  await expect(interp).toContainText("zdravstvo");
  await expect(interp).toContainText("u: Grad Zagreb");
  const opts = page.getByRole("option");
  await expect(opts.first()).toContainText("CroAI");
  expect(await opts.count()).toBeGreaterThan(3);
});

test("odabir CroAI firme pali sloj i otvara njezin popup", async ({ page }) => {
  const input = await openSearch(page);
  await input.fill("bellabeat");
  const first = page.getByRole("option").first();
  await expect(first).toContainText("Bellabeat", { timeout: 15000 });
  await first.click();
  const sw = page.locator('[role="switch"]', { hasText: /AI ekosustav/ }).first();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".maplibregl-popup")).toContainText(/bellabeat/i, { timeout: 20000 });
});

test("bez dijakritika i dvojezični nazivi: „porec“ → Grad Poreč - Parenzo prvi", async ({ page }) => {
  const input = await openSearch(page);
  await input.fill("porec");
  const first = page.getByRole("option").first();
  await expect(first).toContainText("Poreč - Parenzo", { timeout: 15000 });
  await expect(first).toContainText("Grad / općina");
});

test("„Prikaži sve na karti“ crta sloj isticanja", async ({ page }) => {
  const input = await openSearch(page);
  await input.fill("AI startupi Split");
  await page.getByTestId("search-show-all").click({ timeout: 15000 });
  await page.waitForFunction(() => {
    const m = (window as unknown as { _gisMap?: import("maplibre-gl").Map })._gisMap;
    return !!m?.getLayer("hr-search-hits-halo");
  });
});
