import type { EvidenceFile, LayerGroup, ModelDocument } from "@atlas/architecture-ir";
import { composeEditorialPoster, type EditorialPosterBlueprint, type PosterBox } from "./poster.js";
import type { Point, PositionedScene } from "./positioned.js";
import { resolveSidePorts } from "./ports.js";
import { measureText } from "./text.js";
import type { DiagramScene, EvidenceAnnotation, SemanticEdge, SemanticGroup, SemanticNode } from "./types.js";
import { diagramTypography } from "./typography.js";

export type SubviewKind = "block" | "attention" | "ffn" | "residual" | "decision";

export interface CompiledSubview {
  key: string;
  kind: SubviewKind;
  title: string;
  subtitle: string;
  scene: DiagramScene;
  positioned: PositionedScene;
}

type AnnStatus = NonNullable<EvidenceAnnotation["status"]>;

function commas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

interface SubGroupLayout {
  groupId: string;
  rows: Array<Array<string | null>>;
  /** Y band [y, h] inside CANVAS_W x CANVAS_H */
  bandY: number;
  bandH: number;
}

const SUB_W = 1160;
const SUB_H = 656;
const SUB_PAD_X = 28;

function reqWidth(node: SemanticNode, minW = 108): number {
  const typo = diagramTypography("editorial-poster");
  const labelW = measureText(node.label, typo.nodeLabel, true) * 1.15;
  const detailW = node.detail ? measureText(node.detail, typo.nodeDetail, false) * 1.15 : 0;
  return Math.max(minW, Math.ceil(Math.max(labelW, detailW) + 34));
}

function distPort(box: PosterBox, side: "left" | "right" | "top" | "bottom", idx: number, count: number): Point {
  const f = (idx + 1) / (count + 1);
  if (side === "left") return { x: box.x, y: box.y + box.h * f };
  if (side === "right") return { x: box.x + box.w, y: box.y + box.h * f };
  if (side === "top") return { x: box.x + box.w * f, y: box.y };
  return { x: box.x + box.w * f, y: box.y + box.h };
}

function nodePort(node: SemanticNode, box: PosterBox, portName: string): { point: Point; side: "left" | "right" | "top" | "bottom" } {
  const defs = resolveSidePorts(node);
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const onSide = defs.filter((p) => p.side === side);
    const idx = onSide.findIndex((p) => p.name === portName);
    if (idx >= 0) return { point: distPort(box, side, idx, onSide.length), side };
  }
  return { point: { x: box.x + box.w / 2, y: box.y + box.h }, side: "bottom" };
}

