import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import type { EditorialPosterBlueprint } from "./poster.js";
import type { DiagramScene, EvidenceAnnotation, SemanticGroupPort, SemanticNode } from "./types.js";

type AnnStatus = NonNullable<EvidenceAnnotation["status"]>;
const SID = [1, 2, 3, 4] as const;

const streamPorts = (prefix: string, side: "left" | "right" | "top" | "bottom", role: "ingress" | "egress") =>
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
      ports: [{ name: "mhc", side: "bottom" }, { name: "lenses", side: "bottom" }],
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
      claimPath: "topology.residual.streams",
      ports: [...streamPorts("s", "right", "egress"), { name: "read", side: "top" as const }],
      claims: [{ claimPath: "topology.residual.streams", label: "4 streams" }],
    },
    {
      id: "mhc-hpre", kind: "mix", label: "H-pre", detail: "4 → 1 read",
      claimPath: "topology.residual.streams",
      ports: [{ name: "in", side: "bottom" as const }, { name: "out", side: "right" as const }],
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
      id: "mhc-hpost", kind: "mix", label: "H-post", detail: "1 → 4 write",
      claimPath: "topology.residual.streams",
      ports: [{ name: "in", side: "left" as const }, ...streamPorts("out", "bottom", "egress")],
    },
    {
      id: "mhc-add", kind: "mix", label: "⊕ ×4", detail: "per-stream add",
      claimPath: "topology.residual.scheme",
      ports: [
        ...streamPorts("res", "left", "ingress"),
        ...streamPorts("post", "top", "ingress"),
        ...streamPorts("out", "right", "egress"),
      ],
    },
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
    { id: "kda-gate", kind: "gate", label: "Gate", detail: "output", claimPath: "topology.attention_groups[0]" },
    {
      id: "dsa-indexer", kind: "indexer", label: "Indexer", detail: "32 heads",
      claimPath: "topology.attention.dsa_indexer_heads",
      claims: [{ claimPath: "topology.attention.dsa_indexer_heads", label: "32 heads" }],
    },
    {
      id: "dsa-topk", kind: "selector", label: "Top-k", detail: "2,048",
      claimPath: "topology.attention.dsa_topk", claims: [{ claimPath: "topology.attention.dsa_topk", label: "k=2048" }],
      ports: [{ name: "out", side: "bottom" }],
    },
    {
      id: "dsa-selected", kind: "selection", label: "selected KV", claimPath: "topology.attention_groups[1]",
      ports: [{ name: "in", side: "top" }, { name: "out", side: "left" }],
    },
    {
      id: "dsa-mla", kind: "attention", label: "MLA", detail: "latent KV", claimPath: "topology.attention_groups[1]",
      ports: [{ name: "in", side: "right" }],
    },
    {
      id: "moe-router", kind: "router", label: "Router", claimPath: "topology.experts.routed_total",
      ports: [{ name: "routed", side: "right" }, { name: "shared", side: "right" }],
    },
    {
      id: "moe-routed", kind: "moe", label: "Routed", detail: `${experts.routed_total} · top-${experts.active_routed}`,
      claimPath: "topology.experts.routed_total",
      ports: [{ name: "in", side: "left" }, { name: "out", side: "right" }],
      claims: [
        { claimPath: "topology.experts.routed_total", label: `${experts.routed_total} total` },
        { claimPath: "topology.experts.active_routed", label: `top-${experts.active_routed}` },
      ],
    },
    {
      id: "moe-shared", kind: "moe", label: "Shared", detail: `${experts.shared} always-on`,
      claimPath: "topology.experts.shared", claims: [{ claimPath: "topology.experts.shared", label: `${experts.shared} shared` }],
      ports: [{ name: "in", side: "left" }, { name: "out", side: "right" }],
    },
    {
      id: "moe-merge", kind: "merge", label: "⊕", detail: "merge", claimPath: "topology.ffn_groups[1]",
      ports: [{ name: "routed", side: "left" }, { name: "shared", side: "left" }],
    },
  ];

  const mhcPorts: SemanticGroupPort[] = [
    { id: "callout", side: "top", inner: "mhc-f" },
  ];

  const edges: DiagramScene["edges"] = [
    { id: "main-token-embed", from: "tok", to: "embed", kind: "flow" },
    { id: "main-embed-decoder", from: "embed", to: "decoder", kind: "flow" },
    { id: "main-decoder-norm", from: "decoder", to: "norm", kind: "flow" },
    { id: "main-norm-head", from: "norm", to: "head", kind: "flow" },
    { id: "main-mtp", from: "head", to: "mtp", kind: "control", claimPath: "topology.mtp.predict_layers" },
    { id: "callout-mhc", from: "decoder.mhc", to: "g-mhc.callout", kind: "control", label: "representative sublayer" },
    { id: "callout-lenses", from: "decoder.lenses", to: "lens-bus", kind: "control" },
    ...SID.flatMap((i) => [
      { id: `mhc-res-in-${i}`, from: `mhc-source.s${i}`, to: `mhc-hres.in${i}`, kind: "residual" as const, claimPath: "topology.residual.streams" },
      { id: `mhc-res-out-${i}`, from: `mhc-hres.out${i}`, to: `mhc-add.res${i}`, kind: "residual" as const, claimPath: "topology.residual.scheme" },
      { id: `mhc-post-${i}`, from: `mhc-hpost.out${i}`, to: `mhc-add.post${i}`, kind: "flow" as const, claimPath: "topology.residual.scheme" },
      { id: `mhc-exit-${i}`, from: `mhc-add.out${i}`, to: `mhc-sink.w${i}`, kind: "residual" as const, claimPath: "topology.residual.streams" },
    ]),
    { id: "mhc-pre", from: "mhc-source.read", to: "mhc-hpre.in", kind: "flow", claimPath: "topology.residual.scheme" },
    { id: "mhc-pre-f", from: "mhc-hpre.out", to: "mhc-f.in", kind: "flow", claimPath: "topology.residual.scheme" },
    { id: "mhc-f-post", from: "mhc-f.out", to: "mhc-hpost.in", kind: "flow", claimPath: "topology.residual.scheme" },
    { id: "kda-1", from: "kda-qkv", to: "kda-state", kind: "flow", claimPath: "topology.attention_groups[0]" },
    { id: "kda-2", from: "kda-state", to: "kda-gate", kind: "flow", claimPath: "topology.attention_groups[0]" },
    { id: "dsa-1", from: "dsa-indexer", to: "dsa-topk", kind: "flow", claimPath: "topology.attention.dsa_indexer_heads" },
    { id: "dsa-2", from: "dsa-topk", to: "dsa-selected.in", kind: "flow", claimPath: "topology.attention.dsa_topk" },
    { id: "dsa-3", from: "dsa-selected.out", to: "dsa-mla.in", kind: "flow", claimPath: "topology.attention_groups[1]" },
    { id: "moe-1", from: "moe-router.routed", to: "moe-routed.in", kind: "control", label: `top-${experts.active_routed}`, claimPath: "topology.experts.active_routed" },
    { id: "moe-2", from: "moe-router.shared", to: "moe-shared.in", kind: "control", claimPath: "topology.experts.shared" },
    { id: "moe-3", from: "moe-routed.out", to: "moe-merge.routed", kind: "flow", claimPath: "topology.experts.routed_total" },
    { id: "moe-4", from: "moe-shared.out", to: "moe-merge.shared", kind: "flow", claimPath: "topology.experts.shared" },
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
        "mhc-source", "mhc-hpre", "mhc-hres", "mhc-f", "mhc-hpost",
        "mhc-add", "mhc-sink",
      ],
      ports: mhcPorts, claimPath: "topology.residual.scheme",
    },
    {
      id: "g-kda", label: `KDA · ${kda.layers.length} layers`, kind: "inset", members: ["kda-qkv", "kda-state", "kda-gate"],
      claimPath: "topology.attention_groups[0]",
    },
    {
      id: "g-dsa", label: `DSA · ${dsa.layers.length} layers`, kind: "inset", members: ["dsa-indexer", "dsa-topk", "dsa-selected", "dsa-mla"],
      claimPath: "topology.attention_groups[1]",
    },
    {
      id: "g-moe", label: `Sparse MoE · layers ${moe.layers[0]}–${moe.layers[moe.layers.length - 1]}`, kind: "inset",
      members: ["moe-router", "moe-routed", "moe-shared", "moe-merge"],
      claimPath: "topology.ffn_groups[1]",
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
        `mhc-source.s${i}`, `mhc-hres.in${i}`,
        `mhc-hres.out${i}`, `mhc-add.res${i}`, `mhc-add.out${i}`, `mhc-sink.w${i}`,
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
    { id: "mtp", x: 1335, y: 68, w: 165, h: 80 },
    { id: "lens-bus", x: 1125, y: 155, w: 170, h: 28 },
    ...Array.from({ length: 11 }, (_, i) => ({ id: `pattern-${i}`, x: 50, y: 242 + i * 43, w: 250, h: 36 })),
    { id: "pattern-tail", x: 50, y: 715, w: 250, h: 44 },
    { id: "mhc-source", x: 365, y: 315, w: 120, h: 420 },
    { id: "mhc-hpre", x: 530, y: 220, w: 110, h: 82 },
    { id: "mhc-f", x: 680, y: 220, w: 165, h: 82 },
    { id: "mhc-hpost", x: 865, y: 220, w: 145, h: 82 },
    { id: "mhc-hres", x: 560, y: 315, w: 165, h: 420 },
    { id: "mhc-add", x: 865, y: 315, w: 145, h: 420 },
    { id: "mhc-sink", x: 1030, y: 315, w: 70, h: 420 },
    { id: "kda-qkv", x: 1125, y: 255, w: 140, h: 70 },
    { id: "kda-state", x: 1275, y: 255, w: 150, h: 70 },
    { id: "kda-gate", x: 1435, y: 255, w: 75, h: 70 },
    { id: "dsa-indexer", x: 1145, y: 430, w: 120, h: 55 },
    { id: "dsa-topk", x: 1285, y: 430, w: 120, h: 55 },
    { id: "dsa-selected", x: 1285, y: 500, w: 130, h: 45 },
    { id: "dsa-mla", x: 1145, y: 500, w: 120, h: 45 },
    { id: "moe-router", x: 1135, y: 665, w: 95, h: 70 },
    { id: "moe-routed", x: 1245, y: 632, w: 120, h: 72 },
    { id: "moe-shared", x: 1245, y: 722, w: 120, h: 60 },
    { id: "moe-merge", x: 1385, y: 675, w: 80, h: 72 },
  ];
  const groups = [
    { id: "g-pattern", x: 30, y: 195, w: 290, h: 610 },
    { id: "g-mhc", x: 340, y: 195, w: 760, h: 610 },
    { id: "g-kda", x: 1120, y: 195, w: 390, h: 165 },
    { id: "g-dsa", x: 1120, y: 385, w: 390, h: 180 },
    { id: "g-moe", x: 1120, y: 590, w: 390, h: 215 },
  ];
  const edges = [
    "main-token-embed", "main-embed-decoder", "main-decoder-norm", "main-norm-head", "main-mtp",
    "callout-mhc", "callout-lenses",
    ...SID.flatMap((i) => [
      `mhc-res-in-${i}`, `mhc-res-out-${i}`, `mhc-post-${i}`, `mhc-exit-${i}`,
    ]),
    "mhc-pre", "mhc-pre-f", "mhc-f-post", "kda-1", "kda-2", "dsa-1", "dsa-2", "dsa-3", "moe-1", "moe-2", "moe-3", "moe-4",
  ];
  const edgeRoutes: NonNullable<EditorialPosterBlueprint["edgeRoutes"]> = {
    "callout-mhc": [{ x: 575, y: 148 }, { x: 575, y: 185 }, { x: 720, y: 185 }, { x: 720, y: 195 }],
    "callout-lenses": [{ x: 685, y: 148 }, { x: 685, y: 169 }, { x: 1125, y: 169 }],
    "mhc-pre": [{ x: 425, y: 315 }, { x: 425, y: 308 }, { x: 585, y: 308 }, { x: 585, y: 302 }],
  };
  return { id: "glm-anatomy-desktop", size: { w: 1520, h: 860 }, nodes, groups, edges, edgeRoutes };
}
