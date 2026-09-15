/**
 * Built-in constraint layout (issue #5): deterministic, template-friendly.
 *
 * Strategy (docs/development-plan.md §6.2): flow structure comes from the
 * scene's own order constraints and flow edges (Kahn longest-path layering
 * with declared-order tie-breaks); groups frame their members; skip edges
 * route on right-hand rails. Complex free-form subgraphs may instead go
 * through the ELK adapter in elk.ts.
 */

import type { DiagramScene, SemanticNode } from "./types.js";
import type { LayoutOptions, Point, PositionedEdge, PositionedGroup, PositionedNode, PositionedScene } from "./positioned.js";
import { measureText } from "./text.js";

const MARGIN = 28;

interface Internal {
  node: SemanticNode;
  w: number;
  h: number;
  depth: number;
  x: number;
  y: number;
  ports: Record<string, Point>;
}

export function layoutScene(scene: DiagramScene, opts: LayoutOptions = {}): PositionedScene {
  const pad = opts.padding ?? 14;
  const gapX = opts.gapX ?? 36;
  const gapY = opts.gapY ?? 42;
  const fontSize = opts.fontSize ?? 16;
  const skipRailGap = opts.skipRailGap ?? 20;

  // -- node sizes (1.14 factor: headroom so browser fonts never overflow)
  const internals = new Map<string, Internal>();
  scene.nodes.forEach((node) => {
    const labelW = measureText(node.label, fontSize, true) * 1.14;
    const detailW = node.detail ? measureText(node.detail, fontSize * 0.8) * 1.14 : 0;
    const w = Math.ceil(Math.max(labelW, detailW) + pad * 2);
    const h = Math.ceil((node.detail ? fontSize * 1.1 + 6 : 0) + fontSize * 1.35 + pad * 2);
    internals.set(node.id, { node, w, h, depth: 0, x: 0, y: 0, ports: {} });
  });

  // -- depth layering on flow edges (longest path, declared-order tie-break)
  const declaredIndex = new Map(scene.nodes.map((n, i) => [n.id, i]));
  const incoming = new Map<string, string[]>();
  for (const node of scene.nodes) incoming.set(node.id, []);
  for (const e of scene.edges) {
    if (e.kind !== "flow") continue;
    incoming.get(e.to.split(".")[0]!)!.push(e.from.split(".")[0]!);
  }
  const orderTarget = scene.constraints.find((c) => c.type === "order");
  const orderRank = new Map<string, number>(
    orderTarget && orderTarget.type === "order" ? orderTarget.targets.map((t, i) => [t, i]) : [],
  );
  const byDepth: Internal[][] = [];
  const remaining = new Set(internals.keys());
  let guard = 0;
  while (remaining.size > 0) {
    if (guard++ > scene.nodes.length + 2) break; // cycle safety: flush rest by declared order
    const ready = scene.nodes
      .filter((n) => remaining.has(n.id))
      .filter((n) => (incoming.get(n.id) ?? []).every((p) => !remaining.has(p)))
      .sort(
        (a, b) =>
          (orderRank.get(a.id) ?? Infinity) - (orderRank.get(b.id) ?? Infinity) ||
          (declaredIndex.get(a.id) ?? 0) - (declaredIndex.get(b.id) ?? 0),
      );
    if (ready.length === 0) {
      // cycle: deterministically release the first remaining node
      const first = scene.nodes.find((n) => remaining.has(n.id))!;
      byDepth.push([internals.get(first.id)!]);
      remaining.delete(first.id);
      continue;
    }
    const row: Internal[] = ready.map((n) => internals.get(n.id)!);
    row.forEach((it) => remaining.delete(it.node.id));
    byDepth.push(row);
  }

  const depthOf = new Map<string, number>();
  byDepth.forEach((row, d) => row.forEach((it) => depthOf.set(it.node.id, d)));

  // align constraints (horizontal): members share the deepest row among them
  for (const c of scene.constraints) {
    if (c.type !== "align" || c.axis !== "horizontal") continue;
    const d = Math.max(...c.targets.map((t) => depthOf.get(t) ?? 0));
    for (const t of c.targets) depthOf.set(t, d);
  }

  // rebuild rows from (possibly aligned) depths, preserving declared order
  const rowsMap = new Map<number, Internal[]>();
  for (const node of scene.nodes) {
    const it = internals.get(node.id)!;
    const d = depthOf.get(node.id) ?? 0;
    if (!rowsMap.has(d)) rowsMap.set(d, []);
    rowsMap.get(d)!.push(it);
  }
  const byDepthRows = [...rowsMap.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) =>
    row.sort(
      (a, b) =>
        (orderRank.get(a.node.id) ?? Infinity) - (orderRank.get(b.node.id) ?? Infinity) ||
        (declaredIndex.get(a.node.id) ?? 0) - (declaredIndex.get(b.node.id) ?? 0),
    ),
  );

  // -- vertical placement: bottom-to-top => depth 0 sits at the bottom row
  const rowHeights = byDepthRows.map((row) => Math.max(...row.map((it) => it.h)));
  const rowsFromTop = [...byDepthRows].reverse(); // index 0 = top row in SVG space
  const heightsFromTop = [...rowHeights].reverse();
  const maxRowWidth = Math.max(...byDepthRows.map((row) => row.reduce((a, it) => a + it.w, 0) + gapX * (row.length - 1)));
  const sceneW = maxRowWidth + skipRailGap * 3 + MARGIN * 2;

  let y = MARGIN;
  for (let top = 0; top < rowsFromTop.length; top++) {
    const row = rowsFromTop[top]!;
    const rowW = row.reduce((a, it) => a + it.w, 0) + gapX * (row.length - 1);
    let x = MARGIN + (sceneW - MARGIN * 2 - skipRailGap * 3 - rowW) / 2;
    if (x < MARGIN) x = MARGIN;
    for (const it of row) {
      it.x = x;
      it.y = y;
      x += it.w + gapX;
    }
    y += heightsFromTop[top]! + gapY;
  }

  // -- left-rail reserve: shift the scene so left skip rails have room
  const leftSkipsAll = scene.edges.filter((e) => e.kind === "skip" && e.rail === "left");
  const leftRailOffset = leftSkipsAll.length ? 30 + leftSkipsAll.length * 18 : 0;
  if (leftRailOffset) {
    for (const it of internals.values()) { it.x += leftRailOffset; }
  }

  // -- ports: out = top-center, in = bottom-center; others distributed on sides
  for (const it of internals.values()) {
    const ports: Record<string, Point> = {
      in: { x: it.x + it.w / 2, y: it.y + it.h },
      out: { x: it.x + it.w / 2, y: it.y },
    };
    const side = it.node.ports ?? [];
    const leftNames = side.filter((_, i) => i % 2 === 0);
    const rightNames = side.filter((_, i) => i % 2 === 1);
    leftNames.forEach((name, i) => {
      ports[name] = { x: it.x, y: it.y + (it.h * (i + 1)) / (leftNames.length + 1) };
    });
    rightNames.forEach((name, i) => {
      ports[name] = { x: it.x + it.w, y: it.y + (it.h * (i + 1)) / (rightNames.length + 1) };
    });
    it.ports = ports;
  }

  // -- edges
  const positionedEdges: PositionedEdge[] = [];
  const skipEdges = scene.edges.filter((e) => e.kind === "skip");
  const leftSkips = skipEdges.filter((e) => e.rail === "left");
  let leftRailIndex = 0;
  for (const edge of scene.edges) {
    const fromId = edge.from.split(".")[0]!;
    const toId = edge.to.split(".")[0]!;
    const from = internals.get(fromId);
    const to = internals.get(toId);
    if (!from || !to) continue;
    const fromPort = edge.from.includes(".") ? edge.from.split(".")[1]! : "out";
    const toPort = edge.to.includes(".") ? edge.to.split(".")[1]! : "in";
    const a = from.ports[fromPort] ?? from.ports.out!;
    const b = to.ports[toPort] ?? to.ports.in!;

    let points: Point[];
    if (edge.kind === "skip" && edge.rail === "left") {
      const railX = 24 + leftRailIndex * 18;
      leftRailIndex += 1;
      points = [
        { x: from.x, y: a.y },
        { x: railX, y: a.y },
        { x: railX, y: b.y },
        { x: to.x, y: b.y },
      ];
    } else if (edge.kind === "skip") {
      const railIndex = skipEdges.findIndex((s) => s.id === edge.id);
      const railX = MARGIN + leftRailOffset + maxRowWidth + skipRailGap * (railIndex + 1) + 8;
      points = [
        a,
        { x: railX, y: a.y },
        { x: railX, y: b.y },
        b,
      ];
    } else if (Math.abs(a.x - b.x) < 0.75) {
      points = [a, b];
    } else {
      const midY = (a.y + b.y) / 2;
      points = [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
    }
    positionedEdges.push({ id: edge.id, kind: edge.kind, label: edge.label, claimPath: edge.claimPath, points });
  }

  // -- groups frame their members
  const positionedGroups: PositionedGroup[] = scene.groups.map((group) => {
    const members = group.members.map((id) => internals.get(id)).filter((it): it is Internal => Boolean(it));
    const x1 = Math.min(...members.map((m) => m.x)) - pad;
    const y1 = Math.min(...members.map((m) => m.y)) - pad - 18;
    const x2 = Math.max(...members.map((m) => m.x + m.w)) + pad;
    const y2 = Math.max(...members.map((m) => m.y + m.h)) + pad;
    return {
      id: group.id,
      label: group.label,
      claimPath: group.claimPath,
      x: x1,
      y: y1,
      w: x2 - x1,
      h: y2 - y1,
      repeatBadge: group.repeat ? `${group.repeat.count} ×` : undefined,
    };
  });

  const nodes: PositionedNode[] = [...internals.values()].map((it) => ({
    id: it.node.id,
    kind: it.node.kind,
    label: it.node.label,
    detail: it.node.detail,
    claimPath: it.node.claimPath,
    claims: it.node.claims,
    x: it.x,
    y: it.y,
    w: it.w,
    h: it.h,
    ports: it.ports,
  }));

  const maxRight = Math.max(
    ...nodes.map((n) => n.x + n.w),
    ...positionedGroups.map((g) => g.x + g.w),
  );
  const maxBottom = Math.max(
    ...nodes.map((n) => n.y + n.h),
    ...positionedGroups.map((g) => g.y + g.h),
  );
  const size = { w: Math.ceil(maxRight + skipRailGap * 2 + MARGIN), h: Math.ceil(maxBottom + MARGIN) };

  return { scene, size, nodes, edges: positionedEdges, groups: positionedGroups };
}
