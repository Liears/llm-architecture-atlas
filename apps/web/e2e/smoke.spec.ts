import { expect, test } from "@playwright/test";

test("catalog renders eight models across both paradigms with filters", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/");
  await expect(page).toHaveTitle(/LLM Architecture Atlas/);
  await expect(page.locator("body[data-atlas-ready]")).toHaveCount(1); // catalog script hydrated
  await expect(page.getByTestId("catalog-list").locator("li:visible")).toHaveCount(8);

  // paradigm filter narrows to System-1 models (Laya + OpenJev)
  await page.click('.ptab[data-paradigm="system_one_decision"]');
  await expect(page.getByTestId("catalog-list").locator("li:visible")).toHaveCount(2);
  await page.click('.ptab[data-paradigm=""]');
  await expect(page.getByTestId("catalog-list").locator("li:visible")).toHaveCount(8);

  // search narrows the visible list
  await page.fill("#q", "kda");
  await expect(page.getByTestId("catalog-list").locator("li:visible")).toHaveCount(2); // GLM + Kimi Linear
  await page.fill("#q", "");

  // family filter
  await page.selectOption("#family", "Llama");
  await expect(page.getByTestId("catalog-list").locator("li:visible")).toHaveCount(1);
});

test("GLM detail page: hierarchy, citation panel, real layer 0/3/4/44 drill-down & URL restore (#34,#36,#37,#38)", async ({
  page,
}) => {
  await page.goto("/llm-architecture-atlas/models/zai-org-glm-5-3-flash/");
  await expect(page.locator('img[src*="-generated.svg"]')).toBeAttached();
  const res = await page.request.get("/llm-architecture-atlas/figures/zai-org-glm-5-3-flash-generated.svg");
  expect(res.ok()).toBeTruthy();
  const svg = await res.text();
  expect(svg).toContain('data-atlas-model="zai-org/glm-5.3-flash"');
  expect(svg).toContain("data-claim-path");
  expect(svg).toContain('viewBox="0 0 1528 850"');
  expect(svg).toContain('data-node-id="moe-routed"');
  expect(svg).toContain("288 · top-8");
  expect(svg).toContain('data-edge-id="mhc-res-in-1"');
  expect(svg).toContain('data-edge-id="mhc-post-4"');
  expect(svg).toContain('data-node-id="dsa-indexer"');
  expect(svg).toContain("K · tail KDA");

  // #38: Citation panel is prominent; raw evidence ledger starts collapsed
  await expect(page.getByTestId("citation-panel")).toBeVisible();
  await expect(page.locator("#evidence-ledger")).not.toHaveAttribute("open", "");
  await page.click('button.fact-btn[data-label="Parameters"]');
  await expect(page.locator("#citation-cards .cit-card").first()).toBeVisible();
  await expect(page.locator("#citation-cards")).toContainText("facts.total_params");

  // Advanced disclosure opens the full evidence table on click
  await page.click("#evidence-ledger summary");
  await expect(page.locator("table.evidence tbody tr").first()).toBeVisible();

  // #38: Evidence manifest download fires cleanly
  const dlPromise = page.waitForEvent("download");
  await page.click("#export-manifest-btn");
  const dl = await dlPromise;
  expect(dl.suggestedFilename()).toBe("zai-org-glm-5-3-flash-evidence-manifest.json");

  // #37: Layer 0 (KDA + Dense) -> Layer 3 (DSA + MoE) -> Layer 4 (KDA + MoE) -> Tail Layer 44
  await page.click('.genome .col[data-layer="0"]');
  await expect(page.getByTestId("subview-stage")).toBeVisible();
  await expect(page.locator("#subview-canvas svg")).toContainText("Dense SwiGLU");
  await expect(page.locator("#subview-canvas svg")).toContainText("ShortConv");

  await page.click('.genome .col[data-layer="3"]');
  await expect(page.locator("#subview-canvas svg")).toContainText("Lightning Indexer");
  await expect(page.locator("#subview-canvas svg")).toContainText("Routed Experts");

  await page.click('.genome .col[data-layer="44"]');
  await expect(page.locator("#subview-canvas svg")).toContainText("Tail");
  expect(page.url()).toContain("layer=44");

  // URL restore across reload + Escape returns cleanly to overview
  await page.reload();
  await expect(page.getByTestId("subview-stage")).toBeVisible();
  await expect(page.locator("#subview-title")).toContainText("Layer 44 Block");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("subview-stage")).toBeHidden();
  await expect(page.locator("#overview-stage")).toBeVisible();
});

test("top navbar Compare link opens a valid comparison route without 404", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/");
  await page.click('.topbar .nav a[data-i18n="nav.compare"]');
  await expect(page.locator("h1")).toContainText("vs");
  await expect(page.locator("table.diff tbody tr")).toHaveCount(5);
});

