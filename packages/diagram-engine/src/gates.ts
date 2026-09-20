/**
 * Geometry & readability gates (issue #35): pure assertions over a
 * PositionedScene, separate from pixel-diff regression. The pixel gate can
 * freeze a wrong composition; these gates kill wrong geometry no matter what
 * the baseline says.
 *
 * Scene-level checks (all element-keyed for the machine-readable report):
 * - aspect ratio cap (the 3.35:1 failure mode of the flat layout);
 * - node/node and inset-box overlap, non-member nodes inside a foreign inset;
 * - out-of-canvas geometry (nodes, groups, edge waypoints, group ports);
 * - inset members contained in their box; boundary ports on the border
 *   SEGMENT (both coordinates in range — round 1 review false negative);
 * - edge↔node intersection, edge↔reserved-region (group label strip and
 *   repeat badge), collinear overlapping business edges;
 * - text overflow against measured label width;
 * - effective on-screen font size at a declared reading width.
 *
 * Findings are returned as structured records keyed by element id so the
 * export pipeline can persist a red baseline (tests/gates/*.gates.json) and
 * CI can fail on NEW reds only — known debt stays visible, never silent.
 *
 * GLM-specific structural assertions live in structural-assertions.ts; page
 * level gates (scroll confinement, occupied ratio) live in apps/web e2e.
 */

import type { PositionedScene, LayoutOptions } from "./positioned.js";
import { measureText } from "./text.js";
import { layoutScene } from "./layout.js";
import type { DiagramScene } from "./types.js";

export interface GateFinding {
  gate: string;
  target: string; // element id (node/group/edge) or "canvas" / "svg"
  message: string;
}

export interface GateOptions {
  /** width:height cap for the default overview composition (#32 §3.3). */
  maxAspect?: number;
  /** CSS px floor for key labels in the default reading state. */
  minEffectiveFont?: number;
  /** content width (CSS px) the effective-font gate is evaluated at. */
  referenceWidth?: number;
  /** SVG base label font size (renderer: 16; detail 0.8×; group label 12.8). */
  baseFontSize?: number;
  /** tolerance for geometry comparisons. */
  epsilon?: number;
}

