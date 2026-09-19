import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import type { EditorialPosterBlueprint } from "./poster.js";
import type { DiagramScene, EvidenceAnnotation, SemanticGroupPort, SemanticNode } from "./types.js";

type AnnStatus = NonNullable<EvidenceAnnotation["status"]>;
const SID = [1, 2, 3, 4] as const;

const streamPorts = (prefix: string, side: "left" | "right", role: "ingress" | "egress") =>
  SID.map((i) => ({ name: `${prefix}${i}`, side, stream: `s${i}`, role }));

function commas(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function exactLayerKinds(
  numLayers: number,
  groups: ReadonlyArray<{ code: string; layers: number[] }>,
  scheduleName: string,
): string[] {
  const kinds = Array<string | undefined>(numLayers);
  for (const group of groups) {
    for (const layer of group.layers) {
      if (!Number.isInteger(layer) || layer < 0 || layer >= numLayers) {
        throw new Error(`${scheduleName} schedule contains out-of-range layer ${layer}`);
      }
      if (kinds[layer]) {
        throw new Error(`${scheduleName} schedule assigns layer ${layer} more than once`);
      }
      kinds[layer] = group.code;
    }
  }
  const missing = kinds.findIndex((kind) => kind === undefined);
  if (missing >= 0) throw new Error(`${scheduleName} schedule is missing layer ${missing}`);
  return kinds as string[];
}

function scheduleSummary(kinds: string[]): string {
  const chunks = Array.from({ length: Math.ceil(kinds.length / 4) }, (_, index) => kinds.slice(index * 4, index * 4 + 4));
  const full = chunks.filter((chunk) => chunk.length === 4).map((chunk) => chunk.join(","));
  const tail = chunks.find((chunk) => chunk.length < 4);
  const prefix = full.length > 1 && full.every((chunk) => chunk === full[0])
    ? `${full[0]} ×${full.length}`
    : full.join(" + ");
  return tail ? `${prefix} + ${tail.join(",")}` : prefix;
}

/**
 * The publishable GLM view. It intentionally models one representative mHC
 * sublayer exactly and keeps KDA/DSA/MoE as separate mechanism lenses.
 */
export function compileGlmAnatomyScene(arch: ModelDocument, evidence: EvidenceFile): DiagramScene {
  const { facts, topology } = arch;
  const statusOf = new Map<string, AnnStatus>(evidence.claims.map((claim) => [claim.path, claim.status] as const));
  const kda = topology.attention_groups.find((group) => group.kind === "linear_attention");
  const dsa = topology.attention_groups.find((group) => group.kind === "mla_sparse");
  const dense = topology.ffn_groups.find((group) => group.kind === "dense_ffn");
  const moe = topology.ffn_groups.find((group) => group.kind === "moe");
  const experts = topology.experts;
  const streams = topology.residual?.streams;
  if (!kda || !dsa || !dense || !moe || !experts || streams !== 4) {
    throw new Error("GLM anatomy requires KDA, DSA, Dense/MoE and exactly four mHC streams");
  }
  const attentionKinds = exactLayerKinds(
    facts.num_hidden_layers,
    [{ code: "K", layers: kda.layers }, { code: "D", layers: dsa.layers }],
    "attention",
  );
  exactLayerKinds(
    facts.num_hidden_layers,
    [{ code: "Dense", layers: dense.layers }, { code: "MoE", layers: moe.layers }],
    "FFN",
  );
  const attentionSummary = scheduleSummary(attentionKinds);
  const scheduleChunks = Array.from(
    { length: Math.ceil(attentionKinds.length / 4) },
    (_, index) => attentionKinds.slice(index * 4, index * 4 + 4),
  );
  const denseToMoeLayer = moe.layers[0] ?? -1;

  const nodes: SemanticNode[] = [
    { id: "tok", kind: "io", label: "Token ids" },
    {
      id: "embed", kind: "embedding", label: "Token embedding", detail: `hidden ${commas(facts.hidden_size)}`,
      claimPath: "facts.hidden_size", claims: [{ claimPath: "facts.hidden_size", label: `hidden ${commas(facts.hidden_size)}` }],
    },
    {
      id: "decoder", kind: "stack", label: "Decoder pattern", detail: `${facts.num_hidden_layers} layers · ${attentionSummary}`,
      claimPath: "facts.num_hidden_layers",
      claims: [
        { claimPath: "facts.num_hidden_layers", label: `${facts.num_hidden_layers} layers` },
        { claimPath: "topology.attention_groups[0]", label: `${kda.layers.length} KDA` },
        { claimPath: "topology.attention_groups[1]", label: `${dsa.layers.length} DSA` },
      ],
    },
    { id: "norm", kind: "norm", label: "Final RMSNorm" },
    {
      id: "head", kind: "output", label: "LM head", detail: `vocab ${commas(facts.vocab_size ?? 0)}`,
      claimPath: "facts.vocab_size", claims: [{ claimPath: "facts.vocab_size", label: `vocab ${commas(facts.vocab_size ?? 0)}` }],
    },
    {
      id: "mtp", kind: "annotation", label: "MTP omitted", detail: "1 prediction layer",
      claimPath: "topology.mtp.predict_layers",
      claims: [{ claimPath: "topology.mtp.predict_layers", label: "1 prediction layer" }],
    },
    { id: "lens-bus", kind: "annotation", label: "layer lenses", claimPath: "facts.num_hidden_layers" },
    ...scheduleChunks.filter((chunk) => chunk.length === 4).map((chunk, unit) => ({
      id: `pattern-${unit}`,
      kind: "schedule",
      label: `L${unit * 4}–${unit * 4 + 3}`,
      detail: `${chunk.join("  ")}${denseToMoeLayer >= unit * 4 && denseToMoeLayer <= unit * 4 + 3 ? ` · Dense→MoE at L${denseToMoeLayer}` : ""}`,
      claimPath: "topology.attention_groups[0]",
      claims: [
        { claimPath: "topology.attention_groups[0]", label: "KDA schedule" },
        { claimPath: "topology.attention_groups[1]", label: "DSA schedule" },
        ...(unit === 0 ? [{ claimPath: "topology.ffn_groups[0]", label: "Dense layers 0–2" }, { claimPath: "topology.ffn_groups[1]", label: "MoE layers 3–44" }] : []),
      ],
    })),
    ...scheduleChunks.filter((chunk) => chunk.length < 4).map((chunk) => {
      const start = Math.floor(facts.num_hidden_layers / 4) * 4;
      const isKdaTail = chunk.every((kind) => kind === "K");
      return {
        id: "pattern-tail", kind: "schedule-tail", label: start === facts.num_hidden_layers - 1 ? `L${start}` : `L${start}–${facts.num_hidden_layers - 1}`,
        detail: `${chunk.join("  ")}${isKdaTail ? " · tail KDA" : ""}`,
        claimPath: "topology.attention_groups[0]", claims: [{ claimPath: "topology.attention_groups[0]", label: "tail attention schedule" }],
      };
    }),
    {
      id: "mhc-source", kind: "split", label: "4×", detail: "streams",
      claimPath: "topology.residual.streams", ports: streamPorts("s", "right", "egress"),
      claims: [{ claimPath: "topology.residual.streams", label: "4 streams" }],
    },
    ...SID.map((i) => ({
      id: `mhc-split-${i}`, kind: "split", label: `S${i}`, detail: "read", claimPath: "topology.residual.streams",
      ports: [
        { name: "in", side: "left" as const, stream: `s${i}`, role: "ingress" as const },
        { name: "pre", side: "right" as const, stream: `s${i}`, role: "egress" as const },
        { name: "res", side: "right" as const, stream: `s${i}`, role: "egress" as const },
      ],
    })),
    {
      id: "mhc-hpre", kind: "merge", label: "H-pre", detail: "4 → 1 read",
      claimPath: "topology.residual.streams",
      ports: [...streamPorts("in", "left", "ingress"), { name: "out", side: "right" as const }],
    },
    {
      id: "mhc-hres", kind: "mix", label: "H-res", detail: "manifold mix",
      claimPath: "topology.residual.scheme",
      ports: [...streamPorts("in", "left", "ingress"), ...streamPorts("out", "right", "egress")],
    },
    {
      id: "mhc-f", kind: "attention", label: "ONE sublayer F", detail: "attention or FFN",
      claimPath: "topology.residual.scheme", ports: ["in", "out"],
    },
    {
      id: "mhc-hpost", kind: "split", label: "H-post", detail: "1 → 4 write",
      claimPath: "topology.residual.streams",
      ports: [{ name: "in", side: "left" as const }, ...streamPorts("out", "right", "egress")],
    },
    ...SID.map((i) => ({
      id: `mhc-sum-${i}`, kind: "merge", label: `S${i} ⊕`, claimPath: "topology.residual.scheme",
      ports: [
        { name: "post", side: "left" as const, stream: `s${i}`, role: "ingress" as const },
        { name: "res", side: "left" as const, stream: `s${i}`, role: "ingress" as const },
        { name: "out", side: "right" as const, stream: `s${i}`, role: "egress" as const },
      ],
    })),
    {
      id: "mhc-sink", kind: "merge", label: "→", detail: "write",
      claimPath: "topology.residual.streams", ports: streamPorts("w", "left", "ingress"),
    },
    {
      id: "kda-qkv", kind: "attention", label: "Q/K/V", detail: "ShortConv · k4",
      claimPath: "topology.attention.kda_short_conv_kernel",
      claims: [{ claimPath: "topology.attention.kda_short_conv_kernel", label: "kernel 4" }],
    },
    { id: "kda-state", kind: "state", label: "decay / state", detail: "recurrent", claimPath: "topology.attention_groups[0]" },
    { id: "kda-gate", kind: "gate", label: "output gate", claimPath: "topology.attention_groups[0]" },
    {
      id: "dsa-indexer", kind: "indexer", label: "Indexer", detail: "32 heads",
      claimPath: "topology.attention.dsa_indexer_heads",
      claims: [{ claimPath: "topology.attention.dsa_indexer_heads", label: "32 heads" }],
    },
    {
      id: "dsa-topk", kind: "selector", label: "Top-k", detail: "2,048",
      claimPath: "topology.attention.dsa_topk", claims: [{ claimPath: "topology.attention.dsa_topk", label: "k=2048" }],
    },
    { id: "dsa-selected", kind: "selection", label: "selected KV", claimPath: "topology.attention_groups[1]" },
    { id: "dsa-mla", kind: "attention", label: "MLA", detail: "latent KV", claimPath: "topology.attention_groups[1]" },
    { id: "moe-router", kind: "router", label: "Router", claimPath: "topology.experts.routed_total" },
    {
      id: "moe-routed", kind: "moe", label: "Routed", detail: `${experts.routed_total} · top-${experts.active_routed}`,
      claimPath: "topology.experts.routed_total",
      claims: [
        { claimPath: "topology.experts.routed_total", label: `${experts.routed_total} total` },
        { claimPath: "topology.experts.active_routed", label: `top-${experts.active_routed}` },
      ],
    },
    {
      id: "moe-shared", kind: "moe", label: "Shared", detail: `${experts.shared} always-on`,
      claimPath: "topology.experts.shared", claims: [{ claimPath: "topology.experts.shared", label: `${experts.shared} shared` }],
    },
    { id: "moe-merge", kind: "merge", label: "⊕", detail: "merge", claimPath: "topology.ffn_groups[1]" },
  ];

  const mhcPorts: SemanticGroupPort[] = [
    ...SID.map((i) => ({ id: `in${i}`, side: "left" as const, inner: `mhc-split-${i}.in`, stream: `s${i}`, role: "ingress" as const })),
    ...SID.map((i) => ({ id: `out${i}`, side: "right" as const, inner: `mhc-sum-${i}.out`, stream: `s${i}`, role: "egress" as const })),
    { id: "callout", side: "top", inner: "mhc-f" },
  ];

  const edges: DiagramScene["edges"] = [
    { id: "main-token-embed", from: "tok", to: "embed", kind: "flow" },
    { id: "main-embed-decoder", from: "embed", to: "decoder", kind: "flow" },
    { id: "main-decoder-norm", from: "decoder", to: "norm", kind: "flow" },
    { id: "main-norm-head", from: "norm", to: "head", kind: "flow" },
    { id: "main-mtp", from: "head", to: "mtp", kind: "control", claimPath: "topology.mtp.predict_layers" },
    { id: "callout-mhc", from: "decoder", to: "g-mhc.callout", kind: "control", label: "representative sublayer" },
    { id: "callout-lenses", from: "decoder", to: "lens-bus", kind: "control" },
    { id: "callout-kda", from: "lens-bus", to: "g-kda.callout", kind: "control", claimPath: "topology.attention_groups[0]" },
    { id: "callout-dsa", from: "lens-bus", to: "g-dsa.callout", kind: "control", claimPath: "topology.attention_groups[1]" },
    { id: "callout-moe", from: "lens-bus", to: "g-moe.callout", kind: "control", claimPath: "topology.ffn_groups[1]" },
    ...SID.flatMap((i) => [
      { id: `mhc-enter-${i}`, from: `mhc-source.s${i}`, to: `g-mhc.in${i}`, kind: "residual" as const, rail: "left" as const, claimPath: "topology.residual.streams" },
      { id: `mhc-bound-in-${i}`, from: `g-mhc.in${i}`, to: `mhc-split-${i}.in`, kind: "flow" as const, claimPath: "topology.residual.scheme" },
      { id: `mhc-pre-${i}`, from: `mhc-split-${i}.pre`, to: `mhc-hpre.in${i}`, kind: "flow" as const, claimPath: "topology.residual.scheme" },
      { id: `mhc-res-in-${i}`, from: `mhc-split-${i}.res`, to: `mhc-hres.in${i}`, kind: "flow" as const, claimPath: "topology.residual.scheme" },
      { id: `mhc-res-out-${i}`, from: `mhc-hres.out${i}`, to: `mhc-sum-${i}.res`, kind: "flow" as const, claimPath: "topology.residual.scheme" },
      { id: `mhc-post-${i}`, from: `mhc-hpost.out${i}`, to: `mhc-sum-${i}.post`, kind: "flow" as const, claimPath: "topology.residual.scheme" },
      { id: `mhc-bound-out-${i}`, from: `mhc-sum-${i}.out`, to: `g-mhc.out${i}`, kind: "flow" as const, claimPath: "topology.residual.scheme" },
      { id: `mhc-exit-${i}`, from: `g-mhc.out${i}`, to: `mhc-sink.w${i}`, kind: "residual" as const, rail: "left" as const, claimPath: "topology.residual.streams" },
    ]),
    { id: "mhc-pre-f", from: "mhc-hpre.out", to: "mhc-f.in", kind: "flow", claimPath: "topology.residual.scheme" },
    { id: "mhc-f-post", from: "mhc-f.out", to: "mhc-hpost.in", kind: "flow", claimPath: "topology.residual.scheme" },
    { id: "kda-1", from: "kda-qkv", to: "kda-state", kind: "flow", claimPath: "topology.attention_groups[0]" },
    { id: "kda-2", from: "kda-state", to: "kda-gate", kind: "flow", claimPath: "topology.attention_groups[0]" },
    { id: "dsa-1", from: "dsa-indexer", to: "dsa-topk", kind: "flow", claimPath: "topology.attention.dsa_indexer_heads" },
    { id: "dsa-2", from: "dsa-topk", to: "dsa-selected", kind: "flow", claimPath: "topology.attention.dsa_topk" },
    { id: "dsa-3", from: "dsa-selected", to: "dsa-mla", kind: "flow", claimPath: "topology.attention_groups[1]" },
    { id: "moe-1", from: "moe-router", to: "moe-routed", kind: "control", label: `top-${experts.active_routed}`, claimPath: "topology.experts.active_routed" },
    { id: "moe-2", from: "moe-router", to: "moe-shared", kind: "control", claimPath: "topology.experts.shared" },
    { id: "moe-3", from: "moe-routed", to: "moe-merge", kind: "flow", claimPath: "topology.experts.routed_total" },
    { id: "moe-4", from: "moe-shared", to: "moe-merge", kind: "flow", claimPath: "topology.experts.shared" },
  ];

  const groups: DiagramScene["groups"] = [
    {
      id: "g-pattern", label: `${facts.num_hidden_layers}-layer genome · ${attentionSummary}`, kind: "stack",
      members: scheduleChunks.map((chunk, i) => chunk.length === 4 ? `pattern-${i}` : "pattern-tail"),
      claimPath: "facts.num_hidden_layers",
    },
    {
      id: "g-mhc", label: "mHC anatomy · Figure 1(c) / Eq. 3", kind: "inset",
      members: [
        ...SID.map((i) => `mhc-split-${i}`), "mhc-hpre", "mhc-hres", "mhc-f", "mhc-hpost", ...SID.map((i) => `mhc-sum-${i}`),
      ],
      ports: mhcPorts, claimPath: "topology.residual.scheme",
    },
    {
      id: "g-kda", label: `KDA · ${kda.layers.length} layers`, kind: "inset", members: ["kda-qkv", "kda-state", "kda-gate"],
      ports: [{ id: "callout", side: "left", inner: "kda-qkv" }], claimPath: "topology.attention_groups[0]",
    },
    {
      id: "g-dsa", label: `DSA · ${dsa.layers.length} layers`, kind: "inset", members: ["dsa-indexer", "dsa-topk", "dsa-selected", "dsa-mla"],
      ports: [{ id: "callout", side: "left", inner: "dsa-indexer" }], claimPath: "topology.attention_groups[1]",
    },
    {
      id: "g-moe", label: `Sparse MoE · layers ${moe.layers[0]}–${moe.layers[moe.layers.length - 1]}`, kind: "inset",
      members: ["moe-router", "moe-routed", "moe-shared", "moe-merge"],
      ports: [{ id: "callout", side: "left", inner: "moe-router" }], claimPath: "topology.ffn_groups[1]",
    },
  ];

  const scene: DiagramScene = {
    irVersion: arch.ir_version,
    view: "overview",
    modelId: arch.model.id,
    nodes,
    edges,
    groups,
    streams: SID.map((i) => ({
      id: `s${i}`,
      path: [
        `mhc-source.s${i}`, `g-mhc.in${i}`, `mhc-split-${i}.in`, `mhc-split-${i}.res`, `mhc-hres.in${i}`,
        `mhc-hres.out${i}`, `mhc-sum-${i}.res`, `mhc-sum-${i}.out`, `g-mhc.out${i}`, `mhc-sink.w${i}`,
      ],
    })),
    annotations: [],
    constraints: [{ type: "direction", value: "left-to-right" }],
  };

  for (const node of scene.nodes) {
    for (const ref of node.claims ?? (node.claimPath ? [{ claimPath: node.claimPath, label: node.label }] : [])) {
      const status = statusOf.get(ref.claimPath);
      scene.annotations.push({ claimPath: ref.claimPath, target: node.id, ...(status ? { status } : {}) });
    }
  }
  for (const edge of scene.edges) {
    if (!edge.claimPath) continue;
    const status = statusOf.get(edge.claimPath);
    scene.annotations.push({ claimPath: edge.claimPath, target: edge.id, ...(status ? { status } : {}) });
  }
  return scene;
}

export function glmAnatomyBlueprint(): EditorialPosterBlueprint {
  const nodes: EditorialPosterBlueprint["nodes"] = [
    { id: "tok", x: 50, y: 78, w: 130, h: 60 },
    { id: "embed", x: 220, y: 78, w: 190, h: 60 },
    { id: "decoder", x: 465, y: 68, w: 330, h: 80 },
    { id: "norm", x: 850, y: 78, w: 165, h: 60 },
    { id: "head", x: 1060, y: 78, w: 165, h: 60 },
    { id: "mtp", x: 1260, y: 68, w: 130, h: 80 },
    { id: "lens-bus", x: 935, y: 155, w: 95, h: 28 },
    ...Array.from({ length: 11 }, (_, i) => ({ id: `pattern-${i}`, x: 72, y: 242 + i * 43, w: 266, h: 36 })),
    { id: "pattern-tail", x: 72, y: 715, w: 266, h: 44 },
    { id: "mhc-source", x: 382, y: 445, w: 68, h: 130 },
    ...SID.map((i) => ({ id: `mhc-split-${i}`, x: 477, y: 330 + (i - 1) * 105, w: 70, h: 52 })),
    { id: "mhc-hpre", x: 572, y: 250, w: 105, h: 82 },
    { id: "mhc-f", x: 710, y: 250, w: 125, h: 82 },
    { id: "mhc-hpost", x: 868, y: 250, w: 105, h: 82 },
    { id: "mhc-hres", x: 578, y: 390, w: 110, h: 340 },
    ...SID.map((i) => ({ id: `mhc-sum-${i}`, x: 878, y: 382 + (i - 1) * 105, w: 84, h: 58 })),
    { id: "mhc-sink", x: 1015, y: 445, w: 45, h: 130 },
    { id: "kda-qkv", x: 1080, y: 255, w: 115, h: 70 },
    { id: "kda-state", x: 1205, y: 255, w: 115, h: 70 },
    { id: "kda-gate", x: 1330, y: 255, w: 95, h: 70 },
    { id: "dsa-indexer", x: 1092, y: 430, w: 125, h: 55 },
    { id: "dsa-topk", x: 1240, y: 430, w: 125, h: 55 },
    { id: "dsa-selected", x: 1240, y: 500, w: 125, h: 45 },
    { id: "dsa-mla", x: 1092, y: 500, w: 125, h: 45 },
    { id: "moe-router", x: 1090, y: 665, w: 78, h: 70 },
    { id: "moe-routed", x: 1192, y: 632, w: 105, h: 72 },
    { id: "moe-shared", x: 1192, y: 722, w: 105, h: 60 },
    { id: "moe-merge", x: 1325, y: 675, w: 58, h: 72 },
  ];
  const groups = [
    { id: "g-pattern", x: 48, y: 195, w: 314, h: 610 },
    { id: "g-mhc", x: 458, y: 195, w: 545, h: 610 },
    { id: "g-kda", x: 1070, y: 195, w: 360, h: 165 },
    { id: "g-dsa", x: 1070, y: 385, w: 360, h: 180 },
    { id: "g-moe", x: 1070, y: 590, w: 360, h: 215 },
  ];
  const edges = [
    "main-token-embed", "main-embed-decoder", "main-decoder-norm", "main-norm-head", "main-mtp",
    "callout-mhc", "callout-lenses", "callout-kda", "callout-dsa", "callout-moe",
    ...SID.flatMap((i) => [
      `mhc-enter-${i}`, `mhc-bound-in-${i}`, `mhc-pre-${i}`, `mhc-res-in-${i}`, `mhc-res-out-${i}`,
      `mhc-post-${i}`, `mhc-bound-out-${i}`, `mhc-exit-${i}`,
    ]),
    "mhc-pre-f", "mhc-f-post", "kda-1", "kda-2", "dsa-1", "dsa-2", "dsa-3", "moe-1", "moe-2", "moe-3", "moe-4",
  ];
  const edgeRoutes: NonNullable<EditorialPosterBlueprint["edgeRoutes"]> = {
    "callout-mhc": [{ x: 650, y: 148 }, { x: 650, y: 185 }, { x: 730.5, y: 185 }, { x: 730.5, y: 195 }],
    "callout-lenses": [{ x: 690, y: 148 }, { x: 690, y: 169 }, { x: 935, y: 169 }],
    "callout-kda": [{ x: 1030, y: 169 }, { x: 1045, y: 169 }, { x: 1045, y: 277.5 }, { x: 1070, y: 277.5 }],
    "callout-dsa": [{ x: 1030, y: 169 }, { x: 1045, y: 169 }, { x: 1045, y: 475 }, { x: 1070, y: 475 }],
    "callout-moe": [{ x: 1030, y: 169 }, { x: 1045, y: 169 }, { x: 1045, y: 697.5 }, { x: 1070, y: 697.5 }],
  };
  return { id: "glm-anatomy-desktop", size: { w: 1440, h: 860 }, nodes, groups, edges, edgeRoutes };
}
