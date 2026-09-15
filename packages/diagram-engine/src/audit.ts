/**
 * Evidence coverage audit (issue #21): every claim-backed piece of the
 * figure must resolve to a real evidence claim in a publishable status,
 * and numeric labels must contain the claim's value.
 */

import type { DiagramScene } from "./types.js";

export interface EvidenceClaim {
  path: string;
  value?: unknown;
  status?: string;
}

export function auditCoverage(
  scene: DiagramScene,
  evidence: EvidenceClaim[],
  groups: Array<{ id: string; claimPath?: string }> = [],
): string[] {
  const byPath = new Map(evidence.map((c) => [c.path, c] as const));
  const errors: string[] = [];

  for (const node of scene.nodes) {
    for (const ref of node.claims ?? []) {
      const claim = byPath.get(ref.claimPath);
      if (!claim) {
        errors.push(`node ${node.id}: claim "${ref.claimPath}" missing from evidence ledger`);
        continue;
      }
      if (claim.status === "conflict") {
        errors.push(`node ${node.id}: claim "${ref.claimPath}" is in conflict and cannot be shown as fact`);
      }
      if (typeof claim.value === "number") {
        const v = claim.value;
        const label = ref.label.replace(/,/g, "");
        const forms = [String(v)];
        const trim = (x: number): string => {
          const fixed = x.toFixed(1);
          return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
        };
        forms.push(`${trim(v / 1e9)}B`, `${trim(v / 1e12)}T`, `${trim(v / 1e6)}M`, `${Math.round(v / 1024)}K`);
        if (!forms.some((f) => label.includes(f))) {
          errors.push(`node ${node.id}: label "${ref.label}" does not contain claim ${ref.claimPath}=${v}`);
        }
      }
    }
  }

  for (const group of groups) {
    if (group.claimPath && !byPath.has(group.claimPath)) {
      errors.push(`group ${group.id}: claim "${group.claimPath}" missing from evidence ledger`);
    }
  }
  return errors;
}
