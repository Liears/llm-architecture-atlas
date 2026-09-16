/**
 * Export figures + structural snapshots + gate baselines for every committed
 * model (issues #6, #11, #35). Run: pnpm export:golden
 *
 * #35 gate pipeline: hard gates (layout invariants + SVG safety) must be
 * zero after at most two bounded correction rounds, else a failure report
 * is written and the export fails. Debt gates (aspect, effective font, edge
 * routing, semantic topology) are persisted per model into
 * tests/gates/<model>.gates.json — a committed baseline keyed by element id
 * with the issue that owns each red. New reds or silently-cleared reds
 * change this file, which the clean-diff gate and gates-baseline.test.ts
 * fail until committed with an explanation.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { EvidenceFile, ModelDocument } from "../packages/architecture-ir/src/types.ts";
import { validateScene } from "../packages/diagram-engine/src/index.ts";
import { computeGatesReport } from "./gates-report.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const modelsRoot = `${root}models`;
const outDir = `${root}apps/web/public/figures`;
const gatesDir = `${root}tests/gates`;
mkdirSync(outDir, { recursive: true });
mkdirSync(`${root}tests/structural`, { recursive: true });
mkdirSync(gatesDir, { recursive: true });

let exported = 0;
for (const org of readdirSync(modelsRoot)) {
  const orgDir = `${modelsRoot}/${org}`;
  if (!existsSync(orgDir) || !statSync(orgDir).isDirectory()) continue;
  for (const model of readdirSync(orgDir)) {
    const modelDir = `${orgDir}/${model}/main`;
    if (!existsSync(`${modelDir}/architecture.json`)) continue;
    const arch = JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8")) as ModelDocument;
    const evidence = JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8")) as EvidenceFile;

    const report = computeGatesReport(arch, evidence);
    const scene = report.positioned.scene;
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

    if (report.hard.length > 0) {
      // bounded correction already spent its two rounds inside the report
      const failure = [
        `# Gate failure: ${report.modelId}`,
        "",
        `Hard gates remained red after ${report.correctionRounds} bounded correction round(s).`,
        "No gate was removed and no further redraw was attempted (#35).",
        "",
        ...report.hard.map((f) => `- [${f.gate}] ${f.target}: ${f.message}`),
      ].join("\n");
      const failSlug = report.modelId.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      writeFileSync(`${gatesDir}/${failSlug}.failure.md`, failure + "\n");
      console.error(`[${arch.model.id}] hard gate failures (report written to tests/gates/${failSlug}.failure.md):`);
      for (const f of report.hard) console.error(`  [${f.gate}] ${f.target}: ${f.message}`);
      process.exit(1);
    }

    const positioned = report.positioned;
    writeFileSync(`${outDir}/${positioned.scene.modelId.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-generated.svg`, report.svg);

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

    const slug = scene.modelId.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    writeFileSync(
      `${gatesDir}/${slug}.gates.json`,
      JSON.stringify(
        {
          modelId: scene.modelId,
          generatedBy: "pnpm export:golden",
          note: "Persistent-red baseline (#35). Each entry is a known, owned debt; CI fails on new reds and on entries that clear without being removed here.",
          correctionRounds: report.correctionRounds,
          findings: report.findings,
        },
        null,
        2,
      ) + "\n",
    );
    const summary = report.findings.length
      ? `${report.findings.length} persisted red(s): ${[...new Set(report.findings.map((f) => f.gate))].join(", ")}`
      : "no open findings";
    console.log(`[${arch.model.id}] ok — ${scene.nodes.length} nodes, ${scene.annotations.length} annotations; ${summary}`);
    exported++;
  }
}
console.log(`exported ${exported} model figures`);
