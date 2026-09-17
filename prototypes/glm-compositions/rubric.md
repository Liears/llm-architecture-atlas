# GLM-5.3-Flash composition candidates — rubric (plan §3.4)

Input: the SAME frozen, reviewed source brief — `models/zai-org/glm-5-3-flash/main/`
(architecture.json @ revision `f93128cf` + evidence.json). The generator
(`render-candidates.ts`) asserts every drawn number against the pinned config
and the publishable evidence claims before emitting anything; the three
candidates differ in composition (geometry), not only in skin:

- **A · paper-editorial** — portrait poster 1080×1220: vertical spine with a
  filled 45× container, right gutter of mechanism zoom cards on orthogonal
  callouts, margin leaders, reading-notes block.
- **B · engineering-blueprint** — landscape sheet 1560×950: horizontal spine,
  2×2 mechanism panels, drawing-office title block, grid background.
- **C · nested-containment** — narrow portrait 960×1900: mechanism blocks
  nested inside the decoder repeat-unit container, margin leaders both sides.

Outputs: `candidate-{a,b,c}.svg|png` and `comparison-board.svg|png` (all three
at a common scale with the totals below). Status: prototype / review material.
Not the canonical artifact; the canonical chain remains
Architecture IR → Diagram IR → constrained layout → semantic SVG.

## Methodology

- Six criteria. Criteria 1–5 carry weight 2, criterion 6 weight 1; each scored
  1–5, so the maximum is 55. Scores are assigned per candidate from the checks
  listed under each criterion; where a check is measurable it is measured from
  the emitted SVG (aspect, type sizes at the 1150px embed width, overflow),
  where it is editorial it is judged from the rendered PNG at full size.
- Elimination rule: a candidate scoring <3 on criterion 1 (structural fidelity)
  is eliminated outright. No candidate triggers it at this round.
- Consistency rule: the verdict order must equal the total-score order, and any
  candidate named as fallback carries an explicit fix list. The rubric
  recommends; per plan §3.4 the reviewer (or the user) selects. The implementer
  does not get to pick their own winner.
- Reproducibility: the generator has no randomness or timestamps; two runs emit
  byte-identical SVGs (checked by sha256). PNGs are playwright screenshots of
  those SVGs, identical across runs.

## Scores

| # | Criterion (weight) | A · paper-editorial | B · engineering-blueprint | C · nested-containment |
|---|---|---|---|---|
| 1 | Structural fidelity vs brief (×2) | 5 — every fact, the exact schedule, ⊕ merge, 4 complete streams; semantics correct (slots, not serial mechanisms) | 5 — same content, slots correct | 4 — all content present, but serial arrows between KDA/DSA/MoE blocks imply a per-layer sequence that does not exist (they are per-layer alternatives; only the layer counts disambiguate) |
| 2 | Reading hierarchy (×2) | 5 — filled gray 45× container + filled blue unit block make the repeat unit immediate; gutter cards read as detail, not spine | 3 — spine + four same-depth panels; nesting only via dashed panel borders | 5 — true containment: mechanisms visibly live inside the repeat unit |
| 3 | Line/role discrimination (×2) | 4 — solid flow / dotted callout / teal stream; flow and callout share a dark ink, separated by dash only | 5 — cyan flow, amber dashed callout, teal stream: hue-separated, the best line grammar of the three | 4 — ink flow / gray dashed callout / teal stream |
| 4 | Layout quality (×2) | 5 — strongest figure/ground; no text overflow (shrink-to-fit floor 10px, nothing hits it); gutter and margin leaders orthogonal | 4 — panels keep ~55px dead padding around 180px boxes; grid adds noise behind 12–13px type | 4 — clean but 0.51:1 means one long scroll; mechanisms compared by scrolling, not side by side |
| 5 | Legibility at size / responsive potential (×2) | 4 — at the 1150px embed the smallest type is 12px→12.8px effective (passes the ≥12px target); splits into spine state + card state at 390px, callout bus needs a reflow rule | 3 — at 1150px embed scale 0.74 puts 12px type at 8.8px effective (fails the target); dark-only reading, grid pointless at 390px | 4 — embed scale 1.20 keeps all type ≥14px effective; single column stacks trivially, but length hurts overview |
| 6 | Fit to atlas token family (×1) | 3 — new editorial palette, site tokens would need to move toward it | 2 — dark blueprint only, no light variant | 5 — uses the site's existing pastel/ink family as-is |
| | **Total /55** | **49** | **42** | **47** |

