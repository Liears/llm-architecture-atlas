/**
 * GLM-5.3-Flash composition candidates (#34 pre-work, plan §3.4).
 *
 * Three low-cost composition candidates generated from the SAME frozen,
 * reviewed source brief (models/zai-org/glm-5-3-flash/main/architecture.json,
 * revision f93128cf). Candidates may vary composition, spacing, typography,
 * shape and color tokens only — they must not add, remove or infer model
 * facts. The frozen-fact assertion below enforces that every number drawn
 * equals the pinned config value.
 *
 * These are prototype/review material, never the canonical artifact. The
 * canonical chain stays Architecture IR → Diagram IR → layout → semantic SVG.
 *
 * Run: npx tsx prototypes/glm-compositions/render-candidates.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const arch = JSON.parse(readFileSync(`${root}/models/zai-org/glm-5-3-flash/main/architecture.json`, "utf8"));
const evidence = JSON.parse(readFileSync(`${root}/models/zai-org/glm-5-3-flash/main/evidence.json`, "utf8"));
const F = arch.facts;
const T = arch.topology;
const claim = (path: string): { value: number; status: string } => {
  const c = evidence.claims.find((x: { path: string }) => x.path === path);
  if (!c || !["verified", "reported", "derived"].includes(c.status)) {
    throw new Error(`claim ${path} missing or not publishable`);
  }
  return { value: c.value, status: c.status };
};

// ---- frozen-fact assertion: candidates draw exactly these values
const KDA = T.attention_groups.find((g: { kind: string }) => g.kind === "linear_attention")!;
const DSA = T.attention_groups.find((g: { kind: string }) => g.kind === "mla_sparse")!;
const FROZEN = {
  hidden: 4096,
  vocab: 154880,
  layers: 45,
  kda: 34,
  mla: 11,
  heads: 64,
  routed: 288,
  active: 8,
  shared: 1,
  streams: 4,
  indexerHeads: claim("topology.attention.dsa_indexer_heads").value,
  topk: claim("topology.attention.dsa_topk").value,
};
const actual = {
  hidden: F.hidden_size,
  vocab: F.vocab_size,
  layers: F.num_hidden_layers,
  kda: KDA.layers.length,
  mla: DSA.layers.length,
  heads: F.num_attention_heads,
  routed: T.experts.routed_total,
  active: T.experts.active_routed,
  shared: T.experts.shared,
  streams: T.residual.streams,
  indexerHeads: FROZEN.indexerHeads,
  topk: FROZEN.topk,
};
for (const k of Object.keys(FROZEN) as Array<keyof typeof FROZEN>) {
  if (FROZEN[k] !== actual[k]) {
    throw new Error(`frozen fact drift: ${k} expected ${FROZEN[k]} got ${actual[k]} — candidates must be regenerated from the reviewed brief`);
  }
}

const commas = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// ---- shared geometry (portrait poster, 1040x1360)
const W = 1040;
const H = 1360;
const SPINE_X = 330; // spine column left
const SPINE_W = 250;
const CX = SPINE_X + SPINE_W / 2;
const CARD_X = 640; // zoom cards column
const CARD_W = 372;
const MARGIN_X = 24; // left annotation column right edge

// spine slot y positions (top of each box), bottom-to-top reading
const Y = {
  title: 34,
  sub: 66,
  head: 110,
  norm: 190,
  containerTop: 250,
  containerBottom: 1050,
  embed: 1090,
  tok: 1170,
  input: 1250,
};
const BLOCK = { top: 330, bottom: 985 }; // blue inner block
// inner stack (top→bottom): mixer3, moe slot, mixer2, norm2, attn slot, mixer1, norm1
const SLOT = {
  mixer3: 350,
  moe: 420,
  mixer2: 520,
  norm2: 575,
  plus2: 640,
  attn: 675,
  mixer1: 800,
  norm1: 855,
  plus1: 920,
};
const BOX_H = 44;
const MIX_H = 30;

interface Skin {
  name: string;
  bg: string;
  grid?: string;
  containerFill: string;
  containerStroke: string;
  blockFill: string;
  blockStroke: string;
  boxFill: string;
  boxStroke: string;
  slotFill: string;
  slotStroke: string;
  slotText: string;
  mixerFill: string;
  mixerStroke: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  callout: string;
  calloutDash: string;
  flow: string;
  font: string;
  mono: string;
  rx: number;
  legendY: number;
}

const SKINS: Record<string, Skin> = {
  a: {
    name: "A · paper-editorial",
    bg: "#e8f1fb",
    containerFill: "#c8cdd3",
    containerStroke: "#3b4046",
    blockFill: "#3f97e0",
    blockStroke: "#1d5e99",
    boxFill: "#ffffff",
    boxStroke: "#22262b",
    slotFill: "#4b4f55",
    slotStroke: "#22262b",
    slotText: "#ffffff",
    mixerFill: "#ffffff",
    mixerStroke: "#1a73e8",
    ink: "#16181c",
    muted: "#415062",
    accent: "#1a73e8",
    accent2: "#e8710a",
    callout: "#22262b",
    calloutDash: "2 4",
    flow: "#16181c",
    font: "Helvetica, Arial, sans-serif",
    mono: "monospace",
    rx: 8,
    legendY: 1316,
  },
  b: {
    name: "B · engineering-blueprint",
    bg: "#0d1a2b",
    grid: "#15273c",
    containerFill: "none",
    containerStroke: "#67b7e8",
    blockFill: "none",
    blockStroke: "#67b7e8",
    boxFill: "#0d1a2b",
    boxStroke: "#9fd4f5",
    slotFill: "#0d1a2b",
    slotStroke: "#ffb454",
    slotText: "#ffd9a8",
    mixerFill: "#0d1a2b",
    mixerStroke: "#7ee0c3",
    ink: "#dceeff",
    muted: "#8fb4d4",
    accent: "#ffb454",
    accent2: "#7ee0c3",
    callout: "#ffb454",
    calloutDash: "6 4",
    flow: "#9fd4f5",
    font: "Helvetica, Arial, sans-serif",
    mono: "ui-monospace, Menlo, monospace",
    rx: 0,
    legendY: 1316,
  },
  c: {
    name: "C · atlas-native",
    bg: "#f5f7fa",
    containerFill: "#ffffff",
    containerStroke: "#b9c2d2",
    blockFill: "#eaf3fd",
    blockStroke: "#1769e0",
    boxFill: "#ffffff",
    boxStroke: "#172033",
    slotFill: "#dbeafe",
    slotStroke: "#1769e0",
    slotText: "#12305c",
    mixerFill: "#d5f0f0",
    mixerStroke: "#007a7a",
    ink: "#172033",
    muted: "#5d6778",
    accent: "#1769e0",
    accent2: "#b45309",
    callout: "#5d6778",
    calloutDash: "",
    flow: "#172033",
    font: "Helvetica, Arial, sans-serif",
    mono: "ui-monospace, Menlo, monospace",
    rx: 12,
    legendY: 1316,
  },
};

function render(skinKey: "a" | "b" | "c"): string {
  const s = SKINS[skinKey]!;
  const out: string[] = [];
  const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const box = (x: number, y: number, w: number, h: number, fill: string, stroke: string, rx = s.rx, sw = 1.6): string =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  const text = (x: number, y: number, t: string, o: { size?: number; fill?: string; weight?: number; anchor?: string; font?: string } = {}): string =>
    `<text x="${x}" y="${y}" font-family="${o.font ?? s.font}" font-size="${o.size ?? 15}" fill="${o.fill ?? s.ink}" font-weight="${o.weight ?? 400}" text-anchor="${o.anchor ?? "start"}">${esc(t)}</text>`;
  const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, o: { dash?: string; sw?: number; arrow?: boolean } = {}): string =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${o.sw ?? 1.6}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.arrow ? ` marker-end="url(#ar-${skinKey})"` : ""}/>`;
  const poly = (pts: Array<[number, number]>, stroke: string, o: { dash?: string; sw?: number; arrow?: boolean } = {}): string =>
    `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${stroke}" stroke-width="${o.sw ?? 1.6}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.arrow ? ` marker-end="url(#ar-${skinKey})"` : ""}/>`;
  const plus = (x: number, y: number): string =>
    `<circle cx="${x}" cy="${y}" r="11" fill="${s.boxFill}" stroke="${s.flow}" stroke-width="1.6"/>` +
    line(x - 6, y, x + 6, y, s.flow, { sw: 1.6 }) + line(x, y - 6, x, y + 6, s.flow, { sw: 1.6 });
  const leader = (x1: number, y1: number, x2: number, y2: number): string =>
    line(x1, y1, x2, y2, s.callout, { dash: s.calloutDash || "1 0", sw: 1.3 });
  // zoom callout: leave the source horizontally, turn in the gutter, enter
  // the card horizontally — no diagonal ever crosses the figure
  const GUTTER_X = 626;
  const callout = (srcX: number, srcY: number, cardY: number): string =>
    poly([[srcX, srcY], [GUTTER_X, srcY], [GUTTER_X, cardY], [CARD_X, cardY]], s.callout, { dash: s.calloutDash || "7 5", sw: 1.3 });

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="${s.font}">`);
  out.push(`<defs><marker id="ar-${skinKey}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${s.flow}"/></marker></defs>`);
  out.push(box(0, 0, W, H, s.bg, "none", 0, 0));
  if (s.grid) {
    for (let gx = 0; gx <= W; gx += 26) out.push(line(gx, 0, gx, H, s.grid, { sw: 0.6 }));
    for (let gy = 0; gy <= H; gy += 26) out.push(line(0, gy, W, gy, s.grid, { sw: 0.6 }));
  }

  // ---- title block
  if (skinKey === "b") {
    out.push(text(MARGIN_X, Y.title + 6, "LLM ARCHITECTURE ATLAS — SHEET GLM-01", { size: 22, weight: 700, fill: s.ink, font: s.mono }));
    out.push(text(MARGIN_X, Y.sub + 4, `MODEL zai-org/GLM-5.3-Flash · REV f93128cf · SCALE none · DRAWN from pinned config`, { size: 12, fill: s.muted, font: s.mono }));
  } else {
    out.push(text(MARGIN_X, Y.title + 8, `GLM-5.3-Flash (${F.total_params / 1e9}B-A${F.active_params / 1e9}B)`, { size: 30, weight: 700, fill: skinKey === "a" ? s.accent : s.ink }));
    out.push(text(MARGIN_X, Y.sub + 6, "Text decoder shown; vision encoder and MTP prediction layer omitted", { size: 13, fill: s.muted }));
  }

  // ---- spine: input → embedding
  out.push(text(CX, Y.input + 20, "Sample input text", { size: 13, fill: s.muted, anchor: "middle", font: s.mono }));
  out.push(line(CX, Y.input + 6, CX, Y.tok + BOX_H, s.flow, { arrow: true }));
  out.push(box(CX - 80, Y.tok, 160, BOX_H - 8, s.boxFill, s.boxStroke));
  out.push(text(CX, Y.tok + 24, "Tokenized text", { size: 14, anchor: "middle" }));
  out.push(line(CX, Y.tok, CX, Y.embed + BOX_H, s.flow, { arrow: true }));
  out.push(box(CX - 105, Y.embed, 210, BOX_H, s.boxFill, s.boxStroke));
  out.push(text(CX, Y.embed + 27, "Token embedding layer", { size: 14, anchor: "middle" }));

  // ---- 45× container + inner block
  out.push(box(SPINE_X - 42, Y.containerTop, SPINE_W + 84, Y.containerBottom - Y.containerTop, s.containerFill, s.containerStroke, s.rx + 6, 1.8));
  out.push(box(SPINE_X - 14, BLOCK.top - 26, SPINE_W + 28, BLOCK.bottom - BLOCK.top + 52, s.blockFill, s.blockStroke, s.rx + 2, 1.6));
  // 45× brace on the container's left edge
  out.push(text(SPINE_X - 52, (Y.containerTop + Y.containerBottom) / 2, `${FROZEN.layers} ×`, { size: 17, weight: 700, fill: s.accent, anchor: "end" }));
  out.push(poly([[SPINE_X - 46, Y.containerTop + 40], [SPINE_X - 38, (Y.containerTop + Y.containerBottom) / 2 - 10], [SPINE_X - 46, Y.containerBottom - 40]], s.accent, { sw: 1.6 }));

  // inner stack, bottom → top
  const inner = (y: number, h: number, label: string, fill: string, stroke: string, tcol: string, size = 14): void => {
    out.push(box(SPINE_X + 12, y, SPINE_W - 24, h, fill, stroke, Math.min(s.rx, 6)));
    out.push(text(CX, y + h / 2 + 5, label, { size, anchor: "middle", fill: tcol, weight: 600 }));
  };
  inner(SLOT.norm1, BOX_H - 6, "RMSNorm 1", s.boxFill, s.boxStroke, s.ink);
  inner(SLOT.mixer1, MIX_H, "mHC mixer", s.mixerFill, s.mixerStroke, s.ink, 13);
  inner(SLOT.attn, 108, "", s.slotFill, s.slotStroke, s.slotText);
  out.push(text(CX, SLOT.attn + 26, "Multi-head Latent Attention (MLA)", { size: 13.5, anchor: "middle", fill: s.slotText, weight: 600 }));
  out.push(text(CX, SLOT.attn + 45, "w/ DeepSeek Sparse Attention (DSA)", { size: 13.5, anchor: "middle", fill: s.slotText }));
  out.push(text(CX, SLOT.attn + 64, "or Kimi Delta Attention (KDA)", { size: 13.5, anchor: "middle", fill: s.slotText }));
  out.push(text(CX, SLOT.attn + 86, `schedule K,K,K,D ×${FROZEN.mla} + K`, { size: 12, anchor: "middle", fill: s.slotText, font: s.mono }));
  out.push(plus(CX, SLOT.plus2));
  inner(SLOT.norm2, BOX_H - 6, "RMSNorm 2", s.boxFill, s.boxStroke, s.ink);
  inner(SLOT.mixer2, MIX_H, "mHC mixer", s.mixerFill, s.mixerStroke, s.ink, 13);
  inner(SLOT.moe, 74, "", s.boxFill, s.boxStroke, s.ink);
  out.push(text(CX, SLOT.moe + 30, "MoE / dense FFN", { size: 14, anchor: "middle", weight: 600 }));
  out.push(text(CX, SLOT.moe + 50, `first ${3} dense, then ${FROZEN.layers - 3} MoE`, { size: 12, anchor: "middle", fill: s.muted, font: s.mono }));
  inner(SLOT.mixer3, MIX_H, "mHC mixer", s.mixerFill, s.mixerStroke, s.ink, 13);

  // vertical flow inside the block (bottom → top)
  const flowX = CX;
  out.push(line(flowX, Y.embed, flowX, SLOT.norm1 + BOX_H - 6, s.flow, { arrow: true }));
  out.push(line(flowX, SLOT.norm1, flowX, SLOT.mixer1 + MIX_H, s.flow, { arrow: true }));
  out.push(line(flowX, SLOT.mixer1, flowX, SLOT.attn + 108, s.flow, { arrow: true }));
  out.push(line(flowX, SLOT.attn, flowX, SLOT.plus2 + 11, s.flow, { arrow: true }));
  out.push(line(flowX, SLOT.plus2 - 11, flowX, SLOT.norm2 + BOX_H - 6, s.flow, { arrow: true }));
  out.push(line(flowX, SLOT.norm2, flowX, SLOT.mixer2 + MIX_H, s.flow, { arrow: true }));
  out.push(line(flowX, SLOT.mixer2, flowX, SLOT.moe + 74, s.flow, { arrow: true }));
  out.push(line(flowX, SLOT.moe, flowX, SLOT.mixer3 + MIX_H, s.flow, { arrow: true }));
  out.push(line(flowX, SLOT.mixer3, flowX, BLOCK.top - 26, s.flow, { arrow: true }));

  // mHC 4-stream rail: four parallel lines up the block's left inner edge
  for (let i = 0; i < FROZEN.streams; i++) {
    const rx = SPINE_X - 4 + i * 5;
    out.push(line(rx, SLOT.mixer3 + MIX_H / 2, rx, SLOT.mixer1 + MIX_H / 2, s.mixerStroke, { sw: 1.4 }));
    out.push(line(rx, SLOT.mixer1 + MIX_H / 2, SPINE_X + 12, SLOT.mixer1 + MIX_H / 2, s.mixerStroke, { sw: 1.4, arrow: false }));
    out.push(line(rx, SLOT.mixer3 + MIX_H / 2, SPINE_X + 12, SLOT.mixer3 + MIX_H / 2, s.mixerStroke, { sw: 1.4 }));
  }

  // ---- spine top: norm + head
  out.push(line(CX, Y.containerTop, CX, Y.norm + BOX_H, s.flow, { arrow: true }));
  out.push(box(CX - 90, Y.norm, 180, BOX_H, s.boxFill, s.boxStroke));
  out.push(text(CX, Y.norm + 27, "Final RMSNorm", { size: 14, anchor: "middle" }));
  out.push(line(CX, Y.norm, CX, Y.head + BOX_H, s.flow, { arrow: true }));
  out.push(box(CX - 95, Y.head, 190, BOX_H, s.boxFill, s.boxStroke));
  out.push(text(CX, Y.head + 27, "Linear output layer", { size: 14, anchor: "middle" }));

  // ---- left margin annotations with leaders (note sits at target height:
  // short, near-horizontal leaders never cross each other)
  const note = (l1: string, l2: string | null, ty: number, tx: number): void => {
    out.push(text(MARGIN_X, ty, l1, { size: 13.5, weight: 600, fill: s.ink }));
    if (l2) out.push(text(MARGIN_X, ty + 17, l2, { size: 13.5, weight: 600, fill: s.ink }));
    const fromX = MARGIN_X + Math.max(l1.length, l2?.length ?? 0) * 6.7 + 8;
    out.push(leader(fromX, ty - 5, tx, ty - 5));
  };
  note(`Vocabulary size of ${commas(FROZEN.vocab)}`, null, Y.head + 26, CX - 99);
  note(`${FROZEN.kda} KDA layers`, `${FROZEN.mla} MLA+DSA layers`, SLOT.attn + 30, SPINE_X + 8);
  note(`${FROZEN.heads} attention heads`, null, SLOT.attn + 78, SPINE_X + 8);
  note(`Embedding dimension of ${commas(FROZEN.hidden)}`, null, Y.embed + 16, CX - 109);
  note(`Supported context ${F.context_tokens / 1048576}M tokens`, null, Y.embed + 66, CX - 109);
  out.push(text(MARGIN_X, SLOT.moe + 34, `First 3 blocks use dense`, { size: 13, fill: s.muted }));
  out.push(text(MARGIN_X, SLOT.moe + 51, `SwiGLU FFNs instead of MoEs`, { size: 13, fill: s.muted }));
  out.push(leader(MARGIN_X + 168, SLOT.moe + 46, SPINE_X - 18, SLOT.moe + 46));

  // ---- zoom cards (right column)
  const card = (y: number, h: number, title: string): number => {
    out.push(box(CARD_X, y, CARD_W, h, skinKey === "b" ? s.bg : "#ffffff", s.callout, s.rx, 1.6).replace(`stroke="${s.callout}"`, `stroke="${s.callout}" stroke-dasharray="${s.calloutDash || "7 5"}"`));
    out.push(text(CARD_X + 16, y + 26, title, { size: 15, weight: 700 }));
    return y;
  };
  const sub = (x: number, y: number, w: number, h: number, label: string, fill = s.boxFill, stroke = s.boxStroke, tcol = s.ink): void => {
    out.push(box(x, y, w, h, fill, stroke, Math.min(s.rx, 6), 1.3));
    out.push(text(x + w / 2, y + h / 2 + 4.5, label, { size: 12.5, anchor: "middle", fill: tcol, weight: 600 }));
  };

  // card 1: MoE layer
  let cy = 110;
  card(cy, 300, "MoE layer (sparse blocks 3–44)");
  out.push(plus(CARD_X + CARD_W / 2, cy + 74));
  sub(CARD_X + 30, cy + 130, 140, 36, "Feed forward");
  sub(CARD_X + 202, cy + 130, 140, 36, "Feed forward");
  out.push(text(CARD_X + CARD_W / 2, cy + 152, "…", { size: 16, anchor: "middle", fill: s.muted }));
  out.push(box(CARD_X + 128, cy + 96, 24, 18, s.ink, s.ink, 3, 0));
  out.push(text(CARD_X + 140, cy + 109, "1", { size: 11, anchor: "middle", fill: s.bg, weight: 700 }));
  out.push(box(CARD_X + 220, cy + 96, 34, 18, s.accent, s.accent, 3, 0));
  out.push(text(CARD_X + 237, cy + 109, `${FROZEN.routed}`, { size: 11, anchor: "middle", fill: "#ffffff", weight: 700 }));
  sub(CARD_X + CARD_W / 2 - 55, cy + 216, 110, 36, "Router", s.boxFill, s.accent, s.accent);
  out.push(poly([[CARD_X + CARD_W / 2, cy + 216], [CARD_X + 100, cy + 166]], s.flow, { arrow: true }));
  out.push(poly([[CARD_X + CARD_W / 2, cy + 216], [CARD_X + 272, cy + 166]], s.flow, { arrow: true }));
  out.push(poly([[CARD_X + 100, cy + 130], [CARD_X + CARD_W / 2 - 8, cy + 82]], s.flow, { arrow: true }));
  out.push(poly([[CARD_X + 272, cy + 130], [CARD_X + CARD_W / 2 + 8, cy + 82]], s.flow, { arrow: true }));
  out.push(line(CARD_X + CARD_W / 2, cy + 63, CARD_X + CARD_W / 2, cy + 40, s.flow, { arrow: true }));
  out.push(text(CARD_X + 16, cy + 282, `${FROZEN.shared} shared expert always on · top-${FROZEN.active} of ${FROZEN.routed} routed`, { size: 12, fill: s.muted, font: s.mono }));
  out.push(callout(SPINE_X + SPINE_W - 12, SLOT.moe + 36, cy + 150));

  // card 2: DSA
  cy = 440;
  card(cy, 210, "DSA (1 of 4 layers)");
  sub(CARD_X + 24, cy + 60, 108, 40, "Lightning indexer");
  sub(CARD_X + 146, cy + 60, 92, 40, "Top-k 2048");
  sub(CARD_X + 252, cy + 60, 100, 40, "MLA core", s.slotFill, s.slotStroke, s.slotText);
  out.push(line(CARD_X + 132, cy + 80, CARD_X + 146, cy + 80, s.flow, { arrow: true }));
  out.push(line(CARD_X + 238, cy + 80, CARD_X + 252, cy + 80, s.flow, { arrow: true }));
  out.push(text(CARD_X + 24, cy + 128, `indexer ${FROZEN.indexerHeads} heads · top-k ${FROZEN.topk}`, { size: 12, fill: s.muted, font: s.mono }));
  out.push(text(CARD_X + 24, cy + 150, "selected KV → latent attention", { size: 12.5, fill: s.muted }));
  out.push(text(CARD_X + 24, cy + 186, "scores all positions, routes sparse KV", { size: 12, fill: s.muted }));
  out.push(callout(SPINE_X + SPINE_W - 12, SLOT.attn + 50, cy + 80));

  // card 3: mHC
  cy = 680;
  card(cy, 190, "mHC (manifold-constrained hyper-connections)");
  for (let i = 0; i < FROZEN.streams; i++) {
    const yy = cy + 66 + i * 16;
    out.push(line(CARD_X + 20, yy, CARD_X + 62, yy, s.mixerStroke, { sw: 1.5, arrow: true }));
    out.push(line(CARD_X + 168, yy, CARD_X + 210, yy, s.mixerStroke, { sw: 1.5, arrow: true }));
  }
  sub(CARD_X + 62, cy + 56, 106, 76, "", s.mixerFill, s.mixerStroke);
  out.push(text(CARD_X + 115, cy + 88, "mHC mixer", { size: 12, anchor: "middle", weight: 600 }));
  out.push(text(CARD_X + 115, cy + 106, "(constrained mixing)", { size: 10.5, anchor: "middle", fill: s.muted }));
  sub(CARD_X + 210, cy + 66, 96, 56, "", s.containerFill === "none" ? s.bg : s.containerFill, s.containerStroke);
  out.push(text(CARD_X + 258, cy + 90, "Sublayer", { size: 12, anchor: "middle", weight: 600 }));
  out.push(text(CARD_X + 258, cy + 106, "(attention or MoE)", { size: 10.5, anchor: "middle", fill: s.muted }));
  sub(CARD_X + 316, cy + 56, 44, 76, "", s.mixerFill, s.mixerStroke);
  out.push(text(CARD_X + 338, cy + 90, "mHC", { size: 11, anchor: "middle", weight: 600 }));
  out.push(text(CARD_X + 338, cy + 104, "mixer", { size: 11, anchor: "middle", weight: 600 }));
  out.push(text(CARD_X + 20, cy + 164, `with ${FROZEN.streams} parallel residual streams (replaces plain x + F(x))`, { size: 12, fill: s.muted, font: s.mono }));
  out.push(callout(SPINE_X + SPINE_W - 12, SLOT.mixer2 + 15, cy + 94));

  // ---- resource facts panel
  cy = 900;
  out.push(text(CARD_X, cy + 16, "Resource savings:", { size: 14, weight: 700, fill: s.accent }));
  out.push(text(CARD_X + 8, cy + 42, `• model size ${F.total_params / 1e9}B total`, { size: 13, fill: s.ink }));
  out.push(text(CARD_X + 8, cy + 66, `• only ${FROZEN.shared} shared + ${FROZEN.active} experts active per token`, { size: 13, fill: s.ink }));
  out.push(text(CARD_X + 8, cy + 90, `• ${F.active_params / 1e9}B active (${Math.round((F.active_params / F.total_params) * 1000) / 10}%)`, { size: 13, fill: s.ink }));
  out.push(text(CARD_X, cy + 130, "Evidence: pinned config f93128cf (exact) +", { size: 11.5, fill: s.muted, font: s.mono }));
  out.push(text(CARD_X, cy + 148, "mHC/DSA/KDA papers (mechanism-only)", { size: 11.5, fill: s.muted, font: s.mono }));

  // ---- legend
  out.push(line(MARGIN_X, s.legendY, MARGIN_X + 46, s.legendY, s.flow, { arrow: true }));
  out.push(text(MARGIN_X + 54, s.legendY + 4, "data flow", { size: 12, fill: s.muted }));
  out.push(line(MARGIN_X + 150, s.legendY, MARGIN_X + 196, s.legendY, s.callout, { dash: s.calloutDash || "7 5" }));
  out.push(text(MARGIN_X + 204, s.legendY + 4, "zoom callout", { size: 12, fill: s.muted }));
  out.push(line(MARGIN_X + 320, s.legendY, MARGIN_X + 366, s.legendY, s.mixerStroke, { sw: 1.5 }));
  out.push(text(MARGIN_X + 374, s.legendY + 4, `residual stream ×${FROZEN.streams}`, { size: 12, fill: s.muted }));
  out.push(text(W - MARGIN_X, s.legendY + 4, s.name, { size: 12, fill: s.muted, anchor: "end", font: s.mono }));

  out.push(`</svg>`);
  return out.join("\n") + "\n";
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)));
mkdirSync(outDir, { recursive: true });
for (const k of ["a", "b", "c"] as const) {
  writeFileSync(`${outDir}/candidate-${k}.svg`, render(k));
  console.log(`wrote candidate-${k}.svg (${SKINS[k]!.name})`);
}
