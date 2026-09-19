# GLM-5.3-Flash composition candidates — rubric (plan §3.4)

Input: the SAME frozen, reviewed source brief — `models/zai-org/glm-5-3-flash/main/`
(architecture.json @ revision `f93128cf` + evidence.json + brief.json).
`brief.json` carries the immutable provenance: the config URL pinned at HF
revision `f93128cf7f31ca2b22e367cd63676c320c4164a7` with its sha256, and the
four papers with mechanism-only role and section/figure/page locators. The
generator (`render-candidates.ts`) binds every drawn number to a publishable
evidence claim first and cross-checks it against the pinned config / IR before
emitting anything; the three
candidates differ in composition (geometry), not only in skin:

- **A · paper-editorial** — portrait poster 1080×1220: vertical spine with a
  filled 45× container, right gutter of mechanism zoom cards on orthogonal
  callouts, margin leaders, reading-notes block.
- **B · engineering-blueprint** — landscape sheet 1560×950: horizontal spine,
  2×2 mechanism panels, drawing-office title block, grid background.
- **C · nested-containment** — portrait 1060×1620: mechanism blocks nested
  inside the decoder repeat-unit container, spine column left and mechanism
  panels right, margin leaders both sides, reading-notes block bottom right.

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
- Measurement method (round-3 recompute): aspect = viewBox w/h of the emitted
  SVG (A 1080×1220 = 0.89:1, B 1560×950 = 1.64:1, C 1060×1620 = 0.65:1; the
  #35 aspect target is ≤1.8:1). Effective type = smallest drawn font-size in
  the emitted SVG — after the shrink-to-fit pass, so a shrunk label counts at
  its post-shrink size — multiplied by 1150/canvas width. Measured this round:
  A smallest 12px (legend, rail ticks, notes header; the shrink-to-fit pass
  bottoms out at 12.56px on the slot labels, above the 12px floor) → 12.8px
  effective; B smallest 12px → 8.8px effective; C smallest 12px (stream tick
  labels, margin notes, legend, H-res caption) → 13.0px effective. Scores that
  depend on these numbers were reassigned from the measurement, not carried
  over from earlier rounds.
- Elimination rule: a candidate scoring <3 on criterion 1 (structural fidelity)
  is eliminated outright. No candidate triggers it at this round.
- Consistency rule: the verdict order must equal the total-score order, and any
  candidate named as fallback carries an explicit fix list. Ties in totals are
  broken by criterion 4 (layout quality, the most measured criterion), then
  criterion 5. The rubric
  recommends; per plan §3.4 the reviewer (or the user) selects. The implementer
  does not get to pick their own winner.
- Shared IR (round 3): the generator first builds ONE DiagramScene in the
  compound IR of merged #33 (groups with parents and boundary ports, per-stream
  port tags/roles, scene-level stream declarations) and runs `validateScene()`
  on it; any IR error stops emit before any candidate is drawn. The three
  compositions vary placement, canvas and skin only — labels, details, group
  titles, flow edges and stream rails are read from the scene, so content
  cannot drift between candidates.
- No invented edges (round 4): an overview spine may collapse per-stream
  machinery, but only through the declared `PROJECTION` table — each link
  names the exact scene-edge legs it summarises, and emit asserts every leg
  exists and consecutive legs connect. Every arrow any composition draws
  (spine, collapsed links, stream-card lanes) passes `mustLink()`, which
  throws unless the endpoint pair is a scene edge or a declared projection;
  a mutation test (inventing `slot-attn -> moe-router`) stops emit.
  Compositions place and style; they do not add semantics.
- Reproducibility: the generator has no randomness or timestamps; two runs emit
  byte-identical SVGs (checked by sha256). PNGs are playwright screenshots of
  those SVGs: pixel-stable in a fixed environment, but their byte hashes vary
  with Chromium/font versions, so byte-determinism is claimed for SVGs only.
  The comparison board nests all three candidates at 0.62 for side-by-side
  layout judging only — the font target applies to the candidate sheets at
  their 1150px embed, not to the board's thumbnails.
- Evidence binding: every drawn number goes through `claim()` first
  (publishable status enforced), then cross-checks the pinned config or the
  Architecture IR with `eq()`; prose schedule/partition claims are pinned by
  substring checks on the numbers they carry. Negative-tested: deleting
  `topology.experts.routed_total` from evidence.json stops emit, and
  downgrading it to `disputed` stops emit; the file was restored afterwards.

## Scores

