import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Page-level gates (#35):
 * - no whole-page horizontal overflow at the three review viewports;
 * - horizontal scrolling is confined to explicitly marked canvases
 *   ([data-atlas-scroll]); an unmarked overflower fails (round-1 review
 *   false negative: .genome/.evidence-wrap used to overflow silently);
 * - at the desktop default reading state the main figure occupies a
 *   minimum share of the viewport (key-region occupied ratio);
 * - contact sheet: full-page AND single-figure shots at 1440/820/390 for
 *   the CI artifact (combined before/after sheet is committed separately).
 *
 * Mobile full-figure readability (effective font ≥12px in the mobile default
 * state) is owned by #36 and tracked in the scene-gate baseline until then.
 */

const ROUTES = [
  "/llm-architecture-atlas/",
  "/llm-architecture-atlas/models/zai-org-glm-5-3-flash/",
  "/llm-architecture-atlas/compare/zai-org-glm-5-3-flash--vs--meta-llama-llama-3-8b/",
];

const VIEWPORTS: Array<[number, number]> = [
  [1440, 900],
  [820, 1180],
  [390, 844],
];

for (const [width, height] of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`no whole-page horizontal overflow ${route} @${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(route);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });

    test(`horizontal scroll confined to marked canvases ${route} @${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(route);
      const unmarked = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of Array.from(document.querySelectorAll("*"))) {
          if (el.scrollWidth <= el.clientWidth + 1) continue;
          if (el.closest("[data-atlas-scroll]")) continue; // marked canvas (or inside one)
          const cls = typeof el.className === "string" ? el.className : "";
          bad.push(`${el.tagName.toLowerCase()}${cls ? "." + cls.split(/\s+/).join(".") : ""} ${el.scrollWidth}->${el.clientWidth}`);
        }
        return bad;
      });
      expect(unmarked).toEqual([]);
    });
  }
}

test("key-region occupied ratio: figure holds the desktop first screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/llm-architecture-atlas/models/zai-org-glm-5-3-flash/");
  const figure = page.locator('img[src*="-generated.svg"]');
  await expect(figure).toBeVisible();
  const box = (await figure.boundingBox())!;
  const ratio = (box.width * box.height) / (1440 * 900);
  // #35 occupied-ratio gate: the overview must be the page's main event at
  // desktop, not a thumbnail. Current composition passes; #38 raises this
  // into a full first-screen hierarchy check.
  expect(ratio).toBeGreaterThanOrEqual(0.2);
});

test("contact sheet: GLM page full-page and figure at the three review viewports", async ({ page }) => {
  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "contact");
  mkdirSync(outDir, { recursive: true });
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto("/llm-architecture-atlas/models/zai-org-glm-5-3-flash/");
    const figure = page.locator('img[src*="-generated.svg"]');
    await expect(figure).toBeVisible();
    await page.screenshot({ path: `${outDir}/glm-full-${width}x${height}.png`, fullPage: true });
    await figure.screenshot({ path: `${outDir}/glm-figure-${width}x${height}.png` });
  }
});
