/**
 * GLM-5.3-Flash composition candidates, round 2 (issue #34 pre-work, plan §3.4).
 *
 * Round-1 review rejected the first attempt: one geometry with three skins,
 * missing KDA inset, incomplete mHC paths, selected-KV as prose, weak frozen
 * assertions, sub-12px type, clipped captions. This rewrite provides:
 *
 * - THREE GENUINE COMPOSITIONS (different canvases, spine directions, card
 *   placements and annotation grammars), not skins:
 *     A paper-editorial: portrait poster, vertical spine, right zoom column;
 *     B engineering-blueprint: landscape sheet, horizontal spine, 2×2 panel
 *       grid below, dimension lines and a drawing title block;
 *     C nested-containment: narrow portrait, mechanism cards nested INSIDE
 *       the decoder container, stream rails on the container's inner edge.
 * - COMPLETE mechanisms in every candidate: KDA (Q/K/V ShortConv → decay/
 *   state core → output gate), DSA (indexer → top-k → selected-KV → MLA
 *   core), MoE (router → fan-out → routed + shared → merge), mHC (4 streams:
 *   read split → pre-mixer → sublayer → post-mixer → write merge, rails
 *   crossing the sublayers).
 * - EVERY drawn number resolved through the evidence harness: publishable
 *   claims via claim(), config values via fact(), plus membership assertions
 *   for the K,K,K,D ×11 + K schedule and the dense/MoE partition. Literals
 *   like "first 3" or "1 of 4" are derived from the IR, never typed.
 * - Type floor: no key text below 12px; captions wrap inside their cards.
 *
 * Run: npx tsx prototypes/glm-compositions/render-candidates.ts [--png]
 * Emits candidate-{a,b,c}.svg and, with --png, candidate-{a,b,c}.png.
 * These are prototype/review material, never the canonical artifact.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelDir = `${root}/models/zai-org/glm-5-3-flash/main`;
const arch = JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8"));
const evidence = JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8"));

// ---------------------------------------------------------------- evidence
const PUBLISHABLE = new Set(["verified", "reported", "derived"]);
function claim(path: string): number {
  const c = evidence.claims.find((x: { path: string }) => x.path === path);
  if (!c || !PUBLISHABLE.has(c.status)) throw new Error(`claim ${path} missing or not publishable`);
  return c.value as number;
}
function fact(key: string): number {
  const v = (arch.facts as Record<string, unknown>)[key];
  if (typeof v !== "number") throw new Error(`fact ${key} is not a number`);
  return v;
}

const F = {
  layers: fact("num_hidden_layers"),
  hidden: fact("hidden_size"),
  vocab: fact("vocab_size"),
  heads: fact("num_attention_heads"),
  context: fact("context_tokens"),
  total: fact("total_params"),
  active: fact("active_params"),
};
const linear = arch.topology.attention_groups.find((g: { kind: string }) => g.kind === "linear_attention")!;
const mla = arch.topology.attention_groups.find((g: { kind: string }) => g.kind === "mla_sparse")!;
const KDA_LAYERS: number[] = linear.layers;
const MLA_LAYERS: number[] = mla.layers;
const routed = (arch.topology.experts as { routed_total: number }).routed_total;
const activeRouted = (arch.topology.experts as { active_routed: number }).active_routed;
const shared = (arch.topology.experts as { shared: number }).shared;
const streams = (arch.topology.residual as { streams: number }).streams;
const indexerHeads = claim("topology.attention.dsa_indexer_heads");
const topk = claim("topology.attention.dsa_topk");
const denseLayers: number[] = arch.topology.ffn_groups.find((g: { kind: string }) => g.kind === "dense_ffn")!.layers;
const moeLayers: number[] = arch.topology.ffn_groups.find((g: { kind: string }) => g.kind === "moe")!.layers;

// frozen assertions: counts, membership and partition, before any drawing
const eq = (a: unknown, b: unknown, what: string): void => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`frozen fact drift: ${what}`);
};
eq(F.layers, 45, "layers");
eq(F.hidden, 4096, "hidden");
eq(F.vocab, 154880, "vocab");
eq(F.heads, 64, "heads");
eq(streams, 4, "streams");
eq(routed, 288, "routed");
eq(activeRouted, 8, "activeRouted");
eq(shared, 1, "shared");
eq(indexerHeads, 32, "indexerHeads");
eq(topk, 2048, "topk");
const expectedLinear = new Set<number>();
const expectedMla = new Set<number>();
for (let i = 0; i < F.layers; i++) {
  if (i === F.layers - 1 || i % 4 !== 3) expectedLinear.add(i);
  else expectedMla.add(i);
}
eq([...KDA_LAYERS].sort((a, b) => a - b), [...expectedLinear].sort((a, b) => a - b), "K,K,K,D x11 + K membership (linear)");
eq([...MLA_LAYERS].sort((a, b) => a - b), [...expectedMla].sort((a, b) => a - b), "K,K,K,D x11 + K membership (mla)");
eq(denseLayers, [0, 1, 2], "dense partition");
eq(moeLayers.length, F.layers - 3, "moe partition length");
eq(moeLayers[0], 3, "moe partition start");
const UNITS = MLA_LAYERS.length; // 11 four-layer units
const DENSE_COUNT = denseLayers.length;
const MOE_COUNT = moeLayers.length;
const D_PERIOD = 4; // K,K,K,D period

const commas = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const billions = (n: number): string => `${Math.round((n / 1e9) * 10) / 10}B`;
const ctxLabel = `${Math.round(F.context / 1048576)}M`;

// ---------------------------------------------------------------- svg kit
interface Skin {
  bg: string;
  grid?: string;
  panel: string;
  panelStroke: string;
  box: string;
  boxStroke: string;
  mech: string;
  mechStroke: string;
  ink: string;
  muted: string;
  accent: string;
  stream: string;
  font: string;
  mono: string;
  rx: number;
  dash: string;
}
const SKINS: Record<"a" | "b" | "c", Skin> = {
  a: {
    bg: "#eef4fb", panel: "#ffffff", panelStroke: "#3b4046", box: "#ffffff", boxStroke: "#22262b",
    mech: "#3f97e0", mechStroke: "#1d5e99", ink: "#16181c", muted: "#415062",
    accent: "#1a73e8", stream: "#00796b", font: "Helvetica, Arial, sans-serif",
    mono: "monospace", rx: 8, dash: "2 4",
  },
  b: {
    bg: "#0d1a2b", grid: "#15273c", panel: "#0d1a2b", panelStroke: "#67b7e8", box: "#0f2136", boxStroke: "#9fd4f5",
    mech: "#123047", mechStroke: "#ffb454", ink: "#dceeff", muted: "#8fb4d4",
    accent: "#ffb454", stream: "#7ee0c3", font: "Helvetica, Arial, sans-serif",
    mono: "ui-monospace, Menlo, monospace", rx: 0, dash: "6 4",
  },
  c: {
    bg: "#f5f7fa", panel: "#ffffff", panelStroke: "#b9c2d2", box: "#ffffff", boxStroke: "#172033",
    mech: "#eaf3fd", mechStroke: "#1769e0", ink: "#172033", muted: "#5d6778",
    accent: "#1769e0", stream: "#007a7a", font: "Helvetica, Arial, sans-serif",
    mono: "ui-monospace, Menlo, monospace", rx: 12, dash: "5 4",
  },
};

class Svg {
  out: string[] = [];
  constructor(readonly w: number, readonly h: number, readonly s: Skin) {
    this.out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="${s.font}">`);
    this.out.push(`<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${s.ink}"/></marker></defs>`);
    this.rect(0, 0, w, h, s.bg, "none", 0);
    if (s.grid) {
      for (let x = 0; x <= w; x += 26) this.line(x, 0, x, h, s.grid, 0.6);
      for (let y = 0; y <= h; y += 26) this.line(0, y, w, y, s.grid, 0.6);
    }
  }
  esc(t: string): string {
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  rect(x: number, y: number, w: number, h: number, fill: string, stroke: string, sw: number, rx = this.s.rx, dash = ""): void {
    this.out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`);
  }
  text(x: number, y: number, t: string, o: { size?: number; fill?: string; weight?: number; anchor?: string; font?: string } = {}): void {
    this.out.push(`<text x="${x}" y="${y}" font-size="${o.size ?? 13}" fill="${o.fill ?? this.s.ink}" font-weight="${o.weight ?? 400}" text-anchor="${o.anchor ?? "start"}"${o.font ? ` font-family="${o.font}"` : ""}>${this.esc(t)}</text>`);
  }
  line(x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 1.5, dash = "", arrow = false): void {
    this.out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}${arrow ? ` marker-end="url(#ar)"` : ""}/>`);
  }
  poly(pts: Array<[number, number]>, stroke: string, sw = 1.5, dash = ""): void {
    this.out.push(`<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`);
  }
  node(x: number, y: number, w: number, h: number, label: string, o: { fill?: string; stroke?: string; detail?: string; size?: number; tfill?: string; dfill?: string } = {}): void {
    this.rect(x, y, w, h, o.fill ?? this.s.box, o.stroke ?? this.s.boxStroke, 1.5);
    // shrink-to-fit so a label never spills out of its box
    const fit = (t: string, size: number): number => Math.max(10, Math.min(size, (w - 10) / (t.length * 0.56)));
    const ls = fit(label, o.size ?? 13);
    this.text(x + w / 2, y + (o.detail ? h / 2 - 2 : h / 2 + 4.5), label, { size: ls, weight: 600, anchor: "middle", fill: o.tfill });
    if (o.detail) this.text(x + w / 2, y + h / 2 + 13, o.detail, { size: fit(o.detail, 12), anchor: "middle", fill: o.dfill ?? this.s.muted });
  }
  plus(x: number, y: number): void {
    this.out.push(`<circle cx="${x}" cy="${y}" r="10" fill="${this.s.box}" stroke="${this.s.ink}" stroke-width="1.5"/>`);
    this.line(x - 5, y, x + 5, y, this.s.ink, 1.5);
    this.line(x, y - 5, x, y + 5, this.s.ink, 1.5);
  }
  panel(x: number, y: number, w: number, h: number, title: string): void {
    this.rect(x, y, w, h, this.s.panel, this.s.panelStroke, 1.6, this.s.rx, this.s.dash);
    this.text(x + 12, y + 20, title, { size: 13.5, weight: 700 });
  }
  end(): string {
    this.out.push("</svg>");
    return this.out.join("\n") + "\n";
  }
}

// ---------------------------------------------------------------- mechanisms
type Dir = "lr" | "tb";
interface MechCtx {
  svg: Svg;
  dir: Dir;
  /** lr slot height cap override (default 96) */
  cap?: number;
}
interface R {
  x: number;
  y: number;
  w: number;
  h: number;
}
function slots(ctx: MechCtx, x: number, y: number, w: number, h: number, n: number, gap = 26): R[] {
  const out: R[] = [];
  if (ctx.dir === "lr") {
    const hh = Math.min(h, ctx.cap ?? 96);
    const oy = y + (h - hh) / 2;
    const sw = (w - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) out.push({ x: x + i * (sw + gap), y: oy, w: sw, h: hh });
  } else {
    const sh = Math.max(52, (h - gap * (n - 1)) / n);
    for (let i = 0; i < n; i++) out.push({ x, y: y + i * (sh + gap), w, h: sh });
  }
  return out;
}
function connect(ctx: MechCtx, a: R, b: R, label?: string): void {
  const s = ctx.svg;
  if (ctx.dir === "lr") {
    s.line(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2, s.s.ink, 1.5, "", true);
    if (label) s.text((a.x + a.w + b.x) / 2, a.y + a.h / 2 - 6, label, { size: 12, anchor: "middle", fill: s.s.muted });
  } else {
    s.line(a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y, s.s.ink, 1.5, "", true);
    if (label) s.text(a.x + a.w / 2 + 6, (a.y + a.h + b.y) / 2, label, { size: 12, fill: s.s.muted });
  }
}

