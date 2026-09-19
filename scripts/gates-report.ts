/**
 * Gate report computation for the export pipeline (issue #35). Composition
 * lives in diagram-engine (gates-report.ts) so the baseline test and the
 * export can never diverge; this module adds the renderer-side pieces
 * (SVG safety scan) and the bounded-correction layout.
 */

import type { EvidenceFile, ModelDocument } from "../packages/architecture-ir/src/types.ts";
import {
  compileForModel,
  positionForModel,
  hardFindings,
  composeBaselineFindings,
  type GateFinding,
  type CorrectionResult,
  type BaselineFinding,
} from "../packages/diagram-engine/src/index.ts";
import { renderSvg, scanSvgSafety } from "../packages/renderer-svg/src/render.ts";

export interface GatesReport {
  modelId: string;
  correctionRounds: number;
  hard: GateFinding[];
  findings: BaselineFinding[];
  svg: string;
  positioned: CorrectionResult["positioned"];
}

/** re-exported for pipeline scripts; the choice lives in diagram-engine */
export const compileFor = compileForModel;

export function computeGatesReport(arch: ModelDocument, evidence: EvidenceFile): GatesReport {
  const scene = compileFor(arch, evidence);
  const correction = positionForModel(scene);
  const positioned = correction.positioned;

  const hard = hardFindings(positioned);
  const findings = composeBaselineFindings(scene, positioned, arch);

  const svg = renderSvg(positioned, {
    theme: "light",
    title: `${arch.model.label} — overview`,
    showTitle: arch.model.id === "zai-org/glm-5.3-flash",
    description: `Generated from Architecture IR ${scene.irVersion}. ${scene.nodes.length} nodes, ${scene.annotations.length} evidence annotations; both themes ship in this document via CSS variables.`,
  });
  for (const f of scanSvgSafety(svg)) {
    // inert-document violations are hard failures, never baseline debt
    hard.push(f);
  }

  return { modelId: scene.modelId, correctionRounds: correction.rounds, hard, findings, svg, positioned };
}
