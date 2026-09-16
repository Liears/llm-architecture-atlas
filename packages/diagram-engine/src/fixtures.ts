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
    ...[1, 2, 3, 4].map((i) => ({ id: `in${i}`, side: "left" as const, inner: stage.member })),
    { id: "exit", side: "right", inner: stage.member },
    ...[1, 2, 3, 4].map((i) => ({ id: `out${i}`, side: "right" as const, inner: stage.member })),
  ];
}

const ATTN: StageSpec = { group: "g-attn", member: "attn", label: "Attention stage", kind: "attention" };
const FFN: StageSpec = { group: "g-ffn", member: "ffn", label: "FFN stage", kind: "ffn" };

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
      { id: "read", kind: "split", label: "Stream read", ports: ["s1", "s2", "s3", "s4"] },
      { id: attn.member, kind: attn.kind, label: "Attention" },
      { id: ffn.member, kind: ffn.kind, label: "FFN" },
      { id: "write", kind: "merge", label: "Stream write", ports: ["w1", "w2", "w3", "w4"] },
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
    ],
    groups: [stageGroup(attn), stageGroup(ffn)],
    annotations: [],
    constraints: [
      { type: "direction", value: "bottom-to-top" },
      { type: "order", targets: ["tok", "embed", "read", attn.group, ffn.group, "write", "norm", "head"] },
    ],
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
