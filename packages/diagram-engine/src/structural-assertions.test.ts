/**
 * Mutation proofs for the GLM structural assertions (#35 round 2): every
 * acceptance path-relation has a mutation that turns it red.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import { compileGlmTopologyScene } from "./glm-topology.js";
import { assertGlmStructure } from "./structural-assertions.js";
import { mhcStreamsScene } from "./fixtures.js";
import type { DiagramScene } from "./types.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const modelDir = `${root}/models/zai-org/glm-5-3-flash/main`;
const arch = JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8")) as ModelDocument;
const evidence = JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8")) as EvidenceFile;

const glmScene = (): DiagramScene => compileGlmTopologyScene(arch, evidence);
const gatesOf = (scene: DiagramScene, a: ModelDocument = arch): Set<string> =>
  new Set(assertGlmStructure(scene, a).map((f) => f.gate));

describe("GLM structural assertions (#35)", () => {
  it("current GLM scene: only the MoE fan-in merge is missing (owned by #34)", () => {
    expect([...gatesOf(glmScene())].sort()).toEqual(["mhc-streams", "moe-fanin"]);
  });

  it("schedule: misplacing one layer between KDA and MLA groups turns it red", () => {
    const mutated: ModelDocument = JSON.parse(JSON.stringify(arch));
    const linear = mutated.topology.attention_groups.find((g) => g.kind === "linear_attention")!;
    const mla = mutated.topology.attention_groups.find((g) => g.kind === "mla_sparse")!;
    const stolen = mla.layers[0]!;
    mla.layers = mla.layers.filter((l) => l !== stolen);
    linear.layers = [...linear.layers, stolen];
    expect(gatesOf(glmScene(), mutated).has("schedule")).toBe(true);
  });

  it("schedule: removing the explicit tail layer turns it red", () => {
    const scene = glmScene();
    scene.nodes = scene.nodes.filter((n) => n.id !== "tail-kda");
    expect(gatesOf(scene).has("schedule")).toBe(true);
  });

  it("mHC: declared streams with two stages and operator hops pass the shape check", () => {
    const scene = mhcStreamsScene();
    const findings = assertGlmStructure(scene, arch).filter((f) => f.gate === "mhc-streams");
    expect(findings).toEqual([]);
  });

  it("mHC: a stream confined to one sublayer turns red", () => {
    const scene = mhcStreamsScene();
    scene.streams![0]!.path = ["read.s1", "g-attn.in1", "attn.e1", "attn.x1", "g-attn.out1", "write.w1"];
    expect(assertGlmStructure(scene, arch).some((f) => f.gate === "mhc-streams" && f.target === "s1")).toBe(true);
  });

  it("DSA: removing the selected-KV edge turns it red", () => {
    const scene = glmScene();
    scene.edges = scene.edges.filter((e) => e.claimPath !== "topology.attention.dsa_topk");
    expect(gatesOf(scene).has("dsa-selected-kv")).toBe(true);
  });

  it("MoE: a merge with unrelated inputs is rejected", () => {
    const scene = glmScene();
    scene.nodes.push({ id: "merge", kind: "merge", label: "Merge" });
    scene.edges.push(
      { id: "m1", from: "experts", to: "merge", kind: "flow" },
      { id: "m2", from: "norm", to: "merge", kind: "flow" },
    );
    expect(gatesOf(scene).has("moe-fanin")).toBe(true);
  });

  it("MoE: a merge with exactly experts + shared satisfies fan-in", () => {
    const scene = glmScene();
    scene.nodes.push({ id: "merge", kind: "merge", label: "Merge" });
    scene.edges.push(
      { id: "m1", from: "experts", to: "merge", kind: "flow" },
      { id: "m2", from: "shared", to: "merge", kind: "flow" },
    );
    expect(gatesOf(scene).has("moe-fanin")).toBe(false);
  });
});
