/**
 * Built-in constraint layout (issue #5, compound model in #33):
 * deterministic, template-friendly.
 *
 * Layout is two-level (#33): inset groups are compound subgraphs laid out
 * independently (group-local direction) and participate in the enclosing
 * scope as single boxes; stack/frame groups stay annotations framed around
 * their members. Flow structure inside a scope comes from that scope's flow
 * edges (Kahn longest-path layering with declared-order tie-breaks); skip and
 * residual edges route on side rails. Free-form subgraphs may instead go
 * through the ELK adapter in elk.ts.
 */

import type { DiagramScene, SemanticEdge, SemanticGroup, SemanticNode } from "./types.js";
import type { LayoutOptions, Point, PositionedEdge, PositionedGroup, PositionedNode, PositionedScene } from "./positioned.js";
import { measureText } from "./text.js";
import { nodePortAnchors } from "./ports.js";

const MARGIN = 28;
const LABEL_BAND = 20; // group label strip on top of a box/frame
const RAIL_FIRST = 24; // x of the outermost left rail
const RAIL_STEP = 18; // distance between rails

interface Internal {
  node: SemanticNode;
  w: number;
  h: number;
  x: number;
  y: number;
  ports: Record<string, Point>;
}

/** A compound inset box laid out independently (#33). */
interface Box {
  group: SemanticGroup;
  w: number;
  h: number;
  x: number;
  y: number;
  ports: Record<string, Point>;
}

type Direction = "bottom-to-top" | "top-to-bottom" | "left-to-right";