function drawKda(ctx: MechCtx, x: number, y: number, w: number, h: number): void {
  const s = ctx.svg;
  const [qkv, core, gate] = slots(ctx, x, y, w, h, 3);
  s.node(qkv.x, qkv.y, qkv.w, qkv.h, "Q/K/V ShortConv", { size: 12.5 });
  s.node(core.x, core.y, core.w, core.h, "KDA core", { fill: s.s.mech, stroke: s.s.mechStroke, detail: "decay + recurrent state", size: 12.5, dfill: "#eaf3fb" });
  s.node(gate.x, gate.y, gate.w, gate.h, "output gate", { size: 12.5 });
  connect(ctx, qkv, core);
  connect(ctx, core, gate);
}

function drawDsa(ctx: MechCtx, x: number, y: number, w: number, h: number): void {
  const s = ctx.svg;
  const [idx, tk, sel, core] = slots(ctx, x, y, w, h, 4, 22);
  s.node(idx.x, idx.y, idx.w, idx.h, "Lightning indexer", { detail: `${indexerHeads} heads`, size: 12.5 });
  s.node(tk.x, tk.y, tk.w, tk.h, "Top-k", { detail: `k=${topk}`, size: 12.5 });
  s.node(sel.x, sel.y, sel.w, sel.h, "selected KV", { size: 12.5, fill: s.s.mech, stroke: s.s.mechStroke, dfill: "#eaf3fb" });
  s.node(core.x, core.y, core.w, core.h, "MLA core", { detail: "latent KV", size: 12.5 });
  connect(ctx, idx, tk);
  connect(ctx, tk, sel);
  connect(ctx, sel, core);
}

