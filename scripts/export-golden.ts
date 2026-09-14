/**
 * Export the GLM-5.3-Flash golden overview figure (issue #6).
 *
 * Reads the committed IR + evidence, compiles the DiagramScene, lays it out,
 * renders themed SVG into the web app, and writes the structural snapshot
 * used by the regression gate (issue #7).
 *
 * Run: pnpm export:golden   (node --experimental-strip-types)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { EvidenceFile, ModelDocument } from "../packages/architecture-ir/src/types.ts";
import { compileOverviewScene, layoutScene, validateScene } from "../packages/diagram-engine/src/index.ts";
import { renderSvg } from "../packages/renderer-svg/src/render.ts";

const root = new URL("..", import.meta.url).pathname;
const modelDir = `${root}models/zai-org/glm-5.3-flash/main`;

const arch = JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8")) as ModelDocument;
const evidence = JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8")) as EvidenceFile;

const scene = compileOverviewScene(arch, evidence);
const errors = validateScene(scene);
if (errors.length > 0) {
  console.error("scene invalid:", errors);
  process.exit(1);
}

// traceability gate: numbers require evidence
const targeted = new Set(scene.annotations.map((a) => a.target));
for (const node of scene.nodes) {
  if (/\d/.test(node.label) || /\d/.test(node.detail ?? "")) {
    if (!node.claimPath && !targeted.has(node.id)) {
      console.error(`untraceable numbers in node ${node.id}`);
      process.exit(1);
    }
  }
}

const positioned = layoutScene(scene, { fontSize: 16 });
const svg = renderSvg(positioned, {
  theme: "light",
  title: "GLM-5.3-Flash (320B-A18B) — overview",
  description: `Generated from Architecture IR ${scene.irVersion}. ${scene.nodes.length} nodes, ${scene.annotations.length} evidence annotations; dark theme ships in the same document via CSS variables.`,
});

const outSvg = `${root}apps/web/public/figures/glm-5.3-flash-generated.svg`;
mkdirSync(`${root}apps/web/public/figures`, { recursive: true });
writeFileSync(outSvg, svg);

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
mkdirSync(`${root}tests/structural`, { recursive: true });
writeFileSync(`${root}tests/structural/glm-5.3-flash.overview.json`, JSON.stringify(snapshot, null, 2) + "\n");

console.log(`wrote ${outSvg.replace(root, "")} and structural snapshot (${scene.nodes.length} nodes, ${scene.annotations.length} annotations)`);
