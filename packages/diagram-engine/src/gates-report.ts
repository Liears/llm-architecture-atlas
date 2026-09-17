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
import { runSceneGates, fontGates, HARD_GATES, type GateFinding } from "./gates.js";
import { assertGlmStructure } from "./structural-assertions.js";

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