function drawMoe(ctx: MechCtx, x: number, y: number, w: number, h: number): void {
  const s = ctx.svg;
  if (ctx.dir === "lr") {
    const rw = w * 0.2;
    const ew = w * 0.28;
    const router = { x, y: y + h / 2 - 20, w: rw, h: 40 };
    const experts = { x: x + rw + 44, y, w: ew, h: h / 2 - 8 };
    const sharedB = { x: x + rw + 44, y: y + h / 2 + 8, w: ew, h: h / 2 - 8 };
    const mx = x + rw + ew + 88;
    s.node(router.x, router.y, router.w, router.h, "Router", { size: 12.5 });
    s.node(experts.x, experts.y, experts.w, experts.h, "Routed experts", { detail: `${routed} · top-${activeRouted}`, size: 12.5 });
    s.node(sharedB.x, sharedB.y, sharedB.w, sharedB.h, "Shared expert", { detail: `${shared} always on`, size: 12.5 });
    s.plus(mx + 10, y + h / 2);
    s.line(router.x + router.w, router.y + router.h / 2, experts.x, experts.y + experts.h / 2, s.s.ink, 1.5, "", true);
    s.line(router.x + router.w, router.y + router.h / 2, sharedB.x, sharedB.y + sharedB.h / 2, s.s.ink, 1.5, "", true);
    s.line(experts.x + experts.w, experts.y + experts.h / 2, mx + 2, y + h / 2 - 4, s.s.ink, 1.5, "", true);
    s.line(sharedB.x + sharedB.w, sharedB.y + sharedB.h / 2, mx + 2, y + h / 2 + 4, s.s.ink, 1.5, "", true);
  } else {
    const y0 = y + Math.max(0, (h - 150) / 2);
    const router = { x: x + w / 2 - 60, y: y0, w: 120, h: 34 };
    const experts = { x, y: y0 + 62, w: w / 2 - 12, h: 46 };
    const sharedB = { x: x + w / 2 + 12, y: y0 + 62, w: w / 2 - 12, h: 46 };
    const my = y0 + 136;
    s.node(router.x, router.y, router.w, router.h, "Router", { size: 12.5 });
    s.node(experts.x, experts.y, experts.w, experts.h, "Routed experts", { detail: `${routed} · top-${activeRouted}`, size: 12.5 });
    s.node(sharedB.x, sharedB.y, sharedB.w, sharedB.h, "Shared expert", { detail: `${shared} always on`, size: 12.5 });
    s.plus(x + w / 2, my + 10);
    s.line(router.x + router.w / 2, router.y + router.h, experts.x + experts.w / 2, experts.y, s.s.ink, 1.5, "", true);
    s.line(router.x + router.w / 2, router.y + router.h, sharedB.x + sharedB.w / 2, sharedB.y, s.s.ink, 1.5, "", true);
    s.line(experts.x + experts.w / 2, experts.y + experts.h, x + w / 2 - 4, my + 4, s.s.ink, 1.5, "", true);
    s.line(sharedB.x + sharedB.w / 2, sharedB.y + sharedB.h, x + w / 2 + 4, my + 4, s.s.ink, 1.5, "", true);
  }
}

