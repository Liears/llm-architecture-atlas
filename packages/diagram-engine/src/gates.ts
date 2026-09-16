/**
 * Geometry gates owned by #33: the overlap/containment/bounds/port-segment
 * assertions that the compound-layout acceptance criteria require
 * ("both backends output overlap-free, in-bounds PositionedScene").
 *
 * Scope discipline (round 4 review): readability/debt gates (aspect cap,
 * effective font, edge↔node, edge↔reserved, collinear edge overlap, text
 * overflow), the SVG safety scan and the bounded-correction runner belong
 * to #35 and live in PR #42, not here.
 *
 * Findings are structured records keyed by element id so #35 can persist
 * them into a red baseline later.
 */

import type { PositionedScene } from "./positioned.js";
import type { DiagramScene } from "./types.js";

export interface GateFinding {
  gate: string;
  target: string; // element id (node/group/edge) or "canvas"
  message: string;
}

export interface GateOptions {
  /** tolerance for geometry comparisons. */
  epsilon?: number;
}

const DEFAULT_EPS = 0.75;

/** Gates in this module are all hard: zero in any committed figure. */
export const HARD_GATES = new Set(["overlap", "bounds", "containment", "port-border"]);

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Rect, b: Rect, eps: number): boolean {
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
}

function contains(outer: Rect, inner: Rect, eps: number): boolean {
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.w <= outer.x + outer.w + eps &&
    inner.y + inner.h <= outer.y + outer.h + eps
  );
}

/** declared ancestor chain of a group, from its parent up */
function ancestors(groupId: string, scene: DiagramScene): Set<string> {
  const out = new Set<string>();
  let cur = scene.groups.find((g) => g.id === groupId)?.parent;
  while (cur && !out.has(cur)) {
    out.add(cur);
    cur = scene.groups.find((g) => g.id === cur)?.parent;
  }
  return out;
}

export function runSceneGates(scene: PositionedScene, opts: GateOptions = {}): GateFinding[] {
  const eps = opts.epsilon ?? DEFAULT_EPS;
  const findings: GateFinding[] = [];
  const push = (gate: string, target: string, message: string): void => {
    findings.push({ gate, target, message });
  };
  const { size } = scene;
  const semantic = scene.scene;

  // node/node overlap
  for (let i = 0; i < scene.nodes.length; i++) {
    for (let j = i + 1; j < scene.nodes.length; j++) {
      const a = scene.nodes[i]!;
      const b = scene.nodes[j]!;
      if (overlaps(a, b, eps)) push("overlap", `${a.id}+${b.id}`, `node overlap: ${a.id} vs ${b.id}`);
    }
  }

  const insets = scene.groups.filter((g) => g.inset);
  const membership = new Map<string, string>();
  for (const g of semantic.groups) {
    for (const m of g.members) membership.set(m, g.id);
  }

  // inset/inset: overlap is an error unless one is the DECLARED ancestor of
  // the other (nesting). Geometric containment without declared ancestry is
  // not nesting — it is one box parked inside another (round 4 fix).
  for (let i = 0; i < insets.length; i++) {
    for (let j = i + 1; j < insets.length; j++) {
      const a = insets[i]!;
      const b = insets[j]!;
      const aAncestors = ancestors(a.id, semantic);
      const bAncestors = ancestors(b.id, semantic);
      if (aAncestors.has(b.id) || bAncestors.has(a.id)) continue;
      if (overlaps(a, b, eps) || contains(a, b, -eps) || contains(b, a, -eps)) {
        push("overlap", `${a.id}+${b.id}`, `inset overlap: ${a.id} vs ${b.id}`);
      }
    }
  }

  for (const box of insets) {
    for (const node of scene.nodes) {
      const memberOf = membership.get(node.id);
      if (memberOf === box.id) {
        if (!contains(box, node, eps)) {
          push("containment", `${box.id}/${node.id}`, `inset ${box.id} does not contain member ${node.id}`);
        }
        continue;
      }
      // a node belonging to a group nested INSIDE this box is correctly
      // inside it; everyone else (ungrouped nodes AND members of sibling or
      // ancestor groups) parked inside the box is foreign intrusion
      // (round 4 fix: previously only ungrouped nodes were checked)
      if (memberOf && ancestors(memberOf, semantic).has(box.id)) continue;
      if (contains(box, node, -eps)) {
        push("overlap", `${node.id}+${box.id}`, `node ${node.id} sits inside foreign inset ${box.id}`);
      }
    }
    for (const [name, p] of Object.entries(box.ports)) {
      const onLeft = Math.abs(p.x - box.x) < eps && p.y >= box.y - eps && p.y <= box.y + box.h + eps;
      const onRight = Math.abs(p.x - (box.x + box.w)) < eps && p.y >= box.y - eps && p.y <= box.y + box.h + eps;
      const onTop = Math.abs(p.y - box.y) < eps && p.x >= box.x - eps && p.x <= box.x + box.w + eps;
      const onBottom = Math.abs(p.y - (box.y + box.h)) < eps && p.x >= box.x - eps && p.x <= box.x + box.w + eps;
      if (!(onLeft || onRight || onTop || onBottom)) {
        push("port-border", `${box.id}.${name}`, `inset ${box.id} port ${name} at (${p.x},${p.y}) is not on the group border segment`);
      }
      if (p.x < -eps || p.y < -eps || p.x > size.w + eps || p.y > size.h + eps) {
        push("bounds", `${box.id}.${name}`, `inset ${box.id} port ${name} at (${p.x},${p.y}) exceeds the canvas`);
      }
    }
  }

  // canvas bounds
  for (const n of scene.nodes) {
    if (!contains({ x: 0, y: 0, w: size.w, h: size.h }, n, eps)) {
      push("bounds", n.id, `node ${n.id} exceeds the ${size.w}×${size.h} canvas`);
    }
  }
  for (const g of scene.groups) {
    if (!contains({ x: 0, y: 0, w: size.w, h: size.h }, g, eps)) {
      push("bounds", g.id, `group ${g.id} exceeds the ${size.w}×${size.h} canvas`);
    }
  }
  for (const e of scene.edges) {
    for (const p of e.points) {
      if (p.x < -eps || p.y < -eps || p.x > size.w + eps || p.y > size.h + eps) {
        push("bounds", e.id, `edge ${e.id} waypoint (${p.x},${p.y}) exceeds the canvas`);
      }
    }
  }

  return findings;
}

/** Message-only view, for tests and logs. */
export function geometryGates(scene: PositionedScene, opts: GateOptions = {}): string[] {
  return runSceneGates(scene, opts).map((f) => f.message);
}
