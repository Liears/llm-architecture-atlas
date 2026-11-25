import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import { compileAutoregressivePoster } from "./editorial-overview.js";
import { composeEditorialPoster } from "./poster.js";
import { runSceneGates, fontGates } from "./gates.js";
import { auditCoverage } from "./audit.js";
import { validateScene } from "./validate.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const kimiDir = `${root}/models/moonshotai/kimi-linear-48b-a3b-instruct/main`;
const kimiArch = JSON.parse(readFileSync(`${kimiDir}/architecture.json`, "utf8")) as ModelDocument;
const kimiEvidence = JSON.parse(readFileSync(`${kimiDir}/evidence.json`, "utf8")) as EvidenceFile;

function stripRef(ref: string): string {
  const dot = ref.indexOf(".");
  return dot === -1 ? ref : ref.slice(0, dot);
}

describe("Kimi Linear hybrid KDA + MLA + MoE template reuse (#39)", () => {
  it("covers all 27 layers with L0 Dense SwiGLU and L26 tail MLA + MoE", () => {
    const { scene, blueprint } = compileAutoregressivePoster(kimiArch, kimiEvidence);
    expect(validateScene(scene)).toEqual([]);
    expect(auditCoverage(scene, kimiEvidence.claims, scene.groups)).toEqual([]);

    const positioned = composeEditorialPoster(scene, blueprint);
    expect(positioned.size.w / positioned.size.h).toBeLessThanOrEqual(1.8);
    expect([...runSceneGates(positioned), ...fontGates(positioned, { referenceWidth: 1150 })]).toEqual([]);

    // 27 layers: L0 Dense SwiGLU, L1-26 MoE, K:M 3:1 ending with MLA on L26
    expect(kimiArch.topology.ffn_groups[0]?.layers).toEqual([0]);
    expect(kimiArch.topology.ffn_groups[1]?.layers).toHaveLength(26);
    expect(kimiArch.topology.attention_groups[1]?.layers).toContain(26);

    // Visible schedule preserves Dense->MoE transition and K,K,M tail ending at MLA
    const sched0 = scene.nodes.find((n) => n.id === "sched-0");
    expect(sched0?.detail).toContain("Dense");
    expect(sched0?.detail).toContain("MoE");
    const tail = scene.nodes.find((n) => n.kind === "schedule-tail");
    expect(tail?.label).toBe("L24–26");
    expect(tail?.detail).toContain("K,K,M");

    // MoE includes router fan-out, 256 routed top-8, 1 shared, and weighted merge
    expect(scene.nodes.find((n) => n.id === "moe-router")?.detail).toContain("top-8");
    expect(scene.nodes.find((n) => n.id === "moe-routed")?.detail).toContain("256 total");
    expect(scene.nodes.find((n) => n.id === "moe-shared")?.detail).toContain("1 always-on");
    expect(scene.edges.filter((e) => stripRef(e.to) === "moe-merge")).toHaveLength(2);
  });

  it("keeps KDA and MLA structurally non-isomorphic even after stripping all text labels", () => {
    const { scene } = compileAutoregressivePoster(kimiArch, kimiEvidence);
    const kdaNodes = new Set(["kda-qkv", "kda-decay", "kda-state", "kda-gate"]);
    const mlaNodes = new Set(["mla-kv", "mla-rope", "mla-core"]);

    const signature = (subset: Set<string>) => {
      const deg = new Map<string, [number, number]>();
      for (const id of subset) deg.set(id, [0, 0]);
      const eKinds: string[] = [];
      for (const e of scene.edges) {
        const u = stripRef(e.from);
        const v = stripRef(e.to);
        if (subset.has(u) && subset.has(v)) {
          deg.get(u)![1] += 1;
          deg.get(v)![0] += 1;
          eKinds.push(e.kind);
        }
      }
      return {
        vertexCount: subset.size,
        edgeCount: eKinds.length,
        degreeSequence: [...deg.values()].sort(),
        edgeKinds: eKinds.sort(),
      };
    };

    const kdaSig = signature(kdaNodes);
    const mlaSig = signature(mlaNodes);
    expect(kdaSig.vertexCount).toBe(4);
    expect(mlaSig.vertexCount).toBe(3);
    expect(kdaSig.degreeSequence).not.toEqual(mlaSig.degreeSequence);
    expect(kdaSig.edgeKinds).not.toEqual(mlaSig.edgeKinds);
  });

  it("rejects malformed layer schedules or missing shared expert mutations", () => {
    const missingLayer = structuredClone(kimiArch);
    missingLayer.topology.attention_groups[1]!.layers = missingLayer.topology.attention_groups[1]!.layers.filter(
      (l) => l !== 26,
    );
    expect(() => compileAutoregressivePoster(missingLayer, kimiEvidence)).toThrow(/missing layer 26/i);

    const noShared = structuredClone(kimiArch);
    noShared.topology.experts!.shared = null;
    const { scene: mutScene } = compileAutoregressivePoster(noShared, kimiEvidence);
    expect(mutScene.nodes.find((n) => n.id === "moe-shared")).toBeUndefined();
  });

  it("contains zero model-id conditional branches inside renderer-svg", () => {
    const renderSrc = readFileSync(resolve(root, "packages/renderer-svg/src/render.ts"), "utf8").toLowerCase();
    expect(renderSrc).not.toContain("glm-5.3");
    expect(renderSrc).not.toContain("kimi-linear");
    expect(renderSrc).not.toContain("laya");
    expect(renderSrc).not.toContain("openjev");
  });
});