function composeSubviewGrid(id: string, scene: DiagramScene, bands: SubGroupLayout[]): PositionedScene {
  const nodeMap = new Map(scene.nodes.map((n) => [n.id, n] as const));
  const groupMap = new Map(scene.groups.map((g) => [g.id, g] as const));
  const nodes: PosterBox[] = [];
  const groups: PosterBox[] = [];
  const boxById = new Map<string, PosterBox>();
  const groupBoxById = new Map<string, PosterBox>();

  const gw = SUB_W - SUB_PAD_X * 2;
  for (const band of bands) {
    const gBox: PosterBox = { id: band.groupId, x: SUB_PAD_X, y: band.bandY, w: gw, h: band.bandH };
    groups.push(gBox);
    groupBoxById.set(band.groupId, gBox);

    const padTop = 36;
    const padSide = band.rows[0]!.length >= 5 ? 16 : 22;
    const padBottom = band.rows.length > 1 ? 22 : 20;
    const innerH = band.bandH - padTop - padBottom;
    const rowCount = band.rows.length;
    const rowGap = 14;
    const nodeH = Math.max(46, Math.min(72, Math.floor((innerH - rowGap * (rowCount - 1)) / rowCount)));
    const totalRowsH = rowCount * nodeH + (rowCount - 1) * rowGap;
    const firstY = band.bandY + padTop + Math.max(0, Math.floor((innerH - totalRowsH) / 2));

    const maxCols = Math.max(...band.rows.map((r) => r.length));
    const colGap = maxCols >= 5 ? 14 : 24;
    const availW = gw - padSide * 2 - colGap * (maxCols - 1);
    const colMin = Array.from({ length: maxCols }, (_, ci) => {
      let m = 104;
      for (const row of band.rows) {
        const nid = row[ci];
        if (nid) m = Math.max(m, reqWidth(nodeMap.get(nid)!, 104));
      }
      return m;
    });
    const minSum = colMin.reduce((a, b) => a + b, 0);
    const bonus = Math.floor(Math.max(0, availW - minSum) / maxCols);
    const colW = colMin.map((w, ci) =>
      ci === maxCols - 1 ? Math.max(w, availW - colMin.slice(0, -1).reduce((a, b) => a + b + bonus, 0)) : w + bonus,
    );
    const colX: number[] = [];
    let cx = SUB_PAD_X + padSide;
    for (let ci = 0; ci < maxCols; ci++) {
      colX.push(cx);
      cx += colW[ci]! + colGap;
    }

    band.rows.forEach((rowIds, ri) => {
      const ny = firstY + ri * (nodeH + rowGap);
      const hasNull = rowIds.some((r) => r === null);
      if (!hasNull && rowIds.length !== maxCols) {
        const rGap = rowIds.length >= 5 ? 16 : 24;
        const rAvail = gw - padSide * 2 - rGap * (rowIds.length - 1);
        const rMins = rowIds.map((nid) => reqWidth(nodeMap.get(nid!)!, 104));
        const rBonus = Math.floor(Math.max(0, rAvail - rMins.reduce((a, b) => a + b, 0)) / rowIds.length);
        let rx = SUB_PAD_X + padSide;
        rowIds.forEach((nid, ci) => {
          const w = ci === rowIds.length - 1 ? SUB_PAD_X + gw - padSide - rx : rMins[ci]! + rBonus;
          const b: PosterBox = { id: nid!, x: rx, y: ny, w, h: nodeH };
          nodes.push(b);
          boxById.set(nid!, b);
          rx += w + rGap;
        });
      } else {
        rowIds.forEach((nid, ci) => {
          if (!nid) return;
          const b: PosterBox = { id: nid, x: colX[ci]!, y: ny, w: colW[ci]!, h: nodeH };
          nodes.push(b);
          boxById.set(nid, b);
        });
      }
    });
  }

  const edgeRoutes: Record<string, Point[]> = {};
  const resolveEnd = (ref: string, outgoing: boolean): { point: Point; side: "left" | "right" | "top" | "bottom" } | null => {
    const dot = ref.indexOf(".");
    const head = dot === -1 ? ref : ref.slice(0, dot);
    const port = dot === -1 ? undefined : ref.slice(dot + 1);
    const nNode = nodeMap.get(head);
    const nBox = boxById.get(head);
    if (nNode && nBox) {
      if (!port || port === "in" || port === "out") {
        const side = outgoing ? "right" : "left";
        return {
          point: side === "right" ? { x: nBox.x + nBox.w, y: nBox.y + nBox.h / 2 } : { x: nBox.x, y: nBox.y + nBox.h / 2 },
          side,
        };
      }
      return nodePort(nNode, nBox, port);
    }
    const g = groupMap.get(head);
    const gBox = groupBoxById.get(head);
    if (g && gBox && port) {
      const def = (g.ports ?? []).find((p) => p.id === port);
      if (def) {
        const allSide = (g.ports ?? []).filter((p) => p.side === def.side);
        const idx = allSide.findIndex((p) => p.id === port);
        return { point: distPort(gBox, def.side, idx, allSide.length), side: def.side };
      }
    }
    return null;
  };

  const resolvedEnds = scene.edges.map((edge) => ({
    edge,
    from: resolveEnd(edge.from, true),
    to: resolveEnd(edge.to, false),
  }));

  // Stagger same-side bypass rails (e.g., inner MLA latent skip vs outer residual bridge)
  // by ascending span width so inner channels nest inside outer channels with zero overlap.
  const assignTracks = (matchSide: "bottom" | "top") => {
    const items = resolvedEnds
      .filter((r): r is { edge: SemanticEdge; from: { point: Point; side: typeof matchSide }; to: { point: Point; side: typeof matchSide } } =>
        Boolean(r.from && r.to && r.from.side === matchSide && r.to.side === matchSide),
      )
      .map((r) => ({
        id: r.edge.id,
        rowBucket: Math.round(Math.max(r.from.point.y, r.to.point.y) / 20),
        span: Math.abs(r.to.point.x - r.from.point.x),
      }));
    const trackMap = new Map<string, number>();
    const byBucket = new Map<number, typeof items>();
    for (const item of items) {
      const list = byBucket.get(item.rowBucket) ?? [];
      list.push(item);
      byBucket.set(item.rowBucket, list);
    }
    for (const list of byBucket.values()) {
      list.sort((a, b) => a.span - b.span);
      list.forEach((item, idx) => trackMap.set(item.id, idx));
    }
    return trackMap;
  };
  const bottomTracks = assignTracks("bottom");
  const topTracks = assignTracks("top");

  for (const { edge, from, to } of resolvedEnds) {
    if (!from || !to) continue;
    if ((from.side === "bottom" || from.side === "top") && (to.side === "left" || to.side === "right")) {
      edgeRoutes[edge.id] = [from.point, { x: from.point.x, y: to.point.y }, to.point];
    } else if ((from.side === "left" || from.side === "right") && (to.side === "top" || to.side === "bottom")) {
      edgeRoutes[edge.id] = [from.point, { x: to.point.x, y: from.point.y }, to.point];
    } else if (from.side === "bottom" && to.side === "bottom") {
      const track = bottomTracks.get(edge.id) ?? 0;
      const dy = Math.max(from.point.y, to.point.y) + 11 + track * 12;
      edgeRoutes[edge.id] = [from.point, { x: from.point.x, y: dy }, { x: to.point.x, y: dy }, to.point];
    } else if (from.side === "top" && to.side === "top") {
      const track = topTracks.get(edge.id) ?? 0;
      const ry = Math.min(from.point.y, to.point.y) - 11 - track * 12;
      edgeRoutes[edge.id] = [from.point, { x: from.point.x, y: ry }, { x: to.point.x, y: ry }, to.point];
    } else if (from.side === "bottom" && to.side === "top") {
      const midY = Math.round((from.point.y + to.point.y) / 2);
      edgeRoutes[edge.id] = [from.point, { x: from.point.x, y: midY }, { x: to.point.x, y: midY }, to.point];
    }
  }

  const blueprint: EditorialPosterBlueprint = {
    id,
    size: { w: SUB_W, h: SUB_H },
    nodes,
    groups,
    edges: scene.edges.map((e) => e.id),
    edgeRoutes,
  };
  return composeEditorialPoster(scene, blueprint);
}

interface HelperCtx {
  safeNode: (
    id: string,
    kind: string,
    label: string,
    segments: Array<{ claimPath?: string; label: string }>,
    ports?: SemanticNode["ports"],
    fallbackClaimPath?: string,
  ) => SemanticNode;
  hasClaim: (p: string) => boolean;
  statusOf: Map<string, AnnStatus>;
}

