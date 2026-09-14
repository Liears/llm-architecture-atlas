import { describe, expect, it } from "vitest";
import type { DiagramScene } from "./types.js";
import { validateScene } from "./validate.js";

function glmOverview(): DiagramScene {
  return {
    irVersion: "0.1.0",
    view: "overview",
    modelId: "zai-org/glm-5.3-flash",
    nodes: [
      { id: "embed", kind: "embedding", label: "Token embedding layer", claimPath: "facts.hidden_size" },
      { id: "block", kind: "stack", label: "Decoder block" },
      { id: "attn", kind: "attention", label: "KDA / MLA+DSA", parent: "block", ports: ["q", "kv", "out"] },
      { id: "ffn", kind: "moe", label: "MoE (288 experts)", parent: "block", claimPath: "topology.experts.routed_total" },
      { id: "head", kind: "output", label: "Linear output layer" },
    ],
    edges: [
      { id: "e1", from: "embed.out", to: "block.in", kind: "flow" },
      { id: "skip", from: "attn.out", to: "block.sum", kind: "skip" },
      { id: "out", from: "block.out", to: "head.in", kind: "flow" },
    ],
    groups: [{ id: "repeat", label: "Decoder block", kind: "stack", members: ["attn", "ffn"], repeat: { count: 45, label: "45 ×" } }],
    annotations: [
      { claimPath: "facts.hidden_size", target: "embed" },
      { claimPath: "topology.experts.routed_total", target: "ffn" },
    ],
    constraints: [
      { type: "direction", value: "bottom-to-top" },
      { type: "emphasize", target: "attn" },
      { type: "order", targets: ["embed", "block", "head"] },
    ],
  };
}

describe("validateScene", () => {
  it("accepts a well-formed GLM overview scene", () => {
    expect(validateScene(glmOverview())).toEqual([]);
  });

  it("rejects edges pointing at unknown nodes", () => {
    const scene = glmOverview();
    scene.edges[0]!.to = "ghost.in";
    expect(validateScene(scene)).toEqual(["edge e1: endpoint \"ghost.in\" does not reference a known node"]);
  });

  it("rejects pixel coordinates — they belong to the layout engine, not the IR", () => {
    const scene = glmOverview();
    (scene.nodes[0] as unknown as Record<string, unknown>).x = 120;
    const errors = validateScene(scene);
    expect(errors.join("\n")).toMatch(/coordinate key "x" is forbidden/);
  });

  it("rejects duplicate node ids", () => {
    const scene = glmOverview();
    scene.nodes.push({ ...scene.nodes[0]! });
    expect(validateScene(scene).join("\n")).toMatch(/duplicate node id: embed/);
  });

  it("rejects group members and annotation targets that do not exist", () => {
    const scene = glmOverview();
    scene.groups[0]!.members.push("ghost");
    scene.annotations.push({ claimPath: "facts.vocab_size", target: "missing" });
    const errors = validateScene(scene);
    expect(errors.join("\n")).toMatch(/member "ghost" is not a known node/);
    expect(errors.join("\n")).toMatch(/unknown target missing/);
  });

  it("rejects constraints on unknown targets", () => {
    const scene = glmOverview();
    scene.constraints.push({ type: "emphasize", target: "ghost" });
    expect(validateScene(scene).join("\n")).toMatch(/constraint emphasize: unknown target ghost/);
  });
});