test("Kimi Linear reuses hybrid KDA + MLA + MoE template without model-id hacks (#39)", async ({ page }) => {
  const svgRes = await page.request.get(
    "/llm-architecture-atlas/figures/moonshotai-kimi-linear-48b-a3b-instruct-generated.svg",
  );
  expect(svgRes.ok()).toBeTruthy();
  const svg = await svgRes.text();
  expect(svg).toContain("Q/K/V ShortConv");
  expect(svg).toContain("KDA Decay Gate");
  expect(svg).toContain("d=128 · o_norm");
  expect(svg).toContain("Latent KV");
  expect(svg).toContain("Shared Expert");
  expect(svg).toContain("1 always-on");
  expect(svg).toContain("Dense→MoE");

  // L0 = KDA + Dense SwiGLU, L26 = Tail MLA + MoE, plus clickable edge citation & ?view=moe alias
  await page.goto("/llm-architecture-atlas/models/moonshotai-kimi-linear-48b-a3b-instruct/?view=block&layer=0");
  await expect(page.locator("#subview-canvas svg")).toContainText("Dense SwiGLU");
  await page.click('.genome .col[data-layer="26"]');
  await expect(page.locator("#subview-canvas svg")).toContainText("Latent KV");
  await expect(page.locator("#subview-canvas svg")).toContainText("256 total");
  await expect(page.locator('#subview-canvas svg path[data-edge-id="e-blk-f-route"]')).toHaveAttribute(
    "data-claim-path",
    "topology.experts.active_routed",
  );
  await page.click('#subview-canvas .hotspot[data-edge-id="e-blk-f-route"]');
  await expect(page.locator("#citation-cards")).toContainText("topology.experts.active_routed");
  const edgeBtnPos = await page
    .locator('#subview-canvas .hotspot[data-edge-id="e-blk-f-route"]')
    .evaluate((el) => getComputedStyle(el).position);
  expect(edgeBtnPos).toBe("absolute");

  // ?view=moe alias opens the MoE/FFN subview (#36, #37) and preserves normalized view=ffn across URL/reload
  await page.goto("/llm-architecture-atlas/models/zai-org-glm-5-3-flash/?view=moe&layer=3");
  await expect(page.getByTestId("subview-stage")).toBeVisible();
  await expect(page.locator("#subview-title")).toContainText("FFN & Expert Routing");
  expect(page.url()).toContain("view=ffn");
  expect(page.url()).toContain("layer=3");
  await page.reload();
  await expect(page.getByTestId("subview-stage")).toBeVisible();
  await expect(page.locator("#subview-title")).toContainText("FFN & Expert Routing");
  expect(page.url()).toContain("view=ffn");
});

test("mobile 390x844 shows readable structured overview cards and >=24px controls (#36)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/llm-architecture-atlas/models/zai-org-glm-5-3-flash/");
  const cards = page.locator(".mobile-cards");
  await expect(cards).toBeVisible();
  await expect(cards).toContainText("Main Execution Spine");
  await expect(cards).toContainText("K,K,K,D");

  const metrics = await page.evaluate(() => {
    const chain = document.querySelector(".spine-chain")!;
    const sched = document.querySelector(".schedule-pills")!;
    const tab = document.querySelector(".vtab")!;
    const col = document.querySelector(".genome .col")!;
    const crumb = document.querySelector(".crumb-back")!;
    const chainBox = chain.getBoundingClientRect();
    const schedBox = sched.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    const colBox = col.getBoundingClientRect();
    const crumbBox = crumb.getBoundingClientRect();
    return {
      fontSize: parseFloat(getComputedStyle(chain).fontSize),
      chainBottom: chainBox.bottom,
      schedBottom: schedBox.bottom,
      tabW: tabBox.width,
      tabH: tabBox.height,
      colW: colBox.width,
      colH: colBox.height,
      crumbH: crumbBox.height,
    };
  });
  expect(metrics.fontSize).toBeGreaterThanOrEqual(12);
  expect(metrics.chainBottom).toBeLessThanOrEqual(844);
  expect(metrics.schedBottom).toBeLessThanOrEqual(844);
  expect(metrics.tabW).toBeGreaterThanOrEqual(24);
  expect(metrics.tabH).toBeGreaterThanOrEqual(24);
  expect(metrics.colW).toBeGreaterThanOrEqual(24);
  expect(metrics.colH).toBeGreaterThanOrEqual(24);
  expect(metrics.crumbH).toBeGreaterThanOrEqual(24);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedScroll = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  expect(reducedScroll).toBe("auto");
});