const DEFAULTS: Required<GateOptions> = {
  maxAspect: 1.8,
  minEffectiveFont: 12,
  referenceWidth: 1150,
  baseFontSize: 16,
  epsilon: 0.75,
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const LABEL_BAND = 20; // group label strip height (layout.ts)
const BADGE_W = 52;
const BADGE_H = 20;

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

/** Liang-Barsky: does segment p→q enter rect r (interior, not just touch)? */
function segmentHitsRect(p: { x: number; y: number }, q: { x: number; y: number }, r: Rect, eps: number): boolean {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const xmin = r.x + eps;
  const xmax = r.x + r.w - eps;
  const ymin = r.y + eps;
  const ymax = r.y + r.h - eps;
  if (xmax <= xmin || ymax <= ymin) return false;
  let t0 = 0;
  let t1 = 1;
  const clip = (d: number, bound: number): boolean => {
    if (Math.abs(d) < 1e-9) return bound >= 0;
    const t = bound / d;
    if (d < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, p.x - xmin) && clip(dx, xmax - p.x) && clip(-dy, p.y - ymin) && clip(dy, ymax - p.y);
}

function segmentsOnSameLine(
  a: [{ x: number; y: number }, { x: number; y: number }],
  b: [{ x: number; y: number }, { x: number; y: number }],
  eps: number,
): boolean {
  const horizontal = (s: [{ x: number; y: number }, { x: number; y: number }]): boolean => Math.abs(s[0].y - s[1].y) < eps;
  const vertical = (s: [{ x: number; y: number }, { x: number; y: number }]): boolean => Math.abs(s[0].x - s[1].x) < eps;
  if (horizontal(a) && horizontal(b) && Math.abs(a[0].y - b[0].y) < eps) {
    const [a1, a2] = [Math.min(a[0].x, a[1].x), Math.max(a[0].x, a[1].x)];
    const [b1, b2] = [Math.min(b[0].x, b[1].x), Math.max(b[0].x, b[1].x)];
    return Math.min(a2, b2) - Math.max(a1, b1) > eps;
  }
  if (vertical(a) && vertical(b) && Math.abs(a[0].x - b[0].x) < eps) {
    const [a1, a2] = [Math.min(a[0].y, a[1].y), Math.max(a[0].y, a[1].y)];
    const [b1, b2] = [Math.min(b[0].y, b[1].y), Math.max(b[0].y, b[1].y)];
    return Math.min(a2, b2) - Math.max(a1, b1) > eps;
  }
  return false;
}

/** All geometry/readability findings for one positioned scene. */
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

/** aspect ratio cap (#32 §3.3): portrait poster, not a landscape strip */
export function aspectGate(scene: PositionedScene, opts: GateOptions = {}): GateFinding[] {
  const { maxAspect } = { ...DEFAULTS, ...opts };
  const aspect = scene.size.w / scene.size.h;
  if (aspect > maxAspect) {
    return [{ gate: "aspect", target: "canvas", message: `aspect ratio ${aspect.toFixed(2)}:1 exceeds ${maxAspect}:1 — split into main figure + insets instead of shrinking text` }];
  }
  return [];
}

/** node/node, inset/inset and foreign-node intrusion overlaps */
export function overlapGates(scene: PositionedScene, opts: GateOptions = {}): GateFinding[] {
  const { epsilon } = { ...DEFAULTS, ...opts };
  const out: GateFinding[] = [];
  for (let i = 0; i < scene.nodes.length; i++) {
    for (let j = i + 1; j < scene.nodes.length; j++) {
      const a = scene.nodes[i]!;
      const b = scene.nodes[j]!;
      if (overlaps(a, b, epsilon)) out.push({ gate: "overlap", target: `${a.id}+${b.id}`, message: `node overlap: ${a.id} vs ${b.id}` });
    }
  }
  const insets = scene.groups.filter((g) => g.inset);
  const membership = new Map<string, string>();
  for (const g of scene.scene.groups) {
    for (const m of g.members) membership.set(m, g.id);
  }
  for (let i = 0; i < insets.length; i++) {
    for (let j = i + 1; j < insets.length; j++) {
      const a = insets[i]!;
      const b = insets[j]!;
      // nesting is containment, not overlap — but only DECLARED ancestry
      // counts; geometric containment without a parent chain is one box
      // parked inside another (round 4 fix)
      if (ancestors(a.id, scene.scene).has(b.id) || ancestors(b.id, scene.scene).has(a.id)) continue;
      if (overlaps(a, b, epsilon) || contains(a, b, -epsilon) || contains(b, a, -epsilon)) {
        out.push({ gate: "overlap", target: `${a.id}+${b.id}`, message: `inset overlap: ${a.id} vs ${b.id}` });
      }
    }
  }
  for (const box of insets) {
    for (const node of scene.nodes) {
      const memberOf = membership.get(node.id);
      if (memberOf === box.id) continue; // containment gate owns members
      // a node belonging to a group nested INSIDE this box is correctly
      // inside it; everyone else (ungrouped nodes AND members of sibling or
      // ancestor groups) overlapping the box is foreign intrusion
      // (round 4/5: partial overlap counts, straddling included)
      if (memberOf && ancestors(memberOf, scene.scene).has(box.id)) continue;
      if (overlaps(box, node, epsilon)) {
        out.push({ gate: "overlap", target: `${node.id}+${box.id}`, message: `node ${node.id} overlaps foreign inset ${box.id}` });
      }
    }
  }
  return out;
}

/** members inside their inset; declared child insets inside their parent */
export function containmentGates(scene: PositionedScene, opts: GateOptions = {}): GateFinding[] {
  const { epsilon } = { ...DEFAULTS, ...opts };
  const out: GateFinding[] = [];
  const membership = new Map<string, string>();
  for (const g of scene.scene.groups) {
    for (const m of g.members) membership.set(m, g.id);
  }
  const posGroup = new Map(scene.groups.map((g) => [g.id, g]));
  for (const box of scene.groups.filter((g) => g.inset)) {
    for (const node of scene.nodes) {
      if (membership.get(node.id) !== box.id) continue;
      if (!contains(box, node, epsilon)) {
        out.push({ gate: "containment", target: `${box.id}/${node.id}`, message: `inset ${box.id} does not contain member ${node.id}` });
      }
    }
  }
  for (const g of scene.scene.groups) {
    if (!g.parent) continue;
    const child = posGroup.get(g.id);
    const parent = posGroup.get(g.parent);
    if (!child || !parent) continue;
    if (!contains(parent, child, epsilon)) {
      out.push({ gate: "containment", target: `${g.parent}+${g.id}`, message: `group ${g.id} escapes declared parent ${g.parent}` });
    }
  }
  return out;
}

/** boundary ports on their border segment; everything inside the canvas */
export function boundsAndPortGates(scene: PositionedScene, opts: GateOptions = {}): GateFinding[] {
  const { epsilon } = { ...DEFAULTS, ...opts };
  const out: GateFinding[] = [];
  const { size } = scene;
  const canvas = { x: 0, y: 0, w: size.w, h: size.h };
  for (const box of scene.groups.filter((g) => g.inset)) {
    for (const [name, p] of Object.entries(box.ports)) {
      const onLeft = Math.abs(p.x - box.x) < epsilon && p.y >= box.y - epsilon && p.y <= box.y + box.h + epsilon;
      const onRight = Math.abs(p.x - (box.x + box.w)) < epsilon && p.y >= box.y - epsilon && p.y <= box.y + box.h + epsilon;
      const onTop = Math.abs(p.y - box.y) < epsilon && p.x >= box.x - epsilon && p.x <= box.x + box.w + epsilon;
      const onBottom = Math.abs(p.y - (box.y + box.h)) < epsilon && p.x >= box.x - epsilon && p.x <= box.x + box.w + epsilon;
      if (!(onLeft || onRight || onTop || onBottom)) {
        out.push({ gate: "port-border", target: `${box.id}.${name}`, message: `inset ${box.id} port ${name} at (${p.x},${p.y}) is not on the group border segment` });
      }
      if (p.x < -epsilon || p.y < -epsilon || p.x > size.w + epsilon || p.y > size.h + epsilon) {
        out.push({ gate: "bounds", target: `${box.id}.${name}`, message: `inset ${box.id} port ${name} at (${p.x},${p.y}) exceeds the canvas` });
      }
    }
  }
  for (const n of scene.nodes) {
    if (!contains(canvas, n, epsilon)) out.push({ gate: "bounds", target: n.id, message: `node ${n.id} exceeds the ${size.w}×${size.h} canvas` });
  }
  for (const g of scene.groups) {
    if (!contains(canvas, g, epsilon)) out.push({ gate: "bounds", target: g.id, message: `group ${g.id} exceeds the ${size.w}×${size.h} canvas` });
  }
  for (const e of scene.edges) {
    for (const p of e.points) {
      if (p.x < -epsilon || p.y < -epsilon || p.x > size.w + epsilon || p.y > size.h + epsilon) {
        out.push({ gate: "bounds", target: e.id, message: `edge ${e.id} waypoint (${p.x},${p.y}) exceeds the canvas` });
      }
    }
  }
  return out;
}

/** edges through node boxes (port-to-port traversals of their own member exempt) */
export function edgeNodeGates(scene: PositionedScene, opts: GateOptions = {}): GateFinding[] {
  const { epsilon } = { ...DEFAULTS, ...opts };
  const out: GateFinding[] = [];
  const exemptNodes = new Map<string, Set<string>>();
  for (const e of scene.scene.edges) {
    const fromGroup = scene.scene.groups.find((g) => g.id === splitHead(e.from));
    const toGroup = scene.scene.groups.find((g) => g.id === splitHead(e.to));
    if (!fromGroup || fromGroup.id !== toGroup?.id) continue;
    const inners = [fromGroup, toGroup].flatMap((g) =>
      (g.ports ?? []).filter((p) => e.from === `${g.id}.${p.id}` || e.to === `${g.id}.${p.id}`).map((p) => splitHead(p.inner)),
    );
    exemptNodes.set(e.id, new Set(inners));
  }
  for (const e of scene.edges) {
    const segs = e.points.slice(0, -1).map((p, i) => [p, e.points[i + 1]!] as const);
    for (const node of scene.nodes) {
      if (exemptNodes.get(e.id)?.has(node.id)) continue;
      const isEndpoint =
        (e.points[0] && touches(e.points[0], node, epsilon)) ||
        (e.points[e.points.length - 1] && touches(e.points[e.points.length - 1]!, node, epsilon));
      if (isEndpoint) continue;
      for (const [p, q] of segs) {
        if (segmentHitsRect(p, q, node, epsilon)) {
          out.push({ gate: "edge-node", target: `${e.id}/${node.id}`, message: `edge ${e.id} passes through node ${node.id}` });
          break;
        }
      }
    }
  }
  return out;
}

/** edges through reserved regions: group label strip and repeat badge */
export function edgeReservedGates(scene: PositionedScene, opts: GateOptions = {}): GateFinding[] {
  const { epsilon } = { ...DEFAULTS, ...opts };
  const out: GateFinding[] = [];
  const reserved: Array<{ id: string; rect: Rect }> = [];
  for (const g of scene.groups) {
    reserved.push({ id: `${g.id}:label`, rect: { x: g.x, y: g.y, w: g.w, h: LABEL_BAND } });
    if (g.repeatBadge) {
      reserved.push({ id: `${g.id}:badge`, rect: { x: g.x + g.w - 58, y: g.y + 6, w: BADGE_W, h: BADGE_H } });
    }
  }
  for (const e of scene.edges) {
    const segs = e.points.slice(0, -1).map((p, i) => [p, e.points[i + 1]!] as const);
    for (const region of reserved) {
      for (const [p, q] of segs) {
        if (segmentHitsRect(p, q, region.rect, epsilon)) {
          out.push({ gate: "edge-reserved", target: `${e.id}/${region.id}`, message: `edge ${e.id} passes through reserved region ${region.id}` });
          break;
        }
      }
    }
  }
  return out;
}

/** collinear overlapping business edges */
export function edgeOverlapGates(scene: PositionedScene, opts: GateOptions = {}): GateFinding[] {
  const { epsilon } = { ...DEFAULTS, ...opts };
  const out: GateFinding[] = [];
  const edgeSegments = scene.edges.map((e) => ({
    id: e.id,
    segs: e.points.slice(0, -1).map((p, i) => [p, e.points[i + 1]!] as [{ x: number; y: number }, { x: number; y: number }]),
  }));
  for (let i = 0; i < edgeSegments.length; i++) {
    for (let j = i + 1; j < edgeSegments.length; j++) {
      const a = edgeSegments[i]!;
      const b = edgeSegments[j]!;
      let hit = false;
      for (const sa of a.segs) {
        for (const sb of b.segs) {
          if (segmentsOnSameLine(sa, sb, epsilon)) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (hit) out.push({ gate: "edge-overlap", target: `${a.id}+${b.id}`, message: `edges ${a.id} and ${b.id} overlap collinearly` });
    }
  }
  return out;
}

/** measured label/detail width vs available inner width */
export function textOverflowGates(scene: PositionedScene, opts: GateOptions = {}): GateFinding[] {
  const { epsilon, baseFontSize } = { ...DEFAULTS, ...opts };
  const out: GateFinding[] = [];
  for (const n of scene.nodes) {
    const inner = n.w - 28; // layout padding 14×2
    const labelW = measureText(n.label, baseFontSize, true) * 1.14;
    if (labelW > inner + epsilon) {
      out.push({ gate: "text-overflow", target: n.id, message: `node ${n.id} label needs ${Math.ceil(labelW)}px but has ${Math.ceil(inner)}px` });
    }
    if (n.detail) {
      const detailW = measureText(n.detail, baseFontSize * 0.8) * 1.14;
      if (detailW > inner + epsilon) {
        out.push({ gate: "text-overflow", target: n.id, message: `node ${n.id} detail needs ${Math.ceil(detailW)}px but has ${Math.ceil(inner)}px` });
      }
    }
  }
  for (const g of scene.groups) {
    const showLabel = !(g.repeatBadge && g.w < 300);
    if (showLabel) {
      const labelW = measureText(g.label, baseFontSize * 0.8, true);
      if (labelW + 24 > g.w + epsilon) {
        out.push({ gate: "text-overflow", target: g.id, message: `group ${g.id} label needs ${Math.ceil(labelW + 24)}px but frame is ${Math.ceil(g.w)}px` });
      }
    }
  }
  return out;
}

/**
 * Aggregator (round 2 P2): each gate is a small function above; this only
 * concatenates in stable order so baselines stay comparable.
 */
export function runSceneGates(scene: PositionedScene, opts: GateOptions = {}): GateFinding[] {
  return [
    ...aspectGate(scene, opts),
    ...overlapGates(scene, opts),
    ...containmentGates(scene, opts),
    ...boundsAndPortGates(scene, opts),
    ...edgeNodeGates(scene, opts),
    ...edgeReservedGates(scene, opts),
    ...edgeOverlapGates(scene, opts),
    ...textOverflowGates(scene, opts),
  ];
}

function touches(p: { x: number; y: number }, r: Rect, eps: number): boolean {
  return p.x >= r.x - eps && p.x <= r.x + r.w + eps && p.y >= r.y - eps && p.y <= r.y + r.h + eps;
}

function splitHead(ref: string): string {
  const dot = ref.indexOf(".");
  return dot === -1 ? ref : ref.slice(0, dot);
}

/** Message-only view, for tests and logs. */
export function geometryGates(scene: PositionedScene, opts: GateOptions = {}): string[] {
  return runSceneGates(scene, opts).map((f) => f.message);
}

/**
 * Effective on-screen size of the figure's text when the SVG is displayed at
 * `displayWidth` CSS px (the whole-figure scaling the mobile page does today).
 */
export function effectiveFontPx(scene: PositionedScene, displayWidth: number, baseFontSize = DEFAULTS.baseFontSize): { label: number; detail: number } {
  const scale = displayWidth / scene.size.w;
  return { label: baseFontSize * scale, detail: baseFontSize * 0.8 * scale };
}

export function fontGates(scene: PositionedScene, opts: GateOptions = {}): GateFinding[] {
  const { minEffectiveFont, referenceWidth, baseFontSize } = { ...DEFAULTS, ...opts };
  const { label } = effectiveFontPx(scene, referenceWidth, baseFontSize);
  if (label < minEffectiveFont) {
    return [
      {
        gate: "font",
        target: "canvas",
        message: `effective label font ${label.toFixed(1)}px at ${referenceWidth}px content width is below ${minEffectiveFont}px`,
      },
    ];
  }
  return [];
}

/** Gates that must never be red in a committed figure (layout invariants). */
export const HARD_GATES = new Set(["overlap", "bounds", "containment", "port-border", "svg-active", "svg-external", "svg-viewbox"]);

export interface CorrectionResult {
  positioned: PositionedScene;
  /** correction rounds spent beyond the initial layout (max 2, #35) */
  rounds: number;
  hard: GateFinding[];
}

/**
 * Bounded correction (issue #35): if hard gates are red, retry the layout
 * with escalated spacing — at most two correction rounds — then report. No
 * silent gate removal, no unbounded redraw.
 */
export function layoutWithCorrection(
  scene: DiagramScene,
  variants: LayoutOptions[] = [{ fontSize: 16 }, { fontSize: 16, gapX: 48, gapY: 52 }, { fontSize: 16, gapX: 56, gapY: 60, skipRailGap: 26 }],
  gateFn: (p: PositionedScene) => GateFinding[] = (p) => runSceneGates(p).filter((f) => HARD_GATES.has(f.gate)),
): CorrectionResult {
  let positioned = layoutScene(scene, variants[0]);
  let hard = gateFn(positioned);
  let rounds = 0;
  for (let i = 1; i < variants.length && hard.length > 0; i++) {
    positioned = layoutScene(scene, variants[i]);
    hard = gateFn(positioned);
    rounds = i;
  }
  return { positioned, rounds, hard };
}
