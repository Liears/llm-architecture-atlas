/**
 * Compiler (issue #6): Architecture IR + Evidence Ledger -> DiagramScene.
 *
 * Deterministic, template-driven. Every label that carries a number must
 * reference a claim (node.claimPath, group.claimPath or an annotation) so
 * the traceability gate can hold the figure to the evidence ledger.
 */

import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import type { DiagramScene, EvidenceAnnotation, SemanticNode } from "./types.js";

type AnnStatus = NonNullable<EvidenceAnnotation["status"]>;

function commas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function paramsToB(n: number): string {
  return n >= 1e12 ? `${Math.round(n / 1e12)}B` : `${Math.round(n / 1e9)}B`;
}

function contextLabel(n: number): string {
  return n >= 1e6 ? `${Math.round(n / 1e5) / 10}M tokens` : `${commas(n)} tokens`;
}

export function compileOverviewScene(arch: ModelDocument, evidence: EvidenceFile): DiagramScene {
  const { facts, topology } = arch;
  const statusOf = new Map<string, AnnStatus>(evidence.claims.map((c) => [c.path, c.status]));

  const kda = topology.attention_groups[0];
  const mla = topology.attention_groups[1];
  if (!kda) throw new Error("overview template requires at least one attention group");
  const attentionDetail = mla
    ? `${kda.layers.length} ${kda.label} ⇄ ${mla.layers.length} ${mla.label}`
    : `${kda.layers.length} ${kda.label}`;
  const moeCount = topology.ffn_groups.find((g) => g.kind === "moe")?.layers.length ?? 0;
  const denseCount = topology.ffn_groups.find((g) => g.kind === "dense_ffn")?.layers.length ?? 0;

  const nodes: SemanticNode[] = [
    { id: "tok", kind: "io", label: "Tokenized text" },
    {
      id: "embed",
      kind: "embedding",
      label: "Token embedding layer",
      detail: `hidden ${commas(facts.hidden_size)} · vocab ${commas(facts.vocab_size ?? 0)}`,
      claimPath: "facts.hidden_size",
    },
    {
      id: "block",
      kind: "stack",
      label: `Decoder stack · ${facts.num_hidden_layers} layers`,
      detail: `${denseCount} dense SwiGLU + ${moeCount} MoE blocks`,
      claimPath: "facts.num_hidden_layers",
    },
    {
      id: "norm",
      kind: "norm",
      label: "Final RMSNorm",
    },
    {
      id: "head",
      kind: "output",
      label: "Linear output layer",
      detail: `vocab ${commas(facts.vocab_size ?? 0)}`,
      claimPath: "facts.vocab_size",
    },
    {
      id: "inset-attn",
      kind: "inset-attention",
      label: "Attention mix",
      detail: attentionDetail,
      claimPath: "topology.attention_groups[0]",
    },
    {
      id: "inset-moe",
      kind: "inset-moe",
      label: "MoE routing",
      detail: `${commas(topology.experts?.routed_total ?? 0)} routed · ${topology.experts?.active_routed ?? 0} active + ${topology.experts?.shared ?? 0} shared`,
      claimPath: "topology.experts.routed_total",
    },
    {
      id: "inset-mhc",
      kind: "inset-residual",
      label: "mHC residual",
      detail: `${topology.residual?.streams ?? 0} parallel streams`,
      claimPath: "topology.residual.streams",
    },
    {
      id: "inset-ctx",
      kind: "inset-context",
      label: "Context & scale",
      detail: `${contextLabel(facts.context_tokens ?? 0)} · ${paramsToB(facts.total_params ?? 0)} total / ${paramsToB(facts.active_params ?? 0)} active`,
      claimPath: "facts.context_tokens",
    },
  ];

  const scene: DiagramScene = {
    irVersion: arch.ir_version,
    view: "overview",
    modelId: arch.model.id,
    nodes,
    edges: [
      { id: "e-tok-embed", from: "tok", to: "embed", kind: "flow" },
      { id: "e-embed-block", from: "embed", to: "block", kind: "flow" },
      { id: "e-block-norm", from: "block", to: "norm", kind: "flow" },
      { id: "e-norm-head", from: "norm", to: "head", kind: "flow" },
      { id: "c-attn", from: "block", to: "inset-attn", kind: "control" },
      { id: "c-moe", from: "block", to: "inset-moe", kind: "control" },
      { id: "c-mhc", from: "block", to: "inset-mhc", kind: "control" },
      { id: "c-ctx", from: "block", to: "inset-ctx", kind: "control" },
    ],
    groups: [
      {
        id: "repeat-block",
        label: "Decoder block",
        kind: "stack",
        members: ["block"],
        repeat: { count: facts.num_hidden_layers, label: `${facts.num_hidden_layers} ×` },
        claimPath: "facts.num_hidden_layers",
      },
    ],
    annotations: [],
    constraints: [
      { type: "direction", value: "bottom-to-top" },
      {
        type: "order",
        targets: ["tok", "embed", "block", "inset-attn", "inset-moe", "inset-mhc", "inset-ctx", "norm", "head"],
      },
      { type: "align", targets: ["block", "inset-attn", "inset-moe", "inset-mhc", "inset-ctx"], axis: "horizontal" },
      { type: "emphasize", target: "block" },
    ],
  };

  // evidence annotations: node claims + node-adjacent IR paths, with status
  const annotations: EvidenceAnnotation[] = [];
  for (const node of nodes) {
    if (node.claimPath) {
      const status = statusOf.get(node.claimPath);
      annotations.push({ claimPath: node.claimPath, target: node.id, ...(status ? { status } : {}) });
    }
  }
  for (const path of ["facts.num_attention_heads", "topology.attention_groups[1]", "facts.active_params"]) {
    const status = statusOf.get(path);
    if (status) annotations.push({ claimPath: path, target: "block", ...(status ? { status } : {}) });
  }
  scene.annotations = annotations;

  return scene;
}
