# GLM-5.3-Flash composition candidates — rubric scoring (plan §3.4)

Input: the SAME frozen, reviewed source brief — `models/zai-org/glm-5-3-flash/main/`
(architecture.json @ revision f93128cf + evidence.json). The generator
(`render-candidates.ts`) asserts every drawn number against the pinned config
and the publishable evidence claims before emitting anything; candidates vary
composition, spacing, typography, shape and color tokens only.

Outputs: `candidate-a.svg|png`, `candidate-b.svg|png`, `candidate-c.svg|png`.
Status: prototype / review material. Not the canonical artifact; the canonical
chain remains Architecture IR → Diagram IR → constrained layout → semantic SVG.

## Rubric (review order; a fail eliminates)

| # | Criterion | A · paper-editorial | B · engineering-blueprint | C · atlas-native |
|---|---|---|---|---|
| 1 | Structural fidelity vs brief | pass (all facts, schedule, ⊕, zoom cards, 4 streams) | pass | pass |
| 2 | Reading hierarchy (spine / pattern / inset) | pass — filled gray 45× container + filled blue unit block make the repeat unit immediate | pass but weak — outline-only container and block flatten the nesting | pass — pastel unit block reads, container/block contrast lower than A |
| 3 | Line discrimination (data / residual / callout) | pass — solid vs dotted vs blue; flow and callout both dark-ish | pass, best — cyan flow / amber dashed callout / teal stream are hue-separated | pass — ink flow / gray dashed callout / teal stream |
| 4 | Layout quality (whitespace, alignment, density, type scale) | pass — strongest figure/ground; margin notes at target height, orthogonal callouts | pass with penalty — background grid adds noise behind 12–13px text at print/mobile sizes | pass — clean, slightly flatter than A |
| 5 | Responsive potential (splits into mobile reading states) | pass — spine column + card column stack naturally | pass with penalty — dark-only reading, grid pointless on 390px | pass — same split as A |

## Verdict

- **Eliminated: B** at criteria 4–5 (grid noise at small type sizes, dark-only
  reading). Kept as reference: its hue-separated line grammar is the one idea
  worth carrying forward.
- **Selected direction: A** (paper-editorial). Strongest reading hierarchy and
  figure/ground; matches the paper-figure expectation the gallery sets without
  copying its layout.
- **Fallback: C** (atlas-native) if review prefers continuity with the site's
  existing token family; it differs from A mainly in fill saturation.
- **Adopted into the selected direction regardless of skin:** B's hue
  separation for flow/callout/stream lines, and C's pastel family fills for
  attention/FFN/norm/mixer, so the canonical renderer's design tokens move
  toward the chosen composition instead of inventing a fourth palette.

## What the selected composition fixes vs the current canonical figure

1. Portrait poster (1040×1360, 0.76:1) instead of 1958×980 (2.0:1) landscape —
   the #35 aspect gate's ≤1.8:1 target is met with margin.
2. Repeat unit drawn as nested filled containers with a 45× brace, not as
   same-depth boxes spread on a row.
3. Mechanism detail as dotted zoom cards (MoE fan-out with 1/288 chips, DSA
   indexer→top-k→MLA core, mHC 4-stream mixer) attached by orthogonal callouts
   in a gutter — no diagonal or canvas-crossing line.
4. Margin annotations with short horizontal leaders; numbers live in the
   margin, not inside box detail rows.
5. ⊕ symbols for residual aggregation; mHC streams as four parallel rails.
6. In-figure title, omission note, resource panel and legend.

## Reproduce

```bash
npx tsx prototypes/glm-compositions/render-candidates.ts
```

Any drift between the frozen brief and the drawn values throws before emit.
