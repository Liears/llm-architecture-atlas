/**
 * Node port contract helpers (issue #33, round 4): the string/object port
 * normalization used to live twice (layout.ts and elk.ts) and could drift.
 * Both backends and the validator now share these.
 */

import type { SemanticNode } from "./types.js";

export interface SidePort {
  name: string;
  side: "left" | "right" | "top" | "bottom";
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

/**
 * Round 6/7 guard, shared by the node-port and group-port loops: a
 * stream-tagged port must declare a valid role, otherwise the traversal
 * contract would be optional metadata.
 */
export function streamRoleError(
  ref: string,
  port: { stream?: string; role?: "ingress" | "egress" },
): string | undefined {
  if (port.stream && port.role !== "ingress" && port.role !== "egress") {
    return `port ${ref}: stream-tagged port must declare role ingress or egress`;
  }
  return undefined;
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
  const declared = resolveSidePorts(node);
  for (const portSide of ["left", "right", "top", "bottom"] as const) {
    const names = declared.filter((port) => port.side === portSide).map((port) => port.name);
    names.forEach((name, index) => {
      const fraction = (index + 1) / (names.length + 1);
      if (portSide === "left") ports[name] = { x: rect.x, y: rect.y + rect.h * fraction };
      else if (portSide === "right") ports[name] = { x: rect.x + rect.w, y: rect.y + rect.h * fraction };
      else if (portSide === "top") ports[name] = { x: rect.x + rect.w * fraction, y: rect.y };
      else ports[name] = { x: rect.x + rect.w * fraction, y: rect.y + rect.h };
    });
  }
  return ports;
}
