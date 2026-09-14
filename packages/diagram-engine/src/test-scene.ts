/**
 * Shared fixture scene for layout/renderer tests (GLM-5.3-Flash overview).
 * Not part of the public API — consumed by tests across packages.
 */

import type { DiagramScene } from "./types.js";

export function glmScene(): DiagramScene {
  return {
    irVersion: "0.1.0",
    view: "overview",
    modelId: "zai-org/glm-5.3-flash",
    nodes: [
      { id: "tok", kind: "io", label: "Tokenized text" },
      { id: "embed", kind: "embedding", label: "Token embedding layer", claimPath: "facts.hidden_size" },
      { id: "block", kind: "stack", label: "Decoder block ×45", detail: "KDA / MLA+DSA · Dense / MoE" },
      { id: "norm", kind: "norm", label: "Final RMSNorm" },
      { id: "head", kind: "output", label: "Linear output layer", claimPath: "facts.vocab_size" },
    ],
    edges: [
      { id: "e1", from: "tok", to: "embed", kind: "flow" },
      { id: "e2", from: "embed", to: "block", kind: "flow" },
      { id: "e3", from: "block", to: "norm", kind: "flow" },
      { id: "e4", from: "norm", to: "head", kind: "flow" },
      { id: "skip", from: "block.out", to: "norm.in", kind: "skip" },
    ],
    groups: [
      { id: "core", label: "Decoder block", kind: "stack", members: ["block"], repeat: { count: 45, label: "45 ×" } },
    ],
    annotations: [{ claimPath: "facts.hidden_size", target: "embed" }],
    constraints: [
      { type: "direction", value: "bottom-to-top" },
      { type: "order", targets: ["tok", "embed", "block", "norm", "head"] },
    ],
  };
}
