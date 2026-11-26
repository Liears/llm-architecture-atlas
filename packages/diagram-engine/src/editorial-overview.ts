import type { EvidenceFile, LayerGroup, ModelDocument } from "@atlas/architecture-ir";
import type { EditorialPosterBlueprint } from "./poster.js";
import { buildPosterGridBlueprint, type LensSpec } from "./poster-grid.js";
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
  const hasMoe = Boolean(topology.experts?.routed_total);
  const hasShared = Boolean(topology.experts?.shared && topology.experts.shared > 0);
  const attnKinds = new Set(attnGroups.map((g) => g.kind));

  // 1. Main Spine
  const nodes: SemanticNode[] = [
    { id: "tok", kind: "io", label: "Token ids" },
    safeNode("embed", "embedding", "Token embedding", [
      { claimPath: "facts.hidden_size", label: `hidden ${commas(facts.hidden_size)}` },
    ]),
    safeNode(
      "decoder",
      "stack",
      "Decoder stack",
      [
        { claimPath: "facts.num_hidden_layers", label: `${facts.num_hidden_layers} layers` },
        { label: attnSummary },
      ],
      [
        { name: "sched", side: "bottom" },
        { name: "scale", side: "bottom" },
        { name: "ffn", side: "bottom" },
        { name: "attn", side: "bottom" },
      ],
    ),
    { id: "norm", kind: "norm", label: "Final RMSNorm" },
    safeNode("head", "output", "LM head", facts.vocab_size ? [{ claimPath: "facts.vocab_size", label: `vocab ${commas(facts.vocab_size)}` }] : []),
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

  // 3. Mechanism Lens 1: Attention anatomy (multi-row non-isomorphic graphs for hybrid linear+full)
  const attnLensIds: string[] = [];
  let attnRows: Array<Array<string | null>> = [];
  const attnInternalEdges: DiagramScene["edges"] = [];
  const primaryAttnClaim = "topology.attention_groups[0]";
  const secondaryAttnClaim = hasClaim("topology.attention_groups[1]") ? "topology.attention_groups[1]" : primaryAttnClaim;
  const posClaim = hasClaim("topology.position_encoding.type") ? "topology.position_encoding.type" : secondaryAttnClaim;

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
      safeNode("attn-proj", "attention", "Q / KV Latent Proj", [{ claimPath: "facts.hidden_size", label: `from d=${commas(facts.hidden_size)}` }], [{ name: "latent", side: "bottom" }]),
      safeNode("attn-kv", "state", "Compressed KV Cache", [{ label: "low-rank latent vector" }], undefined, primaryAttnClaim),
      safeNode(
        "attn-core",
        "attention",
        "MLA Attention",
        [{ claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads} Q heads` }],
        [{ name: "latent", side: "bottom" }],
        primaryAttnClaim,
      ),
    );
    attnRows = [["attn-proj", "attn-kv", "attn-core"]];
    attnLensIds.push("attn-proj", "attn-kv", "attn-core");
    attnInternalEdges.push(
      { id: "e-attn-1", from: "attn-proj", to: "attn-kv", kind: "flow", claimPath: primaryAttnClaim },
      { id: "e-attn-2", from: "attn-kv", to: "attn-core", kind: "flow", claimPath: primaryAttnClaim },
      { id: "e-attn-bypass", from: "attn-proj.latent", to: "attn-core.latent", kind: "skip", claimPath: primaryAttnClaim },
    );
  } else {
    const kvRatio = facts.num_key_value_heads ? Math.round(facts.num_attention_heads / facts.num_key_value_heads) : null;
    nodes.push(
      safeNode("attn-q", "attention", "Query Projections", [{ claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads} Q heads` }]),
      safeNode(
        "attn-kv",
        "state",
        "Shared KV Cache",
        [
          ...(facts.num_key_value_heads ? [{ claimPath: "facts.num_key_value_heads", label: `${facts.num_key_value_heads} KV heads` }] : [{ label: "grouped KV" }]),
        ],
        undefined,
        "facts.num_attention_heads",
      ),
      safeNode(
        "attn-core",
        "attention",
        attnGroups[0]!.label,
        [
          ...(kvRatio ? [{ label: `${kvRatio}:1 Q/KV ratio` }] : [{ label: "attention core" }]),
        ],
        undefined,
        primaryAttnClaim,
      ),
    );
    attnRows = [["attn-q", "attn-kv", "attn-core"]];
    attnLensIds.push("attn-q", "attn-kv", "attn-core");
    attnInternalEdges.push(
      { id: "e-attn-1", from: "attn-q", to: "attn-kv", kind: "flow", claimPath: primaryAttnClaim },
      { id: "e-attn-2", from: "attn-kv", to: "attn-core", kind: "flow", claimPath: primaryAttnClaim },
    );
  }

  // 4. Mechanism Lens 2: FFN / Sparse MoE
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
      safeNode("moe-routed", "moe", "Routed Experts", [
        { claimPath: "topology.experts.routed_total", label: `${commas(exp.routed_total!)} total` },
        ...(exp.active_routed ? [{ claimPath: "topology.experts.active_routed", label: `top-${exp.active_routed}` }] : []),
      ]),
      {
        id: "moe-merge",
        kind: "merge",
        label: "⊕ Merge",
        detail: hasShared ? "routed + shared" : "routed + residual",
        claimPath: "topology.experts.routed_total",
        ports: [{ name: hasShared ? "shared" : "skip", side: "bottom" }],
      },
    );
    ffnLensIds.push("moe-router", "moe-routed", "moe-merge");
    ffnEdges.push(
      { id: "e-moe-route", from: "moe-router", to: "moe-routed", kind: "control", claimPath: "topology.experts.active_routed" },
      { id: "e-moe-routed-merge", from: "moe-routed", to: "moe-merge", kind: "flow", claimPath: "topology.experts.routed_total" },
    );
    if (hasShared) {
      nodes.push(
        safeNode("moe-shared", "moe", "Shared Expert", [{ claimPath: "topology.experts.shared", label: `${exp.shared} always-on` }]),
      );
      ffnLensIds.push("moe-shared");
      ffnRows.push(["moe-router", "moe-routed", "moe-merge"], [null, "moe-shared", null]);
      ffnEdges.push(
        { id: "e-moe-shared-route", from: "moe-router.shared", to: "moe-shared", kind: "control", claimPath: "topology.experts.shared" },
        { id: "e-moe-shared-merge", from: "moe-shared", to: "moe-merge.shared", kind: "flow", claimPath: "topology.experts.shared" },
      );
    } else {
      ffnRows.push(["moe-router", "moe-routed", "moe-merge"]);
      ffnEdges.push({ id: "e-moe-skip", from: "moe-router.skip", to: "moe-merge.skip", kind: "skip" });
    }
  } else {
    nodes.push(
      {
        id: "ffn-norm",
        kind: "norm",
        label: "Pre-FFN Norm",
        detail: "RMSNorm",
        ports: [{ name: "skip", side: "bottom" }],
      },
      safeNode("ffn-mlp", "ffn", topology.ffn_groups[0]?.label ?? "Dense FFN", [
        { claimPath: "facts.hidden_size", label: `width ${commas(facts.hidden_size)}` },
      ]),
      {
        id: "ffn-add",
        kind: "merge",
        label: "⊕ Residual",
        detail: "skip + MLP",
        ports: [{ name: "skip", side: "bottom" }],
      },
    );
    ffnLensIds.push("ffn-norm", "ffn-mlp", "ffn-add");
    ffnRows.push(["ffn-norm", "ffn-mlp", "ffn-add"]);
    ffnEdges.push(
      { id: "e-ffn-1", from: "ffn-norm", to: "ffn-mlp", kind: "flow" },
      { id: "e-ffn-2", from: "ffn-mlp", to: "ffn-add", kind: "flow" },
      { id: "e-ffn-skip", from: "ffn-norm.skip", to: "ffn-add.skip", kind: "skip" },
    );
  }

  // 5. Mechanism Lens 3: Context, Position & Parameter Scale
  const posLabel = topology.position_encoding?.type?.toUpperCase() ?? "RoPE";
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

  // Edges (main spine + callouts + internal lens edges)
  const edges: DiagramScene["edges"] = [
    { id: "e-tok-embed", from: "tok", to: "embed", kind: "flow" },
    { id: "e-embed-dec", from: "embed", to: "decoder", kind: "flow" },
    { id: "e-dec-norm", from: "decoder", to: "norm", kind: "flow" },
    { id: "e-norm-head", from: "norm", to: "head", kind: "flow" },
    { id: "c-sched", from: "decoder.sched", to: "g-schedule.in", kind: "control", claimPath: "facts.num_hidden_layers" },
    { id: "c-attn", from: "decoder.attn", to: "g-attn.in", kind: "control", claimPath: primaryAttnClaim },
    { id: "c-ffn", from: "decoder.ffn", to: "g-ffn.in", kind: "control" },
    { id: "c-scale", from: "decoder.scale", to: "g-scale.in", kind: "control", claimPath: "facts.total_params" },
    ...attnInternalEdges,
    ...ffnEdges,
  ];

  const groups: SemanticGroup[] = [
    {
      id: "g-schedule",
      label: `Layer Genome · ${facts.num_hidden_layers} layers`,
      kind: "inset",
      members: scheduleIds,
      ports: [{ id: "in", side: "right", inner: scheduleIds[0]! }],
      claimPath: "facts.num_hidden_layers",
    },
    {
      id: "g-attn",
      label: `Attention · ${attnSummary}`,
      kind: "inset",
      members: attnLensIds,
      ports: [{ id: "in", side: "left", inner: attnLensIds[0]! }],
      claimPath: primaryAttnClaim,
    },
    {
      id: "g-ffn",
      label: hasMoe ? `Sparse MoE · ${commas(topology.experts!.routed_total!)} experts` : "Dense FFN Block",
      kind: "inset",
      members: ffnLensIds,
      ports: [{ id: "in", side: "left", inner: ffnLensIds[0]! }],
      ...(hasMoe ? { claimPath: "topology.experts.routed_total" } : {}),
    },
    {
      id: "g-scale",
      label: "Context & Footprint",
      kind: "inset",
      members: scaleLensIds,
      ports: [{ id: "in", side: "left", inner: scaleLensIds[0]! }],
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
    constraints: [{ type: "direction", value: "left-to-right" }],
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
    { groupId: "g-scale", rows: [scaleLensIds] },
  ];

  const blueprint = buildPosterGridBlueprint({
    id: `editorial-${arch.model.id}`,
    scene,
    spine: ["tok", "embed", "decoder", "norm", "head"],
    scheduleGroupId: "g-schedule",
    scheduleNodes: scheduleIds,
    lenses,
    callouts: [
      { edgeId: "c-sched", sourceNodeId: "decoder", sourcePort: "sched", targetGroupId: "g-schedule", targetPort: "in", busY: 158, corridorX: 452 },
      { edgeId: "c-scale", sourceNodeId: "decoder", sourcePort: "scale", targetGroupId: "g-scale", targetPort: "in", busY: 170, corridorX: 462 },
      { edgeId: "c-ffn", sourceNodeId: "decoder", sourcePort: "ffn", targetGroupId: "g-ffn", targetPort: "in", busY: 182, corridorX: 472 },
      { edgeId: "c-attn", sourceNodeId: "decoder", sourcePort: "attn", targetGroupId: "g-attn", targetPort: "in", busY: 194, corridorX: 482 },
    ],
  });

  return { scene, blueprint };
}
