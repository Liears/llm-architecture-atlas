/**
 * Structural regression gate (issue #7): the committed snapshot
 * tests/structural/glm-5.3-flash.overview.json must equal what the current
 * pipeline produces from the committed IR. Update flow:
 *
 *     pnpm export:golden   # regenerates snapshot + figure; review, commit
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import { compileOverviewScene } from "./compile.js";
import { layoutScene } from "./layout.js";


const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const modelDir = `${root}/models/zai-org/glm-5.3-flash/main`;

const arch = JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8")) as ModelDocument;
const evidence = JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8")) as EvidenceFile;
const committed = JSON.parse(
  readFileSync(`${root}/tests/structural/glm-5.3-flash.overview.json`, "utf8"),
);

describe("structural regression gate (GLM-5.3-Flash overview)", () => {
  const scene = compileOverviewScene(arch, evidence);
  const positioned = layoutScene(scene, { fontSize: 16 });

  const fresh = {
    modelId: scene.modelId,
    view: scene.view,
    irVersion: scene.irVersion,
    size: positioned.size,
    nodes: scene.nodes.map((n) => ({ id: n.id, label: n.label, detail: n.detail ?? null, claimPath: n.claimPath ?? null })),
    edges: scene.edges.map((e) => ({ id: e.id, kind: e.kind, from: e.from, to: e.to })),
    groups: scene.groups,
    annotations: scene.annotations,
  };

  it("matches the committed structural snapshot exactly", () => {
    expect(fresh).toEqual(committed);
  });

  it("keeps evidence coverage: numbers always resolve to claims", () => {
    const targeted = new Set(fresh.annotations.map((a) => a.target));
    for (const node of fresh.nodes) {
      if (/\d/.test(node.label) || /\d/.test(node.detail ?? "")) {
        expect(Boolean(node.claimPath) || targeted.has(node.id), node.id).toBe(true);
      }
    }
  });
});
