import type { EvidenceFile, LayerGroup, ModelDocument } from "@atlas/architecture-ir";
import type { EditorialPosterBlueprint } from "./poster.js";
import { buildSpinePosterBlueprint, type LensSpec } from "./poster-grid.js";
import type { DiagramScene, EvidenceAnnotation, SemanticGroup, SemanticNode } from "./types.js";

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
    return `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}M ctx`;
  }
  return `${Math.round(n / 1024)}K ctx`;
}

function shortCode(group: LayerGroup): string {
  const l = group.label.toLowerCase();
  if (l.includes("kda")) return "K";
  if (l.includes("deltanet") || group.kind === "linear_attention") return "L";
  if (l.includes("dsa") || group.kind === "mla_sparse") return "D";
  if (l.includes("mla")) return "M";
  if (l.includes("gqa") || group.kind === "gqa") return "G";
  if (l.includes("sliding")) return "S";
  return group.label.slice(0, 1).toUpperCase();
}

export interface ScheduleRun {
  id: string;
  label: string;
  detail: string;
  claimPath: string;
  tail?: boolean;
}

/**
 * Derive a compact, readable, exact layer-schedule summary from source
 * attention_groups and ffn_groups (never fabricated strings).
 */
export function buildScheduleRuns(
  numLayers: number,
  attentionGroups: LayerGroup[],
  ffnGroups: LayerGroup[],
): ScheduleRun[] {
  const attnAt = Array<string>(numLayers).fill("?");
  const ffnAt = Array<string>(numLayers).fill("Dense");
  for (const g of attentionGroups) {
    const code = shortCode(g);
    for (const idx of g.layers) if (idx >= 0 && idx < numLayers) attnAt[idx] = code;
  }
  for (const g of ffnGroups) {
    const tag = g.kind === "moe" ? "MoE" : "Dense";
    for (const idx of g.layers) if (idx >= 0 && idx < numLayers) ffnAt[idx] = tag;
  }

  // Detect repeating hybrid period if >1 attention type
  const attnDistinct = new Set(attnAt).size;
  const ffnSplits: Array<{ start: number; end: number; ffn: string }> = [];
  let curStart = 0;
  for (let i = 1; i <= numLayers; i++) {
    if (i === numLayers || ffnAt[i] !== ffnAt[curStart]) {
      ffnSplits.push({ start: curStart, end: i - 1, ffn: ffnAt[curStart]! });
      curStart = i;
    }
  }

  const runs: ScheduleRun[] = [];
  if (attnDistinct === 1) {
    // Homogeneous attention: show exact FFN transition segments (e.g. Dense 0-2, MoE 3-60)
    const attnName = attentionGroups[0]!.label;
    ffnSplits.forEach((seg, idx) => {
      const count = seg.end - seg.start + 1;
      runs.push({
        id: `sched-${idx}`,
        label: seg.start === seg.end ? `L${seg.start}` : `L${seg.start}–${seg.end}`,
        detail: `${count}× ${attnName} · ${seg.ffn}`,
        claimPath: "topology.attention_groups[0]",
        tail: seg.ffn === "MoE" && ffnSplits.length > 1,
      });
    });
    // Legend / ratio card
    runs.push({
      id: "sched-summary",
      label: `Total ${numLayers} layers`,
      detail: `${attentionGroups.map((g) => `${g.layers.length} ${g.label}`).join(" · ")}`,
      claimPath: "facts.num_hidden_layers",
    });
    return runs;
  }

  // Hybrid attention: auto-detect repeating period (3, 4, 6, 8) that minimizes chunks.
  let stride = 4;
  let bestScore = Infinity;
  for (const cand of [3, 4, 6, 8]) {
    if (numLayers < cand) continue;
    const seen = new Set<string>();
    for (let i = 0; i + cand <= numLayers; i += cand) {
      seen.add(attnAt.slice(i, i + cand).join(","));
    }
    const score = seen.size * 10 + (numLayers % cand === 0 ? 0 : 1);
    if (score < bestScore) {
      bestScore = score;
      stride = cand;
    }
  }
  const chunks: Array<{ start: number; end: number; pattern: string; ffn: string }> = [];
  for (let i = 0; i < numLayers; i += stride) {
    const end = Math.min(numLayers - 1, i + stride - 1);
    const pattern = attnAt.slice(i, end + 1).join(",");
    const ffnSet = [...new Set(ffnAt.slice(i, end + 1))].join("→");
    chunks.push({ start: i, end, pattern, ffn: ffnSet });
  }
  // Compress consecutive chunks that share exact (pattern, ffn) and full length
  const merged: Array<{ start: number; end: number; pattern: string; ffn: string; cycles: number; full: boolean }> = [];
  for (const ch of chunks) {
    const full = ch.end - ch.start + 1 === stride;
    const prev = merged[merged.length - 1];
    if (prev && full && prev.full && prev.pattern === ch.pattern && prev.ffn === ch.ffn) {
      prev.end = ch.end;
      prev.cycles += 1;
    } else {
      merged.push({ ...ch, cycles: 1, full });
    }
  }
  merged.forEach((m, idx) => {
    const cycleText = m.cycles > 1 ? `(${m.pattern}) ×${m.cycles}` : m.pattern;
    runs.push({
      id: `sched-${idx}`,
      label: m.start === m.end ? `L${m.start}` : `L${m.start}–${m.end}`,
      detail: `${cycleText} · ${m.ffn}`,
      claimPath: "topology.attention_groups[0]",
      tail: !m.full,
    });
  });

  // Explicit per-group count card backed directly by claims
  attentionGroups.forEach((g, idx) => {
    runs.push({
      id: `sched-grp-${idx}`,
      label: g.label,
      detail: `${g.layers.length} / ${numLayers} layers (${shortCode(g)})`,
      claimPath: `topology.attention_groups[${idx}]`,
    });
  });

  return runs;
}

