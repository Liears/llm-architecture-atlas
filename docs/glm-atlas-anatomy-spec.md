---
type: decision
title: GLM-5.3-Flash anatomy poster vertical slice
tags:
  - llm-architecture
  - diagram-engine
  - glm
created: 2026-09-18
updated: 2026-09-18
---

# GLM-5.3-Flash anatomy poster vertical slice

## Outcome

Replace the current wide GLM overview with a deterministic, evidence-backed
desktop poster that can be read at the model page's normal content width. The
poster has three reading zones:

1. the 45-layer genome and Dense-to-MoE transition;
2. one exact mHC sublayer anatomy with four residual streams;
3. KDA, DSA and MoE mechanism lenses.

The implementation is also the reference implementation for a reusable
architecture-diagram workflow. It must not become a renderer branch keyed by
the GLM model id.

## Source contract

- Exact-model facts: pinned
  [GLM-5.3-Flash config](https://huggingface.co/zai-org/GLM-5.3-Flash/blob/f93128cf7f31ca2b22e367cd63676c320c4164a7/config.json).
- mHC topology: [Manifold-Constrained Hyper-Connections](https://arxiv.org/abs/2512.24880), Figure 1(c), Equation 3 and Sections 3–4.
- KDA mechanism: [Kimi Linear](https://arxiv.org/abs/2510.26692), Section 4 and Figure 3.
- DSA mechanism: [DeepSeek-V3.2](https://arxiv.org/abs/2512.02556), Section 2.1 and Figure 2.
- Exact values already live in `architecture.json` and `evidence.json`; papers
  explain mechanism topology and do not override the pinned model config.

Every displayed number and non-obvious edge must resolve to a claim path or a
declared view projection. A view projection may collapse a path only when it
lists the exact source edge ids and those edges form a continuous path.

## Paper-to-diagram map

| Region | Diagram contract | Exact/model evidence | Mechanism evidence |
|---|---|---|---|
| Main spine | token -> embedding -> decoder -> norm -> LM head | `facts.hidden_size`, `facts.vocab_size`, `facts.num_hidden_layers` in the pinned config | n/a |
| Layer genome | `K,K,K,D ×11 + K`; Dense L0–2, MoE L3–44 | `topology.attention_groups[0..1]`, `topology.ffn_groups[0..1]` | n/a |
| mHC | four stream reads; H-pre -> one F -> H-post; H-res -> per-stream sum/write | `topology.residual.scheme`, `topology.residual.streams` | mHC Figure 1(c), Equation 3, Sections 3–4 |
| KDA | Q/K/V ShortConv -> decay/state -> output gate | `topology.attention.kda_short_conv_kernel`, KDA layer membership | Kimi Linear Section 4, Figure 3 |
| DSA | Lightning Indexer -> Top-k 2048 -> selected KV -> MLA | `topology.attention.dsa_indexer_heads`, `topology.attention.dsa_topk` | DeepSeek-V3.2 Section 2.1, Figure 2 |
| MoE | router -> 288 routed (Top-8) + 1 shared -> merge | `topology.experts.*`, MoE layer membership | n/a; exact model config is authoritative |
| MTP | explicit omitted annotation, separated from the LM head | `topology.mtp.predict_layers` | n/a |

## Module boundary

```text
Architecture IR + Evidence
           |
           v
  GLM semantic DiagramScene  ---- projection validation
           |                         |
           +----------+--------------+
                      v
          EditorialPosterBlueprint
             (regions + anchors)
                      |
                      v
              PositionedScene
                      |
                      v
              generic SVG renderer
```

- `packages/diagram-engine`: semantic scene, projection validation, generic
  poster composition and the GLM blueprint data.
- `packages/renderer-svg`: generic visual grammar only. No model-id branches.
- `scripts/export-golden.ts`: selects the GLM anatomy pipeline and writes the
  canonical SVG/snapshot.
- `apps/web`: consumes the canonical SVG without hand-authored paths.

## Visual grammar

- Main data flow: solid ink arrow.
- Four mHC residual streams: colored parallel rails with explicit read, H-res,
  H-pre, one sublayer F, H-post and per-stream sum/write.
- Routing/control and callouts: dashed muted arrow.
- Repetition: schedule cells and a decoder frame, not 45 copied blocks.
- KDA, DSA and MoE: contained cards with their own local reading direction.
- MTP: a clearly separated omitted annotation after the LM head.

The canonical canvas is 1440 x 860 (aspect ratio 1.67). Native body text is at
least 15 px so it remains at least 12 CSS px when fit into a 1150 px content
area.

## Acceptance tests

- Scene validation rejects a missing mHC stream leg, selected-KV edge, expert
  merge edge or tail KDA schedule cell.
- Projection validation rejects an unknown, disconnected or endpoint-mismatched
  source path.
- Poster composition is deterministic and no wider than 1.8:1.
- The rendered SVG contains semantic ids/claim paths/source-edge ids and no
  model-specific renderer condition.
- `pnpm export:golden`, unit tests and typecheck pass.
- PR includes a 1440 x 900 page screenshot and 1x/2x figure output; acceptance
  remains `review pending` for an independent reviewer.

## Non-goals

- Mobile rearrangement, pan/zoom and drill-down are #36/#37.
- This change does not merge or close #34 and does not absorb #35's CI gates.
- The prototype branch is a composition reference, not source code for the
  canonical renderer.
