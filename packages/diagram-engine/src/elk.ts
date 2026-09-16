/**
 * ELK adapter (issue #5, compound support #33): optional layout backend for
 * free-form subgraphs.
 *
 * The ELK engine is injected (constructor-style) so the package itself does
 * not depend on elkjs; tests and callers decide. The scene maps to a compound
 * ELK graph: inset groups become ELK parent nodes (group-local direction),
 * main-scope nodes sit at the root, and boundary-port edges connect at the
 * group node. Post-processing mirrors the built-in backend: shared boundary
 * port anchors, direction-aware node ports, stack frames from member coords.
 */

import type { DiagramScene, SemanticGroup } from "./types.js";
import type { Point, PositionedEdge, PositionedGroup, PositionedNode, PositionedScene } from "./positioned.js";
import { boundaryPortAnchors } from "./layout.js";

export interface ElkPort {
  id: string;
  width: number;
  height: number;
}

export interface ElkNode {
  id: string;
  width: number;
  height: number;
  ports?: ElkPort[];
  children?: ElkNode[];
  layoutOptions?: Record<string, string>;
}

export interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
}

export interface ElkGraph {
  id: string;
  layoutOptions: Record<string, string>;
  children: ElkNode[];
  edges: ElkEdge[];
}

export interface ElkSection {
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  bendPoints?: Array<{ x: number; y: number }>;
}

export interface ElkLayoutEngine {
  layout(graph: ElkGraph): Promise<{
    children: Array<ElkNode & { x: number; y: number; children?: Array<ElkNode & { x: number; y: number; children?: unknown[] }> }>;
    edges?: Array<ElkEdge & { sections?: ElkSection[] }>;
  }>;
}

function splitRef(ref: string): { head: string; port?: string } {
  const dot = ref.indexOf(".");
  if (dot === -1) return { head: ref };
  return { head: ref.slice(0, dot), port: ref.slice(dot + 1) };
}

function elkDirection(d: "bottom-to-top" | "top-to-bottom" | "left-to-right"): string {
  if (d === "left-to-right") return "RIGHT";
  if (d === "top-to-bottom") return "DOWN";
  return "UP";
}