function makeCtx(evidence: EvidenceFile): HelperCtx {
  const claimMap = new Map(evidence.claims.map((c) => [c.path, c] as const));
  const hasClaim = (p: string) => claimMap.has(p);
  const statusOf = new Map<string, AnnStatus>(evidence.claims.map((c) => [c.path, c.status] as const));
  const safeNode: HelperCtx["safeNode"] = (id, kind, label, segments, ports, fallbackClaimPath) => {
    const validClaims = segments.filter((s) => s.claimPath && hasClaim(s.claimPath)) as Array<{
      claimPath: string;
      label: string;
    }>;
    const detail = segments.map((s) => s.label).join(" · ");
    const claimPath =
      validClaims[0]?.claimPath ?? (fallbackClaimPath && hasClaim(fallbackClaimPath) ? fallbackClaimPath : undefined);
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
  return { safeNode, hasClaim, statusOf };
}

function appendAnnotations(scene: DiagramScene, ctx: HelperCtx): DiagramScene {
  for (const n of scene.nodes) {
    const refs = n.claims ?? (n.claimPath ? [{ claimPath: n.claimPath, label: n.label }] : []);
    for (const ref of refs) {
      if (!ctx.hasClaim(ref.claimPath)) continue;
      scene.annotations.push({ claimPath: ref.claimPath, target: n.id, status: ctx.statusOf.get(ref.claimPath) });
    }
  }
  for (const e of scene.edges) {
    if (e.claimPath && ctx.hasClaim(e.claimPath)) {
      scene.annotations.push({ claimPath: e.claimPath, target: e.id, status: ctx.statusOf.get(e.claimPath) });
    }
  }
  return scene;
}

function buildAttentionSubgraphNodes(
  prefix: string,
  grp: LayerGroup,
  grpIdx: number,
  arch: ModelDocument,
  ctx: HelperCtx,
  includeNormBypass = true,
): { row: string[]; nodes: SemanticNode[]; edges: SemanticEdge[] } {
  const claim = ctx.hasClaim(`topology.attention_groups[${grpIdx}]`)
    ? `topology.attention_groups[${grpIdx}]`
    : "facts.num_hidden_layers";
  const { facts, topology } = arch;
  const attnMeta = (topology as unknown as Record<string, unknown>).attention as Record<string, unknown> | undefined;
  const posClaim = ctx.hasClaim("topology.position_encoding.type") ? "topology.position_encoding.type" : claim;
  const isKda = grp.label.toLowerCase().includes("kda");

  const nodes: SemanticNode[] = [];
  const edges: SemanticEdge[] = [];
  const row: string[] = [];

  if (includeNormBypass) {
    nodes.push(
      ctx.safeNode(
        `${prefix}-in`,
        "norm",
        topology.residual?.scheme === "mhc" ? "Pre-Norm · H-pre" : "Input RMSNorm",
        topology.residual?.scheme === "mhc" ? [{ claimPath: "topology.residual.streams", label: `${topology.residual.streams} streams read` }] : [{ claimPath: "facts.hidden_size", label: `d=${commas(facts.hidden_size)}` }],
        [{ name: "res", side: "bottom" }],
        claim,
      ),
    );
    row.push(`${prefix}-in`);
  }

  let coreStart = "";
  let coreEnd = "";

  if (grp.kind === "linear_attention") {
    const kdaKernel = typeof attnMeta?.kda_short_conv_kernel === "number" ? attnMeta.kda_short_conv_kernel : null;
    nodes.push(
      ctx.safeNode(
        `${prefix}-qkv`,
        "state",
        isKda ? "Q/K/V ShortConv" : "Q/K/V + Conv",
        isKda && kdaKernel && ctx.hasClaim("topology.attention.kda_short_conv_kernel")
          ? [{ claimPath: "topology.attention.kda_short_conv_kernel", label: `kernel ${kdaKernel}` }]
          : [{ label: "short conv" }],
        undefined,
        claim,
      ),
      ctx.safeNode(
        `${prefix}-state`,
        "state",
        isKda ? "KDA Decay & State" : "DeltaNet State",
        [{ label: `${grp.layers.length} layers · constant mem` }],
        undefined,
        claim,
      ),
      ctx.safeNode(
        `${prefix}-gate`,
        "state",
        "Output Gate",
        [
          { claimPath: "facts.num_attention_heads", label: isKda ? `${facts.num_attention_heads}h` : `${facts.num_attention_heads} heads` },
          ...(isKda
            ? [{ claimPath: claim, label: "d=128 · o_norm" }]
            : facts.head_dim && ctx.hasClaim("facts.head_dim")
              ? [{ claimPath: "facts.head_dim", label: `d=${facts.head_dim}` }]
              : []),
        ],
        undefined,
        claim,
      ),
    );
    edges.push(
      { id: `e-${prefix}-1`, from: `${prefix}-qkv`, to: `${prefix}-state`, kind: "control", claimPath: claim },
      { id: `e-${prefix}-2`, from: `${prefix}-state`, to: `${prefix}-gate`, kind: "flow", claimPath: claim },
    );
    row.push(`${prefix}-qkv`, `${prefix}-state`, `${prefix}-gate`);
    coreStart = `${prefix}-qkv`;
    coreEnd = `${prefix}-gate`;
  } else if (grp.kind === "mla_sparse") {
    const idxHeads = typeof attnMeta?.dsa_indexer_heads === "number" ? attnMeta.dsa_indexer_heads : null;
    const topk = typeof attnMeta?.dsa_topk === "number" ? attnMeta.dsa_topk : null;
    const topkClaim = ctx.hasClaim("topology.attention.dsa_topk") ? "topology.attention.dsa_topk" : claim;
    nodes.push(
      ctx.safeNode(
        `${prefix}-idx`,
        "router",
        "Lightning Indexer",
        idxHeads && ctx.hasClaim("topology.attention.dsa_indexer_heads")
          ? [{ claimPath: "topology.attention.dsa_indexer_heads", label: `${idxHeads} heads` }]
          : [{ label: "sparse scorer" }],
        undefined,
        claim,
      ),
      ctx.safeNode(
        `${prefix}-topk`,
        "router",
        "Top-k Selector",
        topk && ctx.hasClaim("topology.attention.dsa_topk") ? [{ claimPath: "topology.attention.dsa_topk", label: `top-${topk}` }] : [{ label: "top-k KV" }],
        undefined,
        topkClaim,
      ),
      ctx.safeNode(`${prefix}-sel`, "state", "Selected KV", [{ label: "sublinear cache" }], undefined, topkClaim),
      ctx.safeNode(
        `${prefix}-mla`,
        "attention",
        "MLA Core",
        [{ claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads} Q heads` }],
        undefined,
        claim,
      ),
    );
    edges.push(
      { id: `e-${prefix}-1`, from: `${prefix}-idx`, to: `${prefix}-topk`, kind: "control", claimPath: claim },
      { id: `e-${prefix}-2`, from: `${prefix}-topk`, to: `${prefix}-sel`, kind: "flow", claimPath: topkClaim },
      { id: `e-${prefix}-3`, from: `${prefix}-sel`, to: `${prefix}-mla`, kind: "flow", claimPath: claim },
    );
    row.push(`${prefix}-idx`, `${prefix}-topk`, `${prefix}-sel`, `${prefix}-mla`);
    coreStart = `${prefix}-idx`;
    coreEnd = `${prefix}-mla`;
  } else if (grp.kind === "mla") {
    nodes.push(
      ctx.safeNode(`${prefix}-kv`, "attention", "Latent KV", [{ label: "compressed bottleneck" }], [{ name: "latent", side: "bottom" }], claim),
      ctx.safeNode(`${prefix}-rope`, "attention", "RoPE / NoPE", [{ claimPath: posClaim, label: "decoupled Q/K" }], undefined, posClaim),
      ctx.safeNode(
        `${prefix}-core`,
        "attention",
        grp.label,
        [{ claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads} Q heads` }],
        [{ name: "latent", side: "bottom" }],
        claim,
      ),
    );
    edges.push(
      { id: `e-${prefix}-1`, from: `${prefix}-kv`, to: `${prefix}-rope`, kind: "control", claimPath: claim },
      { id: `e-${prefix}-2`, from: `${prefix}-rope`, to: `${prefix}-core`, kind: "flow", claimPath: claim },
      { id: `e-${prefix}-latent`, from: `${prefix}-kv.latent`, to: `${prefix}-core.latent`, kind: "skip", claimPath: claim },
    );
    row.push(`${prefix}-kv`, `${prefix}-rope`, `${prefix}-core`);
    coreStart = `${prefix}-kv`;
    coreEnd = `${prefix}-core`;
  } else {
    const isSw = grp.kind === "sliding_window";
    nodes.push(
      ctx.safeNode(`${prefix}-qkv`, isSw ? "state" : "attention", "Q / K / V Proj", [{ claimPath: "facts.num_attention_heads", label: `${facts.num_attention_heads} Q heads` }], undefined, claim),
      ctx.safeNode(
        `${prefix}-kv`,
        isSw ? "state" : "attention",
        isSw ? "Sliding Window" : "KV Cache",
        facts.num_key_value_heads ? [{ claimPath: "facts.num_key_value_heads", label: `${facts.num_key_value_heads} KV` }] : [{ label: "grouped KV" }],
        undefined,
        claim,
      ),
      ctx.safeNode(`${prefix}-core`, isSw ? "state" : "attention", grp.label, [{ label: grp.module ?? `${grp.layers.length} layers` }], undefined, claim),
    );
    edges.push(
      { id: `e-${prefix}-1`, from: `${prefix}-qkv`, to: `${prefix}-kv`, kind: "flow", claimPath: claim },
      { id: `e-${prefix}-2`, from: `${prefix}-kv`, to: `${prefix}-core`, kind: "flow", claimPath: claim },
    );
    row.push(`${prefix}-qkv`, `${prefix}-kv`, `${prefix}-core`);
    coreStart = `${prefix}-qkv`;
    coreEnd = `${prefix}-core`;
  }

  if (includeNormBypass) {
    nodes.push(
      ctx.safeNode(
        `${prefix}-out`,
        topology.residual?.scheme === "mhc" ? "merge" : "merge",
        topology.residual?.scheme === "mhc" ? "⊕ 4-Stream Mix" : "⊕ Attn Residual",
        topology.residual?.scheme === "mhc" ? [{ label: "H-res + H-post add" }] : [{ label: "skip + attn" }],
        [{ name: "res", side: "bottom" }],
        claim,
      ),
    );
    row.push(`${prefix}-out`);
    edges.push(
      { id: `e-${prefix}-start`, from: `${prefix}-in`, to: coreStart, kind: "flow" },
      { id: `e-${prefix}-end`, from: coreEnd, to: `${prefix}-out`, kind: "flow" },
      { id: `e-${prefix}-res`, from: `${prefix}-in.res`, to: `${prefix}-out.res`, kind: "skip" },
    );
  }

  return { row, nodes, edges };
}

