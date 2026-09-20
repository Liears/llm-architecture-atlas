import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import { compileGlmAnatomyScene, glmAnatomyBlueprint } from "./glm-anatomy.js";
import { fontGates, runSceneGates } from "./gates.js";
import { composeEditorialPoster } from "./poster.js";
import { validateScene } from "./validate.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const modelDir = `${root}/models/zai-org/glm-5-3-flash/main`;
const arch = JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8")) as ModelDocument;
const evidence = JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8")) as EvidenceFile;

describe("GLM anatomy poster", () => {
  it("compiles an exact, valid four-stream mHC and the three mechanism lenses", () => {
    const scene = compileGlmAnatomyScene(arch, evidence);
    expect(validateScene(scene)).toEqual([]);
    expect(scene.streams).toHaveLength(4);
    expect(scene.edges.find((edge) => edge.id === "dsa-2")?.to).toBe("dsa-selected.in");
    expect(scene.edges.filter((edge) => edge.id.startsWith("moe-") && edge.to.startsWith("moe-merge."))).toHaveLength(2);
    expect(scene.nodes.find((node) => node.id === "pattern-tail")?.detail).toContain("tail KDA");
    expect(scene.nodes.find((node) => node.id === "kda-qkv")).toMatchObject({ label: "Q/K/V", detail: "ShortConv · k4" });
    expect(scene.nodes.find((node) => node.id === "kda-gate")).toMatchObject({ label: "Gate", detail: "output" });
    expect(scene.edges.filter((edge) => edge.id.startsWith("callout-")).map((edge) => edge.to)).toEqual([
      "g-mhc.callout",
      "lens-bus",
      "g-kda.callout",
      "g-dsa.callout",
      "g-moe.callout",
    ]);
  });

  it("fails validation when a residual stream leg is deleted", () => {
    const scene = compileGlmAnatomyScene(arch, evidence);
    scene.edges = scene.edges.filter((edge) => edge.id !== "mhc-res-out-3");
    expect(validateScene(scene).join("\n")).toMatch(/stream s3: missing leg/);
  });

  it("rejects a source IR whose attention schedule does not cover every layer", () => {
    const mutated = structuredClone(arch);
    const kda = mutated.topology.attention_groups.find((group) => group.kind === "linear_attention")!;
    kda.layers = kda.layers.filter((layer) => layer !== 44);

    expect(() => compileGlmAnatomyScene(mutated, evidence)).toThrow(/attention schedule.*layer 44/i);
  });

  it("derives the visible schedule from source layer membership", () => {
    const mutated = structuredClone(arch);
    const kda = mutated.topology.attention_groups.find((group) => group.kind === "linear_attention")!;
    const dsa = mutated.topology.attention_groups.find((group) => group.kind === "mla_sparse")!;
    kda.layers = [...kda.layers, 39].sort((a, b) => a - b);
    dsa.layers = dsa.layers.filter((layer) => layer !== 39);

    const scene = compileGlmAnatomyScene(mutated, evidence);
    expect(scene.nodes.find((node) => node.id === "pattern-9")?.detail).toBe("K  K  K  K");
    expect(scene.nodes.find((node) => node.id === "pattern-tail")?.detail).toBe("K · tail KDA");
  });

  it("composes deterministically at the desktop readability aspect ratio", () => {
    const scene = compileGlmAnatomyScene(arch, evidence);
    const first = composeEditorialPoster(scene, glmAnatomyBlueprint());
    const second = composeEditorialPoster(scene, glmAnatomyBlueprint());
    expect(first).toEqual(second);
    expect(first.size.w / first.size.h).toBeLessThanOrEqual(1.8);
    expect(first.nodes).toHaveLength(scene.nodes.length);
    for (const id of ["callout-kda", "callout-dsa", "callout-moe"]) {
      expect(first.edges.find((edge) => edge.id === id)?.points.length).toBeGreaterThan(2);
    }
  });

  it("rejects an editorial route detached from its semantic endpoint", () => {
    const scene = compileGlmAnatomyScene(arch, evidence);
    const blueprint = glmAnatomyBlueprint();
    blueprint.edgeRoutes!["callout-kda"]![0] = { x: 0, y: 0 };

    expect(() => composeEditorialPoster(scene, blueprint)).toThrow(/callout-kda.*source anchor/i);
  });

  it("ships the reviewed poster without geometry or desktop font debt", () => {
    const positioned = composeEditorialPoster(compileGlmAnatomyScene(arch, evidence), glmAnatomyBlueprint());

    expect([...runSceneGates(positioned), ...fontGates(positioned, { referenceWidth: 1150 })]).toEqual([]);
  });
});
