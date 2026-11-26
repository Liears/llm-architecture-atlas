import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import { compileForModel, positionForModel } from "./gates-report.js";
import { fontGates, runSceneGates } from "./gates.js";
import { auditCoverage } from "./audit.js";
import { validateScene } from "./validate.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function load(orgModel: string): { arch: ModelDocument; evidence: EvidenceFile } {
  const dir = `${root}/models/${orgModel}/main`;
  return {
    arch: JSON.parse(readFileSync(`${dir}/architecture.json`, "utf8")) as ModelDocument,
    evidence: JSON.parse(readFileSync(`${dir}/evidence.json`, "utf8")) as EvidenceFile,
  };
}

describe("System One decision model diagrams", () => {
  it("compiles Laya with ModernBERT encoder, [MASK] decision head, RLCD & act head with zero debt", () => {
    const { arch, evidence } = load("convaiinnovations/laya");
    const scene = compileForModel(arch, evidence);
    expect(validateScene(scene)).toEqual([]);
    expect(auditCoverage(scene, evidence.claims, scene.groups)).toEqual([]);
    const positioned = positionForModel(scene).positioned;
    expect([...runSceneGates(positioned), ...fontGates(positioned, { referenceWidth: 1150 })]).toEqual([]);
    expect(scene.nodes.some((n) => n.kind === "decision")).toBe(true);
    expect(scene.nodes.some((n) => n.kind === "action")).toBe(true);
    expect(scene.nodes.find((n) => n.id === "sched-0")?.detail).toContain("(F,S,S) ×9");
  });

  it("compiles OpenJev with hybrid Qwen3.5 backbone, shared prefix KV, and single-pass letter readout with zero debt", () => {
    const { arch, evidence } = load("openjev/openjev");
    const scene = compileForModel(arch, evidence);
    expect(validateScene(scene)).toEqual([]);
    expect(auditCoverage(scene, evidence.claims, scene.groups)).toEqual([]);
    const positioned = positionForModel(scene).positioned;
    expect([...runSceneGates(positioned), ...fontGates(positioned, { referenceWidth: 1150 })]).toEqual([]);
    expect(scene.nodes.some((n) => n.kind === "cache")).toBe(true);
    expect(scene.nodes.some((n) => n.kind === "vision")).toBe(true);
    expect(scene.nodes.find((n) => n.id === "sched-0")?.detail).toContain("(L,L,L,G) ×16");
  });

  it("rejects system_one_decision models missing decision_head metadata", () => {
    const { arch, evidence } = load("convaiinnovations/laya");
    const broken = structuredClone(arch);
    broken.topology.decision_head = null;
    expect(() => compileForModel(broken, evidence)).toThrow(/decision_head/);
  });
});
