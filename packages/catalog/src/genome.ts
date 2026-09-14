/** Architecture Genome (issues #9, #10): per-layer encoding for the strip view. */

export interface GenomeLayer {
  index: number;
  attention: string; // group label
  attentionKind: string;
  ffn: string;
  ffnKind: string;
}

export interface Genome {
  numLayers: number;
  layers: GenomeLayer[];
}

type Arch = {
  facts: { num_hidden_layers: number };
  topology: { attention_groups: Array<{ label: string; kind: string; layers: number[] }>; ffn_groups: Array<{ label: string; kind: string; layers: number[] }> };
};

export function buildGenome(arch: Arch): Genome {
  const n = arch.facts.num_hidden_layers;
  const layers: GenomeLayer[] = [];
  for (let i = 0; i < n; i++) {
    const a = arch.topology.attention_groups.find((g) => g.layers.includes(i));
    const f = arch.topology.ffn_groups.find((g) => g.layers.includes(i));
    layers.push({
      index: i,
      attention: a?.label ?? "unknown",
      attentionKind: a?.kind ?? "unknown",
      ffn: f?.label ?? "unknown",
      ffnKind: f?.kind ?? "unknown",
    });
  }
  return { numLayers: n, layers };
}

/** Token colors for the strip (resolved by the page from @atlas/ui tokens). */
export function genomeCellRole(layer: GenomeLayer): "attention" | "state" | "compute" | "muted" {
  if (layer.ffnKind === "moe") return "compute";
  if (layer.attentionKind === "linear_attention") return "state";
  if (layer.attentionKind === "unknown") return "muted";
  return "attention";
}
