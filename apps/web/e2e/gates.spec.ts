import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
 *   the CI artifact, composed into a before|after board against the
 *   committed frozen baseline (tests/baseline/before-<main head>/).
 *
 * Review-state machine (round 4): apps/web/e2e/contact-manifest.json is the
 * committed source of truth. `status` is an enum; `reviewed` additionally
 * requires reviewer, date, the head sha it was reviewed at and the sha256 of
 * the six shots — if head or shots moved since the signature, the inherited
 * state auto-reverts to pending so an old signature can never vouch for new
 * artifacts. `rejected` and `skipped` are visible states but never satisfy
 * the review: the contact test fails on them after writing the artifacts.
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

  // round-4 review-state machine: enum + required fields are validated here,
  // so a hand-edited manifest cannot claim a review it does not describe
  type ReviewState = {
    status: string;
    reviewer: string | null;
    date: string | null;
    head?: string | null;
    shots_sha256?: Record<string, string> | null;
    note?: string;
  };
  const STATUSES = ["pending", "reviewed", "rejected", "skipped"];
  let committed: ReviewState = { status: "pending", reviewer: null, date: null };
  try {
    const raw = JSON.parse(readFileSync(`${e2eDir}/contact-manifest.json`, "utf8"));
    if (raw?.visual_review) committed = raw.visual_review as ReviewState;
  } catch {
    // no committed manifest yet: pending is correct
  }
  if (!STATUSES.includes(committed.status)) {
    throw new Error(`contact-manifest.json: visual_review.status "${committed.status}" is not one of ${STATUSES.join("/")}`);
  }
  if (committed.status === "reviewed") {
    const missing: string[] = [];
    if (!committed.reviewer || typeof committed.reviewer !== "string") missing.push("reviewer");
    if (!committed.date || typeof committed.date !== "string") missing.push("date");
    if (!committed.head || !/^[0-9a-f]{40}$/.test(committed.head)) missing.push("head (40-hex sha)");
    if (!committed.shots_sha256 || shots.some((f) => typeof committed.shots_sha256?.[f] !== "string")) {
      missing.push("shots_sha256 (all six shots)");
    }
    if (missing.length > 0) {
      throw new Error(`contact-manifest.json: status "reviewed" requires ${missing.join(", ")} — an unsigned review is not a review`);
    }
  }

  // binding: a signature only vouches for the exact head and exact shots it
  // names; anything newer auto-reverts to pending in the inherited state
  let effective: ReviewState = committed;
  let revertNote: string | null = null;
  if (committed.status === "reviewed") {
    const drifted: string[] = [];
    if (committed.head !== head) drifted.push(`head ${committed.head!.slice(0, 9)} → ${head.slice(0, 9)}`);
    for (const f of shots) {
      if (committed.shots_sha256![f] !== shotHashes[f]) drifted.push(`shot ${f}`);
    }
    if (drifted.length > 0) {
      effective = {
        status: "pending",
        reviewer: null,
        date: null,
        note: `auto-reverted from "reviewed by ${committed.reviewer} ${committed.date}": ${drifted.join(", ")} changed after the signature`,
      };
      revertNote = effective.note!;
    }
  }
  const reviewLabel = effective.reviewer
    ? `${effective.status} by ${effective.reviewer} ${effective.date ?? ""}`.trim()
    : effective.status;

  // frozen before-baseline: exactly one committed tests/baseline/before-* dir
  const baselineDirs = readdirSync(`${root}/tests/baseline`).filter((d) => d.startsWith("before-"));
  const baselineDir = baselineDirs.length === 1 ? baselineDirs[0] : null;
  const beforeCell = (f: string, w: number) => {
    const p = baselineDir ? `${root}/tests/baseline/${baselineDir}/${f}` : null;
    if (!p || !exists(p)) {
      return `<td style="vertical-align:top;padding:4px"><div style="font:600 12px sans-serif">before: none</div></td>`;
    }
    return `<td style="vertical-align:top;padding:4px"><div style="font:600 12px sans-serif">${f} (before)</div><img src="data:image/png;base64,${readFileSync(p).toString("base64")}" style="width:${w}px;display:block;border:1px solid #ccc"/></td>`;
  };
  const cell = (f: string, w: number) =>
    `<td style="vertical-align:top;padding:4px"><div style="font:600 12px sans-serif">${f} (after)</div><img src="${f}" style="width:${w}px;display:block;border:1px solid #ccc"/></td>`;
  const rows = VIEWPORTS.map(([w, h]) =>
    `<tr><td style="font:700 13px sans-serif">${w}px</td>${beforeCell(`glm-full-${w}x${h}.png`, 300)}${beforeCell(`glm-figure-${w}x${h}.png`, 300)}${cell(`glm-full-${w}x${h}.png`, 300)}${cell(`glm-figure-${w}x${h}.png`, 300)}</tr>`,
  ).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:13px sans-serif;margin:12px;background:#fff}</style></head><body>
<h3>GLM-5.3-Flash review board — before (${baselineDir ?? "none"}) | after at ${head.slice(0, 9)}, at 1440/820/390 (visual_review: ${reviewLabel})</h3>
${revertNote ? `<p style="color:#a00;font:600 12px sans-serif">${revertNote}</p>` : ""}
<table><tr><th></th><th colspan="2">before (frozen baseline)</th><th colspan="2">after (this run)</th></tr><tr><th></th><th>full page</th><th>figure</th><th>full page</th><th>figure</th></tr>${rows}</table>
</body></html>`;
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
        review_satisfied: effective.status === "reviewed",
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

function exists(p: string): boolean {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}