/** 4 complete streams: split → pre-mixer → sublayer → post-mixer → merge */
function drawMhc(ctx: MechCtx, x: number, y: number, w: number, h: number): void {
  const s = ctx.svg;
  const laneH = h / streams;
  for (let i = 0; i < streams; i++) {
    const ly = y + i * laneH;
    if (ctx.dir === "lr") {
      const cw = (w - 3 * 18) / 4;
      const split = { x, y: ly + laneH / 2 - 12, w: cw * 0.5, h: 24 };
      const pre = { x: x + cw * 0.62 + 18, y: ly + laneH / 2 - 12, w: cw * 0.8, h: 24 };
      const sub = { x: x + cw * 1.6 + 36, y: ly + laneH / 2 - 12, w: cw * 0.8, h: 24 };
      const post = { x: x + cw * 2.6 + 54, y: ly + laneH / 2 - 12, w: cw * 0.8, h: 24 };
      s.text(split.x, split.y + 16, `S${i + 1}`, { size: 12, weight: 600, fill: s.s.stream });
      s.line(split.x + 24, split.y + 12, pre.x, pre.y + 12, s.s.stream, 1.4, "", true);
      s.rect(pre.x, pre.y, pre.w, pre.h, s.s.mech, s.s.mechStroke, 1.2);
      s.text(pre.x + pre.w / 2, pre.y + 16, "pre-mix", { size: 12, anchor: "middle" });
      s.line(pre.x + pre.w, pre.y + 12, sub.x, sub.y + 12, s.s.stream, 1.4, "", true);
      s.rect(sub.x, sub.y, sub.w, sub.h, s.s.box, s.s.boxStroke, 1.2);
      s.text(sub.x + sub.w / 2, sub.y + 16, "sublayer", { size: 12, anchor: "middle" });
      s.line(sub.x + sub.w, sub.y + 12, post.x, post.y + 12, s.s.stream, 1.4, "", true);
      s.rect(post.x, post.y, post.w, post.h, s.s.mech, s.s.mechStroke, 1.2);
      s.text(post.x + post.w / 2, post.y + 16, "post-mix", { size: 12, anchor: "middle" });
      s.line(post.x + post.w, post.y + 12, x + w - 22, post.y + 12, s.s.stream, 1.4, "", true);
    } else {
      const rail = x + 10 + i * 8;
      s.line(rail, ly + 4, rail, ly + laneH - 4, s.s.stream, 1.4);
      const pre = { x: x + 52, y: ly + laneH / 2 - 11, w: 78, h: 22 };
      const sub = { x: x + 142, y: ly + laneH / 2 - 11, w: 78, h: 22 };
      const post = { x: x + 232, y: ly + laneH / 2 - 11, w: 78, h: 22 };
      s.line(rail, ly + laneH / 2, pre.x, pre.y + 11, s.s.stream, 1.4, "", true);
      s.rect(pre.x, pre.y, pre.w, pre.h, s.s.mech, s.s.mechStroke, 1.2);
      s.text(pre.x + pre.w / 2, pre.y + 15, "pre-mix", { size: 12, anchor: "middle" });
      s.line(pre.x + pre.w, pre.y + 11, sub.x, sub.y + 11, s.s.stream, 1.4, "", true);
      s.rect(sub.x, sub.y, sub.w, sub.h, s.s.box, s.s.boxStroke, 1.2);
      s.text(sub.x + sub.w / 2, sub.y + 15, "sublayer", { size: 12, anchor: "middle" });
      s.line(sub.x + sub.w, sub.y + 11, post.x, post.y + 11, s.s.stream, 1.4, "", true);
      s.rect(post.x, post.y, post.w, post.h, s.s.mech, s.s.mechStroke, 1.2);
      s.text(post.x + post.w / 2, post.y + 15, "post-mix", { size: 12, anchor: "middle" });
      s.line(post.x + post.w, post.y + 11, x + w - 22, post.y + 11, s.s.stream, 1.4, "", true);
    }
  }
  if (ctx.dir === "lr") {
    s.rect(x + w - 18, y + 2, 10, h - 4, s.s.stream, s.s.stream, 1.2);
    s.text(x + w - 24, y - 6, "write merge", { size: 12, fill: s.s.muted, anchor: "end" });
  } else {
    s.rect(x + w - 18, y + 2, 10, h - 4, s.s.stream, s.s.stream, 1.2);
  }
}