test("overview edge hotspot and dark-mode contrast meet accessibility guarantees (#36, #38)", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/models/zai-org-glm-5-3-flash/");
  await page.click('.hotspot[data-edge-id="dsa-2"]');
  await expect(page.locator("#citation-cards")).toContainText("topology.attention.dsa_topk");

  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  const darkColors = await page.evaluate(() => {
    const vtab = document.querySelector<HTMLElement>(".vtab.active")!;
    const reportedChip = document.querySelector<HTMLElement>("#citation-cards .chip-reported")!;
    return {
      vtabInk: getComputedStyle(vtab).color,
      chipInk: getComputedStyle(reportedChip).color,
    };
  });
  expect(darkColors.vtabInk).toBe("rgb(11, 18, 32)");
  expect(darkColors.chipInk).toBe("rgb(11, 18, 32)");
});

test("System-1 model pages render decision contract and non-autoregressive SVG plates", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/models/convaiinnovations-laya/");
  await expect(page.locator(".decision-panel")).toBeVisible();
  const layaSvg = await (await page.request.get("/llm-architecture-atlas/figures/convaiinnovations-laya-generated.svg")).text();
  expect(layaSvg).toContain("Bidirectional Encoder");
  expect(layaSvg).toContain("Calibrated Scorer");
  expect(layaSvg).toContain("RLCD Proper Scoring");

  await page.goto("/llm-architecture-atlas/models/openjev-openjev/");
  await expect(page.locator(".decision-panel")).toBeVisible();
  const ojSvg = await (await page.request.get("/llm-architecture-atlas/figures/openjev-openjev-generated.svg")).text();
  expect(ojSvg).toContain("Single-Pass Prefill");
  expect(ojSvg).toContain("Shared Prefix KV");
});

test("language toggle switches to Chinese and persists across catalog, detail, SVG diagrams, and compare", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/");
  await page.click("#lang-toggle");
  await expect(page.locator("h1")).toHaveText("目录");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("html")).toHaveAttribute("data-lang", "zh");
  await expect(page.locator(".site-footer")).toContainText("由可溯源 Architecture IR 编译生成");
  await expect(page.locator("#catalog .pill").first()).toContainText("System-");

  await page.reload();
  await expect(page.locator("h1")).toHaveText("目录");

  // Navigating to detail page keeps Chinese chrome, overview SVG translation & live subview translation
  await page.goto("/llm-architecture-atlas/models/zai-org-glm-5-3-flash/?view=ffn");
  await expect(page.locator("#subview-title")).toHaveText("FFN 与专家路由");
  await expect(page.locator("#subview-canvas svg")).toContainText("路由专家");
  await expect(page.locator("#subview-canvas svg")).toContainText("42 / 45 层");
  await expect(page.locator(".stage-footer")).toContainText("点击架构图中任意模块或连线");

  // Switching to Overview translates the overview diagram cleanly as well
  await page.click('.vtab[data-subview="overview"]');
  await expect
    .poll(async () => {
      const src = await page.locator("#overview-stage img.diagram-img").getAttribute("src");
      return decodeURIComponent(src ?? "");
    })
    .toContain("架构总览");

  // Switching back to English restores canonical EN overview & subviews immediately
  await page.click("#lang-toggle");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#overview-stage img.diagram-img")).toHaveAttribute(
    "src",
    "/llm-architecture-atlas/figures/zai-org-glm-5-3-flash-generated.svg",
  );
  await page.goto("/llm-architecture-atlas/?lang=zh");
  await expect(page.locator("h1")).toHaveText("目录");
  await page.click("#lang-toggle");
  await expect(page.locator("h1")).toHaveText("Catalog");
});

test("theme toggle switches between light and dark", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/");
  await page.click("#theme-toggle");
  const first = await page.locator("html").getAttribute("data-theme");
  expect(["light", "dark"]).toContain(first);
  await page.click("#theme-toggle");
  const second = await page.locator("html").getAttribute("data-theme");
  expect(second).not.toBe(first);
});

test("compare page aligns genomes", async ({ page }) => {
  await page.goto("/llm-architecture-atlas/compare/zai-org-glm-5-3-flash--vs--meta-llama-llama-3-8b/");
  await expect(page.locator("h1")).toContainText("vs");
  await expect(page.locator("table.diff tbody tr")).toHaveCount(5);
  await expect(page.locator(".track")).toHaveCount(2);
  expect(await page.locator('.track .gcell[style*="var(--attention)"]').count()).toBeGreaterThan(0);
  expect(await page.locator('.track .gcell[style*="var(--state)"]').count()).toBeGreaterThan(0);
  expect(await page.locator('.track .gcell.ffn[style*="var(--compute)"]').count()).toBeGreaterThan(0);
});

test("atom feed is served", async ({ request }) => {
  const res = await request.get("/llm-architecture-atlas/changes.xml");
  expect(res.ok()).toBeTruthy();
  expect(await res.text()).toContain("<feed");
});

test("hand-drawn migration sample still served", async ({ request }) => {
  const res = await request.get("/llm-architecture-atlas/figures/glm-5.3-flash.svg");
  expect(res.ok()).toBeTruthy();
});
