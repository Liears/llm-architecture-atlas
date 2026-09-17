import { describe, expect, it } from "vitest";
import type { DiagramScene } from "./types.js";
import { validateScene } from "./validate.js";
import { nestedScene, mhcStreamsScene } from "./fixtures.js";

function glmOverview(): DiagramScene {
  return {
    irVersion: "0.1.0",
    view: "overview",
    modelId: "zai-org/glm-5.3-flash",
    nodes: [
      { id: "embed", kind: "embedding", label: "Token embedding layer", claimPath: "facts.hidden_size" },
      { id: "block", kind: "stack", label: "Decoder block", ports: ["sum"] },
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

  it("rejects a boundary port paired with a non-inner member inside its group", () => {
    const scene: DiagramScene = {
      irVersion: "0.1.0",
      view: "overview",
      modelId: "fixture/pairing",
      nodes: [
        { id: "m1", kind: "attention", label: "M1" },
        { id: "m2", kind: "ffn", label: "M2" },
      ],
      edges: [{ id: "t", from: "g.in", to: "m2", kind: "flow" }],
      groups: [
        {
          id: "g",
          label: "G",
          kind: "inset",
          members: ["m1", "m2"],
          direction: "left-to-right",
          ports: [{ id: "in", side: "left", inner: "m1" }],
        },
      ],
      annotations: [],
      constraints: [],
    };
    expect(validateScene(scene).join("\n")).toMatch(/boundary port g.in must pair with its inner member m1/);
  });

  it("rejects dangling node ports (round 2 regression)", () => {
    const scene = glmOverview();
    scene.edges[0]!.from = "embed.ghost";
    expect(validateScene(scene).join("\n")).toMatch(/endpoint "embed.ghost" references undeclared port on node embed/);
  });

  it("keeps implicit in/out anchors valid without declaration", () => {
    expect(validateScene(glmOverview())).toEqual([]);
  });

  it("rejects constraints on unknown targets", () => {
    const scene = glmOverview();
    scene.constraints.push({ type: "emphasize", target: "ghost" });
    expect(validateScene(scene).join("\n")).toMatch(/constraint emphasize: unknown target ghost/);
  });
});

describe("validateScene compound rules (#33)", () => {
  /** inset with a boundary port; attn inside, head outside. */
  function insetScene(): DiagramScene {
    return {
      irVersion: "0.1.0",
      view: "overview",
      modelId: "fixture/inset",
      nodes: [
        { id: "embed", kind: "embedding", label: "Embedding" },
        { id: "attn", kind: "attention", label: "Attention" },
        { id: "head", kind: "output", label: "LM head" },
      ],
      edges: [
        { id: "e1", from: "embed", to: "g-attn.in", kind: "flow" },
        { id: "e2", from: "g-attn.out", to: "head", kind: "flow" },
      ],
      groups: [
        {
          id: "g-attn",
          label: "Attention",
          kind: "inset",
          members: ["attn"],
          direction: "left-to-right",
          ports: [
            { id: "in", side: "left", inner: "attn" },
            { id: "out", side: "right", inner: "attn" },
          ],
        },
      ],
      annotations: [],
      constraints: [{ type: "direction", value: "bottom-to-top" }],
    };
  }

  it("accepts edges that cross an inset through declared boundary ports", () => {
    expect(validateScene(insetScene())).toEqual([]);
  });

  it("rejects a cross-group edge without a boundary port", () => {
    const scene = insetScene();
    scene.edges[0]!.to = "attn";
    expect(validateScene(scene).join("\n")).toMatch(/crosses group g-attn boundary without a boundary port/);
  });

  it("rejects endpoints that name a group without a matching port", () => {
    const scene = insetScene();
    scene.edges[0]!.to = "g-attn.ghost";
    expect(validateScene(scene).join("\n")).toMatch(/does not match a boundary port of group g-attn/);
  });

  it("rejects boundary ports whose inner anchor is not a member", () => {
    const scene = insetScene();
    scene.groups[0]!.ports![0]!.inner = "head";
    expect(validateScene(scene).join("\n")).toMatch(/port "in" inner "head" does not reference a member node/);
  });

  it("rejects a boundary port whose inner anchor names an undeclared node port (round 3)", () => {
    const scene = insetScene();
    scene.groups[0]!.ports![0]!.inner = "attn.ghost";
    expect(validateScene(scene).join("\n")).toMatch(/inner "attn.ghost" references an undeclared node port/);
  });

  it("accepts implicit in/out as a boundary port inner anchor", () => {
    const scene = insetScene();
    scene.groups[0]!.ports![0]!.inner = "attn.in";
    expect(validateScene(scene)).toEqual([]);
  });

  it("rejects duplicate stream declaration ids (round-8 P2 follow-up)", () => {
    const scene = mhcStreamsScene();
    scene.streams![1]!.id = scene.streams![0]!.id;
    expect(validateScene(scene).join("\n")).toMatch(/duplicate stream declaration id/);
  });

  it("rejects residual self-loops — pseudo streams are not streams", () => {
    const scene = insetScene();
    scene.edges.push({ id: "s1", from: "embed", to: "embed", kind: "residual" });
    expect(validateScene(scene).join("\n")).toMatch(/residual edge s1: self-loop/);
  });

  it("rejects residual edges that stay inside one sublayer", () => {
    const scene = insetScene();
    scene.edges.push({ id: "s1", from: "g-attn.in", to: "g-attn.out", kind: "residual" });
    // both endpoints resolve to attn (inside g-attn): no boundary crossed
    expect(validateScene(scene).join("\n")).toMatch(/residual edge s1: does not cross a sublayer boundary/);
  });

  it("rejects residual edges not covered by a declared stream path (round 7)", () => {
    const scene = insetScene();
    scene.edges.push({ id: "s1", from: "embed", to: "g-attn.in", kind: "residual" });
    expect(validateScene(scene).join("\n")).toMatch(/residual edges must be covered by a declared stream path/);
  });

  it("rejects split nodes with a single fan-out", () => {
    const scene = insetScene();
    scene.nodes.push({ id: "split", kind: "split", label: "Split" });
    scene.edges.push({ id: "sp", from: "split", to: "head", kind: "flow" });
    expect(validateScene(scene).join("\n")).toMatch(/split node split must fan out to at least 2 targets/);
  });

  it("rejects merge nodes with a single fan-in", () => {
    const scene = insetScene();
    scene.nodes.push({ id: "merge", kind: "merge", label: "Merge" });
    scene.edges.push({ id: "mg", from: "embed", to: "merge", kind: "flow" });
    expect(validateScene(scene).join("\n")).toMatch(/merge node merge must collect at least 2 sources/);
  });

  it("rejects a node claimed by two groups", () => {
    const scene = insetScene();
    scene.groups.push({ id: "g2", label: "G2", kind: "stack", members: ["attn"] });
    expect(validateScene(scene).join("\n")).toMatch(/node attn belongs to multiple groups: g-attn and g2/);
  });

  it("rejects unknown group parents", () => {
    const scene = insetScene();
    scene.groups[0]!.parent = "ghost";
    expect(validateScene(scene).join("\n")).toMatch(/group g-attn: unknown parent ghost/);
  });

  it("rejects group parent cycles", () => {
    const scene = insetScene();
    scene.groups.push({ id: "outer", label: "Outer", kind: "inset", members: [], parent: "g-attn" });
    scene.groups[0]!.parent = "outer";
    expect(validateScene(scene).join("\n")).toMatch(/parent cycle/);
  });

  it("rejects pixel coordinates on groups", () => {
    const scene = insetScene();
    (scene.groups[0] as unknown as Record<string, unknown>).x = 40;
    expect(validateScene(scene).join("\n")).toMatch(/group g-attn: coordinate key "x" is forbidden/);
  });

  describe("nested subgraphs (review fix: ancestry-aware boundaries)", () => {
    it("accepts outer member ↔ nested boundary-port edges without an outer port", () => {
      expect(validateScene(nestedScene())).toEqual([]);
    });

    it("rejects a spine edge piercing straight into a nested group", () => {
      const scene = nestedScene();
      scene.edges[0]!.to = "g-inner.in";
      const errors = validateScene(scene);
      expect(errors.join("\n")).toMatch(/crosses group g-outer boundary without a boundary port/);
    });
  });
});
