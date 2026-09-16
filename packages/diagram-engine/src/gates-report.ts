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
}

const OWNER: Record<string, string> = {
  aspect: "#34",
  font: "#34",
  "edge-node": "#34",
  "edge-reserved": "#34",
  "edge-overlap": "#34",
  "text-overflow": "#34",
  "mhc-streams": "#34",
  "moe-fanout": "#34",
  "moe-fanin": "#34",
  "dsa-selected-kv": "#34",
  schedule: "#34",
};

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
  return debt.map((f) => ({ ...f, owner: OWNER[f.gate] ?? "#35" }));
}
