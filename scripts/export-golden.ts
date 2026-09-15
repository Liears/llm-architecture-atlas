/**
 * Export figures + structural snapshots for every committed model
 * (issues #6, #11). Run: pnpm export:golden
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { EvidenceFile, ModelDocument } from "../packages/architecture-ir/src/types.ts";
import {
  auditCoverage, compileOverviewScene, compileGlmTopologyScene, layoutScene, validateScene,
} from "../packages/diagram-engine/src/index.ts";
import { renderSvg } from "../packages/renderer-svg/src/render.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const modelsRoot = `${root}models`;
const outDir = `${root}apps/web/public/figures`;
mkdirSync(outDir, { recursive: true });
mkdirSync(`${root}tests/structural`, { recursive: true });

let exported = 0;
for (const org of readdirSync(modelsRoot)) {
  const orgDir = `${modelsRoot}/${org}`;
  if (!existsSync(orgDir) || !statSync(orgDir).isDirectory()) continue;
  for (const model of readdirSync(orgDir)) {
    const modelDir = `${orgDir}/${model}/main`;
    if (!existsSync(`${modelDir}/architecture.json`)) continue;
    const arch = JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8")) as ModelDocument;
    const evidence = JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8")) as EvidenceFile;

    const scene = arch.model.id === "zai-org/glm-5.3-flash"
      ? compileGlmTopologyScene(arch, evidence)
      : compileOverviewScene(arch, evidence);
    const errors = validateScene(scene);
    if (errors.length > 0) {
      console.error(`[${arch.model.id}] scene invalid:`, errors);
      process.exit(1);
    }

    const targeted = new Set(scene.annotations.map((a) => a.target));
    for (const node of scene.nodes) {
      if (/\d/.test(node.label) || /\d/.test(node.detail ?? "")) {
        if (!node.claimPath && !targeted.has(node.id)) {
          console.error(`[${arch.model.id}] untraceable numbers in node ${node.id}`);
          process.exit(1);
        }
    }
    }

    const positioned = layoutScene(scene, { fontSize: 16 });
    const svg = renderSvg(positioned, {
      theme: "light",
      title: `${arch.model.label} — overview`,
      description: `Generated from Architecture IR ${scene.irVersion}. ${scene.nodes.length} nodes, ${scene.annotations.length} evidence annotations; both themes ship in this document via CSS variables.`,
    });
    writeFileSync(`${outDir}/${positioned.scene.modelId.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-generated.svg`, svg);

    const snapshot = {
      modelId: scene.modelId,
      view: scene.view,
      irVersion: scene.irVersion,
      size: positioned.size,
      nodes: scene.nodes.map((n) => ({ id: n.id, label: n.label, detail: n.detail ?? null, claimPath: n.claimPath ?? null })),
      edges: scene.edges.map((e) => ({ id: e.id, kind: e.kind, from: e.from, to: e.to })),
      groups: scene.groups,
      annotations: scene.annotations,
    };
    const snapName = `${scene.modelId.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.overview.json`;
    writeFileSync(`${root}tests/structural/${snapName}`, JSON.stringify(snapshot, null, 2) + "\n");
    console.log(`[${arch.model.id}] ok — ${scene.nodes.length} nodes, ${scene.annotations.length} annotations`);
    exported++;
  }
}
console.log(`exported ${exported} model figures`);
