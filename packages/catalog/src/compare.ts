/** Two-model alignment diff (issue #10): fields + per-layer genome alignment. */

import type { CatalogEntry } from "./index.js";
import type { Genome } from "./genome.js";

export interface FieldDiffRow {
  field: string;
  a: string;
  b: string;
  shared: boolean;
}

export interface CompareResult {
  fieldRows: FieldDiffRow[];
  genome: {
    numLayers: number; // max of both; shorter model pads with "—"
    aLayers: Array<{ label: string; role: string } | null>;
    bLayers: Array<{ label: string; role: string } | null>;
    attentionDiffer: number; // count of aligned columns where attention types differ
  };
}

function fmtParams(n: number | null): string {
  if (n === null) return "—";
  return n >= 1e12 ? `${Math.round((n / 1e12) * 10) / 10}B` : `${Math.round((n / 1e9) * 10) / 10}B`;
}

export function compareModels(
  a: { entry: CatalogEntry; genome: Genome },
  b: { entry: CatalogEntry; genome: Genome },
): CompareResult {
  const fa = a.entry;
  const fb = b.entry;
  const rows: FieldDiffRow[] = [
    ["Total params", fmtParams(fa.totalParams), fmtParams(fb.totalParams)],
    ["Active params", fmtParams(fa.activeParams), fmtParams(fb.activeParams)],
    ["Layers", String(fa.numLayers), String(fb.numLayers)],
    ["Context", fa.contextTokens === fb.contextTokens ? String(fa.contextTokens) : `${fa.contextTokens} vs ${fb.contextTokens}`, ""],
    ["Decoder", fa.decoderType, fb.decoderType],
  ].map(([field, av, bv]) => ({
    field: field!,
    a: av!,
    b: field === "Context" ? bv! || av! : bv!,
    shared: false,
  }));
  // recompute shared flags on values
  for (const r of rows) {
    if (r.field === "Context") {
      r.a = String(fa.contextTokens ?? "—");
      r.b = String(fb.contextTokens ?? "—");
    }
    r.shared = r.a === r.b;
  }

  const numLayers = Math.max(a.genome.numLayers, b.genome.numLayers);
  const pad = (g: Genome) => {
    const cells: Array<{ label: string; role: string } | null> = [];
    for (let i = 0; i < numLayers; i++) {
      const l = g.layers[i];
      cells.push(l ? { label: l.attention, role: l.attentionKind } : null);
    }
    return cells;
  };
  const aLayers = pad(a.genome);
  const bLayers = pad(b.genome);
  const attentionDiffer = aLayers.filter(
    (c, i) => c && bLayers[i] && c.label !== bLayers[i]!.label,
  ).length;

  return { fieldRows: rows, genome: { numLayers, aLayers, bLayers, attentionDiffer } };
}
