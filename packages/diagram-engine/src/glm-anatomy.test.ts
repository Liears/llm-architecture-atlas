import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import { compileGlmAnatomyScene, glmAnatomyBlueprint } from "./glm-anatomy.js";
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
    expect(scene.edges.find((edge) => edge.id === "dsa-2")?.to).toBe("dsa-selected");
    expect(scene.edges.filter((edge) => edge.id.startsWith("moe-") && edge.to === "moe-merge")).toHaveLength(2);
    expect(scene.nodes.find((node) => node.id === "pattern-tail")?.detail).toContain("tail KDA");
  });

  it("fails validation when a residual stream leg is deleted", () => {
    const scene = compileGlmAnatomyScene(arch, evidence);
    scene.edges = scene.edges.filter((edge) => edge.id !== "mhc-res-out-3");
    expect(validateScene(scene).join("\n")).toMatch(/stream s3: missing leg/);
  });

  it("composes deterministically at the desktop readability aspect ratio", () => {
    const scene = compileGlmAnatomyScene(arch, evidence);
    const first = composeEditorialPoster(scene, glmAnatomyBlueprint());
    const second = composeEditorialPoster(scene, glmAnatomyBlueprint());
    expect(first).toEqual(second);
    expect(first.size.w / first.size.h).toBeLessThanOrEqual(1.8);
    expect(first.nodes).toHaveLength(scene.nodes.length);
  });
});
