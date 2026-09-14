import { expect, test } from "@playwright/test";

test("catalog page renders", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/");
  await expect(page).toHaveTitle(/LLM Architecture Atlas/);
  await expect(page.getByTestId("catalog-count")).toContainText("1 model");
});

test("model page serves the migration-sample figure", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/models/glm-5-3-flash/");
  await expect(page.locator('img[src*="glm-5.3-flash.svg"]')).toBeAttached();
  const res = await page.request.get("/llm-architecture-atlas/figures/glm-5.3-flash.svg");
  expect(res.ok()).toBeTruthy();
  expect(await res.text()).toContain("</svg>");
});

test("model page serves the IR-generated golden figure with evidence links", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/models/glm-5-3-flash/");
  await expect(page.locator('img[src*="glm-5.3-flash-generated.svg"]')).toBeAttached();
  const res = await page.request.get("/llm-architecture-atlas/figures/glm-5.3-flash-generated.svg");
  expect(res.ok()).toBeTruthy();
  const svg = await res.text();
  expect(svg).toContain('data-atlas-model="zai-org/glm-5.3-flash"');
  expect(svg).toContain("data-claim-path"); // every number traces to evidence
  expect(svg).toContain("288 routed"); // MoE info survives generation
  expect(svg).toContain("4 parallel streams"); // mHC info survives generation
});