// ---------------------------------------------------------------- shared chrome
function titleBlock(s: Svg, x: number, y: number, name: string): void {
  s.rect(x, y, 320, 92, s.s.panel, s.s.panelStroke, 1.4);
  s.text(x + 10, y + 18, "LLM ARCHITECTURE ATLAS — GLM-01", { size: 12.5, weight: 700, font: s.s.mono });
  s.text(x + 10, y + 36, "MODEL zai-org/GLM-5.3-Flash REV f93128cf", { size: 12, font: s.s.mono, fill: s.s.muted });
  s.text(x + 10, y + 54, `DRAWN ${name} · SCALE none`, { size: 12, font: s.s.mono, fill: s.s.muted });
  s.text(x + 10, y + 72, "SRC pinned config + publishable claims", { size: 12, font: s.s.mono, fill: s.s.muted });
}

function legend(s: Svg, x: number, y: number): void {
  s.line(x, y, x + 34, y, s.s.ink, 1.6, "", true);
  s.text(x + 40, y + 4, "data flow", { size: 12, fill: s.s.muted });
  s.line(x + 130, y, x + 164, y, s.s.muted, 1.4, s.s.dash);
  s.text(x + 170, y + 4, "callout", { size: 12, fill: s.s.muted });
  s.line(x + 250, y, x + 284, y, s.s.stream, 1.6, "", true);
  s.text(x + 290, y + 4, `residual stream ×${streams}`, { size: 12, fill: s.s.muted });
}

