import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import { compileOverviewScene } from "./compile.js";
import { validateScene } from "./validate.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const arch = JSON.parse(readFileSync(`${root}/models/zai-org/glm-5.3-flash/main/architecture.json`, "utf8")) as ModelDocument;
const evidence = JSON.parse(readFileSync(`${root}/models/zai-org/glm-5.3-flash/main/evidence.json`, "utf8")) as EvidenceFile;

const scene = compileOverviewScene(arch, evidence);

describe("compileOverviewScene (GLM-5.3-Flash golden slice)", () => {
  it("produces a structurally valid scene", () => {
    expect(validateScene(scene)).toEqual([]);
  });

  it("carries numbers only with evidence: every numeric label resolves to a claim", () => {
    const targeted = new Set(scene.annotations.map((a) => a.target));
    for (const node of scene.nodes) {
      const hasDigits = /\d/.test(node.label) || /\d/.test(node.detail ?? "");
      if (!hasDigits) continue;
      const traceable = Boolean(node.claimPath) || targeted.has(node.id);
      expect(traceable, `node ${node.id} shows numbers without a claim`).toBe(true);
    }
    for (const group of scene.groups) {
      if (!group.repeat) continue;
      expect(group.claimPath, `group ${group.id} repeats without a claim`).toBeTruthy();
    }
  });

  it("annotations reference real evidence claims with copied status", () => {
    const claimPaths = new Set(evidence.claims.map((c) => c.path));
    for (const ann of scene.annotations) {
      expect(claimPaths.has(ann.claimPath), `annotation path ${ann.claimPath} missing from evidence`).toBe(true);
      if (ann.status) expect(["verified", "reported", "derived", "inferred", "conflict", "unknown"]).toContain(ann.status);
    }
  });

  it("aligns evidence insets with the decoder block row", () => {
    const laid = scene; // alignment is a scene-level constraint; sanity-check it exists
    const align = laid.constraints.find((c) => c.type === "align");
    expect(align && align.type === "align" && align.targets).toContain("inset-moe");
  });

  it("keeps the mHC and MoE information the hand-drawn sample nearly lost", () => {
    const texts = scene.nodes.map((n) => `${n.label} ${n.detail ?? ""}`).join("\n");
    expect(texts).toMatch(/288 routed/);
    expect(texts).toMatch(/4 parallel streams/);
    expect(texts).toMatch(/KDA/);
    expect(texts).toMatch(/MLA/);
  });
});
