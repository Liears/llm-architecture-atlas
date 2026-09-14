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
import { compileOverviewScene } from "./compile.js";
import { layoutScene } from "./layout.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const modelsRoot = `${root}/models`;
const snapDir = `${root}/tests/structural`;

const snapshots = readdirSync(snapDir).filter((f) => f.endsWith(".overview.json"));

function pipelineFor(modelId: string) {
  const [org, ...rest] = modelId.split("/");
  const name = rest.join("/").replace(/\./g, "-");
  const modelDir = `${modelsRoot}/${org}/${name}/main`;
  if (!existsSync(`${modelDir}/architecture.json`)) {
    throw new Error(`missing IR for ${modelId} at ${modelDir}`);
  }
  const arch = JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8")) as ModelDocument;
  const evidence = JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8")) as EvidenceFile;
  const scene = compileOverviewScene(arch, evidence);
  const positioned = layoutScene(scene, { fontSize: 16 });
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

describe.each(snapshots)("structural gate: %s", (file) => {
  const committed = JSON.parse(readFileSync(`${snapDir}/${file}`, "utf8"));
  it("matches the pipeline output exactly", () => {
    expect(pipelineFor(committed.modelId)).toEqual(committed);
  });
  it("keeps evidence coverage: numbers always resolve to claims", () => {
    const targeted = new Set<string>(committed.annotations.map((a: { target: string }) => a.target));
    for (const node of committed.nodes) {
      if (/\d/.test(node.label) || /\d/.test(node.detail ?? "")) {
        expect(Boolean(node.claimPath) || targeted.has(node.id), node.id).toBe(true);
      }
    }
  });
});