function buildFfnSubgraphNodes(
  prefix: string,
  ffnGrp: LayerGroup,
  ffnIdx: number,
  arch: ModelDocument,
  ctx: HelperCtx,
  isTailSystemOne: boolean,
): { rows: Array<Array<string | null>>; nodes: SemanticNode[]; edges: SemanticEdge[] } {
  const ffnClaim = ctx.hasClaim(`topology.ffn_groups[${ffnIdx}]`) ? `topology.ffn_groups[${ffnIdx}]` : "facts.hidden_size";
  const { facts, topology } = arch;
  const exp = topology.experts;
  const hasShared = Boolean(exp?.shared && exp.shared > 0);
  const nodes: SemanticNode[] = [];
  const edges: SemanticEdge[] = [];
  const rows: Array<Array<string | null>> = [];

  nodes.push(
    ctx.safeNode(
      `${prefix}-in`,
      "norm",
      topology.residual?.scheme === "mhc" ? "Post-Attn · H-pre" : "Post-Attn Norm",
      [{ label: "RMSNorm" }],
      hasShared && ffnGrp.kind === "moe" ? undefined : [{ name: "skip", side: "bottom" }],
      ffnClaim,
    ),
  );

  let tailConnectFrom = "";
  if (ffnGrp.kind === "moe" && exp?.routed_total) {
    nodes.push(
      {
        id: `${prefix}-router`,
        kind: "router",
        label: "Router",
        detail: `top-${exp.active_routed ?? "?"} gate`,
        claimPath: "topology.experts.active_routed",
        ports: [{ name: hasShared ? "shared" : "skip", side: "bottom" }],
      },
      ctx.safeNode(`${prefix}-routed`, "moe", "Routed Experts", [
        { claimPath: "topology.experts.routed_total", label: `${commas(exp.routed_total)} total` },
        ...(exp.active_routed ? [{ claimPath: "topology.experts.active_routed", label: `top-${exp.active_routed}` }] : []),
      ]),
      {
        id: `${prefix}-merge`,
        kind: "merge",
        label: "⊕ MoE Merge",
        detail: hasShared ? "routed + shared" : "routed + skip",
        claimPath: "topology.experts.routed_total",
        ports: [{ name: hasShared ? "shared" : "skip", side: "bottom" }],
      },
    );
    edges.push(
      { id: `e-${prefix}-in`, from: `${prefix}-in`, to: `${prefix}-router`, kind: "flow" },
      { id: `e-${prefix}-route`, from: `${prefix}-router`, to: `${prefix}-routed`, kind: "control", claimPath: "topology.experts.active_routed" },
      { id: `e-${prefix}-merge`, from: `${prefix}-routed`, to: `${prefix}-merge`, kind: "flow", claimPath: "topology.experts.routed_total" },
    );
    if (hasShared) {
      nodes.push(ctx.safeNode(`${prefix}-shared`, "moe", "Shared Expert", [{ claimPath: "topology.experts.shared", label: `${exp.shared} always-on` }]));
      edges.push(
        { id: `e-${prefix}-s1`, from: `${prefix}-router.shared`, to: `${prefix}-shared`, kind: "control", claimPath: "topology.experts.shared" },
        { id: `e-${prefix}-s2`, from: `${prefix}-shared`, to: `${prefix}-merge.shared`, kind: "flow", claimPath: "topology.experts.shared" },
      );
      if (isTailSystemOne && topology.decision_head) {
        nodes.push(
          ctx.safeNode(`${prefix}-dec`, "decision", "Decision Head", [{ claimPath: "topology.decision_head.readout_mode", label: topology.decision_head.readout_mode }], undefined, "topology.decision_head.readout_mode"),
        );
        rows.push(
          [`${prefix}-in`, `${prefix}-router`, `${prefix}-routed`, `${prefix}-merge`, `${prefix}-dec`],
          [null, null, `${prefix}-shared`, null, null],
        );
        edges.push({ id: `e-${prefix}-dec`, from: `${prefix}-merge`, to: `${prefix}-dec`, kind: "flow", claimPath: "topology.decision_head.readout_mode" });
      } else {
        rows.push(
          [`${prefix}-in`, `${prefix}-router`, `${prefix}-routed`, `${prefix}-merge`],
          [null, null, `${prefix}-shared`, null],
        );
      }
    } else {
      edges.push({ id: `e-${prefix}-skip`, from: `${prefix}-router.skip`, to: `${prefix}-merge.skip`, kind: "skip" });
      rows.push([`${prefix}-in`, `${prefix}-router`, `${prefix}-routed`, `${prefix}-merge`]);
    }
    tailConnectFrom = `${prefix}-merge`;
  } else {
    nodes.push(
      ctx.safeNode(`${prefix}-mlp`, "ffn", ffnGrp.label, [
        { claimPath: "facts.hidden_size", label: `d=${commas(facts.hidden_size)}` },
        ...(ffnGrp.module ? [{ label: ffnGrp.module }] : []),
      ], undefined, ffnClaim),
      {
        id: `${prefix}-merge`,
        kind: "merge",
        label: "⊕ FFN Residual",
        detail: "skip + MLP",
        ports: [{ name: "skip", side: "bottom" }],
      },
    );
    edges.push(
      { id: `e-${prefix}-1`, from: `${prefix}-in`, to: `${prefix}-mlp`, kind: "flow" },
      { id: `e-${prefix}-2`, from: `${prefix}-mlp`, to: `${prefix}-merge`, kind: "flow" },
      { id: `e-${prefix}-skip`, from: `${prefix}-in.skip`, to: `${prefix}-merge.skip`, kind: "skip" },
    );
    if (isTailSystemOne && topology.decision_head) {
      nodes.push(
        ctx.safeNode(`${prefix}-dec`, "decision", "Decision Head", [{ claimPath: "topology.decision_head.readout_mode", label: topology.decision_head.readout_mode }], undefined, "topology.decision_head.readout_mode"),
      );
      rows.push([`${prefix}-in`, `${prefix}-mlp`, `${prefix}-merge`, `${prefix}-dec`]);
      edges.push({ id: `e-${prefix}-dec`, from: `${prefix}-merge`, to: `${prefix}-dec`, kind: "flow", claimPath: "topology.decision_head.readout_mode" });
    } else {
      rows.push([`${prefix}-in`, `${prefix}-mlp`, `${prefix}-merge`]);
    }
    tailConnectFrom = `${prefix}-merge`;
  }

  void tailConnectFrom;
  return { rows, nodes, edges };
}

