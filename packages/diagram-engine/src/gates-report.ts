/**
 * Gate report composition (issue #35): splits scene findings into HARD gates
 * (layout invariants: must be zero in any committed figure) and DEBT gates
 * (aspect, effective font, edge routing, semantic topology) whose current
 * reds are persisted in tests/gates/<model>.gates.json, each keyed by element
 * id and owned by the issue that turns it green. Shared by the export
 * pipeline and the baseline regression test so the two can never diverge.
 */

import type { DiagramScene } from "./types.js";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import type { PositionedScene } from "./positioned.js";
import { layoutWithCorrection, runSceneGates, fontGates, HARD_GATES, type CorrectionResult, type GateFinding } from "./gates.js";
import { assertGlmStructure } from "./structural-assertions.js";
import { compileGlmAnatomyScene, glmAnatomyBlueprint } from "./glm-anatomy.js";
import { compileAutoregressivePoster } from "./editorial-overview.js";
import { compileSystemOnePoster } from "./system-one-anatomy.js";
import { composeEditorialPoster, type EditorialPosterBlueprint } from "./poster.js";

const compiledBlueprints = new WeakMap<DiagramScene, EditorialPosterBlueprint>();

/**
 * Single compiler dispatch shared by baseline tests, gate checks, and the
 * export pipeline. Routes GLM-5.3-Flash to its multi-stream mHC anatomy,
 * System-1 decision models to the non-autoregressive decision compiler, and
 * all other models to the general autoregressive editorial poster compiler.
 */
export function compileForModel(arch: ModelDocument, evidence: EvidenceFile): DiagramScene {
  if (arch.model.id === "zai-org/glm-5.3-flash") {
    return compileGlmAnatomyScene(arch, evidence);
  }
  const poster =
    arch.topology.paradigm === "system_one_decision"
      ? compileSystemOnePoster(arch, evidence)
      : compileAutoregressivePoster(arch, evidence);
  compiledBlueprints.set(poster.scene, poster.blueprint);
  return poster.scene;
}

/**
 * Keep the reviewed composition choice beside the compiler choice.
 * Editorial posters (GLM, autoregressive editorial overviews, and System-1
 * posters) use deterministic blueprint composition; fallback generic scenes
 * retain bounded layout correction.
 */
export function positionForModel(scene: DiagramScene): CorrectionResult {
  if (scene.modelId === "zai-org/glm-5.3-flash") {
    const positioned = composeEditorialPoster(scene, glmAnatomyBlueprint());
    return { positioned, rounds: 0, hard: hardFindings(positioned) };
  }
  const blueprint = compiledBlueprints.get(scene);
  if (blueprint) {
    const positioned = composeEditorialPoster(scene, blueprint);
    return { positioned, rounds: 0, hard: hardFindings(positioned) };
  }
  return layoutWithCorrection(scene);
}

export interface BaselineFinding extends GateFinding {
  /** issue that owns turning this red green */
  owner: string;
  /** why this owner, when not obvious (round 2) */
  note?: string;
}

function ownerFor(modelId: string): { owner: string; note?: string } {
  if (modelId === "zai-org/glm-5.3-flash") return { owner: "#34" };
  if (modelId === "moonshotai/kimi-linear-48b-a3b-instruct") return { owner: "#39" };
  return { owner: "#32", note: "per-model migration issue not opened yet; roadmap #32 owns this debt until then" };
}

export function hardFindings(positioned: PositionedScene): GateFinding[] {
  return runSceneGates(positioned).filter((f) => HARD_GATES.has(f.gate));
}

export function composeBaselineFindings(
  scene: DiagramScene,
  positioned: PositionedScene,
  arch: ModelDocument | null,
): BaselineFinding[] {
  const debt: GateFinding[] = [
    ...runSceneGates(positioned).filter((f) => !HARD_GATES.has(f.gate)),
    ...fontGates(positioned),
  ];
  if (arch && arch.model.id === "zai-org/glm-5.3-flash") {
    debt.push(...assertGlmStructure(scene, arch));
  }
  const { owner, note } = ownerFor(arch?.model.id ?? "unknown");
  return debt.map((f) => ({ ...f, owner, ...(note ? { note } : {}) }));
}
