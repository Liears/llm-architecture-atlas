---
type: concept
title: Model diagram composition and routing rules
created: 2026-09-20
updated: 2026-09-20
---

# Model diagram composition and routing rules

## Order of operations

1. Fix hierarchy and regions.
2. Give every fan-out/fan-in a named semantic port.
3. Reserve corridors between regions.
4. Route the main data flow, then residual streams, then mechanism branches, then callouts.
5. Fit copy using the shared renderer/gate typography contract.
6. Adjust node and region sizes only after labels are concise and factual.

Explicit editorial routes must begin and end at their semantic anchors. The composer rejects detached waypoints.

## Gate remedies

- `edge-node`: create a named anchor and a reserved corridor. Include arrowhead and stroke clearance; never route through a non-endpoint node.
- `edge-overlap`: independent edges need independent lanes. If a trunk is truly shared, model one explicit bus or junction and branch from it; never use coincident unrelated polylines as a visual shortcut.
- `text-overflow`: renderer and gate must call the same typography contract. Shorten without losing meaning, then rearrange, then widen. Never reduce text below the reading-size gate.
- `aspect` or `font`: redesign regions or create a separate reading state. A shrunken desktop poster is not a mobile design.
- `port-border` or detached route: fix the semantic endpoint or exact first/last waypoint; never relax epsilon to hide it.

## Shape grammar

- The main spine establishes the first reading order.
- Repeated schedules are a compact, exact genome rather than dozens of copied blocks.
- A representative unit explains residual or recurrent anatomy.
- Mechanism lenses are visually distinct and connect to their exact schedule/stack context.
- Selector flow must read indexer → selector → selected values → attention.
- MoE must read router → routed/shared computation → merge without labels.
- Residual streams remain traceable source-to-sink by line style and geometry, not color alone.

Review once with labels hidden and once with claim/element identifiers visible. If the mechanism cannot be followed without prose, the topology or shape grammar is still too weak.