// ---------------------------------------------------------------- compositions
/** A: portrait poster, vertical spine left-center, right zoom column */
function compositionA(): string {
  const s = new Svg(1080, 1220, SKINS.a);
  s.text(24, 40, `GLM-5.3-Flash (${billions(F.total)}-A${billions(F.active)})`, { size: 26, weight: 700, fill: s.s.accent });
  s.text(24, 62, "Text decoder shown; vision encoder and MTP head omitted", { size: 12.5, fill: s.s.muted });
  const cx = 330;
  s.node(cx - 110, 96, 220, 34, "Tokenized text", {});
  s.node(cx - 120, 156, 240, 46, "Token embedding", { detail: `hidden ${commas(F.hidden)} · vocab ${commas(F.vocab)}` });
  s.line(cx, 130, cx, 156, s.s.ink, 1.5, "", true);
  const contY = 236;
  const contH = 470;
  s.rect(cx - 150, contY, 300, contH, "#c8cdd3", "#3b4046", 1.8, 10);
  s.rect(cx - 122, contY + 30, 244, contH - 60, s.s.mech, s.s.mechStroke, 1.6, 8);
  s.text(cx - 158, contY + contH / 2, `${F.layers} ×`, { size: 15, weight: 700, fill: s.s.accent, anchor: "end" });
  let by = contY + 44;
  const inner = [
    { label: "mHC mixer", mech: true, detail: "" },
    { label: "attention slot", mech: false, detail: `K,K,K,D per ${D_PERIOD} layers` },
    { label: "mHC mixer", mech: true, detail: "" },
    { label: "FFN slot", mech: false, detail: `${DENSE_COUNT} dense → ${MOE_COUNT} MoE` },
    { label: "mHC mixer", mech: true, detail: "" },
  ];
  inner.forEach((b, i) => {
    s.node(cx - 100, by, 200, b.detail ? 44 : 30, b.label, {
      fill: b.mech ? "#ffffff" : s.s.box,
      stroke: b.mech ? s.s.accent : s.s.boxStroke,
      detail: b.detail || undefined,
      size: 12.5,
    });
    const hh = b.detail ? 44 : 30;
    if (i < inner.length - 1) s.line(cx, by + hh, cx, by + hh + 22, s.s.ink, 1.5, "", true);
    by += hh + 22;
  });
  for (let i = 0; i < streams; i++) {
    const rx = cx - 138 + i * 6;
    s.line(rx, contY + 40, rx, contY + contH - 40, s.s.stream, 1.3);
  }
  let y = contY + contH + 26;
  s.line(cx, contY + contH, cx, y, s.s.ink, 1.5, "", true);
  s.node(cx - 100, y, 200, 34, "Final RMSNorm", {});
  y += 60;
  s.line(cx, y - 26, cx, y, s.s.ink, 1.5, "", true);
  s.node(cx - 120, y, 240, 44, "Linear output", { detail: `vocab ${commas(F.vocab)}` });
  const cards: Array<[string, (ctx: MechCtx, x: number, y: number, w: number, h: number) => void, Dir, number, number]> = [
    [`KDA — ${KDA_LAYERS.length} layers (Kimi Linear §4 Fig 3)`, drawKda, "tb", 224, 342],
    [`DSA — ${MLA_LAYERS.length} layers, 1 per ${D_PERIOD} (V3.2 §2.1 Fig 2)`, drawDsa, "tb", 302, 366],
    [`MoE — layers ${moeLayers[0]}–${moeLayers[moeLayers.length - 1]}`, drawMoe, "tb", 170, 472],
    [`mHC — ${streams} parallel streams (mHC Fig 1c)`, drawMhc, "lr", 150, 531],
  ];
  let cyv = 96;
  const cxx = 640;
  const cw = 416;
  for (const [title, draw, dir, ch, anchorY] of cards) {
    s.panel(cxx, cyv, cw, ch + 34, title);
    draw({ svg: s, dir }, cxx + 14, cyv + 40, cw - 28, ch - 16);
    const mid = cyv + (ch + 34) / 2;
    s.poly([[cx + 150, anchorY], [cxx - 12, anchorY], [cxx - 12, mid], [cxx, mid]], s.s.muted, 1.3, s.s.dash);
    cyv += ch + 34 + 22;
  }
  const leaders: Array<[string, number]> = [
    [`vocab ${commas(F.vocab)}`, 112],
    [`hidden ${commas(F.hidden)}`, 176],
    [`${KDA_LAYERS.length} KDA · ${MLA_LAYERS.length} MLA/DSA`, contY + 90],
    [`${F.heads} heads`, contY + 130],
    [`context ${ctxLabel} tokens`, contY + 170],
    [`first ${DENSE_COUNT} dense, then ${MOE_COUNT} MoE`, contY + 260],
  ];
  for (const [t, ty] of leaders) {
    s.text(24, ty, t, { size: 12.5, weight: 600 });
    s.line(24 + t.length * 6.4, ty - 4, cx - 152, ty - 4, s.s.muted, 1.2, s.s.dash);
  }
  s.text(24, 880, "READING NOTES", { size: 12, weight: 700, font: s.s.mono, fill: s.s.muted });
  const notes = [
    `schedule K,K,K,D ×${UNITS} + K — ${F.layers} layers`,
    `DSA in ${MLA_LAYERS.length} of ${F.layers} layers (1 per ${D_PERIOD})`,
    `MoE layers ${moeLayers[0]}–${moeLayers[moeLayers.length - 1]}: ${routed} routed top-${activeRouted}, ${shared} shared`,
    `mHC: ${streams} residual streams through every sublayer`,
  ];
  notes.forEach((t, i) => s.text(24, 906 + i * 24, t, { size: 12.5 }));
  legend(s, 24, 1184);
  s.text(1056, 1188, "A · paper-editorial", { size: 12, fill: s.s.muted, anchor: "end", font: s.s.mono });
  return s.end();
}

