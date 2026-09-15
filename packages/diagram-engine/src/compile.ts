/**
 * Compiler (issue #6, hardened by #21): Architecture IR + Evidence Ledger ->
 * DiagramScene. Deterministic, template-driven.
 *
 * Traceability rule (#21): the figure is built from claim-backed segments.
 * Every text piece that contains a number references a claim path, and the
 * audit gate checks that path against the evidence ledger — a missing or
 * mismatched claim fails the export.
 */

import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import type { DiagramScene, EvidenceAnnotation, SemanticNode } from "./types.js";

type AnnStatus = NonNullable<EvidenceAnnotation["status"]>;

function commas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function paramsToB(n: number): string {
  return n >= 1e12 ? `${Math.round((n / 1e12) * 10) / 10}T` : `${Math.round((n / 1e9) * 10) / 10}B`;
}

function contextLabel(n: number): string {
  if (n >= 1e6) {
    const m = Math.round((n / 1e6) * 10) / 10;
    return `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}M tokens`;
  }
  return `${Math.round(n / 1024)}K tokens`;
}

export function compileOverviewScene(arch: ModelDocument, evidence: EvidenceFile): DiagramScene {
  const { facts, topology } = arch;
  const statusOf = new Map<string, AnnStatus>(evidence.claims.map((c) => [c.path, c.status] as const));

  /** Build a node whose detail is split into claim-backed segments. */
  function node(
    id: string,
    kind: string,
    label: string,
    segments: Array<{ claimPath?: string; label: string }>,
  ): SemanticNode {
    const claims = segments.filter((s) => s.claimPath) as Array<{ claimPath: string; label: string }>;
    const detail = segments.map((s) => s.label).join(" · ");
    return {
      id,
      kind,
      label,
      ...(segments.length ? { detail } : {}),
      claimPath: claims[0]?.claimPath,
      ...(claims.length ? { claims } : {}),
    };
  }

  const attentionGroups = topology.attention_groups;
  const attentionDetail = attentionGroups
    .map((g) => `${g.layers.length} ${g.label}`)
    .join(" ⇄ ");
  const moeGroup = topology.ffn_groups.find((g) => g.kind === "moe");
  const denseGroup = topology.ffn_groups.find((g) => g.kind === "dense_ffn");
  const experts = topology.experts;

  const nodes: SemanticNode[] = [
    { id: "tok", kind: "io", label: "Tokenized text" },
    node("embed", "embedding", "Token embedding layer", [
      { claimPath: "facts.hidden_size", label: `hidden ${commas(facts.hidden_size)}` },
      ...(facts.vocab_size ? [{ claimPath: "facts.vocab_size", label: `vocab ${commas(facts.vocab_size)}` }] : []),
    ]),
    node("block", "stack", `Decoder stack · ${facts.num_hidden_layers} layers`, [
      { claimPath: "facts.num_hidden_layers", label: `${facts.num_hidden_layers} layers` },
      ...attentionGroups.map((g) => ({ claimPath: `topology.attention_groups[${attentionGroups.indexOf(g)}]`, label: `${g.layers.length} ${g.label}` })),
      ...(denseGroup ? [{ label: `${denseGroup.layers.length} dense` }] : []),
      ...(moeGroup ? [{ label: `${moeGroup.layers.length} MoE blocks` }] : []),
    ]),
    { id: "norm", kind: "norm", label: "Final RMSNorm" },
    node("head", "output", "Linear output layer",
      facts.vocab_size ? [{ claimPath: "facts.vocab_size", label: `vocab ${commas(facts.vocab_size)}` }] : []),
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
      { type: "order", targets: ["tok", "embed", "block", "norm", "head"] },
      { type: "emphasize", target: "block" },
    ],
  };

  // -- evidence insets: only when the model actually has the structure
  const insetTargets: string[] = [];
  const insetSpecs: Array<{ id: string; kind: string; label: string; segments: Array<{ claimPath?: string; label: string }> }> = [];
  insetSpecs.push({
    id: "inset-attn",
    kind: "inset-attention",
    label: "Attention mix",
    segments: attentionGroups.map((g, i) => ({
      claimPath: `topology.attention_groups[${i}]`,
      label: `${g.layers.length} ${g.label}`,
    })),
  });
  if (experts?.routed_total) {
    insetSpecs.push({
      id: "inset-moe",
      kind: "inset-moe",
      label: "MoE routing",
      segments: [
        { claimPath: "topology.experts.routed_total", label: `${commas(experts.routed_total)} routed` },
        { claimPath: "topology.experts.active_routed", label: `${experts.active_routed ?? "?"} active` },
        ...(experts.shared ? [{ claimPath: "topology.experts.shared", label: `${experts.shared} shared` }] : []),
      ],
    });
  }
  if (topology.residual?.streams) {
    insetSpecs.push({
      id: "inset-mhc",
      kind: "inset-residual",
      label: "mHC residual",
      segments: [{ claimPath: "topology.residual.streams", label: `${topology.residual.streams} parallel streams` }],
    });
  }
  if (facts.context_tokens || facts.total_params) {
    insetSpecs.push({
      id: "inset-ctx",
      kind: "inset-context",
      label: "Context & scale",
      segments: [
        ...(facts.context_tokens ? [{ claimPath: "facts.context_tokens", label: contextLabel(facts.context_tokens) }] : []),
        ...(facts.total_params ? [{ claimPath: "facts.total_params", label: `${paramsToB(facts.total_params)} total` }] : []),
        ...(facts.active_params ? [{ claimPath: "facts.active_params", label: `${paramsToB(facts.active_params)} active` }] : []),
      ],
    });
  }
  // mechanism-specific attention structure inset (#28): each family shows
  // its signature attention mechanism as structure, not just a label
  const attnKinds = new Set(attentionGroups.map((g) => g.kind));
  if (attnKinds.has("mla") || attnKinds.has("mla_sparse")) {
    insetSpecs.push({
      id: "inset-mla",
      kind: "inset-attention",
      label: "MLA latent KV",
      segments: attentionGroups
        .filter((g) => g.kind === "mla" || g.kind === "mla_sparse")
        .map((g) => ({ claimPath: `topology.attention_groups[${attentionGroups.indexOf(g)}]`, label: `${g.label}: latent + RoPE keys` })),
    });
  } else if (attnKinds.has("linear_attention")) {
    insetSpecs.push({
      id: "inset-linear",
      kind: "inset-attention",
      label: "Linear state path",
      segments: attentionGroups
        .filter((g) => g.kind === "linear_attention")
        .map((g) => ({ claimPath: `topology.attention_groups[${attentionGroups.indexOf(g)}]`, label: `${g.label}: recurrent state, no KV cache` })),
    });
  } else {
    insetSpecs.push({
      id: "inset-gqa",
      kind: "inset-attention",
      label: "GQA grouped KV",
      segments: attentionGroups.map((g, i) => ({
        claimPath: `topology.attention_groups[${i}]`,
        label: `${g.label}: shared KV heads`,
      })),
    });
  }

  for (const spec of insetSpecs) {
    scene.nodes.push(node(spec.id, spec.kind, spec.label, spec.segments));
    scene.edges.push({ id: `c-${spec.id.replace("inset-", "")}`, from: "block", to: spec.id, kind: "control" });
    insetTargets.push(spec.id);
  }

  // order: main flow first, then insets after the block
  scene.constraints.push({
    type: "order",
    targets: ["tok", "embed", "block", ...insetTargets, "norm", "head"],
  });
  if (insetTargets.length) {
    scene.constraints.push({ type: "align", targets: ["block", ...insetTargets], axis: "horizontal" });
  }

  // -- evidence annotations: every claim-backed node gets one with status
  const annotations: EvidenceAnnotation[] = [];
  for (const node of scene.nodes) {
    for (const ref of node.claims ?? []) {
      const status = statusOf.get(ref.claimPath);
      annotations.push({ claimPath: ref.claimPath, target: node.id, ...(status ? { status } : {}) });
    }
  }
  scene.annotations = annotations;

  return scene;
}
