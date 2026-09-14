/**
 * Catalog (issue #8): build the static catalog index from Architecture IR
 * documents. Pure function over committed models/ data — no network.
 */

export interface CatalogEntry {
  id: string; // org/name
  slug: string; // URL-safe id
  label: string;
  family: string;
  decoderType: string; // human-readable hybrid description
  attentionTypes: string[];
  totalParams: number | null;
  activeParams: number | null;
  contextTokens: number | null;
  numLayers: number;
  revision: string;
}

function decoderType(attentionTypes: string[]): string {
  if (attentionTypes.length === 0) return "Unknown";
  if (attentionTypes.length === 1) return attentionTypes[0]!;
  return `Hybrid (${attentionTypes.join(" + ")})`;
}

export interface CatalogInput {
  model: { id: string; label: string; family: string | null; revision: string };
  facts: { num_hidden_layers: number; total_params: number | null; active_params: number | null; context_tokens: number | null };
  topology: {
    attention_groups: Array<{ label: string; kind: string }>;
    ffn_groups: Array<{ kind: string }>;
    experts: { routed_total: number | null } | null;
  };
}

export function buildCatalog(docs: CatalogInput[]): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const d of docs) {
    const attentionTypes = d.topology.attention_groups.map((g) => g.label);
    const hasMoE = Boolean(d.topology.experts?.routed_total);
    entries.push({
      id: d.model.id,
      slug: d.model.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      label: d.model.label,
      family: d.model.family ?? "Other",
      decoderType: hasMoE ? `${decoderType(attentionTypes)} + MoE` : decoderType(attentionTypes),
      attentionTypes,
      totalParams: d.facts.total_params,
      activeParams: d.facts.active_params,
      contextTokens: d.facts.context_tokens,
      numLayers: d.facts.num_hidden_layers,
      revision: d.model.revision,
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
  { query = "", family = "" }: { query?: string; family?: string },
): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (family && e.family !== family) return false;
    if (!q) return true;
    return `${e.label} ${e.family} ${e.decoderType} ${e.attentionTypes.join(" ")}`.toLowerCase().includes(q);
  });
}

export function families(entries: CatalogEntry[]): string[] {
  return [...new Set(entries.map((e) => e.family))].sort();
}

export * from "./genome.js";
export * from "./compare.js";
