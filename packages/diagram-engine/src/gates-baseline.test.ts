/**
 * Persistent-red baseline regression (issue #35): the committed gate
 * baseline (tests/gates/*.gates.json) must equal what the pipeline computes
 * today. A NEW red fails CI until it is committed with an owner and an
 * explanation; a red that cleared fails CI until its baseline entry is
 * removed. Known debt can therefore never be presented as green, and can
 * never silently grow or be silently deleted.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import { hardFindings, composeBaselineFindings, compileForModel, positionForModel } from "./gates-report.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const gatesDir = `${root}/tests/gates`;
const modelsRoot = `${root}/models`;

const baselines = readdirSync(gatesDir).filter((f) => f.endsWith(".gates.json"));

const committedModelIds = readdirSync(modelsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((org) =>
  readdirSync(`${modelsRoot}/${org.name}`, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((model) => {
    const architecture = `${modelsRoot}/${org.name}/${model.name}/main/architecture.json`;
    try {
      return [(JSON.parse(readFileSync(architecture, "utf8")) as ModelDocument).model.id];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }),
);

const baselineModelIds = baselines.map((file) =>
  (JSON.parse(readFileSync(`${gatesDir}/${file}`, "utf8")) as { modelId: string }).modelId,
);

describe("gate baseline inventory", () => {
  it("covers every committed model exactly once, with no stale baselines", () => {
    expect([...new Set(baselineModelIds)].sort()).toEqual([...committedModelIds].sort());
    expect(baselineModelIds).toHaveLength(new Set(baselineModelIds).size);
  });
});

function inputsFor(modelId: string): { arch: ModelDocument; evidence: EvidenceFile } {
  const [orgRaw, ...rest] = modelId.split("/");
  const modelDir = `${modelsRoot}/${orgRaw!.toLowerCase()}/${rest.join("/").toLowerCase().replace(/\./g, "-")}/main`;
  return {
    arch: JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8")) as ModelDocument,
    evidence: JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8")) as EvidenceFile,
  };
}

function reportFor(modelId: string) {
  const { arch, evidence } = inputsFor(modelId);
  const scene = compileForModel(arch, evidence);
  const positioned = positionForModel(scene).positioned;
  return { hard: hardFindings(positioned), findings: composeBaselineFindings(scene, positioned, arch) };
}

describe.each(baselines)("gate baseline: %s", (file) => {
  const committed = JSON.parse(readFileSync(`${gatesDir}/${file}`, "utf8")) as {
    modelId: string;
    findings: Array<{ gate: string; target: string; message: string; owner: string }>;
  };

  it("matches the computed findings exactly (no new reds, no silently cleared reds)", () => {
    expect(reportFor(committed.modelId).findings).toEqual(committed.findings);
  });

  it("keeps hard gates at zero (bounded correction spent, no failure report)", () => {
    expect(reportFor(committed.modelId).hard).toEqual([]);
    expect(readdirSync(gatesDir).filter((f) => f.endsWith(".failure.md"))).toEqual([]);
  });

  it("every persisted red names an owning issue", () => {
    for (const f of committed.findings) {
      expect(f.owner).toMatch(/^#\d+$/);
    }
  });
});