function splitRef(ref: string): { head: string; port?: string } {
  const dot = ref.indexOf(".");
  if (dot === -1) return { head: ref };
  return { head: ref.slice(0, dot), port: ref.slice(dot + 1) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Boundary-port anchors on a group box border (#33), shared by the built-in
 * layout and the ELK adapter so both backends agree on port placement.
 * Ports stack outward from the inner member's center, clamped to the box.
 */
export function boundaryPortAnchors(
  declared: Array<{ id: string; side: "left" | "right" | "top" | "bottom"; inner: string }>,
  box: { x: number; y: number; w: number; h: number },
  centerOf: (memberId: string) => Point,
): Record<string, Point> {
  const ports: Record<string, Point> = {};
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const sidePorts = declared.filter((p) => p.side === side);
    sidePorts.forEach((p, i) => {
      const c = centerOf(splitRef(p.inner).head);
      const off = (i - (sidePorts.length - 1) / 2) * 12;
      if (side === "left") ports[p.id] = { x: box.x, y: clamp(c.y + off, box.y + 8, box.y + box.h - 8) };
      else if (side === "right") ports[p.id] = { x: box.x + box.w, y: clamp(c.y + off, box.y + 8, box.y + box.h - 8) };
      else if (side === "top") ports[p.id] = { x: clamp(c.x + off, box.x + 8, box.x + box.w - 8), y: box.y };
      else ports[p.id] = { x: clamp(c.x + off, box.x + 8, box.x + box.w - 8), y: box.y + box.h };
    });
  }
  return ports;
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
    internals.set(node.id, { node, w, h, x: 0, y: 0, ports: {} });
  });

  // -- group tree
  const groupById = new Map<string, SemanticGroup>(scene.groups.map((g) => [g.id, g]));
  const memberGroup = new Map<string, string>(); // node -> its (unique) group
  for (const group of scene.groups) {
    for (const member of group.members) memberGroup.set(member, group.id);
  }

  /** Nearest enclosing inset group for a node (null = main spine). */
  const insetOfNode = new Map<string, string | null>();
  for (const node of scene.nodes) {
    let g: string | null = memberGroup.get(node.id) ?? null;
    let inset: string | null = null;
    while (g) {
      const grp = groupById.get(g)!;
      if (grp.kind === "inset") {
        inset = g;
        break;
      }
      g = grp.parent ?? null;
    }
    insetOfNode.set(node.id, inset);
  }

  /** The inset group a given inset box is placed in (null = main spine). */
  function insetOfBox(group: SemanticGroup): string | null {
    let g = group.parent ?? null;
    while (g) {
      const grp = groupById.get(g)!;
      if (grp.kind === "inset") return g;
      g = grp.parent ?? null;
    }
    return null;
  }

  const directionConstraint = scene.constraints.find((c) => c.type === "direction") as
    | { type: "direction"; value: Direction }
    | undefined;
  const mainDirection: Direction = directionConstraint?.value ?? "bottom-to-top";

  interface Unit {
    key: string; // "n:<nodeId>" or "b:<groupId>"
    w: number;
    h: number;
    depth: number;
    x: number;
    y: number;
  }

  interface ScopePlan {
    id: string | null;
    direction: Direction;
    units: Map<string, Unit>; // direct units of this scope
    internalsFor: Array<{ key: string; it: Internal }>; // node units -> internals
    boxesFor: Array<{ key: string; box: Box }>; // box units -> boxes
    flowEdges: SemanticEdge[]; // flow edges internal to this scope
    orderRank: Map<string, number>;
    alignSets: string[][]; // align targets already translated to unit keys
    padTop: number;
  }

  /** Scope id (inset group id or null) an edge endpoint resolves to. */
  function endpointScope(ref: string): string | null {
    const { head } = splitRef(ref);
    const group = groupById.get(head);
    if (group) return insetOfBox(group);
    return insetOfNode.get(head) ?? null;
  }

  const boxByGroup = new Map<string, Box>();

  function buildPlan(scopeId: string | null): ScopePlan {
    const group = scopeId ? groupById.get(scopeId)! : null;
    const direction: Direction = group
      ? group.kind === "inset"
        ? (group.direction ?? "left-to-right")
        : mainDirection
      : mainDirection;

    const units = new Map<string, Unit>();
    const internalsFor: ScopePlan["internalsFor"] = [];
    const boxesFor: ScopePlan["boxesFor"] = [];
    for (const node of scene.nodes) {
      if (insetOfNode.get(node.id) !== scopeId) continue;
      const it = internals.get(node.id)!;
      units.set(`n:${node.id}`, { key: `n:${node.id}`, w: it.w, h: it.h, depth: 0, x: 0, y: 0 });
      internalsFor.push({ key: `n:${node.id}`, it });
    }
    for (const g of scene.groups) {
      if (g.kind !== "inset" || insetOfBox(g) !== scopeId) continue;
      const box = boxByGroup.get(g.id)!; // measured bottom-up before this pass
      units.set(`b:${g.id}`, { key: `b:${g.id}`, w: box.w, h: box.h, depth: 0, x: 0, y: 0 });
      boxesFor.push({ key: `b:${g.id}`, box });
    }

    const flowEdges = scene.edges.filter((e) => {
      if (e.kind !== "flow") return false;
      return endpointScope(e.from) === scopeId && endpointScope(e.to) === scopeId;
    });

    // declared-order ranks, shared across the scope tree so a global order
    // constraint sequences boxes and spine nodes consistently
    const orderRank = new Map<string, number>();
    let rank = 0;
    const assign = (sid: string | null, target: string): void => {
      const g = groupById.get(target);
      if (g && g.kind === "inset") {
        if (insetOfBox(g) === sid && units.has(`b:${target}`) && !orderRank.has(`b:${target}`)) {
          orderRank.set(`b:${target}`, rank++);
        }
        return;
      }
      const nodeScope = insetOfNode.get(target);
      if (nodeScope === sid) {
        const key = `n:${target}`;
        if (units.has(key) && !orderRank.has(key)) orderRank.set(key, rank++);
      } else if (nodeScope != null && nodeScope !== sid && containsScope(nodeScope, sid)) {
        // first member occurrence also ranks the containing box in this scope
        const boxKey = `b:${nodeScope}`;
        if (units.has(boxKey) && !orderRank.has(boxKey)) orderRank.set(boxKey, rank++);
        assign(nodeScope, target);
      }
    };
    for (const c of scene.constraints) {
      if (c.type !== "order") continue;
      for (const t of c.targets) assign(scopeId, t);
    }

    // align constraints apply to vertical scopes; LTR columns satisfy them
    // structurally only for first-of-column members, so they are skipped there
    const alignSets: string[][] = [];
    if (direction !== "left-to-right") {
      for (const c of scene.constraints) {
        if (c.type !== "align" || c.axis !== "horizontal") continue;
        const keys = [...new Set(c.targets.map((t) => {
          if (groupById.get(t)?.kind === "inset") return `b:${t}`;
          return insetOfNode.get(t) === scopeId ? `n:${t}` : null;
        }).filter((k): k is string => k !== null && units.has(k)))];
        if (keys.length >= 2) alignSets.push(keys);
      }
    }

    return {
      id: scopeId,
      direction,
      units,
      internalsFor,
      boxesFor,
      flowEdges,
      orderRank,
      alignSets,
      padTop: group ? LABEL_BAND : 0,
    };
  }

  function containsScope(descendant: string, ancestor: string | null): boolean {
    let g: string | null = groupById.get(descendant)?.parent ?? null;
    const seen = new Set<string>();
    while (g && !seen.has(g)) {
      if (g === ancestor) return true;
      seen.add(g);
      g = groupById.get(g)?.parent ?? null;
    }
    return ancestor === null;
  }

  /** Kahn longest-path layers over a scope's flow edges, ordered by rank. */
  function layerUnits(plan: ScopePlan): Unit[][] {
    const incoming = new Map<string, string[]>();
    for (const key of plan.units.keys()) incoming.set(key, []);
    for (const e of plan.flowEdges) {
      const fromKey = refUnitKey(plan, e.from);
      const toKey = refUnitKey(plan, e.to);
      if (!fromKey || !toKey || fromKey === toKey) continue;
      incoming.get(toKey)!.push(fromKey);
    }
    const remaining = new Set(plan.units.keys());
    const layers: Unit[][] = [];
    let guard = 0;
    while (remaining.size > 0) {
      if (guard++ > plan.units.size + 2) break; // cycle safety: flush the rest by rank
      const ready = [...remaining]
        .map((k) => plan.units.get(k)!)
        .filter((u) => (incoming.get(u.key) ?? []).every((p) => !remaining.has(p)))
        .sort((a, b) => (plan.orderRank.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (plan.orderRank.get(b.key) ?? Number.MAX_SAFE_INTEGER) || a.key.localeCompare(b.key));
      if (ready.length === 0) {
        const flush = [...remaining]
          .map((k) => plan.units.get(k)!)
          .sort((a, b) => a.key.localeCompare(b.key));
        for (const u of flush) remaining.delete(u.key);
        layers.push(flush);
        continue;
      }
      for (const u of ready) remaining.delete(u.key);
      layers.push(ready);
    }
    return layers;
  }

  /** Unit key an edge endpoint maps to inside this scope, if any. */
  function refUnitKey(plan: ScopePlan, ref: string): string | null {
    const { head } = splitRef(ref);
    if (plan.units.has(`n:${head}`)) return `n:${head}`;
    if (plan.units.has(`b:${head}`)) return `b:${head}`;
    return null;
  }

  /**
   * Place one scope's units at (originX, originY) and recurse into boxes.
   * Returns the occupied content size relative to the origin.
   */
  function placeScope(plan: ScopePlan, originX: number, originY: number): { w: number; h: number } {
    const layers = layerUnits(plan);
    const depthOf = new Map<string, number>();
    layers.forEach((layer, d) => layer.forEach((u) => depthOf.set(u.key, d)));

    // align sets: members share the deepest layer among them
    for (const keys of plan.alignSets) {
      const d = Math.max(...keys.map((k) => depthOf.get(k) ?? 0));
      for (const k of keys) depthOf.set(k, d);
    }

    const byDepth = new Map<number, Unit[]>();
    for (const u of plan.units.values()) {
      const d = depthOf.get(u.key) ?? 0;
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(u);
    }
    const rankOf = (u: Unit): number => plan.orderRank.get(u.key) ?? Number.MAX_SAFE_INTEGER;
    const rows = [...byDepth.keys()].sort((a, b) => a - b).map((d) =>
      byDepth.get(d)!.sort((a, b) => rankOf(a) - rankOf(b) || a.key.localeCompare(b.key)),
    );

    if (plan.direction === "left-to-right") {
      let x = originX + pad;
      let contentH = 0;
      for (const column of rows) {
        const columnH = column.reduce((a, u) => a + u.h, 0) + gapY * (column.length - 1);
        contentH = Math.max(contentH, columnH);
        let y = originY + plan.padTop + pad;
        for (const u of column) {
          u.x = x;
          u.y = y;
          y += u.h + gapY;
        }
        x += Math.max(...column.map((u) => u.w)) + gapX;
      }
      commit(plan);
      return { w: x - gapX + pad - originX, h: contentH + plan.padTop + pad * 2 };
    }

    const rowHeights = rows.map((row) => Math.max(...row.map((u) => u.h), 0));
    const maxRowWidth = Math.max(...rows.map((row) => row.reduce((a, u) => a + u.w, 0) + gapX * (row.length - 1)), 0);
    let y = originY + plan.padTop + pad;
    const rowsFromTop = plan.direction === "top-to-bottom" ? rows : [...rows].reverse();
    const heightsFromTop = plan.direction === "top-to-bottom" ? rowHeights : [...rowHeights].reverse();
    for (let top = 0; top < rowsFromTop.length; top++) {
      const row = rowsFromTop[top]!;
      const rowW = row.reduce((a, u) => a + u.w, 0) + gapX * (row.length - 1);
      let x = originX + pad + (maxRowWidth - rowW) / 2;
      if (x < originX + pad) x = originX + pad;
      for (const u of row) {
        u.x = x;
        u.y = y;
        x += u.w + gapX;
      }
      y += heightsFromTop[top]! + gapY;
    }
    commit(plan);
    return { w: maxRowWidth + pad * 2, h: y - gapY + pad - originY };

    function commit(p: ScopePlan): void {
      for (const { key, it } of p.internalsFor) {
        const u = p.units.get(key)!;
        it.x = u.x;
        it.y = u.y;
      }
      for (const { key, box } of p.boxesFor) {
        const u = p.units.get(key)!;
        box.x = u.x;
        box.y = u.y;
        const innerPlan = planById.get(box.group.id)!;
        placeScope(innerPlan, box.x, box.y);
      }
    }
  }

  // build plans and measure inset boxes deepest-first, so a scope always
  // sees its child boxes' sizes before its own plan is built
  const planById = new Map<string, ScopePlan>();
  const insetGroups = scene.groups.filter((g) => g.kind === "inset");
  const insetDepth = (g: SemanticGroup): number => {
    let d = 0;
    let p = g.parent;
    while (p) {
      const pg = groupById.get(p);
      if (!pg) break;
      if (pg.kind === "inset") d += 1;
      p = pg.parent;
    }
    return d;
  };
  for (const g of [...insetGroups].sort((a, b) => insetDepth(b) - insetDepth(a) || a.id.localeCompare(b.id))) {
    planById.set(g.id, buildPlan(g.id));
    const box: Box = { group: g, w: 0, h: 0, x: 0, y: 0, ports: {} };
    boxByGroup.set(g.id, box);
    const size = placeScope(planById.get(g.id)!, 0, 0);
    box.w = Math.ceil(size.w);
    box.h = Math.ceil(size.h);
  }
  planById.set("__main__", buildPlan(null));

  // left-rail reservation: shift everything right so residual rails fit
  const leftRailCount = scene.edges.filter(
    (e) => e.kind === "residual" ? (e.rail ?? "left") === "left" : e.kind === "skip" && e.rail === "left",
  ).length;
  const leftShift = leftRailCount > 0 ? 30 + (leftRailCount - 1) * RAIL_STEP + 6 : 0;

  // final placement pass at real origins
  placeScope(planById.get("__main__")!, MARGIN + leftShift, MARGIN);

  // -- group output: inset boxes with boundary ports, then stack frames
  const positionedGroups: PositionedGroup[] = [];
  for (const group of scene.groups) {
    if (group.kind !== "inset") continue;
    const box = boxByGroup.get(group.id)!;
    const ports = boundaryPortAnchors(group.ports ?? [], box, (memberId) => {
      const it = internals.get(memberId)!;
      return { x: it.x + it.w / 2, y: it.y + it.h / 2 };
    });
    positionedGroups.push({
      id: group.id,
      label: group.label,
      claimPath: group.claimPath,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      inset: true,
      ports,
    });
  }
  for (const group of scene.groups) {
    if (group.kind === "inset") continue;
    const members = group.members.map((id) => internals.get(id)!);
    const x1 = Math.min(...members.map((m) => m.x)) - pad;
    const y1 = Math.min(...members.map((m) => m.y)) - pad - LABEL_BAND;
    const x2 = Math.max(...members.map((m) => m.x + m.w)) + pad;
    const y2 = Math.max(...members.map((m) => m.y + m.h)) + pad;
    positionedGroups.push({
      id: group.id,
      label: group.label,
      claimPath: group.claimPath,
      x: x1,
      y: y1,
      w: x2 - x1,
      h: y2 - y1,
      repeatBadge: group.repeat ? `${group.repeat.count} ×` : undefined,
      inset: false,
      ports: {},
    });
  }

  // -- node ports: direction-aware anchors
  for (const node of scene.nodes) {
    const it = internals.get(node.id)!;
    const insetId = insetOfNode.get(node.id) ?? null;
    const dir: Direction = insetId ? (groupById.get(insetId)?.direction ?? "left-to-right") : mainDirection;
    const vertical = dir !== "left-to-right";
    it.ports = nodePortAnchors({ x: it.x, y: it.y, w: it.w, h: it.h }, vertical, it.node);
  }

  // -- edges
  const contentMaxX = Math.max(
    ...[...internals.values()].map((it) => it.x + it.w),
    ...positionedGroups.map((g) => g.x + g.w),
  );

  function anchorOf(ref: string): Point {
    const { head, port } = splitRef(ref);
    const box = boxByGroup.get(head);
    if (box) {
      const group = groupById.get(head)!;
      if (group.kind === "inset") {
        const positioned = positionedGroups.find((g) => g.id === head)!;
        const anchor = port ? positioned.ports[port] : undefined;
        if (anchor) return anchor;
        return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      }
    }
    const it = internals.get(head)!;
    if (!port) return it.ports.out!;
    return it.ports[port] ?? it.ports.out!;
  }

  const positionedEdges: PositionedEdge[] = [];
  let leftRailIndex = 0;
  let rightRailIndex = 0;
  for (const edge of scene.edges) {
    const a = anchorOf(edge.from);
    const b = anchorOf(edge.to);
    const isRail = edge.kind === "skip" || edge.kind === "residual";
    const railSide = edge.kind === "residual" ? (edge.rail ?? "left") : edge.rail;
    let points: Point[];
    if (isRail && railSide === "left") {
      const railX = RAIL_FIRST + leftRailIndex * RAIL_STEP;
      leftRailIndex += 1;
      points = [
        { x: a.x, y: a.y },
        { x: railX, y: a.y },
        { x: railX, y: b.y },
        { x: b.x, y: b.y },
      ];
    } else if (isRail) {
      const railX = contentMaxX + skipRailGap * (rightRailIndex + 1) + 8;
      rightRailIndex += 1;
      points = [
        a,
        { x: railX, y: a.y },
        { x: railX, y: b.y },
        b,
      ];
    } else {
      points = orthogonal(a, b);
    }
    positionedEdges.push({ id: edge.id, kind: edge.kind, label: edge.label, claimPath: edge.claimPath, points });
  }

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
    rightRailIndex > 0 ? contentMaxX + skipRailGap * rightRailIndex + 16 : 0,
  );
  const maxBottom = Math.max(
    ...nodes.map((n) => n.y + n.h),
    ...positionedGroups.map((g) => g.y + g.h),
  );
  const size = {
    w: Math.ceil(maxRight + MARGIN),
    h: Math.ceil(maxBottom + MARGIN),
  };

  return { scene, size, nodes, edges: positionedEdges, groups: positionedGroups };

  /** Orthogonal connector; route on the axis with the larger span. */
  function orthogonal(a: Point, b: Point): Point[] {
    if (Math.abs(a.x - b.x) < 0.75) return [a, b];
    if (Math.abs(a.y - b.y) < 0.75) return [a, b];
    if (Math.abs(a.y - b.y) >= Math.abs(a.x - b.x)) {
      const midY = (a.y + b.y) / 2;
      return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
    }
    const midX = (a.x + b.x) / 2;
    return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
  }
}