/**
 * Compile a canonical per-layer interactive block DiagramScene (#37) covering
 * the exact Attention, FFN/MoE, and Residual sublayers of `layerIndex`.
 */
export function compileLayerBlockSubview(arch: ModelDocument, evidence: EvidenceFile, layerIndex: number): CompiledSubview {
  if (layerIndex < 0 || layerIndex >= arch.facts.num_hidden_layers) {
    throw new Error(`${arch.model.id}: layer ${layerIndex} out of bounds [0, ${arch.facts.num_hidden_layers - 1}]`);
  }
  const attnIdx = arch.topology.attention_groups.findIndex((g) => g.layers.includes(layerIndex));
  const ffnIdx = arch.topology.ffn_groups.findIndex((g) => g.layers.includes(layerIndex));
  if (attnIdx < 0 || ffnIdx < 0) {
    throw new Error(`${arch.model.id}: layer ${layerIndex} missing attention or ffn assignment`);
  }
  const attnGrp = arch.topology.attention_groups[attnIdx]!;
  const ffnGrp = arch.topology.ffn_groups[ffnIdx]!;
  const isTail = layerIndex === arch.facts.num_hidden_layers - 1;
  const isTailSystemOne = isTail && arch.topology.paradigm === "system_one_decision";
  const ctx = makeCtx(evidence);

  const attnSub = buildAttentionSubgraphNodes("blk-a", attnGrp, attnIdx, arch, ctx, true);
  const ffnSub = buildFfnSubgraphNodes("blk-f", ffnGrp, ffnIdx, arch, ctx, isTailSystemOne);

  const nodes = [...attnSub.nodes, ...ffnSub.nodes];
  const ffnFlat = ffnSub.rows.flat().filter((x): x is string => Boolean(x));

  const groups: SemanticGroup[] = [
    {
      id: "g-blk-attn",
      label: `Layer ${layerIndex} · Attention (${attnGrp.label})`,
      kind: "inset",
      members: attnSub.row,
      ports: [{ id: "out", side: "bottom", inner: "blk-a-out" }],
      ...(ctx.hasClaim(`topology.attention_groups[${attnIdx}]`) ? { claimPath: `topology.attention_groups[${attnIdx}]` } : {}),
    },
    {
      id: "g-blk-ffn",
      label: isTail
        ? `Layer ${layerIndex} (Tail) · ${ffnGrp.label}`
        : `Layer ${layerIndex} · ${ffnGrp.label}`,
      kind: "inset",
      members: ffnFlat,
      ports: [{ id: "in", side: "top", inner: "blk-f-in" }],
      ...(ctx.hasClaim(`topology.ffn_groups[${ffnIdx}]`) ? { claimPath: `topology.ffn_groups[${ffnIdx}]` } : {}),
    },
  ];

  const edges: SemanticEdge[] = [
    ...attnSub.edges,
    ...ffnSub.edges,
    { id: "e-blk-mid", from: "g-blk-attn.out", to: "g-blk-ffn.in", kind: "flow" },
  ];

  const scene = appendAnnotations(
    {
      irVersion: arch.ir_version,
      view: "block",
      modelId: arch.model.id,
      nodes,
      edges,
      groups,
      annotations: [],
      constraints: [{ type: "direction", value: "left-to-right" }],
      streams: [],
    },
    ctx,
  );

  const positioned = composeSubviewGrid(`sub-block-l${layerIndex}`, scene, [
    { groupId: "g-blk-attn", rows: [attnSub.row], bandY: 50, bandH: 270 },
    { groupId: "g-blk-ffn", rows: ffnSub.rows, bandY: 342, bandH: 274 },
  ]);

  return {
    key: `block:${attnIdx}:${ffnIdx}:${isTail ? "tail" : "mid"}`,
    kind: "block",
    title: `Layer ${layerIndex} Block Subgraph`,
    subtitle: `${attnGrp.label} + ${ffnGrp.label}${arch.topology.residual?.scheme === "mhc" ? " + 4-stream mHC" : ""}`,
    scene,
    positioned,
  };
}

