---
type: concept
title: Evidence-backed model diagram contract
created: 2026-09-18
updated: 2026-09-18
---

# Evidence-backed model diagram contract

## Layers and ownership

```text
exact config/code + mechanism papers
                  |
                  v
Architecture IR + evidence ledger
                  |
                  v
coordinate-free DiagramScene
                  |
          validated projection
                  |
                  v
layout / editorial blueprint
                  |
                  v
PositionedScene -> semantic SVG
```

- Architecture IR owns model facts and source locators.
- Diagram IR owns nodes, edges, groups, ports, streams and claim bindings.
- A view projection owns declared omission: each shortcut names the exact
  source edge path or paths it summarizes.
- A blueprint owns coordinates, regions and named anchors.
- The renderer owns visual tokens and SVG primitives. It must not branch on a
  model id or invent topology.

## Non-negotiable graph rules

- Residual streams are connected paths, not labels, self-loops or decorative
  rails. Their read, operator traversal, mix/write and sink must be explicit.
- Selector topology is indexer -> selector -> selected values -> attention
  core. A label containing "Top-k" is not proof of that path.
- MoE has explicit routing, routed/shared branches and a merge. Avoid a single
  "MoE" box when the figure claims to explain the mechanism.
- Repeated layer schedules are generated from the exact layer membership, not
  typed as a summary string alone. Boundary/tail layers receive mutation tests.
- A cross-group edge uses a declared boundary port. Split and merge nodes must
  have real graph degree.

## Composition rules

- Decide information hierarchy before auto-layout. Use a main spine, pattern
  region and mechanism lenses rather than one global longest-path graph.
- Use solid arrows for data, colored/explicit rails for residual streams and
  dashed lines for routing or callouts. Color is never the only distinction.
- Prefer one readable representative unit plus a precise repeat schedule over
  copying dozens of blocks.
- Treat 1.8:1 as the default maximum desktop overview ratio. Size native text
  so the smallest body copy remains at least 12 CSS px in its normal page
  container.
- Mobile is a separate reading state. Never claim responsiveness because a
  desktop poster shrinks without overflow.

## Reuse test

A pattern is reusable only when the next model can provide a new semantic scene
and blueprint without editing the SVG renderer. A second golden model should
exercise the abstraction before expanding the catalog.
