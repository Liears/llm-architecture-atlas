import { expect, test } from "@playwright/test";

test("catalog page renders", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/");
  await expect(page).toHaveTitle(/LLM Architecture Atlas/);
  await expect(page.getByTestId("catalog-count")).toContainText("1 model");
});

test("model page serves the migration-sample figure", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/models/glm-5-3-flash/");
  await expect(page.locator('object[data*="glm-5.3-flash.svg"]')).toBeAttached();
  const res = await page.request.get("/llm-architecture-atlas/figures/glm-5.3-flash.svg");
  expect(res.ok()).toBeTruthy();
  expect(await res.text()).toContain("</svg>");
});