export interface CompiledEditorialPoster {
  scene: DiagramScene;
  blueprint: EditorialPosterBlueprint;
}

/**
 * Generalized editorial poster compiler for autoregressive LLMs (Llama,
 * Mixtral, DeepSeek, Kimi Linear, Qwen3-Next, etc.). Zero model-id checks;
 * derives spine, layer schedule, and mechanism lenses strictly from IR.
 */
export function compileAutoregressivePoster(arch: ModelDocument, evidence: EvidenceFile): CompiledEditorialPoster {
  const { facts, topology } = arch;
  const claimMap = new Map(evidence.claims.map((c) => [c.path, c] as const));
  const hasClaim = (path: string) => claimMap.has(path);
  const statusOf = new Map<string, AnnStatus>(evidence.claims.map((c) => [c.path, c.status] as const));

  const safeNode = (
    id: string,
    kind: string,
    label: string,
    segments: Array<{ claimPath?: string; label: string }>,
    ports?: SemanticNode["ports"],
    fallbackClaimPath?: string,
  ): SemanticNode => {
    const validClaims = segments.filter((s) => s.claimPath && hasClaim(s.claimPath)) as Array<{
      claimPath: string;
      label: string;
    }>;
    const detail = segments.map((s) => s.label).join(" · ");
    const claimPath = validClaims[0]?.claimPath ?? (fallbackClaimPath && hasClaim(fallbackClaimPath) ? fallbackClaimPath : undefined);
    return {
      id,
      kind,
      label,
      ...(segments.length ? { detail } : {}),
      ...(ports ? { ports } : {}),
      ...(claimPath ? { claimPath } : {}),
      ...(validClaims.length ? { claims: validClaims } : {}),
    };
  };

  const attnGroups = topology.attention_groups;
  // Verify exact 0..N-1 layer coverage so malformed IR schedules fail loudly.
  const covered = new Set<number>();
  for (const g of attnGroups) {
    for (const idx of g.layers) {
      if (covered.has(idx)) {
        throw new Error(`${arch.model.id}: attention schedule covers layer ${idx} more than once`);
      }
      covered.add(idx);
    }
  }
  for (let i = 0; i < facts.num_hidden_layers; i++) {
    if (!covered.has(i)) {
      throw new Error(`${arch.model.id}: attention schedule is missing layer ${i}`);
    }
  }

  const attnSummary = attnGroups.map((g) => `${g.layers.length} ${g.label}`).join(" + ");
  const compactAttnSummary = attnGroups
    .map((g) => `${g.layers.length} ${g.kind === "linear_attention" ? "Lin" : g.kind === "sliding_window" ? "SWA" : g.kind.toUpperCase()}`)
    .join(" + ");
  const ffnSummary = topology.ffn_groups.map((g) => `${g.layers.length} ${g.label}`).join(" → ");
  const hasMoe = Boolean(topology.experts?.routed_total);
  const hasShared = Boolean(topology.experts?.shared && topology.experts.shared > 0);
  const attnKinds = new Set(attnGroups.map((g) => g.kind));
  const primaryAttnClaim = "topology.attention_groups[0]";
  const secondaryAttnClaim = hasClaim("topology.attention_groups[1]") ? "topology.attention_groups[1]" : primaryAttnClaim;
  const posClaim = hasClaim("topology.position_encoding.type") ? "topology.position_encoding.type" : secondaryAttnClaim;
  const posLabel = topology.position_encoding?.type?.toUpperCase() ?? "RoPE";

  // 1. Top & Bottom Main Execution Spine + Nested Pre-Norm Block with Explicit Residual Rails
  const blockNodes: SemanticNode[] = [
    safeNode(
      "blk-in",
      "split",
      "Block Input",
      [{ claimPath: "facts.hidden_size", label: `d=${commas(facts.hidden_size)}` }],
      [{ name: "in", side: "top" }, { name: "out", side: "bottom" }, { name: "skip", side: "left" }],
      "facts.hidden_size",
    ),
    { id: "blk-norm1", kind: "norm", label: "Pre-Attn Norm", detail: "RMSNorm", ports: [{ name: "in", side: "top" }, { name: "out", side: "bottom" }] },
    safeNode(
      "blk-attn",
      attnKinds.has("linear_attention") && attnGroups.length === 1 ? "state" : "attention",
      attnGroups.length > 1 ? "Hybrid Attention" : attnGroups[0]!.label,
      [
        { claimPath: primaryAttnClaim, label: compactAttnSummary },
        ...(facts.num_attention_heads ? [{ claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads} Q` }] : []),
      ],
      [{ name: "in", side: "top" }, { name: "out", side: "bottom" }, { name: "mod", side: "left" }],
      primaryAttnClaim,
    ),
    {
      id: "blk-add1",
      kind: "merge",
      label: "⊕ Residual",
      detail: "h + attn",
      ports: [{ name: "in", side: "top" }, { name: "out", side: "bottom" }, { name: "skip", side: "left" }],
    },
    {
      id: "blk-fork2",
      kind: "split",
      label: "Attn Stream",
      detail: "pre-FFN fork",
      ports: [{ name: "in", side: "top" }, { name: "out", side: "bottom" }, { name: "skip", side: "left" }],
    },
    { id: "blk-norm2", kind: "norm", label: "Pre-FFN Norm", detail: "RMSNorm", ports: [{ name: "in", side: "top" }, { name: "out", side: "bottom" }] },
    safeNode(
      "blk-ffn",
      hasMoe ? "moe" : "ffn",
      hasMoe ? "Sparse MoE" : (topology.ffn_groups[0]?.label ?? "Dense SwiGLU"),
      hasMoe
        ? [
            { claimPath: "topology.experts.routed_total", label: `${commas(topology.experts!.routed_total!)} experts` },
            ...(topology.experts?.active_routed ? [{ claimPath: "topology.experts.active_routed", label: `top-${topology.experts.active_routed}` }] : []),
          ]
        : [{ label: ffnSummary }],
      [{ name: "in", side: "top" }, { name: "out", side: "bottom" }],
      hasMoe ? "topology.experts.routed_total" : "facts.hidden_size",
    ),
    {
      id: "blk-add2",
      kind: "merge",
      label: "⊕ Residual",
      detail: "h + FFN",
      ports: [{ name: "in", side: "top" }, { name: "out", side: "bottom" }, { name: "skip", side: "left" }],
    },
    safeNode(
      "blk-mod",
      "state",
      attnGroups.length > 1 || attnKinds.has("mla") ? "Part. RoPE" : posLabel,
      [
        ...(facts.context_tokens ? [{ claimPath: "facts.context_tokens", label: contextLabel(facts.context_tokens) }] : [{ label: posLabel }]),
      ],
      undefined,
      posClaim,
    ),
  ];

  const nodes: SemanticNode[] = [
    { id: "tok", kind: "io", label: "Token ids", ports: [{ name: "out", side: "bottom" }] },
    safeNode(
      "embed",
      "embedding",
      "Token embedding",
      [{ claimPath: "facts.hidden_size", label: `hidden ${commas(facts.hidden_size)}` }],
      [{ name: "in", side: "top" }, { name: "out", side: "bottom" }],
    ),
    ...blockNodes,
    { id: "norm", kind: "norm", label: "Final RMSNorm", ports: [{ name: "in", side: "top" }, { name: "out", side: "bottom" }] },
    safeNode(
      "head",
      "output",
      "LM head",
      facts.vocab_size ? [{ claimPath: "facts.vocab_size", label: `vocab ${commas(facts.vocab_size)}` }] : [],
      [{ name: "in", side: "top" }, { name: "scale", side: "bottom" }],
    ),
  ];

  // 2. Schedule column nodes
  const schedRuns = buildScheduleRuns(facts.num_hidden_layers, attnGroups, topology.ffn_groups);
  const scheduleIds: string[] = [];
  schedRuns.forEach((r) => {
    scheduleIds.push(r.id);
    const backing = hasClaim(r.claimPath) ? r.claimPath : "facts.num_hidden_layers";
    nodes.push({
      id: r.id,
      kind: r.tail ? "schedule-tail" : "schedule",
      label: r.label,
      detail: r.detail,
      claimPath: backing,
    });
  });

  // 3. Mechanism Lens 1: Detailed Attention / Mixer Internals
  const attnLensIds: string[] = [];
  let attnRows: Array<Array<string | null>> = [];
  const attnInternalEdges: DiagramScene["edges"] = [];

  if (attnKinds.has("linear_attention") && (attnKinds.has("mla") || attnKinds.has("gqa"))) {
    const linGrp = attnGroups.find((g) => g.kind === "linear_attention")!;
    const fullGrp = attnGroups.find((g) => g.kind === "mla" || g.kind === "gqa")!;
    const isKda = linGrp.label.toLowerCase().includes("kda");

    // Branch A: 4-node linear recurrence chain (ShortConv -> Decay -> State -> Output Gate)
    const linIds = isKda
      ? ["kda-qkv", "kda-decay", "kda-state", "kda-gate"]
      : ["lin-qkv", "lin-decay", "lin-state", "lin-gate"];
    nodes.push(
      safeNode(linIds[0]!, "state", isKda ? "Q/K/V ShortConv" : "Q/K/V + Conv", [{ label: isKda ? "kernel 4 · silu" : "short conv" }], undefined, primaryAttnClaim),
      safeNode(linIds[1]!, "state", isKda ? "KDA Decay Gate" : "Delta Decay", [{ label: isKda ? "A_log · dt gate" : "alpha / beta gate" }], undefined, primaryAttnClaim),
      safeNode(linIds[2]!, "state", "Delta State", [{ label: `${linGrp.layers.length} linear layers` }], undefined, primaryAttnClaim),
      safeNode(
        linIds[3]!,
        "state",
        "Output Gate",
        [
          { claimPath: "facts.num_attention_heads", label: isKda ? `${facts.num_attention_heads}h` : `${facts.num_attention_heads} heads` },
          ...(isKda
            ? [{ claimPath: primaryAttnClaim, label: "d=128 · o_norm" }]
            : facts.head_dim
              ? [{ claimPath: "facts.head_dim", label: `d=${facts.head_dim}` }]
              : []),
        ],
        undefined,
        primaryAttnClaim,
      ),
    );
    attnInternalEdges.push(
      { id: "e-lin-conv", from: linIds[0]!, to: linIds[1]!, kind: "flow", claimPath: primaryAttnClaim },
      { id: "e-lin-decay", from: linIds[1]!, to: linIds[2]!, kind: "control", claimPath: primaryAttnClaim },
      { id: "e-lin-gate", from: linIds[2]!, to: linIds[3]!, kind: "flow", claimPath: primaryAttnClaim },
    );

    // Branch B: 3-node compressed bottleneck / grouped KV topology with bypass (strictly non-isomorphic to Branch A)
    let fullIds: string[];
    if (attnKinds.has("mla")) {
      fullIds = ["mla-kv", "mla-rope", "mla-core"];
      nodes.push(
        safeNode("mla-kv", "attention", "Latent KV", [{ label: "bottleneck · norm" }], [{ name: "latent", side: "bottom" }], secondaryAttnClaim),
        safeNode("mla-rope", "attention", "RoPE / NoPE", [{ claimPath: posClaim, label: "decoupled key" }], undefined, posClaim),
        safeNode(
          "mla-core",
          "attention",
          fullGrp.label,
          [
            { label: `${fullGrp.layers.length} layers` },
            ...(facts.num_attention_heads ? [{ claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads} heads` }] : []),
          ],
          [{ name: "latent", side: "bottom" }],
          secondaryAttnClaim,
        ),
      );
      attnInternalEdges.push(
        { id: "e-full-1", from: "mla-kv", to: "mla-rope", kind: "control", claimPath: secondaryAttnClaim },
        { id: "e-full-2", from: "mla-rope", to: "mla-core", kind: "flow", claimPath: secondaryAttnClaim },
        { id: "e-full-bypass", from: "mla-kv.latent", to: "mla-core.latent", kind: "skip", claimPath: secondaryAttnClaim },
      );
    } else {
      fullIds = ["gqa-q", "gqa-kv", "gqa-core"];
      nodes.push(
        safeNode(
          "gqa-q",
          "attention",
          "Query Proj",
          [{ claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads} Q heads` }],
          [{ name: "kv", side: "bottom" }],
        ),
        safeNode(
          "gqa-kv",
          "state",
          "Grouped KV",
          [
            ...(facts.num_key_value_heads ? [{ claimPath: "facts.num_key_value_heads", label: `${facts.num_key_value_heads} KV` }] : [{ label: "shared KV" }]),
          ],
          undefined,
          secondaryAttnClaim,
        ),
        safeNode(
          "gqa-core",
          "attention",
          fullGrp.label,
          [{ label: `${fullGrp.layers.length} layers` }],
          [{ name: "kv", side: "bottom" }],
          secondaryAttnClaim,
        ),
      );
      attnInternalEdges.push(
        { id: "e-full-1", from: "gqa-q", to: "gqa-kv", kind: "control", claimPath: secondaryAttnClaim },
        { id: "e-full-2", from: "gqa-kv", to: "gqa-core", kind: "flow", claimPath: secondaryAttnClaim },
        { id: "e-full-bypass", from: "gqa-q.kv", to: "gqa-core.kv", kind: "skip", claimPath: secondaryAttnClaim },
      );
    }

    attnRows = [linIds, fullIds];
    attnLensIds.push(...linIds, ...fullIds);
  } else if (attnKinds.has("mla") || attnKinds.has("mla_sparse")) {
    nodes.push(
      safeNode("attn-q", "attention", "Query Proj", [{ claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads} Q heads` }]),
      safeNode("attn-rope", "attention", "RoPE / NoPE", [{ claimPath: posClaim, label: "decoupled key" }], undefined, posClaim),
      safeNode("attn-proj", "attention", "KV Down-Proj", [{ claimPath: "facts.hidden_size", label: `from d=${commas(facts.hidden_size)}` }]),
      safeNode("attn-kv", "state", "Latent KV", [{ label: "compressed cache" }], undefined, primaryAttnClaim),
      safeNode(
        "attn-core",
        "attention",
        "MLA Core",
        [{ claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads}h · up-proj` }],
        [{ name: "kv", side: "bottom" }],
        primaryAttnClaim,
      ),
      safeNode("attn-out", "attention", "O Proj", [{ claimPath: "facts.hidden_size", label: `to d=${commas(facts.hidden_size)}` }]),
    );
    attnRows = [
      ["attn-q", "attn-rope", "attn-core", "attn-out"],
      ["attn-proj", "attn-kv", null, null],
    ];
    attnLensIds.push("attn-q", "attn-rope", "attn-proj", "attn-kv", "attn-core", "attn-out");
    attnInternalEdges.push(
      { id: "e-attn-q1", from: "attn-q", to: "attn-rope", kind: "flow", claimPath: primaryAttnClaim },
      { id: "e-attn-q2", from: "attn-rope", to: "attn-core", kind: "flow", claimPath: primaryAttnClaim },
      { id: "e-attn-kv1", from: "attn-proj", to: "attn-kv", kind: "flow", claimPath: primaryAttnClaim },
      { id: "e-attn-kv2", from: "attn-kv", to: "attn-core.kv", kind: "flow", claimPath: primaryAttnClaim },
      { id: "e-attn-out", from: "attn-core", to: "attn-out", kind: "flow", claimPath: primaryAttnClaim },
    );
  } else {
    const kvRatio = facts.num_key_value_heads ? Math.round(facts.num_attention_heads / facts.num_key_value_heads) : null;
    nodes.push(
      safeNode("attn-q", "attention", "Q Projections", [{ claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads} Q heads` }]),
      safeNode("attn-rope", "attention", `RoPE (Q, K)`, [{ claimPath: posClaim, label: posLabel }], undefined, posClaim),
      safeNode(
        "attn-kv",
        "state",
        "KV Projections",
        [
          ...(facts.num_key_value_heads ? [{ claimPath: "facts.num_key_value_heads", label: `${facts.num_key_value_heads} KV heads` }] : [{ label: "grouped KV" }]),
        ],
        undefined,
        "facts.num_attention_heads",
      ),
      safeNode(
        "attn-core",
        "attention",
        "SDPA Attn",
        [...(kvRatio ? [{ label: `${kvRatio}:1 Q/KV ratio` }] : [{ label: "causal mask" }])],
        [{ name: "kv", side: "bottom" }],
        primaryAttnClaim,
      ),
      safeNode("attn-out", "attention", "O Proj", [{ claimPath: "facts.hidden_size", label: `to d=${commas(facts.hidden_size)}` }]),
    );
    attnRows = [
      ["attn-q", "attn-rope", "attn-core", "attn-out"],
      [null, "attn-kv", null, null],
    ];
    attnLensIds.push("attn-q", "attn-rope", "attn-kv", "attn-core", "attn-out");
    attnInternalEdges.push(
      { id: "e-attn-1", from: "attn-q", to: "attn-rope", kind: "flow", claimPath: primaryAttnClaim },
      { id: "e-attn-2", from: "attn-rope", to: "attn-core", kind: "flow", claimPath: primaryAttnClaim },
      { id: "e-attn-kv", from: "attn-kv", to: "attn-core.kv", kind: "flow", claimPath: primaryAttnClaim },
      { id: "e-attn-out", from: "attn-core", to: "attn-out", kind: "flow", claimPath: primaryAttnClaim },
    );
  }

  // 4. Mechanism Lens 2: Detailed FFN SwiGLU Diamond or Sparse MoE
  const ffnRows: Array<Array<string | null>> = [];
  const ffnLensIds: string[] = [];
  const ffnEdges: DiagramScene["edges"] = [];
  if (hasMoe && topology.experts) {
    const exp = topology.experts;
    nodes.push(
      {
        id: "moe-router",
        kind: "router",
        label: "Router",
        detail: `top-${exp.active_routed ?? "?"} gate`,
        claimPath: "topology.experts.active_routed",
        ports: [{ name: hasShared ? "shared" : "skip", side: "bottom" }],
      },
      safeNode(
        "moe-routed",
        "moe",
        "Routed Experts",
        [
          { claimPath: "topology.experts.routed_total", label: `${commas(exp.routed_total!)} total` },
          ...(exp.active_routed ? [{ claimPath: "topology.experts.active_routed", label: `top-${exp.active_routed}` }] : []),
        ],
        hasShared ? undefined : [{ name: "recipe", side: "bottom" }],
      ),
      {
        id: "moe-merge",
        kind: "merge",
        label: "⊕ Merge",
        detail: hasShared ? "routed + shared" : "routed + residual",
        claimPath: "topology.experts.routed_total",
        ports: hasShared ? [{ name: "shared", side: "bottom" }, { name: "recipe", side: "right" }] : [{ name: "skip", side: "bottom" }],
      },
      safeNode("moe-swiglu", "ffn", "Expert SwiGLU", [{ label: "Gate·SiLU ⊙ Up" }], hasShared ? [{ name: "in", side: "top" }] : [{ name: "recipe", side: "top" }], "facts.hidden_size"),
    );
    ffnLensIds.push("moe-router", "moe-routed", "moe-merge", "moe-swiglu");
    ffnEdges.push(
      { id: "e-moe-route", from: "moe-router", to: "moe-routed", kind: "control", claimPath: "topology.experts.active_routed" },
      { id: "e-moe-routed-merge", from: "moe-routed", to: "moe-merge", kind: "flow", claimPath: "topology.experts.routed_total" },
    );
    if (hasShared) {
      nodes.push(
        safeNode("moe-shared", "moe", "Shared Expert", [{ claimPath: "topology.experts.shared", label: `${exp.shared} always-on` }]),
      );
      ffnLensIds.push("moe-shared");
      ffnRows.push(["moe-router", "moe-routed", "moe-merge", null], [null, "moe-shared", null, "moe-swiglu"]);
      ffnEdges.push(
        { id: "e-moe-shared-route", from: "moe-router.shared", to: "moe-shared", kind: "control", claimPath: "topology.experts.shared" },
        { id: "e-moe-shared-merge", from: "moe-shared", to: "moe-merge.shared", kind: "flow", claimPath: "topology.experts.shared" },
        { id: "e-moe-recipe", from: "moe-merge.recipe", to: "moe-swiglu.in", kind: "control" },
      );
    } else {
      ffnRows.push(["moe-router", "moe-routed", "moe-merge"], [null, "moe-swiglu", null]);
      ffnEdges.push(
        { id: "e-moe-skip", from: "moe-router.skip", to: "moe-merge.skip", kind: "skip" },
        { id: "e-moe-recipe", from: "moe-routed.recipe", to: "moe-swiglu.recipe", kind: "control" },
      );
    }
  } else {
    const ffnLabel = topology.ffn_groups[0]?.label ?? "SwiGLU";
    const actName = ffnLabel.toLowerCase().includes("geglu") ? "GELU Act" : "SiLU Act";
    nodes.push(
      safeNode("ffn-gate", "ffn", "Gate Proj", [{ claimPath: "facts.hidden_size", label: `from d=${commas(facts.hidden_size)}` }]),
      { id: "ffn-act", kind: "ffn", label: actName, detail: "gating branch" },
      safeNode("ffn-up", "ffn", "Up Proj", [{ claimPath: "facts.hidden_size", label: `d=${commas(facts.hidden_size)} linear` }]),
      { id: "ffn-mul", kind: "merge", label: "⊗ Multiply", detail: "gate ⊙ up", ports: [{ name: "up", side: "bottom" }] },
      safeNode("ffn-down", "ffn", "Down Proj", [{ claimPath: "facts.hidden_size", label: `to d=${commas(facts.hidden_size)}` }]),
    );
    ffnLensIds.push("ffn-gate", "ffn-act", "ffn-up", "ffn-mul", "ffn-down");
    ffnRows.push(
      ["ffn-gate", "ffn-act", "ffn-mul", "ffn-down"],
      [null, "ffn-up", null, null],
    );
    ffnEdges.push(
      { id: "e-ffn-1", from: "ffn-gate", to: "ffn-act", kind: "flow" },
      { id: "e-ffn-2", from: "ffn-act", to: "ffn-mul", kind: "flow" },
      { id: "e-ffn-up", from: "ffn-up", to: "ffn-mul.up", kind: "flow" },
      { id: "e-ffn-3", from: "ffn-mul", to: "ffn-down", kind: "flow" },
    );
  }

  // 5. Mechanism Lens 3: Context, Position & Parameter Scale
  nodes.push(
    safeNode(
      "scale-ctx",
      "state",
      "Context & Pos",
      [
        ...(facts.context_tokens ? [{ claimPath: "facts.context_tokens", label: contextLabel(facts.context_tokens) }] : []),
        { label: posLabel },
      ],
      undefined,
      "facts.context_tokens",
    ),
    safeNode(
      "scale-params",
      "annotation",
      "Parameter Budget",
      [
        ...(facts.total_params ? [{ claimPath: "facts.total_params", label: `${paramsToB(facts.total_params)} total` }] : []),
        ...(facts.active_params ? [{ claimPath: "facts.active_params", label: `${paramsToB(facts.active_params)} active` }] : []),
      ],
      undefined,
      "facts.total_params",
    ),
  );
  const scaleLensIds = ["scale-ctx", "scale-params"];

  // Edges (top spine -> nested block with residual rails -> bottom spine + right zoom callouts)
  const edges: DiagramScene["edges"] = [
    { id: "e-top-0", from: "tok", to: "embed", kind: "flow" },
    { id: "e-top-1", from: "embed", to: "g-block.in", kind: "flow" },
    { id: "e-blk-0", from: "blk-in", to: "blk-norm1", kind: "flow" },
    { id: "e-blk-1", from: "blk-norm1", to: "blk-attn", kind: "flow" },
    { id: "e-blk-mod", from: "blk-mod", to: "blk-attn.mod", kind: "control", claimPath: posClaim },
    { id: "e-blk-2", from: "blk-attn", to: "blk-add1", kind: "flow" },
    { id: "e-blk-skip1", from: "blk-in.skip", to: "blk-add1.skip", kind: "skip" },
    { id: "e-blk-3", from: "blk-add1", to: "blk-fork2", kind: "flow" },
    { id: "e-blk-4", from: "blk-fork2", to: "blk-norm2", kind: "flow" },
    { id: "e-blk-5", from: "blk-norm2", to: "blk-ffn", kind: "flow" },
    { id: "e-blk-6", from: "blk-ffn", to: "blk-add2", kind: "flow" },
    { id: "e-blk-skip2", from: "blk-fork2.skip", to: "blk-add2.skip", kind: "skip" },
    { id: "e-bot-0", from: "g-block.out", to: "norm", kind: "flow" },
    { id: "e-bot-1", from: "norm", to: "head", kind: "flow" },
    { id: "c-attn", from: "g-block.attn", to: "g-attn.in", kind: "control", claimPath: primaryAttnClaim },
    { id: "c-ffn", from: "g-block.ffn", to: "g-ffn.in", kind: "control" },
    { id: "c-sched", from: "g-block.sched", to: "g-schedule.in", kind: "control", claimPath: "facts.num_hidden_layers" },
    { id: "c-scale", from: "head.scale", to: "g-scale.in", kind: "control", claimPath: "facts.total_params" },
    ...attnInternalEdges,
    ...ffnEdges,
  ];

  const blockMemberIds = blockNodes.map((n) => n.id);
  const groups: SemanticGroup[] = [
    {
      id: "g-block",
      label: `Transformer Block · ${facts.num_hidden_layers} layers`,
      kind: "inset",
      repeat: { count: facts.num_hidden_layers, label: `${facts.num_hidden_layers} ×` },
      members: blockMemberIds,
      ports: [
        { id: "in", side: "top", inner: "blk-in" },
        { id: "out", side: "bottom", inner: "blk-add2" },
        { id: "attn", side: "right", inner: "blk-attn" },
        { id: "ffn", side: "right", inner: "blk-ffn" },
        { id: "sched", side: "right", inner: "blk-add2" },
      ],
      claimPath: "facts.num_hidden_layers",
    },
    {
      id: "g-attn",
      label: `Attention Zoom · ${attnSummary}`,
      kind: "inset",
      members: attnLensIds,
      ports: [{ id: "in", side: "left", inner: attnLensIds[0]! }],
      claimPath: primaryAttnClaim,
    },
    {
      id: "g-ffn",
      label: hasMoe ? `MoE Zoom · ${commas(topology.experts!.routed_total!)} experts` : `FFN Zoom · ${topology.ffn_groups[0]?.label ?? "SwiGLU"}`,
      kind: "inset",
      members: ffnLensIds,
      ports: [{ id: "in", side: "left", inner: ffnLensIds[0]! }],
      ...(hasMoe ? { claimPath: "topology.experts.routed_total" } : {}),
    },
    {
      id: "g-schedule",
      label: `Layer Schedule · ${facts.num_hidden_layers}L`,
      kind: "inset",
      members: scheduleIds,
      ports: [{ id: "in", side: "left", inner: scheduleIds[0]! }],
      claimPath: "facts.num_hidden_layers",
    },
    {
      id: "g-scale",
      label: "Context & Footprint",
      kind: "inset",
      members: scaleLensIds,
      ports: [{ id: "in", side: "bottom", inner: scaleLensIds[scaleLensIds.length - 1]! }],
      claimPath: "facts.total_params",
    },
  ];

  const scene: DiagramScene = {
    irVersion: arch.ir_version,
    view: "overview",
    modelId: arch.model.id,
    nodes,
    edges,
    groups,
    annotations: [],
    constraints: [{ type: "direction", value: "top-to-bottom" }],
    streams: [],
  };

  for (const n of scene.nodes) {
    const refs = n.claims ?? (n.claimPath ? [{ claimPath: n.claimPath, label: n.label }] : []);
    for (const ref of refs) {
      if (!hasClaim(ref.claimPath)) continue;
      scene.annotations.push({ claimPath: ref.claimPath, target: n.id, status: statusOf.get(ref.claimPath) });
    }
  }
  for (const e of scene.edges) {
    if (e.claimPath && hasClaim(e.claimPath)) {
      scene.annotations.push({ claimPath: e.claimPath, target: e.id, status: statusOf.get(e.claimPath) });
    }
  }

  const lenses: LensSpec[] = [
    { groupId: "g-attn", rows: attnRows },
    { groupId: "g-ffn", rows: ffnRows },
  ];

  const blueprint = buildSpinePosterBlueprint({
    id: `editorial-${arch.model.id}`,
    scene,
    topSpine: ["tok", "embed"],
    bottomSpine: ["norm", "head"],
    blockGroupId: "g-block",
    blockSpine: ["blk-in", "blk-norm1", "blk-attn", "blk-add1", "blk-fork2", "blk-norm2", "blk-ffn", "blk-add2"],
    blockModifierId: "blk-mod",
    blockSkips: [
      { edgeId: "e-blk-skip1", fromId: "blk-in", toId: "blk-add1" },
      { edgeId: "e-blk-skip2", fromId: "blk-fork2", toId: "blk-add2" },
    ],
    lenses,
    scheduleGroup: { groupId: "g-schedule", cols: 2, nodeIds: scheduleIds },
    scaleGroup: { groupId: "g-scale", rows: scaleLensIds.map((id) => [id]) },
    callouts: [
      { edgeId: "c-attn", sourceGroupPort: "attn", targetGroupId: "g-attn", targetPort: "in", corridorX: 460 },
      { edgeId: "c-ffn", sourceGroupPort: "ffn", targetGroupId: "g-ffn", targetPort: "in", corridorX: 473 },
      { edgeId: "c-sched", sourceGroupPort: "sched", targetGroupId: "g-schedule", targetPort: "in", corridorX: 486 },
    ],
    scaleCallout: { edgeId: "c-scale", sourceNodeId: "head", sourcePort: "scale" },
  });

  return { scene, blueprint };
}
