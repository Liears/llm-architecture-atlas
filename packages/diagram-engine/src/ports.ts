/**
 * Node port contract helpers (issue #33, round 4): the string/object port
 * normalization used to live twice (layout.ts and elk.ts) and could drift.
 * Both backends and the validator now share these.
 */

import type { SemanticNode } from "./types.js";

export interface SidePort {
  name: string;
  side: "left" | "right";
  /** stream identity tag (#33 round 4): ports of one residual stream share it */
  stream?: string;
  /** ingress/egress role (#33 round 5) */
  role?: "ingress" | "egress";
}

/** Declared ports with sides resolved: bare strings alternate left/right. */
export function resolveSidePorts(node: Pick<SemanticNode, "ports">): SidePort[] {
  return (node.ports ?? []).map((p, i) =>
    typeof p === "string"
      ? { name: p, side: (i % 2 === 0 ? "left" : "right") as "left" | "right" }
      : p,
  );
}

export function declaredPortNames(node: Pick<SemanticNode, "ports">): string[] {
  return resolveSidePorts(node).map((p) => p.name);
}

/** Stream tag of a declared node port, if any. */
export function portStream(node: Pick<SemanticNode, "ports">, port: string): string | undefined {
  return resolveSidePorts(node).find((p) => p.name === port)?.stream;
}

export interface PortRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * All port anchors of a placed node (round 5): implicit in/out by flow
 * direction plus declared side ports distributed evenly. Single
 * implementation for the built-in layout and the ELK adapter so the two
 * backends cannot drift (rounds 4–5 review).
 */
export function nodePortAnchors(
  rect: PortRect,
  vertical: boolean,
  node: Pick<SemanticNode, "ports">,
): Record<string, { x: number; y: number }> {
  const ports: Record<string, { x: number; y: number }> = vertical
    ? {
        in: { x: rect.x + rect.w / 2, y: rect.y + rect.h },
        out: { x: rect.x + rect.w / 2, y: rect.y },
      }
    : {
        in: { x: rect.x, y: rect.y + rect.h / 2 },
        out: { x: rect.x + rect.w, y: rect.y + rect.h / 2 },
      };
  const side = resolveSidePorts(node);
  const leftNames = side.filter((p) => p.side === "left").map((p) => p.name);
  const rightNames = side.filter((p) => p.side === "right").map((p) => p.name);
  leftNames.forEach((name, i) => {
    ports[name] = { x: rect.x, y: rect.y + (rect.h * (i + 1)) / (leftNames.length + 1) };
  });
  rightNames.forEach((name, i) => {
    ports[name] = { x: rect.x + rect.w, y: rect.y + (rect.h * (i + 1)) / (rightNames.length + 1) };
  });
  return ports;
}
