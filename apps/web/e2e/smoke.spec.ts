import { expect, test } from "@playwright/test";

test("catalog renders six models with filters", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/");
  await expect(page).toHaveTitle(/LLM Architecture Atlas/);
  await expect(page.locator("body[data-atlas-ready]")).toHaveCount(1); // catalog script hydrated
  await expect(page.getByTestId("catalog-list").locator("li:visible")).toHaveCount(6);
  // search narrows the visible list
  await page.fill("#q", "kda");
  await expect(page.getByTestId("catalog-list").locator("li:visible")).toHaveCount(2); // GLM + Kimi Linear
  await page.fill("#q", "");
  // family filter
  await page.selectOption("#family", "Llama");
  await expect(page.getByTestId("catalog-list").locator("li:visible")).toHaveCount(1);
});

test("model page serves the IR-generated golden figure with evidence links", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/models/zai-org-glm-5-3-flash/");
  await expect(page.locator('img[src*="-generated.svg"]')).toBeAttached();
  const res = await page.request.get("/llm-architecture-atlas/figures/zai-org-glm-5-3-flash-generated.svg");
  expect(res.ok()).toBeTruthy();
  const svg = await res.text();
  expect(svg).toContain('data-atlas-model="zai-org/glm-5.3-flash"');
  expect(svg).toContain("data-claim-path"); // every number traces to evidence
  expect(svg).toContain("288 routed"); // MoE info survives generation
  expect(svg).toContain("4 parallel streams"); // mHC info survives generation
  // evidence table lists claims with status chips
  await expect(page.locator("table.evidence tbody tr").first()).toBeVisible();
});

test("compare page aligns genomes", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/compare/zai-org-glm-5-3-flash--vs--meta-llama-llama-3-8b/");
  await expect(page.locator("h1")).toContainText("vs");
  await expect(page.locator("table.diff tbody tr")).toHaveCount(5);
  await expect(page.locator(".track")).toHaveCount(2);
});

test("atom feed is served", async ({ request }) => {
  const res = await request.get("/llm-architecture-atlas/changes.xml");
  expect(res.ok()).toBeTruthy();
  expect(await res.text()).toContain("<feed");
});

test("hand-drawn migration sample still served", async ({ request }) => {
  const res = await request.get("/llm-architecture-atlas/figures/glm-5.3-flash.svg");
  expect(res.ok()).toBeTruthy();
  expect(await res.text()).toContain("</svg>");
});
