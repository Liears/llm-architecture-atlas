/**
 * Freeze a "before" visual baseline from a deployed site (#35 round 4).
 *
 * Captures the six contact shots (full page + single figure at 1440/820/390)
 * from a live URL and writes them plus a provenance.json (source URL, main
 * head the deploy corresponds to, capture time, browser version, per-file
 * sha256) into the target directory, e.g. tests/baseline/before-<sha>/.
 * The committed baseline is what the e2e review board puts side by side with
 * the current shots, so a visual regression is visible without re-deriving
 * what "before" meant.
 *
 * Usage: npx tsx scripts/capture-baseline.ts <outDir> <mainHead> [baseUrl]
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(`${root}/apps/web/package.json`);
const { chromium } = require("playwright") as typeof import("playwright");

const [outDir, mainHead, baseUrl = "https://liears.github.io/llm-architecture-atlas"] = process.argv.slice(2);
if (!outDir || !mainHead) throw new Error("usage: capture-baseline.ts <outDir> <mainHead> [baseUrl]");

const ROUTE = "/models/zai-org-glm-5-3-flash/";
const VIEWPORTS: Array<[number, number]> = [
  [1440, 900],
  [820, 1180],
  [390, 844],
];

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const files: string[] = [];
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto(`${baseUrl}${ROUTE}`);
    const figure = page.locator('img[src*="-generated.svg"]');
    await figure.waitFor({ state: "visible", timeout: 30_000 });
    const full = `glm-full-${width}x${height}.png`;
    const fig = `glm-figure-${width}x${height}.png`;
    await page.screenshot({ path: `${outDir}/${full}`, fullPage: true });
    await figure.screenshot({ path: `${outDir}/${fig}` });
    files.push(full, fig);
    console.log(`captured ${full}, ${fig}`);
  }
  const version = browser.version();
  await browser.close();
  const sha = (f: string): string => createHash("sha256").update(readFileSync(`${outDir}/${f}`)).digest("hex");
  const provenance = {
    purpose: "before-baseline for the #35 review board: what the deployed site looked like at the recorded main head",
    source: `${baseUrl}${ROUTE}`,
    mainHead,
    capturedAt: new Date().toISOString(),
    browser: `chromium ${version} (playwright)`,
    viewports: VIEWPORTS.map(([w, h]) => `${w}x${h}`),
    files: Object.fromEntries(files.map((f) => [f, sha(f)])),
  };
  writeFileSync(`${outDir}/provenance.json`, JSON.stringify(provenance, null, 2) + "\n");
  console.log(`wrote ${outDir}/provenance.json (chromium ${version})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
