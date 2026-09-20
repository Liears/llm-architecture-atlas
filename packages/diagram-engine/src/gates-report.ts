/**
 * Gate report composition (issue #35): splits scene findings into HARD gates
 * (layout invariants: must be zero in any committed figure) and DEBT gates
 * (aspect, effective font, edge routing, semantic topology) whose current
 * reds are persisted in tests/gates/<model>.gates.json, each keyed by element
 * id and owned by the issue that turns it green. Shared by the export
 * pipeline and the baseline regression test so the two can never diverge.
 */

import type { DiagramScene } from "./types.js";
import type { ModelDocument } from "@atlas/architecture-ir";
import type { PositionedScene } from "./positioned.js";
import { layoutWithCorrection, runSceneGates, fontGates, HARD_GATES, type CorrectionResult, type GateFinding } from "./gates.js";
import { assertGlmStructure } from "./structural-assertions.js";
import { compileOverviewScene } from "./compile.js";
import { compileGlmAnatomyScene, glmAnatomyBlueprint } from "./glm-anatomy.js";
import { composeEditorialPoster } from "./poster.js";

/**
 * Round-3 review: the specialized-compiler choice lived in three places
 * (baseline test, gates test, export pipeline). One entry point here so a new
 * model-specific compiler cannot be added to only one of them.
 */
export function compileForModel(arch: ModelDocument, evidence: Parameters<typeof compileOverviewScene>[1]): DiagramScene {
  return arch.model.id === "zai-org/glm-5.3-flash"
    ? compileGlmAnatomyScene(arch, evidence)
    : compileOverviewScene(arch, evidence);
}

/**
 * Keep the reviewed model-specific composition choice beside the compiler
 * choice. Editorial posters are fixed review artifacts, so they are checked
 * as-is; generic layouts retain the two-round bounded correction policy.
 */
export function positionForModel(scene: DiagramScene): CorrectionResult {
  if (scene.modelId === "zai-org/glm-5.3-flash") {
    const positioned = composeEditorialPoster(scene, glmAnatomyBlueprint());
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

/**
 * Round-2 review: owners must be the issues that will ACTUALLY clear each
 * red, per model — not one blanket issue. GLM composition/topology debt is
 * cleared by the #34 redraw; Kimi by the #39 golden; the remaining catalog
 * models have no per-model migration issue yet, so the roadmap #32 owns
 * their debt until such issues are opened (stated in the note).
 */
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
