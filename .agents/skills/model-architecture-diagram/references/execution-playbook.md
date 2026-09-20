---
type: concept
title: Model diagram execution playbook
created: 2026-09-20
updated: 2026-09-20
---

# Model diagram execution playbook

## Choose the path before editing

| Situation | Path |
|---|---|
| Standard Transformer with no explanatory mechanism expansion | Generic compiler plus bounded layout correction |
| Multiple mechanisms, residual streams, selector paths, MoE routing, or a generic result that misses readability gates | Model-specific semantic compiler plus editorial poster blueprint |
| Existing canonical scene and a visual-debt task | Geometry-only: freeze semantics, then edit ports, blueprint, routes and visual tokens only |
| A source fact or topology changed | Semantic-change: update brief/evidence/IR and mutation tests before composition |

Do not select the editorial poster path merely because another model used it.

## Deterministic loop

1. Copy `assets/diagram-task.template.md` into the issue/PR notes and fill every input.
2. Validate briefs with `pnpm pytest tools/ingest/tests/test_briefs.py`.
3. For geometry-only work, freeze the normalized semantic graph:

   `pnpm tsx .agents/skills/model-architecture-diagram/scripts/check-model.ts --model <id> --write-freeze .tmp/<slug>.freeze.json`

4. Make semantic changes first. Run focused mutation tests until they fail on each required corruption and pass on the canonical input.
5. Make at most two complete composition passes. A pass means edit, render, and run the whole model check—not one coordinate tweak.
6. Require a publication-ready model to report zero debt:

   `pnpm tsx .agents/skills/model-architecture-diagram/scripts/check-model.ts --model <id> --require-zero-debt`

7. For geometry-only work, add `--compare-freeze .tmp/<slug>.freeze.json` to prove the normalized graph did not change.
8. Run `pnpm export:golden`, `pnpm test`, `pnpm typecheck`, and the repository browser/e2e command. Review isolated SVG, real page and contact sheet.
9. Open a PR with `Refs #N` and `review pending`. The implementation author stops there.

The checker validates the brief's presence, scene/evidence coverage, hard and debt gates, deterministic positioned/SVG hashes, and an optional normalized semantic freeze. It intentionally ignores named-port changes in the freeze while preserving node, edge, group, stream and claim identity.

## Stop conditions

- Source red: a displayed claim lacks an immutable source, locator, or evidence binding.
- Semantic red: scene, projection, stream, coverage, or mutation validation fails.
- Geometry red: hard findings remain after two full composition passes; preserve the failure artifacts.
- Publication red: a new or redrawn target has any debt finding. Do not update the baseline to make it green.
- Browser red: required viewport, type size, overflow, reading order, or theme inspection fails.
- Review red: image hashes changed and independent review is absent or stale.
