import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import type { EditorialPosterBlueprint } from "./poster.js";
import { buildSpinePosterBlueprint, type LensSpec } from "./poster-grid.js";
import { buildScheduleRuns } from "./editorial-overview.js";
import type { DiagramScene, EvidenceAnnotation, SemanticGroup, SemanticNode } from "./types.js";

type AnnStatus = NonNullable<EvidenceAnnotation["status"]>;

function commas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function paramsLabel(n: number): string {
  const fmt = (v: number) => {
    const s = v.toFixed(1);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  };
  if (n >= 1e9) return `${fmt(n / 1e9)}B`;
  return `${fmt(n / 1e6)}M`;
}

function contextLabel(n: number): string {
  if (n >= 1024) return `${Math.round(n / 1024)}K ctx`;
  return `${n} tok ctx`;
}

export interface CompiledSystemOnePoster {
  scene: DiagramScene;
  blueprint: EditorialPosterBlueprint;
}

/**
 * Compiler & poster blueprint for System One (non-autoregressive Jev-class)
 * decision models. Uses the unified top-to-bottom residual execution spine
 * paired with right-hand readout/backbone mix, GeGLU/SwiGLU FFN, schedule,
 * and calibration zooms:
 * - mask_marker_mlp (e.g. Laya: bidirectional encoder + [MASK] head + act_head)
 * - first_token_letter_logits (e.g. OpenJev: single-pass prefill + prefix KV + letter readout)
 */
