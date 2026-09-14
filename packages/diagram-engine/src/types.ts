/**
 * Diagram IR (issue #4) — the view-facing scene between Architecture IR and
 * the SVG renderer (docs/development-plan.md §6.3).
 *
 * Hard rule: no pixel coordinates, no colors. Layout hints stay semantic
 * (direction / emphasize / align / order); coordinates are computed by the
 * layout engine (issue #5), colors come from design tokens (@atlas/ui).
 */

export type DiagramView = "overview" | "block" | "attention" | "moe" | "tensor";

export const DIAGRAM_ENGINE_VERSION = "0.1.0";

export interface SemanticNode {
  id: string;
  kind: string; // "embedding" | "norm" | "attention" | "moe" | "ffn" | "output" | ...
  label: string;
  detail?: string;
  parent?: string; // containing node id, for nested blocks
  ports?: string[];
  /** IR claim path backing this node's label, for evidence annotations. */
  claimPath?: string;
}

export type EdgeKind = "flow" | "skip" | "control";

export interface SemanticEdge {
  id: string;
  from: string; // nodeId or nodeId.port
  to: string;
  kind: EdgeKind;
  label?: string;
}

export type GroupKind = "stack" | "inset" | "frame";

export interface SemanticGroup {
  id: string;
  label: string;
  kind: GroupKind;
  members: string[]; // node ids
  /** Repeated container (e.g. the 45-deep decoder block). */
  repeat?: { count: number; label: string };
}

/** Points at the IR claim that backs a figure element. */
export interface EvidenceAnnotation {
  claimPath: string;
  target: string; // node or edge id
}

export type LayoutConstraint =
  | { type: "direction"; value: "bottom-to-top" | "top-to-bottom" | "left-to-right" }
  | { type: "emphasize"; target: string }
  | { type: "align"; targets: string[]; axis: "vertical" | "horizontal" }
  | { type: "order"; targets: string[] };

export interface DiagramScene {
  irVersion: string;
  view: DiagramView;
  modelId: string;
  nodes: SemanticNode[];
  edges: SemanticEdge[];
  groups: SemanticGroup[];
  annotations: EvidenceAnnotation[];
  constraints: LayoutConstraint[];
}
