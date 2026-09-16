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
