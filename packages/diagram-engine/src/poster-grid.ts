import type { EditorialPosterBlueprint, PosterBox } from "./poster.js";
import type { Point } from "./positioned.js";
import type { DiagramScene, SemanticNode } from "./types.js";
import { resolveSidePorts } from "./ports.js";
import { measureText } from "./text.js";
import { diagramTypography } from "./typography.js";

export interface LensSpec {
  groupId: string;
  /** Rows of node IDs (or null empty column spacers) inside this inset. */
  rows: Array<Array<string | null>>;
}

export interface CalloutSpec {
  edgeId: string;
  sourceNodeId: string;
  sourcePort: string;
  targetGroupId: string;
  targetPort: string;
  busY: number;
  corridorX: number;
}

export interface PosterGridSpec {
  id: string;
  scene: DiagramScene;
  spine: string[];
  scheduleGroupId: string;
  scheduleNodes: string[];
  /** Optional compact secondary group anchored below schedule in the left column. */
  leftBottomGroup?: LensSpec;
  lenses: LensSpec[];
  callouts: CalloutSpec[];
}

const CANVAS_W = 1380;
const CANVAS_H = 780;
const MARGIN_X = 40;
const SPINE_Y = 66;
const SPINE_H = 68;
const BODY_Y = 198;
const BODY_BOTTOM = 750;
const SCHED_W = 396;
const CORRIDOR_W = 54;
const LENS_X = MARGIN_X + SCHED_W + CORRIDOR_W;
const LENS_W = CANVAS_W - MARGIN_X - LENS_X;

function requiredNodeWidth(node: SemanticNode, minW = 104): number {
  const typo = diagramTypography("editorial-poster");
  const labelW = measureText(node.label, typo.nodeLabel, true) * 1.14;
  const detailW = node.detail ? measureText(node.detail, typo.nodeDetail, false) * 1.14 : 0;
  return Math.max(minW, Math.ceil(Math.max(labelW, detailW) + 34));
}

function distributePort(
  box: PosterBox,
  side: "left" | "right" | "top" | "bottom",
  index: number,
  count: number,
): Point {
  const fraction = (index + 1) / (count + 1);
  if (side === "left") return { x: box.x, y: box.y + box.h * fraction };
  if (side === "right") return { x: box.x + box.w, y: box.y + box.h * fraction };
  if (side === "top") return { x: box.x + box.w * fraction, y: box.y };
  return { x: box.x + box.w * fraction, y: box.y + box.h };
}

function resolveNodePort(node: SemanticNode, box: PosterBox, portName: string): Point {
  const defs = resolveSidePorts(node);
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const onSide = defs.filter((p) => p.side === side);
    const idx = onSide.findIndex((p) => p.name === portName);
    if (idx >= 0) return distributePort(box, side, idx, onSide.length);
  }
  return { x: box.x + box.w / 2, y: box.y + box.h };
}

/**
 * Deterministic 3-zone poster composition (spine + schedule column + stacked
 * mechanism lenses) that respects text widths, reserved label bands, aspect
 * ratio (<= 1.8:1), and disjoint orthogonal callout corridors.
 */
