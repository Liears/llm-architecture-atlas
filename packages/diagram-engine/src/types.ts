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
  /**
   * Declared named ports. A bare string gets the default alternating
   * left/right placement; the object form pins the side (round 3: per-stream
   * operator ports need entry ports left and exit ports right), may carry a
   * stream tag (round 4: ports of one residual stream share a tag; the
   * validator rejects edges whose two tagged endpoints disagree) and a role
   * (round 5): ingress ports accept exactly one incoming edge and emit none,
   * egress ports the mirror — which makes operator traversal an IR invariant.
   */
  ports?: Array<string | { name: string; side: "left" | "right"; stream?: string; role?: "ingress" | "egress" }>;
  /** IR claim path backing this node's label, for evidence annotations. */
  claimPath?: string;
  /** Per-segment evidence: every number-bearing text piece references its claim. */
  claims?: Array<{ claimPath: string; label: string }>;
}

export type EdgeKind = "flow" | "skip" | "control" | "residual";

export interface SemanticEdge {
  id: string;
  from: string; // nodeId, nodeId.port, or groupId.port (boundary port)
  to: string;
  kind: EdgeKind;
  label?: string;
  claimPath?: string;
  /** skip/residual-edge routing side; default right for skip, left for residual. */
  rail?: "left" | "right";
}

export type GroupKind = "stack" | "inset" | "frame";

/**
 * Boundary port of a compound group (#33): edges crossing the group frame
 * must land here instead of piercing the frame at an arbitrary member port.
 */
export interface SemanticGroupPort {
  id: string; // unique within the group, e.g. "pre1"
  side: "left" | "right" | "top" | "bottom";
  /** member-side anchor: member node id or "memberId.port" */
  inner: string;
  /** stream identity tag (round 4); see SemanticNode.ports */
  stream?: string;
  /** ingress/egress role (round 5); see SemanticNode.ports */
  role?: "ingress" | "egress";
}

export interface SemanticGroup {
  id: string;
  label: string;
  kind: GroupKind;
  members: string[]; // node ids directly contained (membership is unique)
  /** Repeated container (e.g. the 45-deep decoder block). */
  repeat?: { count: number; label: string };
  /** IR claim path backing the repeat count / group label. */
  claimPath?: string;
  /** Containing group id, for compound subgraphs (groups form a tree). */
  parent?: string;
  /** Group-local layout direction; insets default to left-to-right. */
  direction?: "bottom-to-top" | "top-to-bottom" | "left-to-right";
  /** Boundary ports; cross-group edges must reference one of these. */
  ports?: SemanticGroupPort[];
}

/** Points at the IR claim that backs a figure element. */
export interface EvidenceAnnotation {
  claimPath: string;
  target: string; // node or edge id
  /** Copied from the claim by the compiler so renderers can flag uncertainty. */
  status?: "verified" | "reported" | "derived" | "inferred" | "conflict" | "unknown";
}

/**
 * Scene-level declaration of one residual stream (issue #33, round 7): an
 * ordered list of port references from source to sink. Port-level stream
 * tags/roles are metadata; this declaration is the structure that cannot be
 * erased independently — the validator requires every consecutive pair to be
 * connected by an edge and every referenced port to carry this stream's tag
 * and a role.
 */
export interface StreamDeclaration {
  id: string;
  path: string[]; // port refs, source first: "read.s1", "g-attn.in1", ...
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
  /** declared residual streams (round 7); required to draw residual edges */
  streams?: StreamDeclaration[];
}