| # | Criterion (weight) | A · paper-editorial | B · engineering-blueprint | C · nested-containment |
|---|---|---|---|---|
| 1 | Structural fidelity vs brief (×2) | 5 — every fact, the exact schedule, ⊕ merge, mHC aggregate→one pass→write-back with H-res skip mixing; semantics correct (slots, not serial mechanisms) | 5 — same content, slots correct | 5 — round-3 redraw from the shared Diagram IR: realization is containment plus partition-labelled dashed links, no serial KDA→DSA→MoE edges remain |
| 2 | Reading hierarchy (×2) | 5 — filled gray 45× container + filled blue unit block make the repeat unit immediate; gutter cards read as detail, not spine | 3 — spine + four same-depth panels; nesting only via dashed panel borders | 5 — true containment: mechanisms visibly live inside the repeat unit |
| 3 | Line/role discrimination (×2) | 4 — solid flow / dotted callout / teal stream; flow and callout share a dark ink, separated by dash only | 5 — cyan flow, amber dashed callout, teal stream: hue-separated, the best line grammar of the three | 4 — ink flow / gray dashed callout / teal stream |
| 4 | Layout quality (×2) | 5 — strongest figure/ground; no text overflow (the 12px font floor is enforced at emit time; smallest post-shrink label is 12.57px); gutter and margin leaders orthogonal | 4 — panels keep ~55px dead padding around 180px boxes; grid adds noise behind 12–13px type | 4 — clean two-column nest after the round-3 fixes (no leader/rail/stub collisions left); 0.65:1 still means a 1620px scroll and the top-right margin stays empty |
| 5 | Legibility at size / responsive potential (×2) | 4 — at the 1150px embed the smallest type is 12px→12.8px effective (passes the ≥12px target); splits into spine state + card state at 390px, callout bus needs a reflow rule | 3 — at 1150px embed scale 0.74 puts 12px type at 8.8px effective (fails the target); dark-only reading, grid pointless at 390px | 4 — embed scale 1.08 puts the smallest type 12px→13.0px effective (passes the target); single column stacks trivially, but length hurts overview |
| 6 | Fit to atlas token family (×1) | 3 — new editorial palette, site tokens would need to move toward it | 2 — dark blueprint only, no light variant | 5 — uses the site's existing pastel/ink family as-is |
| | **Total /55** | **49** | **42** | **49** |

## Verdict