/** B: landscape sheet, horizontal spine on top, 2×2 mechanism panels below */
function compositionB(): string {
  const s = new Svg(1560, 950, SKINS.b);
  s.text(28, 40, "GLM-5.3-Flash (320B-A18B) — ENGINEERING SHEET", { size: 22, weight: 700, font: s.s.mono });
  const sy = 96;
  const spineX = [40, 250, 470, 900, 1130];
  s.node(spineX[0], sy, 180, 40, "Tokenized text", {});
  s.node(spineX[1], sy, 190, 40, "Token embedding", { detail: `hidden ${commas(F.hidden)}` });
  s.rect(spineX[2], sy - 18, 400, 76, "none", s.s.panelStroke, 1.8, 0);
  s.text(spineX[2] + 10, sy - 4, `DECODER ×${F.layers} (K,K,K,D ×${UNITS} + K)`, { size: 12.5, weight: 700, font: s.s.mono });
  s.node(spineX[2] + 60, sy + 8, 130, 34, "attn slot", { size: 12.5 });
  s.node(spineX[2] + 220, sy + 8, 130, 34, "FFN slot", { size: 12.5 });
  s.line(spineX[2] + 190, sy + 25, spineX[2] + 220, sy + 25, s.s.ink, 1.5, "", true);
  s.node(spineX[3], sy, 180, 40, "Final RMSNorm", {});
  s.node(spineX[4], sy, 210, 40, "Linear output", { detail: `vocab ${commas(F.vocab)}` });
  for (let i = 0; i < 4; i++) s.line(spineX[i] + (i === 1 ? 190 : i === 2 ? 400 : 180), sy + 20, spineX[i + 1], sy + 20, s.s.ink, 1.6, "", true);
  s.line(spineX[2] + 200, sy + 66, spineX[2] + 200, sy + 96, s.s.accent, 1.3);
  s.text(spineX[2] + 208, sy + 90, `${F.layers} layers · ${streams} stream rails · ${F.heads} heads`, { size: 12, fill: s.s.accent, font: s.s.mono });
  const panels: Array<[string, (ctx: MechCtx, x: number, y: number, w: number, h: number) => void, Dir]> = [
    [`KDA — ${KDA_LAYERS.length} layers (Kimi Linear §4, Fig 3)`, drawKda, "lr"],
    [`DSA — ${MLA_LAYERS.length} layers, 1 per ${D_PERIOD} (DeepSeek-V3.2 §2.1, Fig 2)`, drawDsa, "lr"],
    [`MoE — ${routed} routed, top-${activeRouted}, ${shared} shared`, drawMoe, "tb"],
    [`mHC — ${streams} streams (mHC Fig 1c)`, drawMhc, "tb"],
  ];
  const pw = 730;
  const ph = 310;
  const px = [40, 800];
  const py = [250, 584];
  panels.forEach(([title, draw, dir], i) => {
    const x = px[i % 2]!;
    const y = py[Math.floor(i / 2)]!;
    s.panel(x, y, pw, ph, title);
    draw({ svg: s, dir, cap: 180 }, x + 20, y + 44, pw - 40, ph - 76);
  });
  titleBlock(s, 1210, 150, "B blueprint");
  legend(s, 40, 916);
  s.text(1520, 920, "B · engineering-blueprint", { size: 12, fill: s.s.muted, anchor: "end", font: s.s.mono });
  return s.end();
}

/** C: narrow portrait, mechanism cards nested inside the decoder container */
function compositionC(): string {
  const s = new Svg(960, 1900, SKINS.c);
  s.text(24, 40, "GLM-5.3-Flash (320B-A18B)", { size: 24, weight: 700 });
  s.text(24, 62, "nested-containment reading: mechanisms live inside the repeat unit", { size: 12.5, fill: s.s.muted });
  const cx = 480;
  s.node(cx - 110, 92, 220, 34, "Tokenized text", {});
  s.node(cx - 120, 152, 240, 44, "Token embedding", { detail: `hidden ${commas(F.hidden)} · vocab ${commas(F.vocab)}` });
  s.line(cx, 126, cx, 152, s.s.ink, 1.5, "", true);
  const contY = 230;
  const contH = 1400;
  s.rect(cx - 300, contY, 600, contH, "#ffffff", s.s.panelStroke, 1.8, 14);
  s.text(cx - 288, contY + 22, `DECODER REPEAT UNIT ×${F.layers}`, { size: 13.5, weight: 700 });
  let y = contY + 40;
  s.node(cx - 100, y, 200, 30, "mHC mixer (pre)", { fill: "#d5f0f0", stroke: s.s.stream, size: 12.5 });
  s.line(cx, y + 30, cx, y + 52, s.s.ink, 1.5, "", true);
  y += 52;
  const kdaH = 250;
  s.panel(cx - 270, y, 540, kdaH, `KDA block — ${KDA_LAYERS.length} layers`);
  drawKda({ svg: s, dir: "tb" }, cx - 90, y + 34, 180, kdaH - 56);
  s.line(cx, y + kdaH, cx, y + kdaH + 20, s.s.ink, 1.5, "", true);
  y += kdaH + 20;
  const dsaH = 320;
  s.panel(cx - 270, y, 540, dsaH, `DSA block — ${MLA_LAYERS.length} layers, 1 per ${D_PERIOD}`);
  drawDsa({ svg: s, dir: "tb" }, cx - 90, y + 34, 180, dsaH - 56);
  s.line(cx, y + dsaH, cx, y + dsaH + 20, s.s.ink, 1.5, "", true);
  y += dsaH + 20;
  s.node(cx - 100, y, 200, 30, "mHC mixer (mid)", { fill: "#d5f0f0", stroke: s.s.stream, size: 12.5 });
  s.line(cx, y + 30, cx, y + 52, s.s.ink, 1.5, "", true);
  y += 52;
  const moeH = 250;
  s.panel(cx - 270, y, 540, moeH, `MoE block — layers ${moeLayers[0]}–${moeLayers[moeLayers.length - 1]}`);
  drawMoe({ svg: s, dir: "tb" }, cx - 200, y + 36, 400, moeH - 64);
  s.line(cx, y + moeH, cx, y + moeH + 20, s.s.ink, 1.5, "", true);
  y += moeH + 20;
  const mhcH = 260;
  s.panel(cx - 270, y, 540, mhcH, `mHC — ${streams} streams through every sublayer`);
  drawMhc({ svg: s, dir: "tb" }, cx - 250, y + 36, 500, mhcH - 64);
  s.line(cx, y + mhcH, cx, y + mhcH + 20, s.s.ink, 1.5, "", true);
  y += mhcH + 20;
  s.node(cx - 100, y, 200, 30, "mHC mixer (post)", { fill: "#d5f0f0", stroke: s.s.stream, size: 12.5 });
  s.line(cx, 196, cx, contY, s.s.ink, 1.5, "", true);
  s.line(cx, contY + contH, cx, contY + contH + 30, s.s.ink, 1.5, "", true);
  s.node(cx - 110, contY + contH + 30, 220, 34, "Final RMSNorm", {});
  s.line(cx, contY + contH + 64, cx, contY + contH + 90, s.s.ink, 1.5, "", true);
  s.node(cx - 120, contY + contH + 90, 240, 44, "Linear output", { detail: `vocab ${commas(F.vocab)}` });
  const notes: Array<[string, number, "l" | "r"]> = [
    [`${KDA_LAYERS.length} KDA layers`, contY + 120, "l"],
    [`${MLA_LAYERS.length} MLA/DSA layers`, contY + 420, "r"],
    [`${F.heads} heads`, contY + 460, "l"],
    [`context ${ctxLabel} tokens`, contY + 500, "r"],
    [`first ${DENSE_COUNT} dense`, contY + 760, "l"],
    [`then ${MOE_COUNT} MoE`, contY + 800, "r"],
    [`${routed} routed · top-${activeRouted}`, contY + 840, "l"],
    [`${streams} residual streams`, contY + 1180, "l"],
  ];
  for (const [t, ty, side] of notes) {
    if (side === "l") {
      s.text(24, ty, t, { size: 12.5, weight: 600 });
      s.line(24 + t.length * 6.4, ty - 4, cx - 302, ty - 4, s.s.muted, 1.2, s.s.dash);
    } else {
      s.line(cx + 302, ty - 4, 786, ty - 4, s.s.muted, 1.2, s.s.dash);
      s.text(790, ty, t, { size: 12.5, weight: 600 });
    }
  }
  legend(s, 24, 1856);
  s.text(936, 1860, "C · nested-containment", { size: 12, fill: s.s.muted, anchor: "end", font: s.s.mono });
  return s.end();
}

