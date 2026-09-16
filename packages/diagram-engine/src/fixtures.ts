/**
 * Compound-scene fixtures (#33): reusable across validator, layout, ELK and
 * renderer tests. Each fixture is a contract exercise, not a model snapshot:
 * - mhcStreamsScene: 4 real residual streams; each stream is a CONNECTED
 *   per-stream path read → attention stage → FFN stage → write, crossing a
 *   group boundary at every hop through its own port (review fix: the stream
 *   no longer breaks at the sublayer);
 * - insetsScene: two independently laid-out insets on a spine.
 */

import type { DiagramScene, SemanticGroup, SemanticGroupPort } from "./types.js";

interface StageSpec {
  group: string;
  member: string;
  label: string;
  kind: string;
}

function stagePorts(stage: StageSpec): SemanticGroupPort[] {
  return [
    { id: "enter", side: "left", inner: stage.member },
    ...[1, 2, 3, 4].map((i) => ({ id: `in${i}`, side: "left" as const, inner: `${stage.member}.e${i}`, stream: `s${i}`, role: "ingress" as const })),
    { id: "exit", side: "right", inner: stage.member },
    ...[1, 2, 3, 4].map((i) => ({ id: `out${i}`, side: "right" as const, inner: `${stage.member}.x${i}`, stream: `s${i}`, role: "egress" as const })),
  ];
}

const ATTN: StageSpec = { group: "g-attn", member: "attn", label: "Attention stage", kind: "attention" };
const FFN: StageSpec = { group: "g-ffn", member: "ffn", label: "FFN stage", kind: "ffn" };

/** per-stream operator ports: entries left, exits right (round 3) */
function operatorPorts(): Array<{ name: string; side: "left" | "right" }> {
  return [
    ...[1, 2, 3, 4].map((i) => ({ name: `e${i}`, side: "left" as const, stream: `s${i}`, role: "ingress" as const })),
    ...[1, 2, 3, 4].map((i) => ({ name: `x${i}`, side: "right" as const, stream: `s${i}`, role: "egress" as const })),
  ];
}

function stageGroup(stage: StageSpec): SemanticGroup {
  return {
    id: stage.group,
    label: stage.label,
    kind: "inset",
    members: [stage.member],
    direction: "left-to-right",
    ports: stagePorts(stage),
  };
}

export function mhcStreamsScene(): DiagramScene {
  const [attn, ffn] = [ATTN, FFN];
  return {
    irVersion: "0.1.0",
    view: "overview",
    modelId: "fixture/mhc-streams",
    nodes: [
      { id: "tok", kind: "io", label: "Tokenized text" },
      { id: "embed", kind: "embedding", label: "Token embedding" },
      { id: "read", kind: "split", label: "Stream read", ports: [1, 2, 3, 4].map((i) => ({ name: `s${i}`, side: "left" as const, stream: `s${i}`, role: "egress" as const })) },
      { id: attn.member, kind: attn.kind, label: "Attention", ports: operatorPorts() },
      { id: ffn.member, kind: ffn.kind, label: "FFN", ports: operatorPorts() },
      { id: "write", kind: "merge", label: "Stream write", ports: [1, 2, 3, 4].map((i) => ({ name: `w${i}`, side: "left" as const, stream: `s${i}`, role: "ingress" as const })) },
      { id: "norm", kind: "norm", label: "Final RMSNorm" },
      { id: "head", kind: "output", label: "LM head" },
    ],
    edges: [
      { id: "e-tok", from: "tok", to: "embed", kind: "flow" },
      { id: "e-embed-attn", from: "embed", to: `${attn.group}.enter`, kind: "flow" },
      { id: "e-attn-ffn", from: `${attn.group}.exit`, to: `${ffn.group}.enter`, kind: "flow" },
      { id: "e-ffn-norm", from: `${ffn.group}.exit`, to: "norm", kind: "flow" },
      { id: "e-norm-head", from: "norm", to: "head", kind: "flow" },
      // per-stream connected path: read → attn stage → ffn stage → write;
      // every hop crosses a group boundary through the stream's own port
      ...[1, 2, 3, 4].flatMap((i) => [
        { id: `s${i}`, from: `read.s${i}`, to: `${attn.group}.in${i}`, kind: "residual" as const, rail: "left" as const, label: `S${i}` },
        { id: `p${i}`, from: `${attn.group}.out${i}`, to: `${ffn.group}.in${i}`, kind: "residual" as const, rail: "left" as const },
        { id: `r${i}`, from: `${ffn.group}.out${i}`, to: `write.w${i}`, kind: "residual" as const, rail: "left" as const },
      ]),
      // stream traversals THROUGH the stage operator: the IR connection from
      // a stage's in-port to its out-port (round 2: without these, port
      // identity collapses and cross-wired mutations look connected)
      // IR connection through each stage: the stream enters the operator
      // node and leaves it again (round 3: a border-to-border group self-edge
      // never visits the operator — ELK sees a compound self-loop and the
      // drawn line crosses the node rectangle)
      ...[1, 2, 3, 4].flatMap((i) => [
        { id: `t-a${i}`, from: `${attn.group}.in${i}`, to: `${attn.member}.e${i}`, kind: "flow" as const },
        { id: `u-a${i}`, from: `${attn.member}.x${i}`, to: `${attn.group}.out${i}`, kind: "flow" as const },
        { id: `t-f${i}`, from: `${ffn.group}.in${i}`, to: `${ffn.member}.e${i}`, kind: "flow" as const },
        { id: `u-f${i}`, from: `${ffn.member}.x${i}`, to: `${ffn.group}.out${i}`, kind: "flow" as const },
      ]),
    ],
    groups: [stageGroup(attn), stageGroup(ffn)],
    annotations: [],
    constraints: [
      { type: "direction", value: "bottom-to-top" },
      { type: "order", targets: ["tok", "embed", "read", attn.group, ffn.group, "write", "norm", "head"] },
    ],
  };
}

