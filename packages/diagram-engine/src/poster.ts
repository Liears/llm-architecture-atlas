import type { PositionedEdge, PositionedGroup, PositionedNode, PositionedScene, Point } from "./positioned.js";
import { resolveSidePorts } from "./ports.js";
import type { DiagramScene, SemanticGroup, SemanticNode } from "./types.js";

export interface PosterBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EditorialPosterBlueprint {
  id: string;
  size: { w: number; h: number };
  nodes: PosterBox[];
  groups: PosterBox[];
  /** Edges not listed are intentionally omitted from this composition. */
  edges: string[];
  /** Reviewed routes for callouts that need a clear corridor around dense content. */
  edgeRoutes?: Record<string, Point[]>;
}

function distribute(box: PosterBox, side: "left" | "right" | "top" | "bottom", index: number, count: number): Point {
  const fraction = (index + 1) / (count + 1);
  if (side === "left") return { x: box.x, y: box.y + box.h * fraction };
  if (side === "right") return { x: box.x + box.w, y: box.y + box.h * fraction };
  if (side === "top") return { x: box.x + box.w * fraction, y: box.y };
  return { x: box.x + box.w * fraction, y: box.y + box.h };
}

function nodePorts(node: SemanticNode, box: PosterBox): Record<string, Point> {
  const ports: Record<string, Point> = {
    in: { x: box.x, y: box.y + box.h / 2 },
    out: { x: box.x + box.w, y: box.y + box.h / 2 },
  };
  const defs = resolveSidePorts(node);
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const onSide = defs.filter((port) => port.side === side);
    onSide.forEach((port, index) => {
      ports[port.name] = distribute(box, side, index, onSide.length);
    });
  }
  return ports;
}

function groupPorts(group: SemanticGroup, box: PosterBox): Record<string, Point> {
  const ports: Record<string, Point> = {};
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const onSide = (group.ports ?? []).filter((port) => port.side === side);
    onSide.forEach((port, index) => {
      ports[port.id] = distribute(box, side, index, onSide.length);
    });
  }
  return ports;
}

function splitRef(ref: string): { head: string; port?: string } {
  const dot = ref.indexOf(".");
  return dot === -1 ? { head: ref } : { head: ref.slice(0, dot), port: ref.slice(dot + 1) };
}

function route(a: Point, b: Point): Point[] {
  if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) return [a, b];
  const midX = (a.x + b.x) / 2;
  return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
}

function samePoint(a: Point | undefined, b: Point, epsilon = 0.01): boolean {
  return !!a && Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

/**
 * Applies a reviewed editorial composition without moving facts into the
 * renderer. Coordinates live in this view blueprint, never in Diagram IR.
 */
export function composeEditorialPoster(scene: DiagramScene, blueprint: EditorialPosterBlueprint): PositionedScene {
  const semanticNodes = new Map(scene.nodes.map((node) => [node.id, node] as const));
  const semanticGroups = new Map(scene.groups.map((group) => [group.id, group] as const));
  const nodeBoxes = new Map(blueprint.nodes.map((box) => [box.id, box] as const));
  const groupBoxes = new Map(blueprint.groups.map((box) => [box.id, box] as const));

  const nodes: PositionedNode[] = blueprint.nodes.map((box) => {
    const node = semanticNodes.get(box.id);
    if (!node) throw new Error(`poster ${blueprint.id}: unknown node ${box.id}`);
    const { id: _boxId, ...geometry } = box;
    return {
      id: node.id,
      kind: node.kind,
      label: node.label,
      detail: node.detail,
      claimPath: node.claimPath,
      claims: node.claims,
      ...geometry,
      ports: nodePorts(node, box),
    };
  });

  const groups: PositionedGroup[] = blueprint.groups.map((box) => {
    const group = semanticGroups.get(box.id);
    if (!group) throw new Error(`poster ${blueprint.id}: unknown group ${box.id}`);
    const { id: _boxId, ...geometry } = box;
    return {
      id: group.id,
      label: group.label,
      claimPath: group.claimPath,
      ...geometry,
      repeatBadge: group.repeat?.label,
      inset: group.kind === "inset",
      ports: groupPorts(group, box),
    };
  });

  const positionedNodes = new Map(nodes.map((node) => [node.id, node] as const));
  const positionedGroups = new Map(groups.map((group) => [group.id, group] as const));
  const anchor = (ref: string, outgoing: boolean): Point => {
    const parsed = splitRef(ref);
    const node = positionedNodes.get(parsed.head);
    if (node) return node.ports[parsed.port ?? (outgoing ? "out" : "in")] ?? node.ports[outgoing ? "out" : "in"]!;
    const group = positionedGroups.get(parsed.head);
    if (group) {
      if (parsed.port && group.ports[parsed.port]) return group.ports[parsed.port]!;
      return outgoing
        ? { x: group.x + group.w, y: group.y + group.h / 2 }
        : { x: group.x, y: group.y + group.h / 2 };
    }
    throw new Error(`poster ${blueprint.id}: endpoint ${ref} is not positioned`);
  };

  const edgeById = new Map(scene.edges.map((edge) => [edge.id, edge] as const));
  const edges: PositionedEdge[] = blueprint.edges.map((id) => {
    const edge = edgeById.get(id);
    if (!edge) throw new Error(`poster ${blueprint.id}: unknown edge ${id}`);
    const from = anchor(edge.from, true);
    const to = anchor(edge.to, false);
    const explicit = blueprint.edgeRoutes?.[id];
    if (explicit && !samePoint(explicit[0], from)) {
      throw new Error(`poster ${blueprint.id}: edge ${id} route is detached from its source anchor`);
    }
    if (explicit && !samePoint(explicit.at(-1), to)) {
      throw new Error(`poster ${blueprint.id}: edge ${id} route is detached from its target anchor`);
    }
    return {
      id: edge.id,
      kind: edge.kind,
      label: edge.label,
      claimPath: edge.claimPath,
      points: explicit ?? route(from, to),
    };
  });

  // Catch accidental clipping in the blueprint itself before SVG emission.
  for (const box of [...blueprint.nodes, ...blueprint.groups]) {
    if (box.x < 0 || box.y < 0 || box.x + box.w > blueprint.size.w || box.y + box.h > blueprint.size.h) {
      throw new Error(`poster ${blueprint.id}: ${box.id} falls outside ${blueprint.size.w}x${blueprint.size.h}`);
    }
  }
  return { scene, composition: "editorial-poster", size: blueprint.size, nodes, edges, groups };
}
