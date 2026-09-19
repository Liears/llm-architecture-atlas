/**
 * Structural regression gate (issue #7, generalized in #11): every committed
 * snapshot must equal what the pipeline produces from the committed IR.
 * Update flow: pnpm export:golden — review, commit.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import { compileForModel, positionForModel } from "./gates-report.js";
import { auditCoverage } from "./audit.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const modelsRoot = `${root}/models`;
const snapDir = `${root}/tests/structural`;

const snapshots = readdirSync(snapDir).filter((f) => f.endsWith(".overview.json"));

function pipelineFor(modelId: string) {
  const [orgRaw, ...rest] = modelId.split("/");
  if (!orgRaw) throw new Error(`bad modelId: ${modelId}`);
  const org = orgRaw.toLowerCase();
  const name = rest.join("/").toLowerCase().replace(/\./g, "-");
  const modelDir = `${modelsRoot}/${org}/${name}/main`;
  if (!existsSync(`${modelDir}/architecture.json`)) {
    throw new Error(`missing IR for ${modelId} at ${modelDir}`);
  }
  const arch = JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8")) as ModelDocument;
  const evidence = JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8")) as EvidenceFile;
  const scene = compileForModel(arch, evidence);
  const positioned = positionForModel(scene).positioned;
  return {
    modelId: scene.modelId,
    view: scene.view,
    irVersion: scene.irVersion,
    size: positioned.size,
    nodes: scene.nodes.map((n) => ({ id: n.id, label: n.label, detail: n.detail ?? null, claimPath: n.claimPath ?? null })),
    edges: scene.edges.map((e) => ({ id: e.id, kind: e.kind, from: e.from, to: e.to })),
    groups: scene.groups,
    annotations: scene.annotations,
  };
}

function modelInputs(modelId: string): { arch: ModelDocument; evidence: EvidenceFile } {
  const [orgRaw, ...rest] = modelId.split("/");
  if (!orgRaw) throw new Error(`bad modelId: ${modelId}`);
  const org = orgRaw.toLowerCase();
  const modelDir = `${modelsRoot}/${org}/${rest.join("/").toLowerCase().replace(/\./g, "-")}/main`;
  return {
    arch: JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8")) as ModelDocument,
    evidence: JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8")) as EvidenceFile,
  };
}

describe.each(snapshots)("structural gate: %s", (file) => {
  const committed = JSON.parse(readFileSync(`${snapDir}/${file}`, "utf8"));
  it("matches the pipeline output exactly", () => {
    expect(pipelineFor(committed.modelId)).toEqual(committed);
  });
  it("keeps evidence coverage: every claim-backed segment resolves (#21)", () => {
    const { arch, evidence } = modelInputs(committed.modelId);
    const scene = compileForModel(arch, evidence);
    expect(auditCoverage(scene, evidence.claims, scene.groups)).toEqual([]);
  });

  it("negative: removing a shown claim from evidence fails the audit (#21)", () => {
    const { arch, evidence } = modelInputs(committed.modelId);
    const scene = compileForModel(arch, evidence);
    const firstRef = scene.nodes.flatMap((n) => n.claims ?? [])[0];
    if (!firstRef) return; // model has no claim-backed segments
    const reduced = evidence.claims.filter((c) => c.path !== firstRef.claimPath);
    const audit: string[] = auditCoverage(scene, reduced, scene.groups);
    expect(audit.some((e) => e.includes(`"${firstRef.claimPath}" missing from evidence`))).toBe(true);
  });
});
