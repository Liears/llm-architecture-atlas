/**
 * Catalog (issue #8, paradigm-aware): build the static catalog index from
 * Architecture IR documents. Pure function over committed models/ data — no network.
 */

export type ExecutionParadigm = "autoregressive_lm" | "system_one_decision";

export interface CatalogEntry {
  id: string; // org/name
  slug: string; // URL-safe id
  label: string;
  family: string;
  paradigm: ExecutionParadigm;
  readoutMode: string | null;
  primitives: string[];
  calibration: string | null;
  decoderType: string; // human-readable hybrid/readout description
  attentionTypes: string[];
  totalParams: number | null;
  activeParams: number | null;
  contextTokens: number | null;
  numLayers: number;
  revision: string;
  license: string | null;
  hasMoE: boolean;
  residualScheme: string | null;
}

function decoderType(attentionTypes: string[]): string {
  if (attentionTypes.length === 0) return "Unknown";
  if (attentionTypes.length === 1) return attentionTypes[0]!;
  return `Hybrid (${attentionTypes.join(" + ")})`;
}

function readoutLabel(readoutMode: string | null | undefined): string {
  if (!readoutMode) return "Decision Head";
  if (readoutMode === "mask_marker_mlp") return "[MASK] MLP Head";
  if (readoutMode === "first_token_letter_logits") return "Pos-0 Letter Logits";
  if (readoutMode === "cross_attention_symmetric") return "Symmetric Cross-Attn";
  return readoutMode;
}

export interface CatalogInput {
  model: { id: string; label: string; family?: string | null; revision?: string; license?: string | null };
  facts: { num_hidden_layers: number; total_params?: number | null; active_params?: number | null; context_tokens?: number | null };
  topology: {
    attention_groups: Array<{ label: string; kind: string }>;
    ffn_groups: Array<{ kind: string }>;
    experts?: { routed_total?: number | null } | null;
    residual?: { scheme: string } | null;
    paradigm?: ExecutionParadigm | null;
    decision_head?: {
      readout_mode: string;
      primitives?: string[];
      calibration?: string | null;
    } | null;
  };
}

export function buildCatalog(docs: CatalogInput[]): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const d of docs) {
    const attentionTypes = d.topology.attention_groups.map((g) => g.label);
    const hasMoE = Boolean(d.topology.experts?.routed_total);
    const paradigm: ExecutionParadigm = d.topology.paradigm ?? "autoregressive_lm";
    const readoutMode = d.topology.decision_head?.readout_mode ?? null;
    const baseType = hasMoE ? `${decoderType(attentionTypes)} + MoE` : decoderType(attentionTypes);
    const summaryType =
      paradigm === "system_one_decision" ? `System-1 · ${baseType} → ${readoutLabel(readoutMode)}` : baseType;
    entries.push({
      id: d.model.id,
      slug: d.model.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      label: d.model.label,
      family: d.model.family ?? "Other",
      paradigm,
      readoutMode,
      primitives: d.topology.decision_head?.primitives ?? [],
      calibration: d.topology.decision_head?.calibration ?? null,
      decoderType: summaryType,
      attentionTypes,
      totalParams: d.facts.total_params ?? null,
      activeParams: d.facts.active_params ?? null,
      contextTokens: d.facts.context_tokens ?? null,
      numLayers: d.facts.num_hidden_layers,
      revision: d.model.revision ?? "main",
      license: d.model.license ?? null,
      hasMoE,
      residualScheme: d.topology.residual?.scheme ?? null,
    });
  }
  return entries.sort((a, b) => a.label.localeCompare(b.label));
}

export type SortKey = "label" | "params" | "layers";

export function sortEntries(entries: CatalogEntry[], key: SortKey, desc = false): CatalogEntry[] {
  const cmp: Record<SortKey, (a: CatalogEntry, b: CatalogEntry) => number> = {
    label: (a, b) => a.label.localeCompare(b.label),
    params: (a, b) => (a.totalParams ?? 0) - (b.totalParams ?? 0),
    layers: (a, b) => a.numLayers - b.numLayers,
  };
  const sorted = [...entries].sort(cmp[key]!);
  return desc ? sorted.reverse() : sorted;
}

export function filterEntries(
  entries: CatalogEntry[],
  { query = "", family = "", paradigm = "" }: { query?: string; family?: string; paradigm?: string },
): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (family && e.family !== family) return false;
    if (paradigm && e.paradigm !== paradigm) return false;
    if (!q) return true;
    return `${e.label} ${e.family} ${e.decoderType} ${e.paradigm} ${e.primitives.join(" ")} ${e.attentionTypes.join(" ")}`
      .toLowerCase()
      .includes(q);
  });
}

export function families(entries: CatalogEntry[]): string[] {
  return [...new Set(entries.map((e) => e.family))].sort();
}

export * from "./format.js";
export * from "./genome.js";
export * from "./compare.js";