## Verdict

Order follows the totals: **A (49) > C (47) > B (42)**.

- **Recommended: A.** Strongest reading hierarchy and figure/ground, correct
  slot semantics, passes the aspect (0.89:1) and effective-type targets, and
  matches the paper-figure expectation the Raschka gallery sets without copying
  any of its layouts.
- **Fallback: C**, only with this fix before adoption: replace the serial
  arrows between KDA/DSA/MoE blocks with partition markers (brackets or
  "either/or" glyphs plus the layer counts) so no per-layer sequence is
  implied. Without the fix, C's criterion-1 defect ships into the canonical
  figure.
- **Third: B**, not eliminated. If selected it needs a light-skin variant and
  an effective-type remediation (larger type or a wider embed) before it can
  pass the #35 font gate.
- **Carried forward regardless of selection:** B's hue separation for
  flow/callout/stream lines and C's pastel family fills, so the canonical
  renderer's design tokens converge on the reviewed candidates instead of
  inventing a fourth palette.

## Paper ↔ diagram map

Every drawn number traces to one row; the generator re-asserts each at render
time and throws on drift.

| Drawn element | Values | Source |
|---|---|---|
| Layer count + schedule | 45; K,K,K,D ×11 + K | pinned config `num_hidden_layers`; evidence topology group membership (exact-membership `eq()` in the generator) |
| hidden / vocab / heads / context | 4,096 / 154,880 / 64 / 1M | config facts `hidden_size`, `vocab_size`, `num_attention_heads`, `context_tokens` |
| Param totals | 320B-A18B | config facts `total_params`, `active_params` |
| KDA chain | Q/K/V ShortConv → KDA core (decay + recurrent state) → output gate | Kimi Linear §4, Fig 3 (p.6) |
| DSA chain | Lightning indexer 32 heads → Top-k 2048 → selected KV → MLA core | DeepSeek-V3.2 §2.1, Fig 2 (pp.3–4); 32 and 2048 from evidence claims `topology.attention.dsa_indexer_heads`, `topology.attention.dsa_topk` (publishable status enforced) |
| MoE | router → 288 routed top-8 + 1 shared; layers 3–44 | config `topology.experts.{routed_total,active_routed,shared}`; `ffn_groups` moe partition (asserted) |
| Dense/MoE split | first 3 dense, then 42 MoE | `ffn_groups` dense partition asserted `[0,1,2]` |
| mHC | 4 streams, pre-mix → sublayer → post-mix → write merge | mHC paper Fig 1(c), §3–§4; stream count from `topology.residual.streams` |
| Scope note | vision encoder + MTP head omitted | model-card scope; pinned config carries the text decoder only |

## What the selected composition fixes vs the current canonical figure

1. Portrait poster (1080×1220, 0.89:1) instead of 1958×980 (2.0:1) landscape —
   the #35 aspect gate's ≤1.8:1 target is met with margin.
2. Repeat unit drawn as nested filled containers with a 45× brace, not as
   same-depth boxes spread on a row.
3. Mechanism detail as zoom cards (KDA chain, DSA chain, MoE fan-out with
   routed/shared chips, mHC 4-stream lanes) attached by orthogonal callouts in
   a gutter — no diagonal or canvas-crossing line.
4. Margin annotations with short horizontal leaders; numbers live in the
   margin, not inside box detail rows.
5. ⊕ symbol for residual aggregation; mHC streams as four complete lanes
   (split → pre-mix → sublayer → post-mix → write-merge bar).
6. In-figure title, omission note, title/reading-notes block and legend.

## Reproduce

```bash
npx tsx prototypes/glm-compositions/render-candidates.ts          # SVGs + board
npx tsx prototypes/glm-compositions/render-candidates.ts --png    # + PNGs
```

Any drift between the frozen brief and the drawn values throws before emit.