export function compileSystemOnePoster(arch: ModelDocument, evidence: EvidenceFile): CompiledSystemOnePoster {
  const { facts, topology } = arch;
  const dh = topology.decision_head;
  if (!dh) {
    throw new Error(`${arch.model.id}: system_one_decision requires topology.decision_head`);
  }
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

  const isMarkerMode = dh.readout_mode === "mask_marker_mlp";
  const attnGroups = topology.attention_groups;
  const attnSummary = attnGroups.map((g) => `${g.layers.length} ${g.label}`).join(" + ");
  const compactAttnSummary = attnGroups
    .map((g) => `${g.layers.length} ${g.kind === "linear_attention" ? "Lin" : g.kind === "sliding_window" ? "SWA" : "Full"}`)
    .join(" + ");
  const primitivesText = dh.primitives?.length ? dh.primitives.join(" · ") : "choice · score · noul";
  const ffnLabel = topology.ffn_groups[0]?.label ?? "Dense FFN";
  const isGelu = /gelu|geglu/i.test(ffnLabel);
  const posClaim = hasClaim("topology.position_encoding.type")
    ? "topology.position_encoding.type"
    : "topology.attention_groups[0]";
  const posLabel = topology.position_encoding?.type?.toUpperCase() ?? "RoPE";

  // 1. Top & Bottom Main Execution Spine + Nested Pre-Norm Block with Residual Skip Rails
  const topSpineNodes: SemanticNode[] = isMarkerMode
    ? [
        safeNode(
          "input",
          "io",
          "State + Typed Q",
          [{ claimPath: "topology.decision_head.primitives", label: primitivesText }],
          [{ name: "out", side: "bottom" }],
          "topology.paradigm",
        ),
        safeNode(
          "embed",
          "embedding",
          "Token + Type Emb",
          [{ claimPath: "facts.hidden_size", label: `d=${commas(facts.hidden_size)}` }],
          [{ name: "in", side: "top" }, { name: "out", side: "bottom" }],
        ),
      ]
    : [
        safeNode(
          "input",
          "io",
          "State + Image + Q",
          [{ claimPath: "topology.decision_head.primitives", label: primitivesText }],
          [{ name: "out", side: "bottom" }],
          "topology.paradigm",
        ),
        safeNode(
          "embed",
          dh.vision_encoder ? "vision" : "embedding",
          dh.vision_encoder ? "Embed + Vision" : "Token Embed",
          [{ claimPath: "facts.hidden_size", label: `d=${commas(facts.hidden_size)}` }],
          [{ name: "in", side: "top" }, { name: "out", side: "bottom" }],
          "topology.decision_head.vision_encoder",
        ),
      ];

  const blockNodes: SemanticNode[] = [
    safeNode(
      "blk-in",
      "split",
      "Block Input",
      [{ claimPath: "facts.hidden_size", label: `d=${commas(facts.hidden_size)}` }],
      [{ name: "in", side: "top" }, { name: "out", side: "bottom" }, { name: "skip", side: "left" }],
      "facts.hidden_size",
    ),
    {
      id: "blk-norm1",
      kind: "norm",
      label: "Pre-Attn Norm",
      detail: isMarkerMode ? "LayerNorm" : "RMSNorm",
      ports: [{ name: "in", side: "top" }, { name: "out", side: "bottom" }],
    },
    safeNode(
      "blk-attn",
      "attention",
      isMarkerMode ? "Bidirectional Attn" : "Hybrid Backbone",
      [
        { claimPath: "topology.attention_groups[0]", label: compactAttnSummary },
        ...(facts.num_attention_heads ? [{ claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads} Q` }] : []),
      ],
      [{ name: "in", side: "top" }, { name: "out", side: "bottom" }, { name: "mod", side: "left" }],
      "topology.attention_groups[0]",
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
    {
      id: "blk-norm2",
      kind: "norm",
      label: "Pre-FFN Norm",
      detail: isMarkerMode ? "LayerNorm" : "RMSNorm",
      ports: [{ name: "in", side: "top" }, { name: "out", side: "bottom" }],
    },
    safeNode(
      "blk-ffn",
      "ffn",
      ffnLabel,
      [{ label: "gated MLP" }],
      [{ name: "in", side: "top" }, { name: "out", side: "bottom" }],
      "topology.ffn_groups[0]",
    ),
    {
      id: "blk-add2",
      kind: "merge",
      label: "⊕ Residual",
      detail: "h + ffn",
      ports: [{ name: "in", side: "top" }, { name: "out", side: "bottom" }, { name: "skip", side: "left" }],
    },
    safeNode("blk-mod", "attention", posLabel, [{ label: isMarkerMode ? "dual RoPE" : "pos enc" }], undefined, posClaim),
  ];

  const bottomSpineNodes: SemanticNode[] = isMarkerMode
    ? [
        safeNode(
          "dhead",
          "decision",
          "Decision Head",
          dh.head_layers ? [{ claimPath: "topology.decision_head.head_layers", label: `${dh.head_layers}L Transformer` }] : [{ label: "cross-opt head" }],
          [{ name: "in", side: "top" }, { name: "out", side: "bottom" }],
          "topology.decision_head.readout_mode",
        ),
        safeNode(
          "cal",
          "calibration",
          "Calibrated Scorer",
          [{ label: "[MASK] -> T_q Softmax" }],
          [{ name: "in", side: "top" }, { name: "out", side: "bottom" }],
          "topology.decision_head.calibration",
        ),
        safeNode("out", "output", "Typed JSON", [{ label: "probs + act/abstain" }], [{ name: "in", side: "top" }, { name: "scale", side: "bottom" }], "topology.paradigm"),
      ]
    : [
        safeNode(
          "prefill",
          "readout",
          "Single-Pass Prefill",
          [{ label: "1 step · no decode" }],
          [{ name: "in", side: "top" }, { name: "out", side: "bottom" }],
          "topology.paradigm",
        ),
        safeNode(
          "cal",
          "calibration",
          "Letter Logits + T",
          dh.max_options ? [{ claimPath: "topology.decision_head.max_options", label: `A-Z/a-z · <=${dh.max_options}` }] : [{ label: "logit slice" }],
          [{ name: "in", side: "top" }, { name: "out", side: "bottom" }],
          "topology.decision_head.calibration",
        ),
        safeNode("out", "output", "Typed JSON", [{ label: "calibrated probs" }], [{ name: "in", side: "top" }, { name: "scale", side: "bottom" }], "topology.paradigm"),
      ];

  const nodes: SemanticNode[] = [...topSpineNodes, ...blockNodes, ...bottomSpineNodes];

  // 2. Schedule column (shows repeating backbone pattern + decision head / vision stage)
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

  if (isMarkerMode) {
    scheduleIds.push("sched-dhead");
    nodes.push(
      safeNode(
        "sched-dhead",
        "schedule-decision",
        "+ Decision Head",
        dh.head_layers ? [{ claimPath: "topology.decision_head.head_layers", label: `${dh.head_layers}L head + scorer` }] : [{ label: "head + scorer" }],
        undefined,
        "topology.decision_head.head_layers",
      ),
    );
  } else if (dh.vision_encoder) {
    scheduleIds.push("sched-vision");
    nodes.push(
      safeNode(
        "sched-vision",
        "schedule-decision",
        "+ Vision Tower",
        [{ label: "27L vision · 1152d" }],
        undefined,
        "topology.decision_head.vision_encoder",
      ),
    );
  }

  // 3. Lens 1 (g-readout): Decision Readout Pipeline (row 0) + Backbone Attention Mix (row 1)
  const readoutPipelineIds: string[] = [];
  if (isMarkerMode) {
    nodes.push(
      safeNode("r-pack", "decision", "Prompt + [MASK] Pack", [{ label: "[CLS] q [MASK] opts" }], undefined, "topology.decision_head.readout_mode"),
      safeNode("r-gather", "readout", "[MASK] Gather & MLP", [{ label: "LN -> Linear -> GELU" }], undefined, "topology.decision_head.readout_mode"),
      safeNode("r-act", "action", "Abstain Act Head", [{ label: "[CLS]+H -> act/esc" }], undefined, "topology.decision_head.action_head"),
    );
    readoutPipelineIds.push("r-pack", "r-gather", "r-act");
  } else {
    nodes.push(
      safeNode("r-prefix", "cache", "Shared Prefix KV", [{ label: "page_first + block" }], undefined, "topology.decision_head.prefix_cache"),
      safeNode(
        "r-slice",
        "readout",
        "Pos-0 Logit Readout",
        dh.max_options ? [{ claimPath: "topology.decision_head.max_options", label: `<= ${dh.max_options} letters` }] : [{ label: "first-token slice" }],
        undefined,
        "topology.decision_head.readout_mode",
      ),
      safeNode("r-scale", "calibration", "Temp Scaling", [{ label: "T_choice=0.85 · T_noul=1.83" }], undefined, "topology.decision_head.calibration"),
    );
    readoutPipelineIds.push("r-prefix", "r-slice", "r-scale");
  }

  const g0 = attnGroups[0]!;
  const g1 = attnGroups[1];
  nodes.push(
    safeNode(
      "a-g0",
      g0.kind === "linear_attention" ? "state" : "attention",
      g0.label,
      [
        { label: `${g0.layers.length}L` },
        { claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads} Q` },
        ...(facts.num_key_value_heads ? [{ claimPath: "facts.num_key_value_heads", label: `${facts.num_key_value_heads} KV` }] : []),
        ...(facts.head_dim ? [{ claimPath: "facts.head_dim", label: `d=${facts.head_dim}` }] : []),
      ],
      undefined,
      "topology.attention_groups[0]",
    ),
    ...(g1
      ? [safeNode("a-g1", g1.kind === "sliding_window" ? "state" : "attention", g1.label, [{ label: `${g1.layers.length} layers` }], undefined, "topology.attention_groups[1]")]
      : []),
  );
  const readoutRows: Array<Array<string | null>> = [
    readoutPipelineIds,
    ["a-g0", g1 ? "a-g1" : null, null],
  ];
  const readoutMemberIds = [...readoutPipelineIds, "a-g0", ...(g1 ? ["a-g1"] : [])];

  // 4. Lens 2 (g-ffn): Expanded Gated FFN Diamond (hidden dim linear + gating branches)
  nodes.push(
    safeNode(
      "ffn-gate",
      "ffn",
      "Gate Proj",
      [{ claimPath: "facts.hidden_size", label: `from d=${commas(facts.hidden_size)}` }],
      undefined,
      "facts.hidden_size",
    ),
    { id: "ffn-act", kind: "ffn", label: isGelu ? "GELU Act" : "SiLU Act", detail: isGelu ? "GELU(gate)" : "σ(gate)" },
    { id: "ffn-mul", kind: "merge", label: "⊗ Multiply", detail: "act ⊙ up", ports: [{ name: "up", side: "bottom" }] },
    safeNode(
      "ffn-up",
      "ffn",
      "Up Proj",
      [{ claimPath: "facts.hidden_size", label: `d=${commas(facts.hidden_size)} linear` }],
      undefined,
      "facts.hidden_size",
    ),
    safeNode("ffn-down", "ffn", "Down Proj", [{ claimPath: "facts.hidden_size", label: `to d=${commas(facts.hidden_size)}` }], undefined, "facts.hidden_size"),
  );
  const ffnRows: Array<Array<string | null>> = [
    ["ffn-gate", "ffn-act", "ffn-mul", "ffn-down"],
    [null, "ffn-up", null, null],
  ];
  const ffnLensIds = ["ffn-gate", "ffn-act", "ffn-mul", "ffn-up", "ffn-down"];
  const ffnEdges: DiagramScene["edges"] = [
    { id: "e-ffn-1", from: "ffn-gate", to: "ffn-act", kind: "flow" },
    { id: "e-ffn-2", from: "ffn-act", to: "ffn-mul", kind: "flow" },
    { id: "e-ffn-up", from: "ffn-up", to: "ffn-mul.up", kind: "flow" },
    { id: "e-ffn-down", from: "ffn-mul", to: "ffn-down", kind: "flow" },
  ];

  // 5. Lens 3 (g-cal): Calibration Objective & Footprint
  nodes.push(
    safeNode(
      "c-obj",
      "calibration",
      isMarkerMode ? "RLCD Scoring" : "Calibration",
      [{ label: isMarkerMode ? "Log + 0.5·Sph - RPS" : "Fixed T + shuffle inv." }],
      undefined,
      "topology.decision_head.calibration",
    ),
    safeNode(
      "c-scale",
      "annotation",
      "Model Scale",
      [
        ...(facts.total_params ? [{ claimPath: "facts.total_params", label: `${paramsLabel(facts.total_params)} dense` }] : []),
        ...(facts.context_tokens ? [{ claimPath: "facts.context_tokens", label: contextLabel(facts.context_tokens) }] : []),
      ],
      undefined,
      "facts.total_params",
    ),
  );
  const calIds = ["c-obj", "c-scale"];

  // Edges
  const bottomMidId = bottomSpineNodes[0]!.id;
  const edges: DiagramScene["edges"] = [
    { id: "e-spine-0", from: "input", to: "embed", kind: "flow" },
    { id: "e-spine-in-blk", from: "embed", to: "g-block.in", kind: "flow", claimPath: "facts.num_hidden_layers" },
    { id: "e-blk-0", from: "blk-in", to: "blk-norm1", kind: "flow" },
    { id: "e-blk-1", from: "blk-norm1", to: "blk-attn", kind: "flow" },
    { id: "e-blk-mod", from: "blk-mod", to: "blk-attn.mod", kind: "control", claimPath: posClaim },
    { id: "e-blk-2", from: "blk-attn", to: "blk-add1", kind: "flow", claimPath: "topology.attention_groups[0]" },
    { id: "e-blk-skip1", from: "blk-in.skip", to: "blk-add1.skip", kind: "skip" },
    { id: "e-blk-3", from: "blk-add1", to: "blk-fork2", kind: "flow" },
    { id: "e-blk-4", from: "blk-fork2", to: "blk-norm2", kind: "flow" },
    { id: "e-blk-5", from: "blk-norm2", to: "blk-ffn", kind: "flow" },
    { id: "e-blk-6", from: "blk-ffn", to: "blk-add2", kind: "flow" },
    { id: "e-blk-skip2", from: "blk-fork2.skip", to: "blk-add2.skip", kind: "skip" },
    { id: "e-blk-out", from: "g-block.out", to: bottomMidId, kind: "flow" },
    { id: "e-bot-0", from: bottomMidId, to: "cal", kind: "flow", claimPath: "topology.decision_head.calibration" },
    { id: "e-bot-1", from: "cal", to: "out", kind: "flow", claimPath: "topology.paradigm" },
    { id: "c-readout", from: "g-block.attn", to: "g-readout.in", kind: "control", claimPath: "topology.decision_head.readout_mode" },
    { id: "c-ffn", from: "g-block.ffn", to: "g-ffn.in", kind: "control" },
    { id: "c-sched", from: "g-block.sched", to: "g-schedule.in", kind: "control", claimPath: "facts.num_hidden_layers" },
    { id: "c-scale", from: "out.scale", to: "g-cal.in", kind: "control", claimPath: "topology.decision_head.calibration" },
    { id: "e-read-1", from: readoutPipelineIds[0]!, to: readoutPipelineIds[1]!, kind: "flow", claimPath: "topology.decision_head.readout_mode" },
    {
      id: "e-read-2",
      from: readoutPipelineIds[1]!,
      to: readoutPipelineIds[2]!,
      kind: isMarkerMode ? "control" : "flow",
      claimPath: isMarkerMode ? "topology.decision_head.action_head" : "topology.decision_head.calibration",
    },
    ...ffnEdges,
  ];

  const groups: SemanticGroup[] = [
    {
      id: "g-block",
      label: `${isMarkerMode ? "Encoder Block" : "Hybrid Block"} · ${facts.num_hidden_layers} layers`,
      kind: "inset",
      repeat: { count: facts.num_hidden_layers, label: `${facts.num_hidden_layers} ×` },
      members: blockNodes.map((n) => n.id),
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
      id: "g-readout",
      label: isMarkerMode ? `Marker Readout · ${attnSummary}` : `Prefix Readout · ${attnSummary}`,
      kind: "inset",
      members: readoutMemberIds,
      ports: [{ id: "in", side: "left", inner: readoutPipelineIds[0]! }],
      claimPath: "topology.decision_head.readout_mode",
    },
    {
      id: "g-ffn",
      label: `FFN Zoom · ${ffnLabel}`,
      kind: "inset",
      members: ffnLensIds,
      ports: [{ id: "in", side: "left", inner: ffnLensIds[0]! }],
      claimPath: "topology.attention_groups[0]",
    },
    {
      id: "g-schedule",
      label: `Backbone Schedule · ${facts.num_hidden_layers}L`,
      kind: "inset",
      members: scheduleIds,
      ports: [{ id: "in", side: "left", inner: scheduleIds[0]! }],
      claimPath: "facts.num_hidden_layers",
    },
    {
      id: "g-cal",
      label: "Calibration & Scale",
      kind: "inset",
      members: calIds,
      ports: [{ id: "in", side: "bottom", inner: calIds[calIds.length - 1]! }],
      claimPath: "topology.decision_head.calibration",
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
    { groupId: "g-readout", rows: readoutRows },
    { groupId: "g-ffn", rows: ffnRows },
  ];

  const blueprint = buildSpinePosterBlueprint({
    id: `system-one-${arch.model.id}`,
    scene,
    topSpine: ["input", "embed"],
    bottomSpine: [bottomMidId, "cal", "out"],
    blockGroupId: "g-block",
    blockSpine: ["blk-in", "blk-norm1", "blk-attn", "blk-add1", "blk-fork2", "blk-norm2", "blk-ffn", "blk-add2"],
    blockModifierId: "blk-mod",
    blockSkips: [
      { edgeId: "e-blk-skip1", fromId: "blk-in", toId: "blk-add1" },
      { edgeId: "e-blk-skip2", fromId: "blk-fork2", toId: "blk-add2" },
    ],
    lenses,
    scheduleGroup: { groupId: "g-schedule", cols: 2, nodeIds: scheduleIds },
    scaleGroup: { groupId: "g-cal", rows: calIds.map((id) => [id]) },
    callouts: [
      { edgeId: "c-readout", sourceGroupPort: "attn", targetGroupId: "g-readout", targetPort: "in", corridorX: 460 },
      { edgeId: "c-ffn", sourceGroupPort: "ffn", targetGroupId: "g-ffn", targetPort: "in", corridorX: 473 },
      { edgeId: "c-sched", sourceGroupPort: "sched", targetGroupId: "g-schedule", targetPort: "in", corridorX: 486 },
    ],
    scaleCallout: { edgeId: "c-scale", sourceNodeId: "out", sourcePort: "scale" },
  });

  return { scene, blueprint };
}