/**
 * Compile focused mechanism subviews ("attention" | "ffn" | "residual" | "decision")
 * for desktop module focusing and mobile interactive inspection (#36, #37).
 */
export function compileModuleSubview(
  arch: ModelDocument,
  evidence: EvidenceFile,
  kind: Exclude<SubviewKind, "block">,
): CompiledSubview {
  const ctx = makeCtx(evidence);
  const { facts, topology } = arch;
  const nodes: SemanticNode[] = [];
  const edges: SemanticEdge[] = [];
  const groups: SemanticGroup[] = [];
  const bands: SubGroupLayout[] = [];

  if (kind === "attention") {
    const grps = topology.attention_groups;
    const bandCount = Math.min(2, grps.length);
    const totalH = SUB_H - 76;
    const gap = 22;
    const eachH = bandCount === 1 ? 340 : Math.floor((totalH - gap) / 2);
    const startY = bandCount === 1 ? 136 : 52;
    grps.slice(0, 2).forEach((g, i) => {
      const sub = buildAttentionSubgraphNodes(`att${i}`, g, i, arch, ctx, false);
      nodes.push(...sub.nodes);
      edges.push(...sub.edges);
      const gid = `g-sub-att-${i}`;
      groups.push({
        id: gid,
        label: `${g.label} · ${g.layers.length} layers (${g.module ?? g.kind})`,
        kind: "inset",
        members: sub.row,
        ...(ctx.hasClaim(`topology.attention_groups[${i}]`) ? { claimPath: `topology.attention_groups[${i}]` } : {}),
      });
      bands.push({ groupId: gid, rows: [sub.row], bandY: startY + i * (eachH + gap), bandH: eachH });
    });
  } else if (kind === "ffn") {
    const grps = topology.ffn_groups;
    const bandCount = Math.min(2, grps.length);
    const totalH = SUB_H - 76;
    const gap = 22;
    const eachH = bandCount === 1 ? 350 : Math.floor((totalH - gap) / 2);
    const startY = bandCount === 1 ? 131 : 52;
    grps.slice(0, 2).forEach((g, i) => {
      const sub = buildFfnSubgraphNodes(`ffn${i}`, g, i, arch, ctx, false);
      nodes.push(...sub.nodes);
      edges.push(...sub.edges);
      const flat = sub.rows.flat().filter((x): x is string => Boolean(x));
      const gid = `g-sub-ffn-${i}`;
      groups.push({
        id: gid,
        label: `${g.label} · ${g.layers.length} / ${facts.num_hidden_layers} layers`,
        kind: "inset",
        members: flat,
        ...(ctx.hasClaim(`topology.ffn_groups[${i}]`) ? { claimPath: `topology.ffn_groups[${i}]` } : {}),
      });
      bands.push({ groupId: gid, rows: sub.rows, bandY: startY + i * (eachH + gap), bandH: eachH });
    });
  } else if (kind === "decision" && topology.decision_head) {
    const dh = topology.decision_head;
    const isMarker = dh.readout_mode === "mask_marker_mlp";
    nodes.push(
      ctx.safeNode(
        "dec-pack",
        isMarker ? "decision" : "cache",
        isMarker ? "Prompt + [MASK]" : "Shared Prefix KV",
        [{ label: isMarker ? "CLS q [MASK] opt SEP" : "page_first + block pad" }],
        undefined,
        isMarker ? "topology.decision_head.readout_mode" : "topology.decision_head.prefix_cache",
      ),
      ctx.safeNode(
        "dec-backbone",
        "stack",
        isMarker ? "Bidirectional Encoder" : "Single-Pass Prefill",
        [{ claimPath: "facts.num_hidden_layers", label: `${facts.num_hidden_layers}L · 0 decode` }],
        undefined,
        "topology.paradigm",
      ),
      ctx.safeNode(
        "dec-head",
        "readout",
        "Typed Readout",
        [{ claimPath: "topology.decision_head.readout_mode", label: dh.readout_mode }],
        undefined,
        "topology.decision_head.readout_mode",
      ),
      ctx.safeNode(
        "dec-prim",
        "decision",
        "Typed Primitives",
        [{ claimPath: "topology.decision_head.primitives", label: dh.primitives?.join(" · ") || "choice · score · noul" }],
        undefined,
        "topology.paradigm",
      ),
      ctx.safeNode(
        "dec-cal",
        "calibration",
        "Calibration",
        [{ claimPath: "topology.decision_head.calibration", label: dh.calibration ?? "temperature scaling" }],
        undefined,
        "topology.decision_head.calibration",
      ),
      ctx.safeNode(
        "dec-act",
        dh.action_head ? "action" : "output",
        dh.action_head ? "Abstain Act Head" : "Typed JSON Output",
        dh.action_head
          ? [{ claimPath: "topology.decision_head.action_head", label: dh.action_head }]
          : [{ label: "calibrated probs" }],
        undefined,
        "topology.paradigm",
      ),
    );
    edges.push(
      { id: "e-d1", from: "dec-pack", to: "dec-backbone", kind: "flow", claimPath: "topology.decision_head.readout_mode" },
      { id: "e-d2", from: "dec-backbone", to: "dec-head", kind: "flow", claimPath: "topology.decision_head.readout_mode" },
      { id: "e-d3", from: "dec-prim", to: "dec-cal", kind: "control", claimPath: "topology.decision_head.calibration" },
      { id: "e-d4", from: "dec-cal", to: "dec-act", kind: "flow", claimPath: dh.action_head ? "topology.decision_head.action_head" : "topology.decision_head.calibration" },
    );
    groups.push(
      {
        id: "g-sub-dec-exec",
        label: "Single-Pass Execution & Readout",
        kind: "inset",
        members: ["dec-pack", "dec-backbone", "dec-head"],
        claimPath: "topology.decision_head.readout_mode",
      },
      {
        id: "g-sub-dec-cal",
        label: "Typed Primitives & Calibration Contract",
        kind: "inset",
        members: ["dec-prim", "dec-cal", "dec-act"],
        claimPath: "topology.decision_head.calibration",
      },
    );
    bands.push(
      { groupId: "g-sub-dec-exec", rows: [["dec-pack", "dec-backbone", "dec-head"]], bandY: 54, bandH: 272 },
      { groupId: "g-sub-dec-cal", rows: [["dec-prim", "dec-cal", "dec-act"]], bandY: 348, bandH: 272 },
    );
  } else {
    const isMhc = topology.residual?.scheme === "mhc" && topology.residual.streams === 4;
    if (isMhc) {
      const SID = [1, 2, 3, 4] as const;
      const streamPorts = (p: string, side: "left" | "right" | "top" | "bottom", role: "ingress" | "egress") =>
        SID.map((i) => ({ name: `${p}${i}`, side, stream: `s${i}`, role }));
      const mhcNodes: SemanticNode[] = [
        {
          id: "mhc-source",
          kind: "split",
          label: "4×",
          detail: "streams",
          claimPath: "topology.residual.streams",
          ports: [...streamPorts("s", "right", "egress"), { name: "read", side: "top" }],
          claims: [{ claimPath: "topology.residual.streams", label: "4 streams" }],
        },
        {
          id: "mhc-hpre",
          kind: "mix",
          label: "H-pre",
          detail: "4 → 1 read",
          claimPath: "topology.residual.streams",
          ports: [{ name: "in", side: "bottom" }, { name: "out", side: "right" }],
        },
        {
          id: "mhc-f",
          kind: "attention",
          label: "ONE sublayer F",
          detail: "attention or FFN",
          claimPath: "topology.residual.scheme",
          ports: ["in", "out"],
        },
        {
          id: "mhc-hpost",
          kind: "mix",
          label: "H-post",
          detail: "1 → 4 write",
          claimPath: "topology.residual.streams",
          ports: [{ name: "in", side: "left" }, ...streamPorts("out", "bottom", "egress")],
        },
        {
          id: "mhc-hres",
          kind: "mix",
          label: "H-res",
          detail: "manifold mix",
          claimPath: "topology.residual.scheme",
          ports: [...streamPorts("in", "left", "ingress"), ...streamPorts("out", "right", "egress")],
        },
        {
          id: "mhc-add",
          kind: "mix",
          label: "⊕ ×4",
          detail: "per-stream add",
          claimPath: "topology.residual.scheme",
          ports: [
            ...streamPorts("res", "left", "ingress"),
            ...streamPorts("post", "top", "ingress"),
            ...streamPorts("out", "right", "egress"),
          ],
        },
        {
          id: "mhc-sink",
          kind: "merge",
          label: "→",
          detail: "write",
          claimPath: "topology.residual.streams",
          ports: streamPorts("w", "left", "ingress"),
        },
      ];
      const mhcEdges: SemanticEdge[] = [
        ...SID.flatMap((i) => [
          { id: `mhc-res-in-${i}`, from: `mhc-source.s${i}`, to: `mhc-hres.in${i}`, kind: "residual" as const, claimPath: "topology.residual.streams" },
          { id: `mhc-res-out-${i}`, from: `mhc-hres.out${i}`, to: `mhc-add.res${i}`, kind: "residual" as const, claimPath: "topology.residual.scheme" },
          { id: `mhc-post-${i}`, from: `mhc-hpost.out${i}`, to: `mhc-add.post${i}`, kind: "flow" as const, claimPath: "topology.residual.scheme" },
          { id: `mhc-exit-${i}`, from: `mhc-add.out${i}`, to: `mhc-sink.w${i}`, kind: "residual" as const, claimPath: "topology.residual.streams" },
        ]),
        { id: "mhc-pre", from: "mhc-source.read", to: "mhc-hpre.in", kind: "flow", claimPath: "topology.residual.scheme" },
        { id: "mhc-pre-f", from: "mhc-hpre.out", to: "mhc-f.in", kind: "flow", claimPath: "topology.residual.scheme" },
        { id: "mhc-f-post", from: "mhc-f.out", to: "mhc-hpost.in", kind: "flow", claimPath: "topology.residual.scheme" },
      ];
      const mhcScene = appendAnnotations(
        {
          irVersion: arch.ir_version,
          view: "block",
          modelId: arch.model.id,
          nodes: mhcNodes,
          edges: mhcEdges,
          groups: [
            {
              id: "g-sub-res",
              label: "mHC Multi-Stream Residual · Figure 1(c) / Eq. 3",
              kind: "inset",
              members: mhcNodes.map((n) => n.id),
              claimPath: "topology.residual.scheme",
            },
          ],
          streams: SID.map((i) => ({
            id: `s${i}`,
            path: [`mhc-source.s${i}`, `mhc-hres.in${i}`, `mhc-hres.out${i}`, `mhc-add.res${i}`, `mhc-add.out${i}`, `mhc-sink.w${i}`],
          })),
          annotations: [],
          constraints: [{ type: "direction", value: "left-to-right" }],
        },
        ctx,
      );
      const positioned = composeEditorialPoster(mhcScene, {
        id: "sub-mhc-residual",
        size: { w: SUB_W, h: SUB_H },
        nodes: [
          { id: "mhc-source", x: 72, y: 244, w: 126, h: 332 },
          { id: "mhc-hpre", x: 260, y: 118, w: 146, h: 82 },
          { id: "mhc-f", x: 472, y: 118, w: 224, h: 82 },
          { id: "mhc-hpost", x: 760, y: 118, w: 188, h: 82 },
          { id: "mhc-hres", x: 312, y: 244, w: 220, h: 332 },
          { id: "mhc-add", x: 760, y: 244, w: 188, h: 332 },
          { id: "mhc-sink", x: 1004, y: 244, w: 92, h: 332 },
        ],
        groups: [{ id: "g-sub-res", x: 34, y: 58, w: 1092, h: 554 }],
        edges: mhcEdges.map((e) => e.id),
        edgeRoutes: {
          "mhc-pre": [{ x: 135, y: 244 }, { x: 135, y: 222 }, { x: 333, y: 222 }, { x: 333, y: 200 }],
        },
      });
      return {
        key: "module:residual",
        kind: "residual",
        title: "mHC Multi-Stream Residual",
        subtitle: `${arch.model.label} · 4-stream manifold-constrained residual`,
        scene: mhcScene,
        positioned,
      };
    }

    nodes.push(
      ctx.safeNode("res-read", "split", "Residual Fork", [{ claimPath: "facts.hidden_size", label: `d=${commas(facts.hidden_size)}` }], [{ name: "skip", side: "bottom" }], "topology.residual.scheme"),
      ctx.safeNode("res-sub", "attention", "Attention / FFN Block", [{ label: "pre-norm residual" }], undefined, "facts.num_hidden_layers"),
      ctx.safeNode("res-write", "merge", "⊕ Residual Add", [{ claimPath: "topology.position_encoding.type", label: topology.position_encoding?.type?.toUpperCase() ?? "RoPE" }], [{ name: "skip", side: "bottom" }], "topology.position_encoding.type"),
    );
    edges.push(
      { id: "e-r1", from: "res-read", to: "res-sub", kind: "flow" },
      { id: "e-r2", from: "res-sub", to: "res-write", kind: "flow" },
      { id: "e-r-skip", from: "res-read.skip", to: "res-write.skip", kind: "skip" },
    );
    groups.push({
      id: "g-sub-res",
      label: "Residual Stream & Positional Encoding",
      kind: "inset",
      members: ["res-read", "res-sub", "res-write"],
    });
    bands.push({ groupId: "g-sub-res", rows: [["res-read", "res-sub", "res-write"]], bandY: 130, bandH: 350 });
  }

  const scene = appendAnnotations(
    {
      irVersion: arch.ir_version,
      view:
        kind === "decision"
          ? "overview"
          : kind === "residual"
            ? "block"
            : kind === "ffn"
              ? topology.experts?.routed_total
                ? "moe"
                : "block"
              : kind,
      modelId: arch.model.id,
      nodes,
      edges,
      groups,
      annotations: [],
      constraints: [{ type: "direction", value: "left-to-right" }],
      streams: [],
    },
    ctx,
  );
  const positioned = composeSubviewGrid(`sub-${kind}`, scene, bands);
  const titleMap: Record<Exclude<SubviewKind, "block">, string> = {
    attention: "Attention Subsystem",
    ffn: "FFN & Expert Routing",
    residual: topology.residual?.scheme === "mhc" ? "mHC Multi-Stream Residual" : "Residual & Positional Path",
    decision: "System-1 Readout & Calibration",
  };

  return {
    key: `module:${kind}`,
    kind,
    title: titleMap[kind],
    subtitle: `${arch.model.label} · ${kind} mechanism subview`,
    scene,
    positioned,
  };
}
