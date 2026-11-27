import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import { compileLayerBlockSubview, compileModuleSubview } from "./subview-compiler.js";
import { auditCoverage } from "./audit.js";
import { fontGates, runSceneGates } from "./gates.js";
import { validateScene } from "./validate.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function loadModel(org: string, slug: string): { arch: ModelDocument; evidence: EvidenceFile } {
  const dir = `${root}/models/${org}/${slug}/main`;
  return {
    arch: JSON.parse(readFileSync(`${dir}/architecture.json`, "utf8")) as ModelDocument,
    evidence: JSON.parse(readFileSync(`${dir}/evidence.json`, "utf8")) as EvidenceFile,
  };
}

describe("layer block and module drill-down subviews (#37)", () => {
  it("resolves exact GLM-5.3-Flash layers 0, 3, 4, and tail 44 with clean gates", () => {
    const { arch, evidence } = loadModel("zai-org", "glm-5-3-flash");

    const l0 = compileLayerBlockSubview(arch, evidence, 0);
    const l3 = compileLayerBlockSubview(arch, evidence, 3);
    const l4 = compileLayerBlockSubview(arch, evidence, 4);
    const l44 = compileLayerBlockSubview(arch, evidence, 44);

    // L0: KDA + Dense SwiGLU
    expect(l0.subtitle).toContain("KDA + Dense SwiGLU");
    expect(l0.scene.nodes.some((n) => n.id === "blk-a-qkv")).toBe(true);
    expect(l0.scene.nodes.some((n) => n.id === "blk-f-mlp")).toBe(true);

    // L3: MLA/DSA + Sparse MoE
    expect(l3.subtitle).toContain("MLA/DSA + MoE");
    expect(l3.scene.nodes.some((n) => n.id === "blk-a-idx")).toBe(true);
    expect(l3.scene.nodes.some((n) => n.id === "blk-f-routed")).toBe(true);

    // L4 & tail L44: KDA + MoE
    expect(l4.subtitle).toContain("KDA + MoE");
    expect(l44.subtitle).toContain("KDA + MoE");
    expect(l44.scene.groups.find((g) => g.id === "g-blk-ffn")?.label).toContain("Tail");

    for (const view of [l0, l3, l4, l44]) {
      expect(validateScene(view.scene)).toEqual([]);
      expect(auditCoverage(view.scene, evidence.claims, view.scene.groups)).toEqual([]);
      expect([...runSceneGates(view.positioned), ...fontGates(view.positioned, { referenceWidth: 1150 })]).toEqual([]);
    }
  });

  it("resolves Kimi Linear layers 0, 3, 26 and System-1 models cleanly", () => {
    const kimi = loadModel("moonshotai", "kimi-linear-48b-a3b-instruct");
    const l0 = compileLayerBlockSubview(kimi.arch, kimi.evidence, 0);
    const l3 = compileLayerBlockSubview(kimi.arch, kimi.evidence, 3);
    const l26 = compileLayerBlockSubview(kimi.arch, kimi.evidence, 26);

    expect(l0.subtitle).toContain("KDA + Dense SwiGLU");
    expect(l3.subtitle).toContain("MLA + MoE");
    expect(l26.subtitle).toContain("MLA + MoE");
    expect(l26.scene.nodes.some((n) => n.id === "blk-a-kv")).toBe(true);
    for (const blk of [l0, l3, l26]) {
      expect([...runSceneGates(blk.positioned), ...fontGates(blk.positioned, { referenceWidth: 1150 })]).toEqual([]);
    }

    const ds = loadModel("deepseek-ai", "deepseek-v3");
    for (const layer of [0, 3]) {
      const dsBlk = compileLayerBlockSubview(ds.arch, ds.evidence, layer);
      expect([...runSceneGates(dsBlk.positioned), ...fontGates(dsBlk.positioned, { referenceWidth: 1150 })]).toEqual([]);
    }

    for (const [org, slug, layer] of [
      ["convaiinnovations", "laya", 27],
      ["openjev", "openjev", 63],
    ] as const) {
      const m = loadModel(org, slug);
      const tail = compileLayerBlockSubview(m.arch, m.evidence, layer);
      expect(tail.scene.nodes.some((n) => n.id === "blk-f-dec")).toBe(true);
      expect(validateScene(tail.scene)).toEqual([]);
      expect(auditCoverage(tail.scene, m.evidence.claims, tail.scene.groups)).toEqual([]);
      expect([...runSceneGates(tail.positioned), ...fontGates(tail.positioned, { referenceWidth: 1150 })]).toEqual([]);
    }
  });

  it("compiles clean focused module subviews across attention, ffn, residual, and decision", () => {
    const glm = loadModel("zai-org", "glm-5-3-flash");
    const openjev = loadModel("openjev", "openjev");

    for (const kind of ["attention", "ffn", "residual"] as const) {
      const sub = compileModuleSubview(glm.arch, glm.evidence, kind);
      expect(validateScene(sub.scene)).toEqual([]);
      expect(auditCoverage(sub.scene, glm.evidence.claims, sub.scene.groups)).toEqual([]);
      expect([...runSceneGates(sub.positioned), ...fontGates(sub.positioned, { referenceWidth: 1150 })]).toEqual([]);
      if (kind === "residual") {
        expect(sub.scene.streams).toHaveLength(4);
        expect(sub.scene.nodes.some((n) => n.id === "mhc-hres")).toBe(true);
      }
    }

    const dec = compileModuleSubview(openjev.arch, openjev.evidence, "decision");
    expect(validateScene(dec.scene)).toEqual([]);
    expect(auditCoverage(dec.scene, openjev.evidence.claims, dec.scene.groups)).toEqual([]);
    expect([...runSceneGates(dec.positioned), ...fontGates(dec.positioned, { referenceWidth: 1150 })]).toEqual([]);
  });
});
