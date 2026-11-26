import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import type { EditorialPosterBlueprint } from "./poster.js";
import { buildPosterGridBlueprint, type LensSpec } from "./poster-grid.js";
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
 * decision models. Adapts cleanly across readout modes:
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
  const primitivesText = dh.primitives?.length ? dh.primitives.join(" · ") : "choice · score · noul";

  // 1. Main Spine (Zero-decode single-pass forward flow)
  const nodes: SemanticNode[] = isMarkerMode
    ? [
        safeNode("input", "io", "State + Typed Q", [{ claimPath: "topology.decision_head.primitives", label: primitivesText }], undefined, "topology.paradigm"),
        safeNode("embed", "embedding", "Token + Type Emb", [
          { claimPath: "facts.hidden_size", label: `hidden ${commas(facts.hidden_size)}` },
        ]),
        safeNode(
          "backbone",
          "stack",
          "Bidirectional Encoder",
          [
            { claimPath: "facts.num_hidden_layers", label: `${facts.num_hidden_layers} layers` },
            { label: "full + sliding" },
          ],
          [
            { name: "sched", side: "bottom" },
            { name: "cal", side: "bottom" },
            { name: "attn", side: "bottom" },
            { name: "readout", side: "bottom" },
          ],
        ),
        safeNode(
          "dhead",
          "decision",
          "Decision Head",
          dh.head_layers ? [{ claimPath: "topology.decision_head.head_layers", label: `${dh.head_layers}L Transformer` }] : [{ label: "cross-opt head" }],
          undefined,
          "topology.decision_head.readout_mode",
        ),
        safeNode("cal", "calibration", "Calibrated Scorer", [{ label: "[MASK] -> T_q Softmax" }], undefined, "topology.decision_head.calibration"),
        safeNode("out", "output", "Typed JSON", [{ label: "probs + act/abstain" }], undefined, "topology.paradigm"),
      ]
    : [
        safeNode("input", "io", "State + Image + Q", [{ claimPath: "topology.decision_head.primitives", label: primitivesText }], undefined, "topology.paradigm"),
        safeNode(
          "embed",
          dh.vision_encoder ? "vision" : "embedding",
          dh.vision_encoder ? "Embed + Vision" : "Token Embed",
          [
            { claimPath: "facts.hidden_size", label: `hidden ${commas(facts.hidden_size)}` },
          ],
          undefined,
          "topology.decision_head.vision_encoder",
        ),
        safeNode(
          "backbone",
          "stack",
          "Hybrid Backbone",
          [
            { claimPath: "facts.num_hidden_layers", label: `${facts.num_hidden_layers} layers` },
            { label: "3:1 GDN + GQA" },
          ],
          [
            { name: "sched", side: "bottom" },
            { name: "cal", side: "bottom" },
            { name: "attn", side: "bottom" },
            { name: "readout", side: "bottom" },
          ],
        ),
        safeNode("prefill", "readout", "Single-Pass Prefill", [{ label: "1 step · no decode" }], undefined, "topology.paradigm"),
        safeNode(
          "cal",
          "calibration",
          "Letter Logits + T",
          dh.max_options ? [{ claimPath: "topology.decision_head.max_options", label: `A-Z/a-z · <=${dh.max_options}` }] : [{ label: "logit slice" }],
          undefined,
          "topology.decision_head.calibration",
        ),
        safeNode("out", "output", "Typed JSON", [{ label: "calibrated probs" }], undefined, "topology.paradigm"),
      ];

  const spineIds = nodes.map((n) => n.id);

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
        dh.head_layers ? [{ claimPath: "topology.decision_head.head_layers", label: `${dh.head_layers}L head + scorer + act` }] : [{ label: "head + scorer" }],
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
        [{ label: "27L vision encoder · 1152d" }],
        undefined,
        "topology.decision_head.vision_encoder",
      ),
    );
  }

  // 3. Lens A: Decision Readout Anatomy
  const readoutIds: string[] = [];
  if (isMarkerMode) {
    nodes.push(
      safeNode("r-pack", "decision", "Prompt + [MASK] Pack", [{ label: "[CLS] q [MASK] opts [SEP] state" }], undefined, "topology.decision_head.readout_mode"),
      safeNode("r-gather", "readout", "[MASK] Gather & MLP", [{ label: "LN -> Linear -> GELU -> 1" }], undefined, "topology.decision_head.readout_mode"),
      safeNode("r-act", "action", "Abstain Act Head", [{ label: "[CLS]+entropy -> act/escalate" }], undefined, "topology.decision_head.action_head"),
    );
    readoutIds.push("r-pack", "r-gather", "r-act");
  } else {
    nodes.push(
      safeNode("r-prefix", "cache", "Shared Prefix KV", [{ label: "page_first + block pad" }], undefined, "topology.decision_head.prefix_cache"),
      safeNode(
        "r-slice",
        "readout",
        "Pos-0 Logit Readout",
        dh.max_options ? [{ claimPath: "topology.decision_head.max_options", label: `<= ${dh.max_options} letters / chunk` }] : [{ label: "first-token slice" }],
        undefined,
        "topology.decision_head.readout_mode",
      ),
      safeNode("r-scale", "calibration", "Temp Scaling", [{ label: "T_choice=0.85 · T_noul=1.83" }], undefined, "topology.decision_head.calibration"),
    );
    readoutIds.push("r-prefix", "r-slice", "r-scale");
  }

  // 4. Lens B: Backbone Attention & FFN Mix
  const attnIds: string[] = [];
  const g0 = attnGroups[0]!;
  const g1 = attnGroups[1];
  nodes.push(
    safeNode("a-g0", g0.kind === "linear_attention" ? "state" : "attention", g0.label, [{ label: `${g0.layers.length} layers` }], undefined, "topology.attention_groups[0]"),
    ...(g1
      ? [safeNode("a-g1", g1.kind === "sliding_window" ? "state" : "attention", g1.label, [{ label: `${g1.layers.length} layers` }], undefined, "topology.attention_groups[1]")]
      : []),
    safeNode(
      "a-ffn",
      "ffn",
      topology.ffn_groups[0]?.label ?? "Dense FFN",
      [
        { claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads} Q` },
        ...(facts.num_key_value_heads ? [{ claimPath: "facts.num_key_value_heads", label: `${facts.num_key_value_heads} KV` }] : []),
        ...(facts.head_dim ? [{ claimPath: "facts.head_dim", label: `d=${facts.head_dim}` }] : []),
      ],
      undefined,
      "facts.num_attention_heads",
    ),
  );
  attnIds.push("a-g0", ...(g1 ? ["a-g1"] : []), "a-ffn");

  // 5. Lens C: Calibration Objective & Footprint
  const calIds: string[] = [];
  nodes.push(
    safeNode(
      "c-obj",
      "calibration",
      isMarkerMode ? "RLCD Proper Scoring" : "Calibration & Shuffle",
      [{ label: isMarkerMode ? "Log + 0.5·Sph - RPS" : "Fixed temp + order invariance" }],
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
  calIds.push("c-obj", "c-scale");

  // Edges
  const edges: DiagramScene["edges"] = [];
  for (let i = 0; i < spineIds.length - 1; i++) {
    edges.push({ id: `e-spine-${i}`, from: spineIds[i]!, to: spineIds[i + 1]!, kind: "flow" });
  }
  edges.push(
    { id: "c-sched", from: "backbone.sched", to: "g-schedule.in", kind: "control", claimPath: "facts.num_hidden_layers" },
    { id: "c-readout", from: "backbone.readout", to: "g-readout.in", kind: "control", claimPath: "topology.decision_head.readout_mode" },
    { id: "c-attn", from: "backbone.attn", to: "g-attn.in", kind: "control", claimPath: "topology.attention_groups[0]" },
    { id: "c-cal", from: "backbone.cal", to: "g-cal.in", kind: "control", claimPath: "topology.decision_head.calibration" },
    { id: "e-read-1", from: readoutIds[0]!, to: readoutIds[1]!, kind: "flow", claimPath: "topology.decision_head.readout_mode" },
    { id: "e-read-2", from: readoutIds[1]!, to: readoutIds[2]!, kind: isMarkerMode ? "control" : "flow", claimPath: isMarkerMode ? "topology.decision_head.action_head" : "topology.decision_head.calibration" },
  );

  const groups: SemanticGroup[] = [
    {
      id: "g-schedule",
      label: `Backbone Schedule · ${facts.num_hidden_layers}L`,
      kind: "inset",
      members: scheduleIds,
      ports: [{ id: "in", side: "right", inner: scheduleIds[0]! }],
      claimPath: "facts.num_hidden_layers",
    },
    {
      id: "g-readout",
      label: isMarkerMode ? "System-1 Marker & Act Readout" : "System-1 Prefix & Letter Readout",
      kind: "inset",
      members: readoutIds,
      ports: [{ id: "in", side: "left", inner: readoutIds[0]! }],
      claimPath: "topology.decision_head.readout_mode",
    },
    {
      id: "g-attn",
      label: `Backbone Mix · ${attnSummary}`,
      kind: "inset",
      members: attnIds,
      ports: [{ id: "in", side: "left", inner: attnIds[0]! }],
      claimPath: "topology.attention_groups[0]",
    },
    {
      id: "g-cal",
      label: "Calibration & Scale",
      kind: "inset",
      members: calIds,
      ports: [{ id: "in", side: "right", inner: calIds[0]! }],
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
    { groupId: "g-readout", rows: [readoutIds] },
    { groupId: "g-attn", rows: [attnIds] },
  ];

  const blueprint = buildPosterGridBlueprint({
    id: `system-one-${arch.model.id}`,
    scene,
    spine: spineIds,
    scheduleGroupId: "g-schedule",
    scheduleNodes: scheduleIds,
    leftBottomGroup: { groupId: "g-cal", rows: calIds.map((id) => [id]) },
    lenses,
    callouts: [
      { edgeId: "c-sched", sourceNodeId: "backbone", sourcePort: "sched", targetGroupId: "g-schedule", targetPort: "in", busY: 148, corridorX: 446 },
      { edgeId: "c-cal", sourceNodeId: "backbone", sourcePort: "cal", targetGroupId: "g-cal", targetPort: "in", busY: 160, corridorX: 456 },
      { edgeId: "c-attn", sourceNodeId: "backbone", sourcePort: "attn", targetGroupId: "g-attn", targetPort: "in", busY: 172, corridorX: 468 },
      { edgeId: "c-readout", sourceNodeId: "backbone", sourcePort: "readout", targetGroupId: "g-readout", targetPort: "in", busY: 184, corridorX: 478 },
    ],
  });

  return { scene, blueprint };
}