export async function layoutWithElk(
  scene: DiagramScene,
  elk: ElkLayoutEngine,
  opts: { fontSize?: number } = {},
): Promise<PositionedScene> {
  const fontSize = opts.fontSize ?? 16;
  const boxW = (label: string, detail?: string): number =>
    Math.ceil(Math.max(label.length, (detail?.length ?? 0) * 0.8) * fontSize * 0.58 + 28);
  const boxH = (detail?: string): number => Math.ceil((detail ? fontSize * 1.1 + 6 : 0) + fontSize * 1.35 + 28);

  // -- scope assignment (mirrors layout.ts)
  const groupById = new Map<string, SemanticGroup>(scene.groups.map((g) => [g.id, g]));
  const memberGroup = new Map<string, string>();
  for (const g of scene.groups) for (const m of g.members) memberGroup.set(m, g.id);

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
  const insetOfBox = (group: SemanticGroup): string | null => {
    let g = group.parent ?? null;
    while (g) {
      const grp = groupById.get(g)!;
      if (grp.kind === "inset") return g;
      g = grp.parent ?? null;
    }
    return null;
  };

  const directionConstraint = scene.constraints.find((c) => c.type === "direction") as
    | { type: "direction"; value: "bottom-to-top" | "top-to-bottom" | "left-to-right" }
    | undefined;
  const mainDirection = directionConstraint?.value ?? "bottom-to-top";

  const nodeById = new Map(scene.nodes.map((n) => [n.id, n]));

  // -- compound ELK graph: inset groups are parent nodes
  function elkNodeForGroup(group: SemanticGroup): ElkNode {
    const children: ElkNode[] = [];
    for (const node of scene.nodes) {
      if (insetOfNode.get(node.id) !== group.id) continue;
      children.push({
        id: node.id,
        width: boxW(node.label, node.detail),
        height: boxH(node.detail),
      });
    }
    for (const g of scene.groups) {
      if (g.kind === "inset" && insetOfBox(g) === group.id) children.push(elkNodeForGroup(g));
    }
    return {
      id: group.id,
      width: 0, // ELK sizes parents to fit children
      height: 0,
      children,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": elkDirection(group.direction ?? "left-to-right"),
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.spacing.nodeNodeBetweenLayers": "56",
        "elk.spacing.nodeNode": "36",
        "elk.padding": "[top=34,left=14,bottom=14,right=14]",
      },
    };
  }

  const rootChildren: ElkNode[] = [];
  for (const node of scene.nodes) {
    if (insetOfNode.get(node.id) !== null) continue;
    rootChildren.push({ id: node.id, width: boxW(node.label, node.detail), height: boxH(node.detail) });
  }
  for (const g of scene.groups) {
    if (g.kind === "inset" && insetOfBox(g) === null) rootChildren.push(elkNodeForGroup(g));
  }

  const graph: ElkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": elkDirection(mainDirection),
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "56",
      "elk.spacing.nodeNode": "36",
    },
    children: rootChildren,
    edges: scene.edges.map((edge) => ({
      id: edge.id,
      sources: [splitRef(edge.from).head],
      targets: [splitRef(edge.to).head],
    })),
  };

  const result = await elk.layout(graph);

  // -- read back absolute coordinates (nested x/y are parent-relative)
  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  const walk = (children: Array<ElkNode & { x: number; y: number; children?: unknown[] }>, dx: number, dy: number): void => {
    for (const c of children) {
      const x = dx + c.x;
      const y = dy + c.y;
      pos.set(c.id, { x, y, w: c.width, h: c.height });
      if (c.children) walk(c.children as typeof children, x, y);
    }
  };
  const rawMinX = Math.min(...collectX(result.children, 0));
  const rawMinY = Math.min(...collectY(result.children, 0));
  const offsetX = -rawMinX + 28;
  const offsetY = -rawMinY + 28;
  walk(result.children, offsetX, offsetY);

  function collectX(children: Array<ElkNode & { x: number; y: number; children?: unknown[] }>, dx: number): number[] {
    const out: number[] = [];
    for (const c of children) {
      out.push(dx + c.x);
      if (c.children) out.push(...collectX(c.children as typeof children, dx + c.x));
    }
    return out;
  }
  function collectY(children: Array<ElkNode & { x: number; y: number; children?: unknown[] }>, dy: number): number[] {
    const out: number[] = [];
    for (const c of children) {
      out.push(dy + c.y);
      if (c.children) out.push(...collectY(c.children as typeof children, dy + c.y));
    }
    return out;
  }

  // -- nodes with direction-aware ports (same math as the built-in backend)
  const insetById = new Map(scene.groups.filter((g) => g.kind === "inset").map((g) => [g.id, g]));
  const positionedNodes: PositionedNode[] = scene.nodes.map((node) => {
    const p = pos.get(node.id)!;
    const insetId = insetOfNode.get(node.id) ?? null;
    const dir: string = insetId ? (insetById.get(insetId)?.direction ?? "left-to-right") : mainDirection;
    const vertical = dir !== "left-to-right";
    const ports: Record<string, Point> = vertical
      ? {
          in: { x: p.x + p.w / 2, y: p.y + p.h },
          out: { x: p.x + p.w / 2, y: p.y },
        }
      : {
          in: { x: p.x, y: p.y + p.h / 2 },
          out: { x: p.x + p.w, y: p.y + p.h / 2 },
        };
    const side = node.ports ?? [];
    const leftNames = side.filter((_, i) => i % 2 === 0);
    const rightNames = side.filter((_, i) => i % 2 === 1);
    leftNames.forEach((name, i) => {
      ports[name] = { x: p.x, y: p.y + (p.h * (i + 1)) / (leftNames.length + 1) };
    });
    rightNames.forEach((name, i) => {
      ports[name] = { x: p.x + p.w, y: p.y + (p.h * (i + 1)) / (rightNames.length + 1) };
    });
    return {
      id: node.id,
      kind: node.kind,
      label: node.label,
      detail: node.detail,
      claimPath: node.claimPath,
      claims: node.claims,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      ports,
    };
  });
  const positionedById = new Map(positionedNodes.map((n) => [n.id, n]));

  // -- groups: inset boxes from ELK dims + shared port anchors; stacks framed
  const positionedGroups: PositionedGroup[] = [];
  for (const group of scene.groups) {
    if (group.kind !== "inset") continue;
    const box = pos.get(group.id)!;
    const ports = boundaryPortAnchors(group.ports ?? [], box, (memberId) => {
      const m = positionedById.get(memberId)!;
      return { x: m.x + m.w / 2, y: m.y + m.h / 2 };
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
    const members = group.members.map((id) => positionedById.get(id)!);
    const x1 = Math.min(...members.map((m) => m.x)) - 14;
    const y1 = Math.min(...members.map((m) => m.y)) - 14 - 20;
    const x2 = Math.max(...members.map((m) => m.x + m.w)) + 14;
    const y2 = Math.max(...members.map((m) => m.y + m.h)) + 14;
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

  // -- edges: ELK sections (root coords), falling back to straight anchors
  const groupBox = new Map(positionedGroups.filter((g) => g.inset).map((g) => [g.id, g]));
  function anchorOf(ref: string): Point {
    const { head, port } = splitRef(ref);
    const group = groupBox.get(head);
    if (group) {
      const anchor = port ? group.ports[port] : undefined;
      if (anchor) return anchor;
      return { x: group.x + group.w / 2, y: group.y + group.h / 2 };
    }
    const node = positionedById.get(head)!;
    if (!port) return node.ports.out!;
    return node.ports[port] ?? node.ports.out!;
  }

  const positionedEdges: PositionedEdge[] = scene.edges.map((edge) => {
    const section = result.edges?.find((e) => e.id === edge.id)?.sections?.[0];
    // semantic endpoints win (review fix): the declared anchors — boundary
    // ports for group references, direction-aware ports for nodes — replace
    // ELK's chosen attach points; ELK keeps only the interior bends
    const a = anchorOf(edge.from);
    const b = anchorOf(edge.to);
    const points: Point[] = section
      ? [
          a,
          ...(section.bendPoints ?? []).map((pt) => ({ x: pt.x + offsetX, y: pt.y + offsetY })),
          b,
        ]
      : [a, b];
    return { id: edge.id, kind: edge.kind, label: edge.label, claimPath: edge.claimPath, points };
  });

  const maxRight = Math.max(...positionedNodes.map((n) => n.x + n.w), ...positionedGroups.map((g) => g.x + g.w));
  const maxBottom = Math.max(...positionedNodes.map((n) => n.y + n.h), ...positionedGroups.map((g) => g.y + g.h));
  const size = { w: Math.ceil(maxRight + 28), h: Math.ceil(maxBottom + 28) };

  return { scene, size, nodes: positionedNodes, edges: positionedEdges, groups: positionedGroups };
}
