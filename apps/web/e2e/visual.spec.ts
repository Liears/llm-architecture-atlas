import { expect, test } from "@playwright/test";

/**
 * Visual regression (issue #7): the generated golden figure is screenshotted
 * at three viewports against committed baselines. Update flow:
 *
 *     pnpm --filter @atlas/web test:e2e -- --update-snapshots
 *     # review the diffs, commit the baselines
 */

const VIEWPORTS: Array<[number, number]> = [
  [1440, 900],
  [820, 1180],
  [390, 844],
];

for (const [width, height] of VIEWPORTS) {
  test(`golden figure visual regression @${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/llm-architecture-atlas/models/glm-5-3-flash/");
    const figure = page.locator('img[src*="glm-5.3-flash-generated.svg"]');
    await expect(figure).toBeVisible();
    await expect(figure).toHaveScreenshot(`golden-figure-${width}x${height}.png`, {
      maxDiffPixelRatio: 0.05,
      animations: "disabled",
    });
  });
}
