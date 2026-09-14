# Design notes: sebastianraschka.com/llm-architecture-gallery

Factual teardown of the reference site (HTML/CSS/JS analysis, no visual rendering),
as of 2026-09-14. Purpose: decide what to adopt for our own gallery front-end.
We only describe behavior here — no assets or code are copied.

## Site type

Single static page, "reference manual" not blog post. Fully client-side: all model
data is inlined in the HTML as `data-*` attributes (generated from the models.yml
export). No backend; filtering/sort/search/compare all run in the browser.

## Page anatomy (top to bottom)

1. Site chrome: auto-hiding header, site-wide search, light/dark theme toggle
   (persisted, `data-theme="dark"`).
2. Hero: two-column intro (`grid-template-columns: minmax(0,.96fr) minmax(20rem,1.04fr)`,
   fluid `clamp()` spacing), responsive hero image with `srcset` (320w/640w webp).
   Action buttons: Browse gallery / Compare two models / Memory calculator / Changes+RSS.
   Counters: "103 models · Sep 10 last updated".
3. Jump nav: anchor link per model. Each link carries the SAME `data-sort-*`,
   `data-company`, `data-decoder-type`, `data-search-text` attributes as its card —
   one set of attributes feeds both the nav list and the card grid.
4. Card grid: 103 cards (see anatomy below).
5. Compare tool (`#architecture-diff-tool`): pick two models into slots A/B.
6. Meta-analysis: aggregate views across the catalog (active-parameter ratio,
   attention-mechanism distribution, …).
7. Changelog subpage with RSS feed ("Changes").

## Card anatomy

- Thumbnail from a separate `thumbnails/` directory (smaller webp), `loading="lazy"`,
  explicit `width`/`height` (no CLS). Clicking opens the FULL image in a native
  `<dialog>` (`data-zoom-src`), which also links to the model's article if one exists.
- Title row: model name + anchor permalink; company as "by Z.ai"; right-aligned
  external links: config.json (HF), License, Tech report (arXiv).
- Fact sheet: collapsible. Default (compact density) shows only `scale` and `date`;
  expanding reveals the rest. Global density switch sets `data-card-expanded` on all
  cards; each card can override.
- Card footer ("card tools"): expand toggle, add-to-compare, details.
- Everything the JS needs is redundant `data-*` on the card element:
  `data-sort-key/label/date/size/aai`, `data-company`, `data-decoder-type`,
  `data-search-text` (lowercased full text), `data-compare-*` (one attribute per
  diffable field: attention, decoder, kv, layer-mix, scale, context, aai, summary).

## Interactions (gallery.js, ~42 KB, no framework)

- Sort: alphabetical / company / release date / size / AAI (pure comparator functions).
- Filter: company, decoder type, date range, size band, AAI — all reading `data-*`.
- Search: client-side substring match against `data-search-text`.
- Density: compact vs detailed (toggles `data-card-expanded`).
- Compare: cards get `data-compare-slot="a"|"b"`; the card border recolors
  (teal `#0f766e` for A, amber `#b45309` for B, muted slate for shared values —
  CSS custom props `--compare-*`).
- Zoom: native `<dialog>` + `cancel` event (Esc works for free), `hydrateFromUrl`
  restores state from the URL.
- Keyboard support is minimal (dialog Esc only). No print stylesheet (`@media print`
  count: 0).

## Visual system

- Palette via CSS custom props: ink `#172033`, muted `#5d6778`, line
  `rgb(145 157 177 / 26%)`, panel `#f7f9fc`, accent teal `#0f766e`, warm `#fff7ed`.
- Cards: 1px translucent border, hover lifts with large soft shadow
  (`0 18px 40px rgb(23 32 51 / 10%)`).
- Dark mode: figures are white-background bitmaps, so the site just applies
  `filter: invert(1)` to architecture images in dark theme.
- Breakpoints: 920 / 720 / 480. Small-caps eyebrows (`0.74rem`, letter-spacing
  `0.08em`, uppercase) for section kickers.

## What to adopt for llm-architecture-atlas

1. Data-driven static generation: models.yml → build step → cards with `data-*`
   attributes; zero backend, one attribute set feeds nav + cards + compare + search.
2. Dual image sources (thumb + full) with lazy loading and explicit dimensions.
3. Collapsed-by-default fact sheets showing only scale/date.
4. Compare-slot semantic colors (A teal / B amber / shared gray).
5. Changelog + RSS so the gallery feels alive between syncs.
6. Their KV-memory calculator is worth reimplementing.

## Where we differ / can do better

- Their figures are raster webp; ours are SVG: theme-aware (no invert(1) hack —
  we can ship real dark tokens in the SVG), infinitely zoomable, diffable, and
  generated from one template + per-model metadata.
- Because figures are generated, cross-model *figure-level* comparison (e.g.
  overlaying two families' layer mixes) is possible for us, not for them.
