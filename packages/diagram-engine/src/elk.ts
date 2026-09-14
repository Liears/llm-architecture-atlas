/**
 * ELK adapter (issue #5): optional layout backend for free-form subgraphs.
 *
 * The ELK engine is injected (constructor-style) so the package itself does
 * not depend on elkjs; tests and callers decide. Direction maps from the
 * scene's bottom-to-top constraint; declared ports become ELK ports.
 */

import type { DiagramScene } from "./types.js";
import type { Point, PositionedScene } from "./positioned.js";
import { layoutScene } from "./layout.js";

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

export interface ElkLayoutEngine {
  layout(graph: ElkGraph): Promise<{
    children: Array<ElkNode & { x: number; y: number; ports?: Array<ElkPort & { x: number; y: number }> }>;
    edges?: Array<ElkEdge & { sections?: Array<{ startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; bendPoints?: Array<{ x: number; y: number }> }> }>;
  }>;
}

export async function layoutWithElk(
  scene: DiagramScene,
  elk: ElkLayoutEngine,
  opts: { fontSize?: number } = {},
): Promise<PositionedScene> {
  const fontSize = opts.fontSize ?? 16;
  const direction = scene.constraints.some(
    (c) => c.type === "direction" && c.value === "top-to-bottom",
  )
    ? "DOWN"
    : "UP";

  const children: ElkNode[] = scene.nodes.map((node) => ({
    id: node.id,
    width: Math.ceil(node.label.length * fontSize * 0.58 + 28),
    height: Math.ceil(fontSize * 1.35 + 28),
    ports: (node.ports ?? []).map((name) => ({ id: `${node.id}.${name}`, width: 2, height: 2 })),
  }));

  const graph: ElkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "56",
      "elk.spacing.nodeNode": "36",
    },
    children,
    edges: scene.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.from.split(".")[0]!],
      targets: [edge.to.split(".")[0]!],
    })),
  };

  const result = await elk.layout(graph);
  const byId = new Map(result.children.map((c) => [c.id, c]));
  const nodeById = new Map(scene.nodes.map((n) => [n.id, n]));

  // ELK gives top-left coords with y growing downward already; normalize into
  // positive space, then reuse the built-in group framing for consistency.
  const minX = Math.min(...result.children.map((c) => c.x));
  const minY = Math.min(...result.children.map((c) => c.y));
  const nodes = result.children.map((c) => {
    const semantic = nodeById.get(c.id)!;
    const x = c.x - minX + 28;
    const y = c.y - minY + 28;
    const ports: Record<string, Point> = {};
    for (const p of c.ports ?? []) {
      const name = p.id.split(".")[1] ?? p.id;
      ports[name] = { x: x + p.x, y: y + p.y };
    }
    return {
      id: c.id,
      kind: semantic.kind,
      label: semantic.label,
      detail: semantic.detail,
      claimPath: semantic.claimPath,
      x,
      y,
      w: c.width,
      h: c.height,
      ports,
    };
  });

  const edges = scene.edges.map((edge) => {
    const section = result.edges?.find((e) => e.id === edge.id)?.sections?.[0];
    const fromId = edge.from.split(".")[0]!;
    const toId = edge.to.split(".")[0]!;
    const points = section
      ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
      : [
          { x: nodes.find((n) => n.id === fromId)!.x, y: 0 },
          { x: nodes.find((n) => n.id === toId)!.x, y: 0 },
        ];
    return { id: edge.id, kind: edge.kind, label: edge.label, points };
  });

  const base = layoutScene(scene, { fontSize }); // group framing + size baseline
  return {
    scene,
    size: base.size,
    nodes: nodes as PositionedScene["nodes"],
    edges: edges as PositionedScene["edges"],
    groups: base.groups,
  };
}
