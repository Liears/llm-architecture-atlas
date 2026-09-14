# tests/

- `fixtures/` — golden IR + DiagramScene snapshots (per model)
- `structural/` — node/edge/port/count assertions against golden fixtures
- `visual/` — Playwright screenshot baselines across 3 viewports (issue #7)

Visual baselines are generated on CI with pinned fonts and browser version;
local regeneration must go through the documented script (added with issue #7).
