import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { composeBoardHtml } from "./review-board";
import { parseCommittedReview, resolveEffectiveReview, reviewLabel, reviewSatisfied } from "./review-state";

/**
 * Page-level gates (#35):
 * - no whole-page horizontal overflow at the three review viewports;
 * - horizontal scrolling is confined to explicitly marked canvases
 *   ([data-atlas-scroll]); an unmarked overflower fails (round-1 review
 *   false negative: .genome/.evidence-wrap used to overflow silently);
 * - at the desktop default reading state the main figure occupies a
 *   minimum share of the viewport (key-region occupied ratio);
 * - contact sheet: full-page AND single-figure shots at 1440/820/390 for
 *   the CI artifact, composed into a before|after board against the
 *   committed frozen baseline (tests/baseline/before-<main head>/).
 *
 * Review-state machine (round 5, logic in review-state.ts + unit tests):
 * apps/web/e2e/contact-manifest.json is the committed source of truth.
 * `status` is an enum; `reviewed` additionally requires reviewer, date, the
 * head sha of the reviewed run and the sha256 of the six shots. The BINDING
 * is the shot hashes: a signature survives on any later head whose shots
 * regenerate identically, and auto-reverts to pending when any shot hash
 * drifts — binding to head equality instead would be unreachable, because
 * committing the signature itself creates a new head (round-4 review P1).
 * `rejected` and `skipped` are visible states but never satisfy the review:
 * the contact test fails on them after writing the artifacts.
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

test("contact sheet: before|after board + manifest inheriting bound visual_review state", async ({ page }) => {
  const e2eDir = dirname(fileURLToPath(import.meta.url));
  const root = resolve(e2eDir, "../../..");
  const outDir = resolve(e2eDir, "contact");
  mkdirSync(outDir, { recursive: true });
  const shots: string[] = [];
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto("/llm-architecture-atlas/models/zai-org-glm-5-3-flash/");
    const figure = page.locator('img[src*="-generated.svg"]');
    await expect(figure).toBeVisible();
    await page.screenshot({ path: `${outDir}/glm-full-${width}x${height}.png`, fullPage: true });
    await figure.screenshot({ path: `${outDir}/glm-figure-${width}x${height}.png` });
    shots.push(`glm-full-${width}x${height}.png`, `glm-figure-${width}x${height}.png`);
  }
  const sha = (p: string): string => createHash("sha256").update(readFileSync(p)).digest("hex");
  const shotHashes = Object.fromEntries(shots.map((f) => [f, sha(`${outDir}/${f}`)]));
  const head = execSync("git rev-parse HEAD", { cwd: root }).toString().trim();

  // round-5: schema validation and the binding live in review-state.ts (unit
  // tested); a signature vouches for the six shot hashes, head is provenance
  let committedRaw: unknown;
  try {
    committedRaw = JSON.parse(readFileSync(`${e2eDir}/contact-manifest.json`, "utf8"))?.visual_review;
  } catch {
    // no committed manifest yet: pending is correct
  }
  const committed = parseCommittedReview(committedRaw, shots);
  const { effective, revertNote } = resolveEffectiveReview(committed, head, shotHashes);
  const label = reviewLabel(effective);

  // frozen before-baseline: exactly one committed tests/baseline/before-* dir
  const baselineDirs = readdirSync(`${root}/tests/baseline`).filter((d) => d.startsWith("before-"));
  const baselineDir = baselineDirs.length === 1 ? baselineDirs[0] : null;
  const html = composeBoardHtml({
    baselineDir,
    head,
    reviewLabel: label,
    revertNote,
    viewports: VIEWPORTS,
    beforeSrc: (f) => {
      try {
        return `data:image/png;base64,${readFileSync(`${root}/tests/baseline/${baselineDir}/${f}`).toString("base64")}`;
      } catch {
        return null;
      }
    },
  });
  const { createServer } = await import("node:http");
  const srv = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (url === "/" || url === "") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }
    try {
      res.setHeader("content-type", "image/png");
      res.end(readFileSync(`${outDir}${url}`));
    } catch {
      res.statusCode = 404;
      res.end("nf");
    }
  });
  await new Promise((r) => srv.listen(8947, "127.0.0.1", () => r(null)));
  await page.setViewportSize({ width: 1980, height: 1400 });
  await page.goto("http://127.0.0.1:8947/");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/contact-sheet.png`, fullPage: true });
  srv.close();
  writeFileSync(
    `${outDir}/manifest.json`,
    JSON.stringify(
      {
        generatedBy: "apps/web/e2e/gates.spec.ts",
        head,
        shots,
        shots_sha256: shotHashes,
        composed: "contact-sheet.png",
        composed_sha256: sha(`${outDir}/contact-sheet.png`),
        baseline: baselineDir ? { dir: `tests/baseline/${baselineDir}` } : null,
        visual_review: effective,
        review_satisfied: reviewSatisfied(effective),
        binding: "shots_sha256 (head is provenance, not binding — see review-state.ts)",
      },
      null,
      2,
    ) + "\n",
  );
  // rejected/skipped are visible states, never passing ones: the artifacts
  // above are written first so the red run still uploads its evidence
  if (committed.status === "rejected" || committed.status === "skipped") {
    throw new Error(`visual_review status "${committed.status}" never satisfies the #35 review requirement — resolve the rejection or perform the review`);
  }
});
