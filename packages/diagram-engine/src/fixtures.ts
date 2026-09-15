/**
 * Compound-scene fixtures (#33): reusable across validator, layout, ELK and
 * renderer tests. Each fixture is a contract exercise, not a model snapshot:
 * - mhcStreamsScene: 4 real residual streams, each crossing the sublayer
 *   inset boundary through its own port and returning to its own write port;
 * - insetsScene: two independently laid-out insets on a spine.
 */

import type { DiagramScene, SemanticGroupPort } from "./types.js";

function streamPorts(): SemanticGroupPort[] {
  return [
    { id: "enter", side: "left", inner: "attn" },
    ...[1, 2, 3, 4].map((i) => ({ id: `pre${i}`, side: "left" as const, inner: "attn" })),
    { id: "exit", side: "right", inner: "ffn" },
    ...[1, 2, 3, 4].map((i) => ({ id: `post${i}`, side: "right" as const, inner: "ffn" })),
  ];
}

export function mhcStreamsScene(): DiagramScene {
  return {
    irVersion: "0.1.0",
    view: "overview",
    modelId: "fixture/mhc-streams",
    nodes: [
      { id: "tok", kind: "io", label: "Tokenized text" },
      { id: "embed", kind: "embedding", label: "Token embedding" },
      { id: "read", kind: "split", label: "Stream read", ports: ["s1", "s2", "s3", "s4"] },
      { id: "attn", kind: "attention", label: "Attention" },
      { id: "ffn", kind: "ffn", label: "FFN" },
      { id: "write", kind: "merge", label: "Stream write", ports: ["w1", "w2", "w3", "w4"] },
      { id: "norm", kind: "norm", label: "Final RMSNorm" },
      { id: "head", kind: "output", label: "LM head" },
    ],
    edges: [
      { id: "e-tok", from: "tok", to: "embed", kind: "flow" },
      { id: "e-embed-sub", from: "embed", to: "g-sub.enter", kind: "flow" },
      ...[1, 2, 3, 4].map((i) => ({
        id: `s${i}`,
        from: `read.s${i}`,
        to: `g-sub.pre${i}`,
        kind: "residual" as const,
        rail: "left" as const,
        label: `S${i}`,
      })),
      ...[1, 2, 3, 4].map((i) => ({
        id: `w${i}`,
        from: `g-sub.post${i}`,
        to: `write.w${i}`,
        kind: "flow" as const,
      })),
      { id: "e-sub-norm", from: "g-sub.exit", to: "norm", kind: "flow" },
      { id: "e-norm-head", from: "norm", to: "head", kind: "flow" },
    ],
    groups: [
      {
        id: "g-sub",
        label: "Sublayer",
        kind: "inset",
        members: ["attn", "ffn"],
        direction: "left-to-right",
        ports: streamPorts(),
      },
    ],
    annotations: [],
    constraints: [
      { type: "direction", value: "bottom-to-top" },
      { type: "order", targets: ["tok", "embed", "read", "g-sub", "write", "norm", "head"] },
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