export function buildPosterGridBlueprint(spec: PosterGridSpec): EditorialPosterBlueprint {
  const nodeMap = new Map(spec.scene.nodes.map((n) => [n.id, n] as const));
  const groupMap = new Map(spec.scene.groups.map((g) => [g.id, g] as const));
  const nodes: PosterBox[] = [];
  const groups: PosterBox[] = [];
  const boxById = new Map<string, PosterBox>();
  const groupBoxById = new Map<string, PosterBox>();

  // 1. Top main spine: distribute extra horizontal width proportionally.
  const spineNodes = spec.spine.map((id) => {
    const n = nodeMap.get(id);
    if (!n) throw new Error(`poster-grid ${spec.id}: unknown spine node ${id}`);
    return n;
  });
  const availSpineW = CANVAS_W - MARGIN_X * 2;
  const gapSpine = spineNodes.length >= 6 ? 16 : 24;
  const minWidths = spineNodes.map((n) => requiredNodeWidth(n, 102));
  const totalMin = minWidths.reduce((a, b) => a + b, 0) + gapSpine * (spineNodes.length - 1);
  const extra = Math.max(0, availSpineW - totalMin);
  const weightSum = spineNodes.reduce(
    (s, n) => s + (n.kind === "stack" || n.kind === "decision" || n.kind === "readout" ? 2.2 : 1),
    0,
  );

  let curX = MARGIN_X;
  spineNodes.forEach((n, i) => {
    const wShare = n.kind === "stack" || n.kind === "decision" || n.kind === "readout" ? 2.2 : 1;
    const bonus = Math.floor((extra * wShare) / weightSum);
    const w = minWidths[i]! + bonus;
    const box: PosterBox = { id: n.id, x: curX, y: SPINE_Y, w, h: SPINE_H };
    nodes.push(box);
    boxById.set(n.id, box);
    curX += w + gapSpine;
  });
  if (spineNodes.length > 0) {
    const last = nodes[nodes.length - 1]!;
    const targetRight = CANVAS_W - MARGIN_X;
    if (last.x + last.w < targetRight) {
      last.w += targetRight - (last.x + last.w);
    }
  }

  // Helper to place rows evenly inside a bounded group inset.
  const placeRowsInGroup = (groupId: string, rows: Array<Array<string | null>>, gx: number, gy: number, gw: number, gh: number) => {
    const gBox: PosterBox = { id: groupId, x: gx, y: gy, w: gw, h: gh };
    groups.push(gBox);
    groupBoxById.set(groupId, gBox);

    const padTop = 36;
    const padSide = 20;
    const padBottom = rows.length > 1 ? 20 : 16;
    const innerH = gh - padTop - padBottom;
    const rowCount = rows.length;
    const rowGap = 14;
    const nodeH = Math.max(44, Math.min(74, Math.floor((innerH - rowGap * (rowCount - 1)) / rowCount)));
    const totalRowsH = rowCount * nodeH + (rowCount - 1) * rowGap;
    const firstRowY = gy + padTop + Math.max(0, Math.floor((innerH - totalRowsH) / 2));

    const maxCols = Math.max(...rows.map((r) => r.length));
    const colGap = 20;
    const availRowW = gw - padSide * 2 - colGap * (maxCols - 1);
    const colMinW = Array.from({ length: maxCols }, (_, ci) => {
      let min = 104;
      for (const row of rows) {
        const id = row[ci];
        if (id) min = Math.max(min, requiredNodeWidth(nodeMap.get(id)!, 104));
      }
      return min;
    });
    const colMinSum = colMinW.reduce((a, b) => a + b, 0);
    const colExtra = Math.max(0, availRowW - colMinSum);
    const perColBonus = Math.floor(colExtra / maxCols);
    const colWidths = colMinW.map((w, ci) =>
      ci === maxCols - 1
        ? gw - padSide * 2 - colGap * (maxCols - 1) - colMinW.slice(0, -1).reduce((a, b) => a + b + perColBonus, 0)
        : w + perColBonus,
    );
    const colXs: number[] = [];
    let cx = gx + padSide;
    for (let ci = 0; ci < maxCols; ci++) {
      colXs.push(cx);
      cx += colWidths[ci]! + colGap;
    }

    rows.forEach((rowIds, ri) => {
      const ny = firstRowY + ri * (nodeH + rowGap);
      const hasNull = rowIds.some((id) => id === null);
      if (!hasNull && rowIds.length !== maxCols) {
        const rGap = 20;
        const rAvail = gw - padSide * 2 - rGap * (rowIds.length - 1);
        const rMins = rowIds.map((id) => requiredNodeWidth(nodeMap.get(id!)!, 104));
        const rExtra = Math.max(0, rAvail - rMins.reduce((a, b) => a + b, 0));
        const rBonus = Math.floor(rExtra / rowIds.length);
        let rx = gx + padSide;
        rowIds.forEach((id, ci) => {
          const nw = ci === rowIds.length - 1 ? gx + gw - padSide - rx : rMins[ci]! + rBonus;
          const nBox: PosterBox = { id: id!, x: rx, y: ny, w: nw, h: nodeH };
          nodes.push(nBox);
          boxById.set(id!, nBox);
          rx += nw + rGap;
        });
      } else {
        rowIds.forEach((id, ci) => {
          if (!id) return;
          const nBox: PosterBox = { id, x: colXs[ci]!, y: ny, w: colWidths[ci]!, h: nodeH };
          nodes.push(nBox);
          boxById.set(id, nBox);
        });
      }
    });
  };

  // 2. Left column: Layer Schedule / Genome inset + optional secondary footer group.
  const schedCount = Math.max(1, spec.scheduleNodes.length);
  const schedPadTop = 36;
  const schedPadBottom = 16;
  const schedGap = 10;
  const maxLeftH = BODY_BOTTOM - BODY_Y;
  const leftSplitGap = 16;
  const schedDesiredH = spec.leftBottomGroup
    ? Math.max(198, Math.min(maxLeftH - 188 - leftSplitGap, schedPadTop + schedPadBottom + schedCount * 58 + (schedCount - 1) * schedGap))
    : maxLeftH;

  const schedGroupBox: PosterBox = {
    id: spec.scheduleGroupId,
    x: MARGIN_X,
    y: BODY_Y,
    w: SCHED_W,
    h: schedDesiredH,
  };
  groups.push(schedGroupBox);
  groupBoxById.set(spec.scheduleGroupId, schedGroupBox);

  const schedInnerW = SCHED_W - 32;
  const maxRowH = 68;
  const rawRowH = Math.floor(
    (schedGroupBox.h - schedPadTop - schedPadBottom - schedGap * (schedCount - 1)) / schedCount,
  );
  const rowH = Math.max(44, Math.min(maxRowH, rawRowH));
  const usedSchedH = rowH * schedCount + schedGap * (schedCount - 1);
  const schedStartY =
    BODY_Y + schedPadTop + Math.max(0, Math.floor((schedGroupBox.h - schedPadTop - schedPadBottom - usedSchedH) / 2));

  spec.scheduleNodes.forEach((id, i) => {
    const box: PosterBox = {
      id,
      x: MARGIN_X + 16,
      y: schedStartY + i * (rowH + schedGap),
      w: schedInnerW,
      h: rowH,
    };
    nodes.push(box);
    boxById.set(id, box);
  });

  if (spec.leftBottomGroup) {
    const botY = BODY_Y + schedDesiredH + leftSplitGap;
    const botH = BODY_BOTTOM - botY;
    placeRowsInGroup(spec.leftBottomGroup.groupId, spec.leftBottomGroup.rows, MARGIN_X, botY, SCHED_W, botH);
  }

  // 3. Right column: Stacked Mechanism Lenses (proportional height by row count).
  const lensGap = 18;
  const lensCount = Math.max(1, spec.lenses.length);
  const availLensH = BODY_BOTTOM - BODY_Y - lensGap * (lensCount - 1);
  const lensWeights = spec.lenses.map((l) => 1 + Math.max(0, l.rows.length - 1) * 0.45);
  const totalLensWeight = lensWeights.reduce((a, b) => a + b, 0);

  let curLensY = BODY_Y;
  spec.lenses.forEach((lens, li) => {
    const gy = curLensY;
    const gh =
      li === lensCount - 1
        ? BODY_BOTTOM - gy
        : Math.floor((availLensH * lensWeights[li]!) / totalLensWeight);
    curLensY = gy + gh + lensGap;
    placeRowsInGroup(lens.groupId, lens.rows, LENS_X, gy, LENS_W, gh);
  });

  // 4. Orthogonal non-overlapping callout routes + L-bend internal lens edges.
  const edgeRoutes: Record<string, Point[]> = {};
  const calloutById = new Map(spec.callouts.map((c) => [c.edgeId, c] as const));

  const resolveEndpoint = (ref: string, outgoing: boolean): { point: Point; side?: "left" | "right" | "top" | "bottom" } | null => {
    const dot = ref.indexOf(".");
    const head = dot === -1 ? ref : ref.slice(0, dot);
    const port = dot === -1 ? undefined : ref.slice(dot + 1);
    const nNode = nodeMap.get(head);
    const nBox = boxById.get(head);
    if (nNode && nBox) {
      if (!port || port === "in" || port === "out") {
        const side = outgoing ? "right" : "left";
        const pt = side === "right" ? { x: nBox.x + nBox.w, y: nBox.y + nBox.h / 2 } : { x: nBox.x, y: nBox.y + nBox.h / 2 };
        return { point: pt, side };
      }
      const def = resolveSidePorts(nNode).find((p) => p.name === port);
      return { point: resolveNodePort(nNode, nBox, port), side: def?.side };
    }
    const grp = groupMap.get(head);
    const gBox = groupBoxById.get(head);
    if (grp && gBox && port) {
      const def = (grp.ports ?? []).find((p) => p.id === port);
      if (def) {
        const allSide = (grp.ports ?? []).filter((p) => p.side === def.side);
        const idx = allSide.findIndex((p) => p.id === port);
        return { point: distributePort(gBox, def.side, idx, allSide.length), side: def.side };
      }
    }
    return null;
  };

  for (const edge of spec.scene.edges) {
    const callout = calloutById.get(edge.id);
    if (callout) {
      const srcNode = nodeMap.get(callout.sourceNodeId);
      const srcBox = boxById.get(callout.sourceNodeId);
      const dstGroup = groupMap.get(callout.targetGroupId);
      const dstBox = groupBoxById.get(callout.targetGroupId);
      if (!srcNode || !srcBox || !dstGroup || !dstBox) continue;

      const pFrom = resolveNodePort(srcNode, srcBox, callout.sourcePort);
      const targetPortDef = (dstGroup.ports ?? []).find((p) => p.id === callout.targetPort);
      if (!targetPortDef) continue;
      const allSide = (dstGroup.ports ?? []).filter((p) => p.side === targetPortDef.side);
      const pIdx = allSide.findIndex((p) => p.id === callout.targetPort);
      const pTo = distributePort(dstBox, targetPortDef.side, pIdx, allSide.length);

      edgeRoutes[callout.edgeId] = [
        pFrom,
        { x: pFrom.x, y: callout.busY },
        { x: callout.corridorX, y: callout.busY },
        { x: callout.corridorX, y: pTo.y },
        pTo,
      ];
      continue;
    }

    const from = resolveEndpoint(edge.from, true);
    const to = resolveEndpoint(edge.to, false);
    if (!from || !to) continue;
    if ((from.side === "bottom" || from.side === "top") && (to.side === "left" || to.side === "right")) {
      edgeRoutes[edge.id] = [from.point, { x: from.point.x, y: to.point.y }, to.point];
    } else if ((from.side === "left" || from.side === "right") && (to.side === "top" || to.side === "bottom")) {
      edgeRoutes[edge.id] = [from.point, { x: to.point.x, y: from.point.y }, to.point];
    } else if (from.side === "bottom" && to.side === "bottom") {
      const dropY = Math.max(from.point.y, to.point.y) + 11;
      edgeRoutes[edge.id] = [from.point, { x: from.point.x, y: dropY }, { x: to.point.x, y: dropY }, to.point];
    } else if (from.side === "top" && to.side === "top") {
      const riseY = Math.min(from.point.y, to.point.y) - 11;
      edgeRoutes[edge.id] = [from.point, { x: from.point.x, y: riseY }, { x: to.point.x, y: riseY }, to.point];
    }
  }

  return {
    id: spec.id,
    size: { w: CANVAS_W, h: CANVAS_H },
    nodes,
    groups,
    edges: spec.scene.edges.map((e) => e.id),
    edgeRoutes,
  };
}
