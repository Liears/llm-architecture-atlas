#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EvidenceFile, ModelDocument } from "../../../../packages/architecture-ir/src/types.ts";
import { auditCoverage, validateScene } from "../../../../packages/diagram-engine/src/index.ts";
import { computeGatesReport } from "../../../../scripts/gates-report.ts";

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const modelId = value("--model");
if (!modelId) throw new Error("usage: check-model.ts --model <org/model> [--require-zero-debt] [--write-freeze file | --compare-freeze file]");

const repo = resolve(import.meta.dirname, "../../../..");
const modelsRoot = resolve(repo, "models");
let modelDir: string | undefined;
for (const org of readdirSync(modelsRoot)) {
  const orgDir = resolve(modelsRoot, org);
  if (!statSync(orgDir).isDirectory()) continue;
  for (const model of readdirSync(orgDir)) {
    const candidate = resolve(orgDir, model, "main");
    const archPath = resolve(candidate, "architecture.json");
    if (!existsSync(archPath)) continue;
    const candidateArch = JSON.parse(readFileSync(archPath, "utf8")) as ModelDocument;
    if (candidateArch.model.id === modelId) modelDir = candidate;
  }
}
if (!modelDir) throw new Error(`model not found: ${modelId}`);
for (const file of ["architecture.json", "evidence.json", "brief.json"]) {
  if (!existsSync(resolve(modelDir, file))) throw new Error(`${modelId}: missing ${file}`);
}

const arch = JSON.parse(readFileSync(resolve(modelDir, "architecture.json"), "utf8")) as ModelDocument;
const evidence = JSON.parse(readFileSync(resolve(modelDir, "evidence.json"), "utf8")) as EvidenceFile;
const first = computeGatesReport(arch, evidence);
const second = computeGatesReport(arch, evidence);
const scene = first.positioned.scene;
const semanticErrors = [
  ...validateScene(scene),
  ...auditCoverage(scene, evidence.claims, scene.groups),
];

const head = (ref: string) => ref.split(".", 1)[0];
const freeze = {
  modelId: scene.modelId,
  view: scene.view,
  nodes: scene.nodes.map((node) => ({ id: node.id, kind: node.kind, claimPath: node.claimPath ?? null, claims: node.claims ?? [] })),
  edges: scene.edges.map((edge) => ({ id: edge.id, kind: edge.kind, from: head(edge.from), to: head(edge.to), claimPath: edge.claimPath ?? null })),
  groups: scene.groups.map((group) => ({ id: group.id, kind: group.kind, members: group.members, claimPath: group.claimPath ?? null })),
  streams: scene.streams.map((stream) => ({ id: stream.id, path: stream.path.map(head) })),
};
const stable = (input: unknown) => JSON.stringify(input, null, 2) + "\n";
const sha256 = (input: string) => createHash("sha256").update(input).digest("hex");
const positionedHash = sha256(stable(first.positioned));
const svgHash = sha256(first.svg);
if (positionedHash !== sha256(stable(second.positioned)) || svgHash !== sha256(second.svg)) {
  semanticErrors.push("same inputs produced non-deterministic positioned scene or SVG");
}

const writeFreeze = value("--write-freeze");
if (writeFreeze) writeFileSync(resolve(repo, writeFreeze), stable(freeze));
const compareFreeze = value("--compare-freeze");
if (compareFreeze) {
  const expected = readFileSync(resolve(repo, compareFreeze), "utf8");
  if (expected !== stable(freeze)) semanticErrors.push(`semantic freeze differs from ${compareFreeze}`);
}

const requireZeroDebt = process.argv.includes("--require-zero-debt");
const failed = semanticErrors.length > 0 || first.hard.length > 0 || (requireZeroDebt && first.findings.length > 0);
console.log(JSON.stringify({
  modelId,
  semanticErrors,
  hard: first.hard,
  debt: first.findings,
  correctionRounds: first.correctionRounds,
  positionedSha256: positionedHash,
  svgSha256: svgHash,
  freezeSha256: sha256(stable(freeze)),
  status: failed ? "FAIL" : "PASS",
}, null, 2));
if (failed) process.exit(1);