/**
 * Nested compound scene (round 2 regression): an outer inset containing a
 * nested inset. Validator must accept outer-member ↔ nested-port edges
 * without an outer boundary port, and the real ELK backend must lay it out
 * (hierarchical edges, #33 review round 2).
 */
export function nestedScene(): DiagramScene {
  return {
    irVersion: "0.1.0",
    view: "overview",
    modelId: "fixture/nested",
    nodes: [
      { id: "spine", kind: "io", label: "Spine" },
      { id: "outerMember", kind: "ffn", label: "Outer member" },
      { id: "inner", kind: "attention", label: "Inner" },
      { id: "sink", kind: "output", label: "Sink" },
    ],
    edges: [
      { id: "e-in", from: "spine", to: "g-outer.in", kind: "flow" },
      { id: "e-descend", from: "g-outer.out", to: "g-inner.in", kind: "flow" },
      { id: "e-exit", from: "g-inner.out", to: "g-outer.exit", kind: "flow" },
      { id: "e-out", from: "g-outer.out2", to: "sink", kind: "flow" },
    ],
    groups: [
      {
        id: "g-outer",
        label: "Outer",
        kind: "inset",
        members: ["outerMember"],
        direction: "left-to-right",
        ports: [
          { id: "in", side: "left", inner: "outerMember" },
          { id: "out", side: "right", inner: "outerMember" },
          { id: "exit", side: "right", inner: "outerMember" },
          { id: "out2", side: "right", inner: "outerMember" },
        ],
      },
      {
        id: "g-inner",
        label: "Inner",
        kind: "inset",
        parent: "g-outer",
        members: ["inner"],
        direction: "left-to-right",
        ports: [
          { id: "in", side: "left", inner: "inner" },
          { id: "out", side: "right", inner: "inner" },
        ],
      },
    ],
    annotations: [],
    constraints: [{ type: "direction", value: "bottom-to-top" }],
  };
}

export function insetsScene(): DiagramScene {
  return {
    irVersion: "0.1.0",
    view: "overview",
    modelId: "fixture/insets",
    nodes: [
      { id: "tok", kind: "io", label: "Tokenized text" },
      { id: "embed", kind: "embedding", label: "Token embedding" },
      { id: "block", kind: "stack", label: "Decoder block" },
      { id: "indexer", kind: "indexer", label: "Lightning indexer" },
      { id: "topk", kind: "selector", label: "Top-k" },
      { id: "core", kind: "attention", label: "MLA core" },
      { id: "router", kind: "router", label: "Router" },
      { id: "experts", kind: "moe", label: "Routed experts" },
      { id: "shared", kind: "moe", label: "Shared expert" },
      { id: "norm", kind: "norm", label: "Final RMSNorm" },
      { id: "head", kind: "output", label: "LM head" },
    ],
    edges: [
      { id: "e-tok", from: "tok", to: "embed", kind: "flow" },
      { id: "e-embed", from: "embed", to: "block", kind: "flow" },
      { id: "e-block-moe", from: "block", to: "g-moe.in", kind: "flow" },
      { id: "e-moe-norm", from: "g-moe.out", to: "norm", kind: "flow" },
      { id: "e-norm-head", from: "norm", to: "head", kind: "flow" },
      { id: "c-dsa-in", from: "block", to: "g-dsa.in", kind: "control" },
      { id: "c-dsa-out", from: "g-dsa.out", to: "norm", kind: "control" },
      { id: "f-idx-topk", from: "indexer", to: "topk", kind: "flow" },
      { id: "f-topk-core", from: "topk", to: "core", kind: "flow" },
      { id: "c-router-experts", from: "router", to: "experts", kind: "control" },
      { id: "c-router-shared", from: "router", to: "shared", kind: "control" },
    ],
    groups: [
      { id: "g-decoder", label: "Decoder block", kind: "stack", members: ["block"], repeat: { count: 27, label: "27 ×" } },
      {
        id: "g-dsa",
        label: "DSA",
        kind: "inset",
        members: ["indexer", "topk", "core"],
        direction: "left-to-right",
        ports: [
          { id: "in", side: "left", inner: "indexer" },
          { id: "out", side: "right", inner: "core" },
        ],
      },
      {
        id: "g-moe",
        label: "MoE",
        kind: "inset",
        members: ["router", "experts", "shared"],
        direction: "left-to-right",
        ports: [
          { id: "in", side: "left", inner: "router" },
          { id: "out", side: "right", inner: "experts" },
        ],
      },
    ],
    annotations: [],
    constraints: [
      { type: "direction", value: "bottom-to-top" },
      { type: "order", targets: ["tok", "embed", "block", "g-dsa", "g-moe", "norm", "head"] },
    ],
  };
}
