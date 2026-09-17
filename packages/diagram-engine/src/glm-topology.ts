/**
 * GLM-5.3-Flash hybrid topology compiler (issue #24).
 *
 * Replaces the summary-box overview with the real structure, driven by the
 * pinned official config values in the IR:
 *
 * - mHC: four parallel residual streams on a left rail, each with
 *   read/mix/write edges into the block chain (claim: topology.residual.streams);
 * - attention schedule: K,K,K,D repeated 11× then a final KDA layer,
 *   drawn as an explicit per-4-layer unit group + genome note;
 * - DSA: lightning indexer → top-k 2048 → selected KV → MLA core;
 * - FFN: first 3 dense SwiGLU blocks, then 42 sparse-MoE blocks with
 *   router, top-8 fan-out and shared expert;
 * - every non-obvious edge carries a claim path; auditCoverage enforces it.
 */

import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import type { DiagramScene, SemanticNode } from "./types.js";
import type { EvidenceAnnotation } from "./types.js";

type AnnStatus = NonNullable<EvidenceAnnotation["status"]>;

function commas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function compileGlmTopologyScene(arch: ModelDocument, evidence: EvidenceFile): DiagramScene {
  const { facts, topology } = arch;
  const statusOf = new Map<string, AnnStatus>(evidence.claims.map((c) => [c.path, c.status] as const));
  const experts = topology.experts!;
  const streams = topology.residual?.streams ?? 4;
  const kda = topology.attention_groups.find((g) => g.kind === "linear_attention")!;
  const dsa = topology.attention_groups.find((g) => g.kind === "mla_sparse")!;
  const kdaClaim = "topology.attention_groups[0]";
  const dsaClaim = "topology.attention_groups[1]";

  const nodes: SemanticNode[] = [
    { id: "tok", kind: "io", label: "Tokenized text" },
    {
      id: "embed", kind: "embedding", label: "Token embedding",
      claimPath: "facts.hidden_size",
      claims: [
        { claimPath: "facts.hidden_size", label: `hidden ${commas(facts.hidden_size)}` },
        { claimPath: "facts.vocab_size", label: `vocab ${commas(facts.vocab_size ?? 0)}` },
      ],
      detail: `hidden ${commas(facts.hidden_size)} · vocab ${commas(facts.vocab_size ?? 0)}`,
    },
  ];

  // ---- decoder unit: one 4-layer K,K,K,D unit + the tail KDA layer
  nodes.push(
    {
      id: "unit", kind: "stack", label: `K,K,K,D × ${Math.floor(dsa.layers.length)} units`,
      claimPath: kdaClaim,
      claims: [
        { claimPath: kdaClaim, label: `${kda.layers.length} KDA layers` },
        { claimPath: dsaClaim, label: `${dsa.layers.length} MLA/DSA layers` },
      ],
      detail: `${kda.layers.length} KDA · ${dsa.layers.length} MLA/DSA`,
      ports: ["s1", "s2", "s3", "s4"],
    },
    {
      id: "tail-kda", kind: "attention", label: "KDA",
      claimPath: kdaClaim,
      claims: [{ claimPath: kdaClaim, label: "1 tail KDA layer" }],
      detail: "tail layer",
    },
  );

  // ---- DSA substructure (mechanism view of the D-layer)
  nodes.push(
    {
      id: "dsa", kind: "attention", label: "MLA core",
      claimPath: dsaClaim,
      claims: [
        { claimPath: "topology.attention.dsa_indexer_heads", label: "indexer 32 heads" },
        { claimPath: "topology.attention.dsa_topk", label: "top-k 2048" },
      ],
      detail: "selected KV → latent attention",
      ports: ["in", "sel"],
    },
    {
      id: "indexer", kind: "indexer", label: "Lightning indexer",
      claimPath: "topology.attention.dsa_indexer_heads",
      claims: [{ claimPath: "topology.attention.dsa_indexer_heads", label: "indexer 32 heads" }],
      detail: "scores all positions",
    },
    {
      id: "topk", kind: "selector", label: "Top-k selector",
      claimPath: "topology.attention.dsa_topk",
      claims: [{ claimPath: "topology.attention.dsa_topk", label: "k=2048" }],
      detail: "keeps k tokens",
    },
  );

  // ---- MoE substructure
  nodes.push(
    {
      id: "router", kind: "router", label: "Router",
      claimPath: "topology.experts.routed_total",
      claims: [{ claimPath: "topology.experts.routed_total", label: `${commas(experts.routed_total ?? 0)} experts` }],
      detail: "softmax over experts",
    },
    {
      id: "experts", kind: "moe", label: "Routed experts",
      claimPath: "topology.experts.routed_total",
      claims: [
        { claimPath: "topology.experts.routed_total", label: `${commas(experts.routed_total ?? 0)} routed` },
        { claimPath: "topology.experts.active_routed", label: `top-${experts.active_routed ?? 0}` },
      ],
      detail: `${commas(experts.routed_total ?? 0)} routed · top-${experts.active_routed ?? 0}`,
    },
    {
      id: "shared", kind: "moe", label: "Shared expert",
      claimPath: "topology.experts.shared",
      claims: [{ claimPath: "topology.experts.shared", label: `${experts.shared ?? 0} shared` }],
      detail: "always on",
    },
  );

  // ---- dense prefix + norm + head + mhc mixers
  nodes.push(
    {
      id: "dense3", kind: "ffn", label: "Dense SwiGLU ×3",
      claimPath: "topology.ffn_groups[0]",
      claims: [{ claimPath: "topology.ffn_groups[0]", label: "first 3 blocks dense" }],
      detail: "layers 0–2",
    },
    {
      id: "moe42", kind: "moe", label: `Sparse MoE ×${(experts.routed_total ?? 0) && 42}`,
      claimPath: "topology.ffn_groups[1]",
      claims: [{ claimPath: "topology.ffn_groups[1]", label: "42 sparse MoE blocks" }],
      detail: "layers 3–44",
    },
    { id: "norm", kind: "norm", label: "Final RMSNorm" },
    {
      id: "head", kind: "output", label: "Linear output",
      claimPath: "facts.vocab_size",
      claims: [{ claimPath: "facts.vocab_size", label: `vocab ${commas(facts.vocab_size ?? 0)}` }],
      detail: `vocab ${commas(facts.vocab_size ?? 0)}`,
    },
    {
      id: "mhc", kind: "residual", label: "mHC mixers",
      claimPath: "topology.residual.streams",
      claims: [{ claimPath: "topology.residual.streams", label: `${streams} streams` }],
      detail: `pre/read · res/mix · post/write`,
      ports: ["s1", "s2", "s3", "s4"],
    },
    {
      id: "mtp", kind: "mtp", label: "MTP head (omitted)",
      claimPath: "topology.mtp.predict_layers",
      claims: [{ claimPath: "topology.mtp.predict_layers", label: "1 prediction layer" }],
      detail: "not drawn in overview",
    },
  );

  const edges: DiagramScene["edges"] = [
    { id: "e-tok-embed", from: "tok", to: "embed", kind: "flow" },
    { id: "e-embed-block", from: "embed", to: "unit", kind: "flow" },
    { id: "e-unit-tail", from: "unit", to: "tail-kda", kind: "flow" },
    { id: "e-tail-norm", from: "tail-kda", to: "norm", kind: "flow" },
    { id: "e-norm-head", from: "norm", to: "head", kind: "flow" },
    // DSA chain: hidden → indexer → topk → MLA core (crosses the inset
    // boundary through its declared port, #33). The selection pipeline is
    // data flow (#32 grammar); the Q probe from the block stays control.
    { id: "e-dsa-q", from: "unit.out", to: "g-dsa.q", kind: "control", label: "Q" },
    { id: "e-index-topk", from: "indexer", to: "topk", kind: "flow", claimPath: "topology.attention.dsa_indexer_heads" },
    { id: "e-topk-sel", from: "topk", to: "dsa.sel", kind: "flow", label: "selected KV", claimPath: "topology.attention.dsa_topk" },
    // MoE chain
    { id: "e-moe-router", from: "moe42", to: "g-moe.r", kind: "control" },
    { id: "e-router-experts", from: "router", to: "experts", kind: "control", label: "top-8", claimPath: "topology.experts.active_routed" },
    { id: "e-shared", from: "moe42", to: "g-moe.s", kind: "control", claimPath: "topology.experts.shared" },
    // FFN schedule
    { id: "e-dense-moe", from: "dense3", to: "moe42", kind: "flow", claimPath: "topology.ffn_groups[0]" },
    // mHC: four stream rails from embed area through mixers to head
    ...Array.from({ length: streams }, (_, i) => ({
      id: `e-mhc-s${i + 1}`,
      from: `mhc.s${i + 1}`,
      to: `mhc.s${i + 1}`,
      kind: "skip" as const,
      rail: "left" as const,
      label: `s${i + 1}`,
      claimPath: "topology.residual.streams",
    })),
    { id: "e-embed-mhc", from: "embed", to: "mhc", kind: "control" },
    { id: "e-mhc-head", from: "mhc", to: "head", kind: "control" },
    { id: "c-mtp", from: "head", to: "mtp", kind: "control", claimPath: "topology.mtp.predict_layers" },
  ];

  // fix mHC stream edges: they should be self-rails at the mhc node (visual)
  for (let i = 0; i < streams; i++) {
    const e = edges.find((x) => x.id === `e-mhc-s${i + 1}`)!;
    e.from = "mhc";
    e.to = "mhc";
  }

  const scene: DiagramScene = {
    irVersion: arch.ir_version,
    view: "overview",
    modelId: arch.model.id,
    nodes,
    edges,
    groups: [
      {
        id: "g-decoder", label: "Decoder · 45 layers", kind: "stack",
        members: ["unit", "tail-kda", "dense3", "moe42"],
        repeat: { count: facts.num_hidden_layers, label: "45 ×" },
        claimPath: "facts.num_hidden_layers",
      },
      { id: "g-dsa", label: "DSA (1 of 4 layers)", kind: "inset", members: ["indexer", "topk", "dsa"], direction: "left-to-right", ports: [{ id: "q", side: "left", inner: "indexer" }], claimPath: dsaClaim },
      { id: "g-moe", label: "Sparse MoE block", kind: "inset", members: ["router", "experts", "shared"], direction: "left-to-right", ports: [{ id: "r", side: "left", inner: "router" }, { id: "s", side: "left", inner: "shared" }], claimPath: "topology.experts.routed_total" },
      // mHC real multi-stream paths land in #34; until then the mixer stays
      // a spine node (no fake inset around the self-rails)
      { id: "g-mhc", label: `mHC · ${streams} streams`, kind: "stack", members: ["mhc"], claimPath: "topology.residual.streams" },
    ],
    annotations: [],
    constraints: [
      { type: "direction", value: "bottom-to-top" },
      { type: "order", targets: ["tok", "embed", "unit", "tail-kda", "indexer", "topk", "dsa", "dense3", "moe42", "mhc", "norm", "head", "mtp"] },
      { type: "align", targets: ["indexer", "topk", "dsa"], axis: "horizontal" },
      { type: "align", targets: ["router", "experts", "shared"], axis: "horizontal" },
      { type: "emphasize", target: "unit" },
    ],
  };

  const annotations: EvidenceAnnotation[] = [];
  for (const node of scene.nodes) {
    for (const ref of node.claims ?? []) {
      const status = statusOf.get(ref.claimPath);
      annotations.push({ claimPath: ref.claimPath, target: node.id, ...(status ? { status } : {}) });
    }
  }
  for (const edge of scene.edges) {
    if (edge.claimPath) {
      const status = statusOf.get(edge.claimPath);
      annotations.push({ claimPath: edge.claimPath, target: edge.id, ...(status ? { status } : {}) });
    }
  }
  scene.annotations = annotations;
  return scene;
}
