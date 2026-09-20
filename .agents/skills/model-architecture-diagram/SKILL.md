---
name: model-architecture-diagram
description: Build or redraw evidence-backed LLM model-architecture diagrams from source facts through Diagram IR, reviewed view projections, deterministic composition and browser visual QA. Use for Transformer/model internals; do not use for generic software or cloud architecture diagrams.
---

# Model Architecture Diagram

Produce a figure whose topology remains correct when labels are hidden. Treat
visual quality as a composition problem after facts and graph structure freeze.

Start by copying `assets/diagram-task.template.md` and choosing one mode:

- `new-model`: establish exact-model sources, IR and evidence before drawing.
- `semantic-change`: change facts/topology and their mutation tests first.
- `geometry-only`: freeze the normalized semantic graph, then change only
  ports, blueprint, routes, typography or visual tokens.

Use the generic compiler for ordinary Transformer overviews. Use a
model-specific semantic compiler and editorial blueprint only when mechanisms,
streams or schedule anatomy must be explained, or generic layout fails the
readability gates.

## Workflow

1. Freeze a source pack before drawing. Use an exact model config or code
   revision for model-specific numbers and schedules. Use papers only for the
   mechanisms they actually define. Mark secondary galleries as visual
   benchmarks, never fact sources.
2. Write or update the source brief and paper-to-diagram map. Every number and
   non-obvious edge needs a claim path and source locator.
3. Compile a coordinate-free `DiagramScene`. Encode fan-out/fan-in, residual
   streams, ports and group boundaries as graph structure. Run semantic
   validation before composition.
4. When the final view hides intermediate nodes, declare a
   `DiagramViewProjection`. Every visible shortcut must list continuous source
   edge paths. Never draw an arrow that exists only in the layout function.
5. Explore composition with the same frozen scene. Choose hierarchy, regions,
   spacing, typography and line grammar; do not change facts between variants.
6. Translate the chosen direction into a deterministic poster blueprint or
   layout constraint. Keep model-specific placement data outside the renderer;
   renderers consume semantic kinds and positioned primitives only.
7. Add mutation tests for signature topology and a deterministic structural
   snapshot. Deleting a residual stream leg, selector path, router merge or
   schedule boundary must fail.
8. Run the single-model checker with `--require-zero-debt`. New figures and
   stable redraws are not complete with any finding; never edit a baseline to
   turn a red into green.
9. Export the real artifact and inspect the real model page in a browser. Check
   the required viewports, effective type size, crossings, clipping and reading
   order. A green screenshot diff is not a visual review.
10. Submit through the repository PR workflow with `Refs #N`, source links,
   commands, limitations, screenshots and `review pending`. The implementer
   does not merge, accept or close the issue.

For implementation invariants and the reusable module boundary, read
[references/diagram-contract.md](references/diagram-contract.md). For the final
evidence package and visual pass, read
[references/delivery-checklist.md](references/delivery-checklist.md). Read
[references/execution-playbook.md](references/execution-playbook.md) for exact
commands and stop states, and
[references/composition-and-routing.md](references/composition-and-routing.md)
before editing geometry.

## Stop conditions

- Stop export if a displayed fact lacks evidence or a projection does not
  validate; do not replace it with plausible-looking prose.
- Stop after two complete geometry passes and report the remaining conflict
  instead of deleting a gate or registering new debt.
- If the source is ambiguous, show the ambiguity or omit the detail. Do not let
  an image generator, diagram tool or visual reference decide topology.