Totals: **A 49 · C 49 · B 42**. Round-3 recompute: after the font-floor fix
(every drawn label ≥12px, enforced at emit time) and measuring effective type
and aspect from the emitted SVGs (A 12.8px at 0.89:1, B 8.8px at 1.64:1,
C 13.0px at 0.65:1, all aspects inside the ≤1.8:1 target), the per-criterion
scores above were reassigned from those measurements; the totals recompute to
the same 49/42/49. A and C tie; the tiebreak (criterion 4, layout quality)
goes to A (5 vs 4: C's two-column nest reads cleanly but its 1620px-tall
canvas costs density against A's 1220px). Order after tiebreak:
**A recommended · C alternate · B third**.

Selection status (round-4 review, 2026-09-18): the reviewer confirmed the
rubric's order — **A is the canonical direction**, C kept only as a
containment reference, B not continued. What is accepted is the composition
direction, not the hand-written SVG: the #34 implementation must port it into
the canonical renderer (design tokens, layout constraints, renderer
primitives) and pass the projection/IR rules above, real-site screenshots and
a gallery blind-read check.

- **Recommended: A.** Strongest reading hierarchy and figure/ground, correct
  slot and mHC semantics, passes the aspect (0.89:1) and effective-type
  targets, and matches the paper-figure expectation the Raschka gallery sets
  without copying any of its layouts.
- **Alternate: C.** Round 2 eliminated it (serial arrows implied a false
  per-layer sequence); the round-3 redraw from the shared Diagram IR removed
  that defect — realization is now containment plus partition-labelled dashed
  links — so C re-enters at fidelity 5 and ties A. If the reviewer prefers
  continuity with the site's token family and explicit containment, C is a
  clean choice; its nesting is the most literal expression of "mechanisms live
  inside the repeat unit".
- **Third: B**, not eliminated. If selected it needs a light-skin variant and
  an effective-type remediation (larger type or a wider embed) before it can
  pass the #35 font gate.
- **Carried forward regardless of selection:** B's hue separation for
  flow/callout/stream lines and C's pastel family fills, so the canonical
  renderer's design tokens converge on the reviewed candidates instead of
  inventing a fourth palette.

## Canonical port record (PR #45)

The canonical implementation selects **A's editorial hierarchy**, not its
prototype coordinates: one dominant model spine, a clearly bounded repeated
decoder region, and subordinate mechanism cards connected by short callouts.
The 1080×1220 portrait canvas was adapted to a 1440×860 desktop poster so the
published overview remains visible in the site's normal 1150px content area
without forcing a long first-screen scroll. This is a composition adaptation,
not a fourth semantic candidate; all 43 nodes and all visible edges still come
from the same frozen DiagramScene.

The port deliberately carries forward the two cross-candidate strengths named
above: B's role-separated line/color grammar and C's Atlas light token family.
The implementation mapping is testable:

| Reviewed decision | Canonical implementation |
|---|---|
| A: dominant spine + subordinate mechanism gutter | `glmAnatomyBlueprint()` regions and `callout-mhc` |
| A: repeat schedule is visually primary | `g-pattern` plus source-derived schedule cells |
| B: distinguish data, control and residual roles | renderer `e-flow`, `e-control`, `e-residual` classes |
| C: reuse Atlas light palette | `@atlas/ui` theme tokens; no candidate-local colors |
| No composition may invent structure | `DiagramViewProjection` validation plus semantic edge ids |
| Readable in the 1150px content column | 1440×860 canvas and 15px poster text floor |

The original deterministic candidate generator remains available at immutable
commit [`d70a539`](https://github.com/Liears/llm-architecture-atlas/tree/d70a539f11e4fb5657413f798864646f365f9b64/prototypes/glm-compositions).
The SVG/PNG candidates and comparison board are copied into PR #45 so the
decision does not depend on a live branch or external image host.

## Paper ↔ diagram map

Every drawn number traces to one row; the generator re-asserts each at render
time and throws on drift.

| Drawn element | Values | Source |
|---|---|---|
| Layer count + schedule | 45; K,K,K,D ×11 + K | claim `facts.num_hidden_layers` cross-checked with config; prose claims `topology.attention_groups[0..1]` pinned by substring; exact per-layer membership asserted against the IR groups |
| hidden / vocab / heads / context | 4,096 / 154,880 / 64 / 1M | claims `facts.hidden_size`, `facts.vocab_size`, `facts.num_attention_heads`, `facts.context_tokens`, each cross-checked with the pinned config |
| Param totals | 320B-A18B | claims `facts.total_params`, `facts.active_params` cross-checked with config |
| KDA chain | Q/K/V ShortConv → KDA core (decay + recurrent state) → output gate | Kimi Linear §4, Fig 3 (p.6) |
| DSA chain | Lightning indexer 32 heads → Top-k 2048 → selected KV → MLA core | DeepSeek-V3.2 §2.1, Fig 2 (pp.3–4); 32 and 2048 from evidence claims `topology.attention.dsa_indexer_heads`, `topology.attention.dsa_topk` (publishable status enforced) |
| MoE | router → 288 routed top-8 + 1 shared; layers 3–44 | evidence claims `topology.experts.{routed_total,active_routed,shared}` cross-checked against config; `ffn_groups` moe partition (asserted) |
| Dense/MoE split | first 3 dense, then 42 MoE | prose claims `topology.ffn_groups[0..1]` pinned by substring; dense partition asserted `[0,1,2]` |
| mHC | 4 streams aggregate (H-pre) into ONE sublayer pass F; H-post writes back to 4 streams; H-res mixes the skip path | mHC paper Fig 1(c) p.1, Eq.(3), §3–§4; count from claim `topology.residual.streams` cross-checked against IR; scheme claim `mhc` |
| KDA short conv | kernel 4 on Q/K/V | claim `topology.attention.kda_short_conv_kernel`; Kimi Linear §4 |
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
5. ⊕ symbol for residual aggregation; mHC as four streams aggregating into one
   shared sublayer pass and writing back (H-pre / F / H-post + H-res skip mix),
   per Fig 1(c)/Eq.(3).
6. In-figure title, omission note, title/reading-notes block and legend.

## Frozen audit provenance

These files are frozen review attachments, not a locally reproducible build
target in the canonical branch. Their one-time generator is intentionally not
part of PR #45: it is a 1,064-line prototype that duplicates evidence,
projection and SVG code now implemented as maintained modules and tests.

To audit or reproduce the original candidate run, use immutable commit
[`d70a539`](https://github.com/Liears/llm-architecture-atlas/tree/d70a539f11e4fb5657413f798864646f365f9b64/prototypes/glm-compositions),
which contains `render-candidates.ts`, its assertions and the byte-identical
SVG/PNG outputs preserved here. The canonical figure itself remains locally
reproducible through `corepack pnpm export:golden`.