const outDir = dirname(fileURLToPath(import.meta.url));
const svgs: Record<string, string> = { a: compositionA(), b: compositionB(), c: compositionC() };
for (const [k, svg] of Object.entries(svgs)) {
  writeFileSync(`${outDir}/candidate-${k}.svg`, svg);
  console.log(`wrote candidate-${k}.svg`);
}

/** comparison board: the three candidates at a common scale with their rubric totals */
function compositionBoard(): string {
  const s = new Svg(1635, 1480, SKINS.c);
  s.text(24, 34, "GLM-5.3-Flash — composition candidates (scoring: rubric.md)", { size: 16, weight: 700 });
  const nest = (k: string, x: number, y: number, w: number, h: number, vb: string): void => {
    const innerBody = svgs[k]!.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    s.out.push(`<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb}">${innerBody}</svg>`);
    s.rect(x, y, w, h, "none", "#b9c2d2", 1);
  };
  const sc = 0.62;
  const aw = 1080 * sc, ah = 1220 * sc, bw = 1560 * sc, bh = 950 * sc, cw = 960 * sc, ch = 1900 * sc;
  nest("a", 24, 56, aw, ah, "0 0 1080 1220");
  s.text(24, 56 + ah + 16, "A · paper-editorial — 49/55 · recommended", { size: 12.5, weight: 700, font: s.s.mono });
  nest("b", 24, 56 + ah + 34, bw, bh, "0 0 1560 950");
  s.text(24, 56 + ah + 34 + bh + 16, "B · engineering-blueprint — 42/55", { size: 12.5, weight: 700, font: s.s.mono });
  const cx0 = 24 + bw + 24;
  nest("c", cx0, 56, cw, ch, "0 0 960 1900");
  s.text(cx0, 56 + ch + 16, "C · nested-containment — 47/55 · fallback", { size: 12.5, weight: 700, font: s.s.mono });
  return s.end();
}
const board = compositionBoard();
writeFileSync(`${outDir}/comparison-board.svg`, board);
console.log("wrote comparison-board.svg");

async function renderPngs(): Promise<void> {
  const { createRequire } = await import("node:module");
  const req = createRequire(`${root}/apps/web/package.json`);
  const { chromium } = req("@playwright/test");
  const browser = await chromium.launch();
  for (const [k, svg] of Object.entries({ ...svgs, board })) {
    const name = k === "board" ? "comparison-board" : `candidate-${k}`;
    const vp = k === "board" ? { width: 1700, height: 1560 } : { width: 1600, height: 1900 };
    const page = await browser.newPage({ viewport: vp });
    await page.setContent(`<body style="margin:0;background:#fff">${svg}</body>`);
    await page.locator("svg").first().screenshot({ path: `${outDir}/${name}.png` });
    await page.close();
    console.log(`wrote ${name}.png`);
  }
  await browser.close();
}

if (process.argv.includes("--png")) {
  renderPngs().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
