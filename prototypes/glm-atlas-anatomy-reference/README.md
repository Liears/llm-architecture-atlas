# GLM Atlas anatomy reference prototype

> Throwaway visual reference for issue #34. This is **not** canonical renderer
> code and must not be copied into generated artifacts verbatim.

## Question answered

Can GLM-5.3-Flash be read more clearly as three linked scales instead of one
large node graph?

1. a selectable 45-layer genome (`K,K,K,D ×11 + K`, dense→MoE boundary);
2. one representative mHC-wrapped sublayer with four parallel residual rails;
3. a focused KDA / DSA / MoE mechanism lens with source locator.

## Run

Double-click `index.html`. It is self-contained and does not require a build.

## Reviewer verdict encoded by the prototype

- Carry forward PR #43 candidate A's editorial hierarchy.
- Carry forward B's distinction between data flow, residual rails and callouts.
- Carry forward C's explicit containment, but not its tall page composition.
- Keep all topology in the reviewed Diagram IR. A canonical implementation
  should render a reviewed projection of IR paths; it must not reproduce the
  hand-authored SVG paths in this prototype.
- On mobile, stack genome → layer anatomy → mechanism lens instead of shrinking
  the desktop canvas.

## Frozen facts used

- 45 decoder layers; `K,K,K,D ×11 + K`.
- first 3 dense FFN layers, then 42 sparse MoE layers.
- 34 KDA layers and 11 DSA/MLA layers.
- four mHC residual streams with `H-pre → one F → H-post`, plus H-res and an
  explicit per-stream sum.
- 288 routed experts, top-8 active, plus one shared expert.

The repository's pinned config, evidence register and paper locators remain the
source of truth. This branch only captures the composition decision.
