/**
 * Mutation proofs for the GLM structural assertions (#35 round 2): every
 * acceptance path-relation has a mutation that turns it red.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import { compileGlmAnatomyScene } from "./glm-anatomy.js";
import { assertGlmStructure } from "./structural-assertions.js";
import type { DiagramScene } from "./types.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const modelDir = `${root}/models/zai-org/glm-5-3-flash/main`;
const arch = JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8")) as ModelDocument;
const evidence = JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8")) as EvidenceFile;

const glmScene = (): DiagramScene => compileGlmAnatomyScene(arch, evidence);
const gatesOf = (scene: DiagramScene, a: ModelDocument = arch): Set<string> =>
  new Set(assertGlmStructure(scene, a).map((f) => f.gate));

describe("GLM structural assertions (#35)", () => {
  it("accepts the reviewed GLM anatomy scene", () => {
    expect(assertGlmStructure(glmScene(), arch)).toEqual([]);
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
    scene.nodes = scene.nodes.filter((n) => n.id !== "pattern-tail");
    expect(gatesOf(scene).has("schedule")).toBe(true);
  });

  it("mHC: deleting one residual leg from a declared stream turns red", () => {
    const scene = glmScene();
    scene.streams![0]!.path = scene.streams![0]!.path.filter((ref) => ref !== "mhc-hres.out1");
    expect(assertGlmStructure(scene, arch).some((f) => f.gate === "mhc-streams" && f.target === "s1")).toBe(true);
  });

  it("DSA: removing the selected-KV edge turns it red", () => {
    const scene = glmScene();
    scene.edges = scene.edges.filter((e) => e.id !== "dsa-2");
    expect(gatesOf(scene).has("dsa-selected-kv")).toBe(true);
  });

  it("MoE: replacing the shared input with an unrelated input is rejected", () => {
    const scene = glmScene();
    scene.edges = scene.edges.map((edge) => edge.id === "moe-4" ? { ...edge, from: "norm" } : edge);
    expect(gatesOf(scene).has("moe-fanin")).toBe(true);
  });

  it("MoE: routed and shared branches merge explicitly", () => {
    expect(gatesOf(glmScene()).has("moe-fanin")).toBe(false);
  });
});
