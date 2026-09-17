/**
 * GLM-5.3-Flash composition candidates, round 3 (issue #34 pre-work, plan §3.4).
 *
 * Round-2 review: mHC topology was wrong in all three candidates (P0), and the
 * candidates hardcoded their semantic edges per composition instead of sharing
 * one reviewed Diagram IR (P1). This rewrite therefore:
 *
 * - builds ONE DiagramScene (compound IR from merged #33: groups with parents
 *   and boundary ports, per-stream port tags/roles, scene-level stream
 *   declarations) and runs validateScene() on it before emitting anything —
 *   a candidate cannot draw content the IR does not carry;
 * - renders three compositions from that scene: only placement, canvas and
 *   skin differ. Labels, details, group titles, flow edges and stream rails
 *   all come from the scene;
 * - draws mHC per Fig 1(c)/Eq.(3): n streams aggregate (H-pre) into ONE
 *   sublayer pass, H-post writes back to n streams, H-res mixes the skip path;
 * - keeps the evidence harness: every drawn number binds to a publishable
 *   claim first and cross-checks the pinned config / IR.
 *
 * Run: npx tsx prototypes/glm-compositions/render-candidates.ts [--png]
 * Emits candidate-{a,b,c}.svg + comparison-board.svg (and .png with --png).
 * Prototype/review material, never the canonical artifact.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateScene } from "../../packages/diagram-engine/src/validate.js";
import {
  DIAGRAM_ENGINE_VERSION,
  type DiagramScene,
  type SemanticGroup,
  type SemanticNode,
} from "../../packages/diagram-engine/src/types.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelDir = `${root}/models/zai-org/glm-5-3-flash/main`;
const arch = JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8"));
const evidence = JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8"));

// ---------------------------------------------------------------- evidence
const PUBLISHABLE = new Set(["verified", "reported", "derived"]);
function claimRec(path: string): unknown {
  const c = evidence.claims.find((x: { path: string }) => x.path === path);
  if (!c || !PUBLISHABLE.has(c.status)) throw new Error(`claim ${path} missing or not publishable`);
  return c.value;
}
function claim(path: string): number {
  const v = claimRec(path);
  if (typeof v !== "number") throw new Error(`claim ${path} is not a number`);
  return v;
}
function claimStr(path: string): string {
  const v = claimRec(path);
  if (typeof v !== "string") throw new Error(`claim ${path} is not a string`);
  return v;
}
function fact(key: string): number {
  const v = (arch.facts as Record<string, unknown>)[key];
  if (typeof v !== "number") throw new Error(`fact ${key} is not a number`);
  return v;
}
const eq = (a: unknown, b: unknown, what: string): void => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`frozen fact drift: ${what}`);
};
const ok = (cond: boolean, what: string): void => {
  if (!cond) throw new Error(`frozen fact drift: ${what}`);
};
// Every drawn number binds to an evidence claim first, then cross-checks the
// pinned config / IR. Deleting or downgrading any of these claims stops emit.
const bothFact = (path: string, key: string, what: string): number => {
  const c = claim(path);
  eq(c, fact(key), `${what} (claim vs config)`);
  return c;
};
const bothIr = (path: string, ir: number, what: string): number => {
  const c = claim(path);
  eq(c, ir, `${what} (claim vs IR)`);
  return c;
};

const F = {
  layers: bothFact("facts.num_hidden_layers", "num_hidden_layers", "layers"),
  hidden: bothFact("facts.hidden_size", "hidden_size", "hidden"),
  vocab: bothFact("facts.vocab_size", "vocab_size", "vocab"),
  heads: bothFact("facts.num_attention_heads", "num_attention_heads", "heads"),
  context: bothFact("facts.context_tokens", "context_tokens", "context"),
  total: bothFact("facts.total_params", "total_params", "total"),
  active: bothFact("facts.active_params", "active_params", "active"),
};
const linear = arch.topology.attention_groups.find((g: { kind: string }) => g.kind === "linear_attention")!;
const mla = arch.topology.attention_groups.find((g: { kind: string }) => g.kind === "mla_sparse")!;
const KDA_LAYERS: number[] = linear.layers;
const MLA_LAYERS: number[] = mla.layers;
const routed = bothIr("topology.experts.routed_total", (arch.topology.experts as { routed_total: number }).routed_total, "routed");
const activeRouted = bothIr("topology.experts.active_routed", (arch.topology.experts as { active_routed: number }).active_routed, "activeRouted");
const shared = bothIr("topology.experts.shared", (arch.topology.experts as { shared: number }).shared, "shared");
const streams = bothIr("topology.residual.streams", (arch.topology.residual as { streams: number }).streams, "streams");
const indexerHeads = claim("topology.attention.dsa_indexer_heads");
const topk = claim("topology.attention.dsa_topk");
const convKernel = claim("topology.attention.kda_short_conv_kernel");
eq(claim("topology.attention.kda_heads"), F.heads, "kda heads == attention heads");
eq(claimStr("topology.residual.scheme"), "mhc", "residual scheme is mhc");
eq(claim("topology.mtp.predict_layers"), 1, "mtp predict layers (backs the omission note)");
const denseLayers: number[] = arch.topology.ffn_groups.find((g: { kind: string }) => g.kind === "dense_ffn")!.layers;
const moeLayers: number[] = arch.topology.ffn_groups.find((g: { kind: string }) => g.kind === "moe")!.layers;
const UNITS = MLA_LAYERS.length; // 11 four-layer units
const DENSE_COUNT = denseLayers.length;
const MOE_COUNT = moeLayers.length;
const D_PERIOD = 4; // K,K,K,D period
// prose schedule/partition claims: pin the numbers they carry
ok(claimStr("topology.attention_groups[0]").includes(`${KDA_LAYERS.length} KDA`), "attention_groups[0] KDA count");
ok(claimStr("topology.attention_groups[0]").includes("K,K,K,D"), "attention_groups[0] schedule shape");
ok(claimStr("topology.attention_groups[1]").includes(`${MLA_LAYERS.length} MLA/DSA`), "attention_groups[1] MLA count");
ok(claimStr("topology.ffn_groups[0]").includes(`first ${DENSE_COUNT} blocks dense`), "ffn_groups[0] dense count");
ok(claimStr("topology.ffn_groups[1]").includes(`${MOE_COUNT} sparse MoE`), "ffn_groups[1] MoE count");

// frozen assertions: counts, membership and partition, before any drawing
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
  if (i === F.layers - 1 || i % D_PERIOD !== D_PERIOD - 1) expectedLinear.add(i);
  else expectedMla.add(i);
}
eq([...KDA_LAYERS].sort((a, b) => a - b), [...expectedLinear].sort((a, b) => a - b), "K,K,K,D x11 + K membership (linear)");
eq([...MLA_LAYERS].sort((a, b) => a - b), [...expectedMla].sort((a, b) => a - b), "K,K,K,D x11 + K membership (mla)");
eq(denseLayers, [0, 1, 2], "dense partition");
eq(moeLayers.length, F.layers - DENSE_COUNT, "moe partition length");
eq(moeLayers[0], DENSE_COUNT, "moe partition start");

const commas = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const billions = (n: number): string => `${Math.round((n / 1e9) * 10) / 10}B`;
const ctxLabel = `${Math.round(F.context / 1048576)}M`;

// ---------------------------------------------------------------- the scene
/** One reviewed Diagram IR for all candidates. Composition varies placement
 *  and skin only; every label/edge/stream below is shared. */
const SID = [1, 2, 3, 4];
eq(SID.length, streams, "stream lane count");
const streamNodePorts = (prefix: string, role: "ingress" | "egress") =>
  SID.map((i) => ({ name: `${prefix}${i}`, side: "left" as const, stream: `s${i}`, role }));
const operatorPorts = () => [
  ...SID.map((i) => ({ name: `e${i}`, side: "left" as const, stream: `s${i}`, role: "ingress" as const })),
  ...SID.map((i) => ({ name: `x${i}`, side: "right" as const, stream: `s${i}`, role: "egress" as const })),
];

const scene: DiagramScene = {
  irVersion: DIAGRAM_ENGINE_VERSION,
  view: "overview",
  modelId: "zai-org/glm-5.3-flash",
  nodes: [
    { id: "tok", kind: "io", label: "Tokenized text" },
    {
      id: "embed", kind: "embedding", label: "Token embedding",
      detail: `hidden ${commas(F.hidden)} · vocab ${commas(F.vocab)}`,
      claims: [
        { claimPath: "facts.hidden_size", label: `hidden ${commas(F.hidden)}` },
        { claimPath: "facts.vocab_size", label: `vocab ${commas(F.vocab)}` },
      ],
    },
    { id: "read", kind: "split", label: "stream read x0", ports: streamNodePorts("s", "egress") },
    // mHC (Fig 1c / Eq 3) per sublayer: split → {H-pre aggregate, H-res skip};
    // ONE sublayer pass; H-post write-back and the skip mix meet at ⊕ (sum)
    ...SID.flatMap((i) => [
      { id: `sp0-${i}`, kind: "split", label: `split S${i}`, ports: [
        { name: "in", side: "left" as const, stream: `s${i}`, role: "ingress" as const },
        { name: "a", side: "right" as const, stream: `s${i}`, role: "egress" as const },
        { name: "b", side: "right" as const, stream: `s${i}`, role: "egress" as const },
      ] },
      { id: `sp1-${i}`, kind: "split", label: `split S${i}`, ports: [
        { name: "in", side: "left" as const, stream: `s${i}`, role: "ingress" as const },
        { name: "a", side: "right" as const, stream: `s${i}`, role: "egress" as const },
        { name: "b", side: "right" as const, stream: `s${i}`, role: "egress" as const },
      ] },
      { id: `sum1-${i}`, kind: "merge", label: "⊕", ports: [
        { name: "skip", side: "left" as const, stream: `s${i}`, role: "ingress" as const },
        { name: "f", side: "left" as const, stream: `s${i}`, role: "ingress" as const },
        { name: "out", side: "right" as const, stream: `s${i}`, role: "egress" as const },
      ] },
      { id: `sum2-${i}`, kind: "merge", label: "⊕", ports: [
        { name: "skip", side: "left" as const, stream: `s${i}`, role: "ingress" as const },
        { name: "f", side: "left" as const, stream: `s${i}`, role: "ingress" as const },
        { name: "out", side: "right" as const, stream: `s${i}`, role: "egress" as const },
      ] },
    ]),
    { id: "hpre1", kind: "merge", label: "H-pre (n→1)", ports: [
      ...SID.map((i) => ({ name: `in${i}`, side: "left" as const, stream: `s${i}`, role: "ingress" as const })),
      { name: "out", side: "right" as const },
    ] },
    { id: "hpost1", kind: "split", label: "H-post (1→n)", ports: [
      { name: "in", side: "left" as const },
      ...SID.map((i) => ({ name: `out${i}`, side: "right" as const, stream: `s${i}`, role: "egress" as const })),
    ] },
    { id: "hpre2", kind: "merge", label: "H-pre (n→1)", ports: [
      ...SID.map((i) => ({ name: `in${i}`, side: "left" as const, stream: `s${i}`, role: "ingress" as const })),
      { name: "out", side: "right" as const },
    ] },
    { id: "hpost2", kind: "split", label: "H-post (1→n)", ports: [
      { name: "in", side: "left" as const },
      ...SID.map((i) => ({ name: `out${i}`, side: "right" as const, stream: `s${i}`, role: "egress" as const })),
    ] },
    { id: "hres1", kind: "mix", label: "H-res mix", ports: [
      ...SID.map((i) => ({ name: `in${i}`, side: "left" as const, stream: `s${i}`, role: "ingress" as const })),
      ...SID.map((i) => ({ name: `out${i}`, side: "right" as const, stream: `s${i}`, role: "egress" as const })),
    ] },
    { id: "hres2", kind: "mix", label: "H-res mix", ports: [
      ...SID.map((i) => ({ name: `in${i}`, side: "left" as const, stream: `s${i}`, role: "ingress" as const })),
      ...SID.map((i) => ({ name: `out${i}`, side: "right" as const, stream: `s${i}`, role: "egress" as const })),
    ] },
    {
      id: "slot-attn", kind: "attention", label: "attention slot = sublayer F",
      detail: `K,K,K,D per ${D_PERIOD} layers`, ports: [{ name: "in", side: "left" as const }, { name: "out", side: "right" as const }],
    },
    {
      id: "slot-ffn", kind: "ffn", label: "FFN slot = sublayer F",
      detail: `${DENSE_COUNT} dense → ${MOE_COUNT} MoE`, ports: [{ name: "in", side: "left" as const }, { name: "out", side: "right" as const }],
    },
    { id: "write", kind: "merge", label: "stream write x1", ports: streamNodePorts("w", "ingress") },
    { id: "norm", kind: "norm", label: "Final RMSNorm" },
    { id: "head", kind: "output", label: "Linear output", detail: `vocab ${commas(F.vocab)}` },
    { id: "kda-qkv", kind: "attention", label: "Q/K/V ShortConv", detail: `kernel ${convKernel}`, claimPath: "topology.attention.kda_short_conv_kernel" },
    { id: "kda-core", kind: "attention", label: "KDA core", detail: "decay + recurrent state" },
    { id: "kda-gate", kind: "attention", label: "output gate" },
    { id: "dsa-idx", kind: "attention", label: "Lightning indexer", detail: `${indexerHeads} heads`, claimPath: "topology.attention.dsa_indexer_heads" },
    { id: "dsa-topk", kind: "attention", label: "Top-k", detail: `k=${topk}`, claimPath: "topology.attention.dsa_topk" },
    { id: "dsa-sel", kind: "attention", label: "selected KV" },
    { id: "dsa-mla", kind: "attention", label: "MLA core", detail: "latent KV" },
    { id: "moe-router", kind: "moe", label: "Router" },
    { id: "moe-experts", kind: "moe", label: "Routed experts", detail: `${routed} · top-${activeRouted}`, claimPath: "topology.experts.routed_total" },
    { id: "moe-shared", kind: "moe", label: "Shared expert", detail: `${shared} always on`, claimPath: "topology.experts.shared" },
    { id: "moe-merge", kind: "merge", label: "sum merge (⊕)" },
  ] as SemanticNode[],
  edges: [
    { id: "e-tok", from: "tok", to: "embed", kind: "flow" },
    { id: "e-emb", from: "embed", to: "read", kind: "flow" },
    { id: "e-write-norm", from: "write", to: "norm", kind: "flow" },
    { id: "e-head", from: "norm", to: "head", kind: "flow" },
    // mHC Eq.(3): aggregate → ONE pass → write-back; ⊕ adds the H-res skip
    ...SID.flatMap((i) => [
      { id: `m-sp0a${i}`, from: `sp0-${i}.a`, to: `hpre1.in${i}`, kind: "flow" as const },
      { id: `m-sp1a${i}`, from: `sp1-${i}.a`, to: `hpre2.in${i}`, kind: "flow" as const },
      { id: `m-hp1${i}`, from: `hpost1.out${i}`, to: `sum1-${i}.f`, kind: "flow" as const },
      { id: `m-hp2${i}`, from: `hpost2.out${i}`, to: `sum2-${i}.f`, kind: "flow" as const },
    ]),
    { id: "m-hpre1-f", from: "hpre1.out", to: "slot-attn.in", kind: "flow" },
    { id: "m-f-hpost1", from: "slot-attn.out", to: "hpost1.in", kind: "flow" },
    { id: "m-hpre2-f", from: "hpre2.out", to: "slot-ffn.in", kind: "flow" },
    { id: "m-f-hpost2", from: "slot-ffn.out", to: "hpost2.in", kind: "flow" },
    // mechanism chains (inside their groups)
    { id: "e-kda1", from: "kda-qkv", to: "kda-core", kind: "flow" },
    { id: "e-kda2", from: "kda-core", to: "kda-gate", kind: "flow" },
    { id: "e-dsa1", from: "dsa-idx", to: "dsa-topk", kind: "flow" },
    { id: "e-dsa2", from: "dsa-topk", to: "dsa-sel", kind: "flow" },
    { id: "e-dsa3", from: "dsa-sel", to: "dsa-mla", kind: "flow" },
    { id: "e-moe1", from: "moe-router", to: "moe-experts", kind: "flow" },
    { id: "e-moe2", from: "moe-router", to: "moe-shared", kind: "flow" },
    { id: "e-moe3", from: "moe-experts", to: "moe-merge", kind: "flow" },
    { id: "e-moe4", from: "moe-shared", to: "moe-merge", kind: "flow" },
    // residual stream rails = the skip spine with H-res mixing; every residual
    // edge is a consecutive pair of a stream declaration below
    ...SID.flatMap((i) => [
      { id: `r-read${i}`, from: `read.s${i}`, to: `g-dec.in${i}`, kind: "residual" as const, rail: "left" as const, label: `S${i}` },
      { id: `r-in${i}`, from: `g-dec.in${i}`, to: `sp0-${i}.in`, kind: "flow" as const, rail: "left" as const },
      { id: `r-sk1${i}`, from: `sp0-${i}.b`, to: `hres1.in${i}`, kind: "flow" as const, rail: "left" as const },
      { id: `r-sk1b${i}`, from: `hres1.out${i}`, to: `sum1-${i}.skip`, kind: "flow" as const, rail: "left" as const },
      { id: `r-mid${i}`, from: `sum1-${i}.out`, to: `sp1-${i}.in`, kind: "flow" as const, rail: "left" as const },
      { id: `r-sk2${i}`, from: `sp1-${i}.b`, to: `hres2.in${i}`, kind: "flow" as const, rail: "left" as const },
      { id: `r-sk2b${i}`, from: `hres2.out${i}`, to: `sum2-${i}.skip`, kind: "flow" as const, rail: "left" as const },
      { id: `r-out${i}`, from: `sum2-${i}.out`, to: `g-dec.out${i}`, kind: "flow" as const, rail: "left" as const },
      { id: `r-write${i}`, from: `g-dec.out${i}`, to: `write.w${i}`, kind: "residual" as const, rail: "left" as const },
    ]),
  ],
  groups: [
    {
      id: "g-dec", label: "decoder repeat unit", kind: "frame",
      members: [
        ...SID.flatMap((i) => [`sp0-${i}`, `sp1-${i}`, `sum1-${i}`, `sum2-${i}`]),
        "hpre1", "hpost1", "hpre2", "hpost2", "hres1", "hres2", "slot-attn", "slot-ffn",
      ],
      repeat: { count: F.layers, label: `${F.layers} ×` },
      claimPath: "facts.num_hidden_layers",
      ports: [
        ...SID.map((i) => ({ id: `in${i}`, side: "left" as const, inner: `sp0-${i}.in`, stream: `s${i}`, role: "ingress" as const })),
        ...SID.map((i) => ({ id: `out${i}`, side: "right" as const, inner: `sum2-${i}.out`, stream: `s${i}`, role: "egress" as const })),
      ],
    },
    {
      id: "g-kda", label: `KDA — ${KDA_LAYERS.length} layers (Kimi Linear §4 Fig 3)`,
      kind: "inset", members: ["kda-qkv", "kda-core", "kda-gate"], parent: "g-dec",
      claimPath: "topology.attention_groups[0]",
    },
    {
      id: "g-dsa", label: `DSA — ${MLA_LAYERS.length} layers, 1 per ${D_PERIOD} (V3.2 §2.1 Fig 2)`,
      kind: "inset", members: ["dsa-idx", "dsa-topk", "dsa-sel", "dsa-mla"], parent: "g-dec",
      claimPath: "topology.attention_groups[1]",
    },
    {
      id: "g-moe", label: `MoE — layers ${moeLayers[0]}–${moeLayers[moeLayers.length - 1]}`,
      kind: "inset", members: ["moe-router", "moe-experts", "moe-shared", "moe-merge"], parent: "g-dec",
      claimPath: "topology.ffn_groups[1]",
    },
  ] as SemanticGroup[],
  // stream = residual rail: read → split → H-res mix → ⊕ → … → write.
  // The aggregated sublayer pass (H-pre → F → H-post) feeds the ⊕ nodes via
  // flow edges; the rails are what the model calls the 4 residual streams.
  streams: SID.map((i) => ({
    id: `s${i}`,
    path: [
      `read.s${i}`, `g-dec.in${i}`, `sp0-${i}.in`, `sp0-${i}.b`, `hres1.in${i}`, `hres1.out${i}`,
      `sum1-${i}.skip`, `sum1-${i}.out`, `sp1-${i}.in`, `sp1-${i}.b`, `hres2.in${i}`, `hres2.out${i}`,
      `sum2-${i}.skip`, `sum2-${i}.out`, `g-dec.out${i}`, `write.w${i}`,
    ],
  })),
  annotations: [
    { claimPath: "facts.num_hidden_layers", target: "slot-attn", status: "reported" },
    { claimPath: "facts.num_attention_heads", target: "slot-attn", status: "reported" },
    { claimPath: "facts.context_tokens", target: "slot-attn", status: "reported" },
    { claimPath: "topology.attention_groups[0]", target: "kda-core", status: "reported" },
    { claimPath: "topology.attention_groups[1]", target: "dsa-sel", status: "reported" },
    { claimPath: "topology.ffn_groups[0]", target: "slot-ffn", status: "reported" },
    { claimPath: "topology.ffn_groups[1]", target: "slot-ffn", status: "reported" },
    { claimPath: "topology.residual.streams", target: "read", status: "reported" },
    { claimPath: "topology.residual.scheme", target: "read", status: "reported" },
    { claimPath: "topology.mtp.predict_layers", target: "head", status: "reported" },
  ],
  constraints: [{ type: "direction", value: "top-to-bottom" }],
};
const sceneErrors = validateScene(scene);
if (sceneErrors.length > 0) throw new Error(`Diagram IR invalid:\n${sceneErrors.join("\n")}`);

// mHC Eq.(3) structural assertions: the IR must keep carrying the paper
// topology — mutating any of these edges/degrees stops emit (round-3 P1).
const hasEdge = (from: string, to: string): boolean => scene.edges.some((e) => e.from === from && e.to === to);
const degree = (id: string): [number, number] => [
  scene.edges.filter((e) => e.to === id || e.to.startsWith(`${id}.`)).length,
  scene.edges.filter((e) => e.from === id || e.from.startsWith(`${id}.`)).length,
];
for (const [pre, post, f, res] of [["hpre1", "hpost1", "slot-attn", "hres1"], ["hpre2", "hpost2", "slot-ffn", "hres2"]] as const) {
  eq(degree(f), [1, 1], `${f} must be a SINGLE sublayer pass (one in, one out)`);
  eq(degree(pre)[0], streams, `${pre} aggregates n streams`);
  eq(degree(post)[1], streams, `${post} writes back to n streams`);
  for (const i of SID) {
    ok(hasEdge(`${post}.out${i}`, `sum1-${i}.f`) || hasEdge(`${post}.out${i}`, `sum2-${i}.f`), `${post}.out${i} feeds a ⊕ sum`);
    ok(hasEdge(`${res}.out${i}`, `sum1-${i}.skip`) || hasEdge(`${res}.out${i}`, `sum2-${i}.skip`), `${res}.out${i} feeds a ⊕ sum (Eq 3 residual term)`);
  }
}
for (const i of SID) {
  eq(degree(`sum1-${i}`), [2, 1], `sum1-${i} = Hres term + Hpost term, one out`);
  eq(degree(`sum2-${i}`), [2, 1], `sum2-${i} = Hres term + Hpost term, one out`);
}

const marginText = (path: string): string => {
  switch (path) {
    case "facts.num_hidden_layers": return `schedule K,K,K,D ×${UNITS} + K — ${F.layers} layers`;
    case "facts.num_attention_heads": return `${F.heads} heads`;
    case "facts.context_tokens": return `context ${ctxLabel} tokens`;
    case "topology.attention_groups[0]": return `${KDA_LAYERS.length} KDA layers`;
    case "topology.attention_groups[1]": return `${MLA_LAYERS.length} MLA/DSA layers`;
    case "topology.ffn_groups[0]": return `first ${DENSE_COUNT} dense`;
    case "topology.ffn_groups[1]": return `then ${MOE_COUNT} MoE · ${routed} routed top-${activeRouted} + ${shared} shared`;
    case "topology.residual.streams": return `${streams} residual streams`;
    default: return "";
  }
};
/** margin facts every composition must draw, derived from scene annotations */
const MARGIN: string[] = [...new Set(scene.annotations.map((a) => marginText(a.claimPath)).filter((t) => t !== ""))];
const EQ3 = `mHC Eq.(3): x' = Hres·x + Hpostᵀ·F(Hpre·x)`;

const N = (id: string): SemanticNode => scene.nodes.find((n) => n.id === id)!;
const G = (id: string): SemanticGroup => scene.groups.find((g) => g.id === id)!;
const groupEdges = (gid: string) => {
  const members = new Set(G(gid).members);
  return scene.edges.filter((e) => members.has(e.from) && members.has(e.to));
};

// ---------------------------------------------------------------- svg kit
interface Skin {
  bg: string; grid?: string; ink: string; muted: string; accent: string;
  mech: string; mechStroke: string; stream: string; box: string; boxStroke: string;
  panel: string; panelStroke: string; rx: number; dash: string; font: string; mono: string;
}
const SKINS: Record<string, Skin> = {
  a: {
    bg: "#eef4fb", ink: "#101418", muted: "#5b6470", accent: "#1a73e8",
    mech: "#3d94e6", mechStroke: "#1c5fa8", stream: "#0f8a80", box: "#ffffff", boxStroke: "#22262b",
    panel: "#ffffff", panelStroke: "#3b4046", rx: 8, dash: "2 4",
    font: "Helvetica, Arial, sans-serif", mono: "ui-monospace, monospace",
  },
  b: {
    bg: "#0d1a2b", grid: "#15273c", ink: "#e8f1fa", muted: "#8fa6bd", accent: "#f2a33c",
    mech: "#12364a", mechStroke: "#e08c2f", stream: "#63d8b8", box: "#0f2136", boxStroke: "#9fd4f5",
    panel: "#0d1a2b", panelStroke: "#67b7e8", rx: 2, dash: "5 4",
    font: "Helvetica, Arial, sans-serif", mono: "ui-monospace, monospace",
  },
  c: {
    bg: "#f5f7fa", ink: "#172033", muted: "#66707f", accent: "#2563eb",
    mech: "#dbeafe", mechStroke: "#2563eb", stream: "#0f766e", box: "#ffffff", boxStroke: "#172033",
    panel: "#ffffff", panelStroke: "#b9c2d2", rx: 10, dash: "4 4",
    font: "Helvetica, Arial, sans-serif", mono: "ui-monospace, monospace",
  },
};

class Svg {
  out: string[] = [];
  constructor(readonly w: number, readonly h: number, readonly s: Skin) {
    this.out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="${s.font}">`);
    this.out.push(`<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M,0 L10,5 L0,10 z" fill="${s.ink}"/></marker><marker id="art" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${s.stream}"/></marker></defs>`);
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
    // round-3 font acceptance: 12px is a hard emit-time floor, so a shrunk or
    // undersized label fails the render instead of shipping small type
    const size = o.size ?? 13;
    if (size < 12) throw new Error(`font floor violated: ${size}px < 12px for "${t}"`);
    this.out.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${o.fill ?? this.s.ink}" font-weight="${o.weight ?? 400}" text-anchor="${o.anchor ?? "start"}"${o.font ? ` font-family="${o.font}"` : ""}>${this.esc(t)}</text>`);
  }
  line(x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 1.5, dash = "", arrow = false, teal = false): void {
    this.out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}${arrow ? ` marker-end="url(#${teal ? "art" : "ar"})"` : ""}/>`);
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
  /** scene node drawn as a box, labels/details straight from the IR */
  irNode(id: string, x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; size?: number; tfill?: string; dfill?: string } = {}): void {
    const n = N(id);
    this.node(x, y, w, h, n.label, { ...o, detail: n.detail });
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

// ---------------------------------------------------------------- geometry
interface R { x: number; y: number; w: number; h: number }
type Side = "left" | "right" | "top" | "bottom";
function anchor(r: R, side: Side, t = 0.5): [number, number] {
  if (side === "left") return [r.x, r.y + r.h * t];
  if (side === "right") return [r.x + r.w, r.y + r.h * t];
  if (side === "top") return [r.x + r.w * t, r.y];
  return [r.x + r.w * t, r.y + r.h];
}
function facing(a: R, b: R): [Side, Side] {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  if (Math.abs(dy) > Math.abs(dx)) return dy > 0 ? ["bottom", "top"] : ["top", "bottom"];
  return dx > 0 ? ["right", "left"] : ["left", "right"];
}
/** port anchor on a group rect: ports distributed along their declared side */
function groupAnchor(g: SemanticGroup, gr: R, portId: string, map: (s: Side) => Side): [number, number] {
  const p = g.ports!.find((x) => x.id === portId)!;
  const side = map(p.side);
  const same = g.ports!.filter((x) => map(x.side) === side);
  const t = (same.findIndex((x) => x.id === portId) + 0.5) / same.length;
  return anchor(gr, side, t);
}
function nodeAnchor(nr: R, other: [number, number]): [number, number] {
  const c: [number, number] = [nr.x + nr.w / 2, nr.y + nr.h / 2];
  const dx = other[0] - c[0];
  const dy = other[1] - c[1];
  if (Math.abs(dy) > Math.abs(dx)) return anchor(nr, dy > 0 ? "bottom" : "top");
  return anchor(nr, dx > 0 ? "right" : "left");
}

/** draw one mechanism group's members + its IR edges inside rect r */
function drawGroup(s: Svg, gid: string, r: R, dir: "lr" | "tb", opts: { mechFill?: (id: string) => boolean } = {}): Record<string, R> {
  const g = G(gid);
  const rects: Record<string, R> = {};
  const mech = opts.mechFill ?? ((id: string) => ["kda-core", "dsa-sel"].includes(id));
  if (gid === "g-moe") {
    const rw = r.w * 0.34;
    rects["moe-router"] = { x: r.x + r.w / 2 - rw / 2, y: r.y + 4, w: rw, h: 34 };
    const ew = r.w / 2 - 12;
    rects["moe-experts"] = { x: r.x, y: r.y + 62, w: ew, h: 46 };
    rects["moe-shared"] = { x: r.x + r.w / 2 + 12, y: r.y + 62, w: ew, h: 46 };
    rects["moe-merge"] = { x: r.x + r.w / 2 - 11, y: r.y + 132, w: 22, h: 22 };
  } else {
    const order = g.members;
    const n = order.length;
    if (dir === "lr") {
      const gap = 26;
      const hh = Math.min(r.h, 180);
      const oy = r.y + (r.h - hh) / 2;
      const sw = (r.w - gap * (n - 1)) / n;
      order.forEach((id, i) => { rects[id] = { x: r.x + i * (sw + gap), y: oy, w: sw, h: hh }; });
    } else {
      const gap = 26;
      const sh = Math.max(48, (r.h - gap * (n - 1)) / n);
      order.forEach((id, i) => { rects[id] = { x: r.x, y: r.y + i * (sh + gap), w: r.w, h: sh }; });
    }
  }
  for (const id of g.members) {
    const rc = rects[id]!;
    if (id === "moe-merge") {
      s.plus(rc.x + 11, rc.y + 11);
    } else {
      s.irNode(id, rc.x, rc.y, rc.w, rc.h, {
        fill: mech(id) ? s.s.mech : s.s.box,
        stroke: mech(id) ? s.s.mechStroke : s.s.boxStroke,
        tfill: mech(id) && s.s.mech === "#3d94e6" ? "#ffffff" : undefined,
        dfill: mech(id) && s.s.mech === "#3d94e6" ? "#eaf3fb" : undefined,
        size: 12.5,
      });
    }
  }
  for (const e of groupEdges(gid)) {
    const a = rects[e.from]!;
    const b = rects[e.to]!;
    if (gid === "g-moe") {
      // fixed fan anchors: router drops down, experts/shared drop into merge
      const [fx, fy] = anchor(a, "bottom");
      const [tx, ty] = anchor(b, "top");
      s.line(fx, fy, tx, ty, s.s.ink, 1.4, "", true);
    } else {
      const [sa, sb] = facing(a, b);
      s.line(...anchor(a, sa), ...anchor(b, sb), s.s.ink, 1.5, "", true);
    }
  }
  return rects;
}

/** mHC card rendered FROM the scene: split dots, H-pre aggregate, ONE sublayer
 *  pass F, H-post write-back, H-res skip bar and explicit ⊕ sum nodes
 *  (Fig 1(c) / Eq.(3)). Every arrow below mirrors a scene edge. */
function drawStreamCard(s: Svg, r: R): void {
  const laneY = (i: number): number => r.y + 10 + (r.h - 44) * ((i + 0.5) / streams);
  const midY = r.y + r.h / 2 - 6;
  const dotX = r.x + 26;
  const barX = r.x + 62;
  const hpre = { x: r.x + 84, y: midY - 17, w: 74, h: 34 };
  const fbox = { x: r.x + 172, y: midY - 17, w: 74, h: 34 };
  const hpost = { x: r.x + 260, y: midY - 17, w: 74, h: 34 };
  const sumX = r.x + r.w - 40;
  const tickX = r.x + r.w - 6;
  s.rect(barX - 4, r.y + 6, 8, r.h - 30, s.s.stream, s.s.stream, 1);
  s.text(barX + 6, r.y + r.h - 8, `${N("hres1").label} (skip, across streams)`, { size: 12, fill: s.s.stream });
  s.node(hpre.x, hpre.y, hpre.w, hpre.h, "H-pre", { fill: s.s.mech, stroke: s.s.mechStroke, size: 12.5 });
  s.node(fbox.x, fbox.y, fbox.w, fbox.h, "F", { size: 12.5 });
  s.node(hpost.x, hpost.y, hpost.w, hpost.h, "H-post", { fill: s.s.mech, stroke: s.s.mechStroke, size: 12.5 });
  s.line(hpre.x + hpre.w, midY, fbox.x, midY, s.s.ink, 1.5, "", true);
  s.line(fbox.x + fbox.w, midY, hpost.x, midY, s.s.ink, 1.5, "", true);
  for (let i = 0; i < streams; i++) {
    const ly = laneY(i);
    const sy = r.y + 10 + (r.h - 44) * ((i + 0.5) / streams);
    s.text(r.x + 2, sy + 4, `S${i + 1}`, { size: 12, weight: 600, fill: s.s.stream });
    s.line(r.x + 4, sy, dotX - 4, sy, s.s.stream, 1.3);
    s.out.push(`<circle cx="${dotX}" cy="${sy}" r="3" fill="${s.s.stream}"/>`);
    s.line(dotX + 4, sy, hpre.x, hpre.y + hpre.h * ((i + 0.5) / streams), s.s.stream, 1.2, "", true, true);
    s.line(dotX + 4, sy, barX - 4, sy, s.s.stream, 1.2, "", true, true);
    s.plus(sumX, sy);
    s.line(barX + 4, sy, sumX - 10, sy, s.s.stream, 1.2, "", true, true);
    s.line(hpost.x + hpost.w, hpost.y + hpost.h * ((i + 0.5) / streams), sumX - 8, sy - 4, s.s.stream, 1.2, "", true, true);
    s.line(sumX + 10, sy, tickX, sy, s.s.stream, 1.3, "", true, true);
  }
  void laneY;
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
  s.line(x + 250, y, x + 284, y, s.s.stream, 1.6, "", true, true);
  s.text(x + 290, y + 4, `residual stream ×${streams}`, { size: 12, fill: s.s.muted });
}

const OMISSION = "Text decoder shown; vision encoder and MTP head omitted";
const SCHEDULE = `schedule K,K,K,D ×${UNITS} + K — ${F.layers} layers`;

// ---------------------------------------------------------------- compositions
/** A: portrait poster, vertical spine, right zoom column */
function compositionA(): string {
  const s = new Svg(1080, 1220, SKINS.a);
  s.text(24, 40, `GLM-5.3-Flash (${billions(F.total)}-A${billions(F.active)})`, { size: 26, weight: 700, fill: s.s.accent });
  s.text(24, 62, OMISSION, { size: 12.5, fill: s.s.muted });
  const cx = 330;
  const tok: R = { x: cx - 110, y: 96, w: 220, h: 34 };
  const emb: R = { x: cx - 120, y: 156, w: 240, h: 46 };
  const dec: R = { x: cx - 150, y: 236, w: 300, h: 470 };
  const sa: R = { x: cx - 100, y: 332, w: 200, h: 44 };
  const sf: R = { x: cx - 100, y: 450, w: 200, h: 44 };
  const nrm: R = { x: cx - 100, y: 732, w: 200, h: 34 };
  const hed: R = { x: cx - 120, y: 792, w: 240, h: 44 };
  s.irNode("tok", tok.x, tok.y, tok.w, tok.h);
  s.irNode("embed", emb.x, emb.y, emb.w, emb.h);
  s.line(cx, tok.y + tok.h, cx, emb.y, s.s.ink, 1.5, "", true);
  s.line(cx, emb.y + emb.h, cx, dec.y, s.s.ink, 1.5, "", true);
  s.rect(dec.x, dec.y, dec.w, dec.h, "#c8cdd3", "#3b4046", 1.8, 10);
  s.rect(dec.x + 28, dec.y + 30, dec.w - 56, dec.h - 60, s.s.mech, s.s.mechStroke, 1.6, 8);
  s.text(dec.x - 8, dec.y + dec.h / 2, `${G("g-dec").repeat!.label}`, { size: 15, weight: 700, fill: s.s.accent, anchor: "end" });
  const chain: Array<[string, number, number]> = [
    ["hpre1", 30, 0], ["slot-attn", 44, 1], ["hpost1", 30, 0],
    ["hpre2", 30, 0], ["slot-ffn", 44, 1], ["hpost2", 30, 0],
  ];
  let chy = dec.y + 44;
  const chainR: Record<string, R> = {};
  for (const [id, hh, slot] of chain) {
    chainR[id] = { x: cx - 100, y: chy, w: 200, h: hh };
    if (slot) s.irNode(id, cx - 100, chy, 200, hh, { fill: "#ffffff", stroke: s.s.accent, tfill: "#101418", dfill: "#5b6470" });
    else s.irNode(id, cx - 100, chy, 200, hh, { fill: "#ffffff", stroke: s.s.boxStroke, size: 12.5 });
    chy += hh + 14;
  }
  for (const [a, b] of [["hpre1", "slot-attn"], ["slot-attn", "hpost1"], ["hpre2", "slot-ffn"], ["slot-ffn", "hpost2"]] as const) {
    s.line(cx, chainR[a]!.y + chainR[a]!.h, cx, chainR[b]!.y, s.s.ink, 1.5, "", true);
  }
  for (const [a, b] of [["hpost1", "hpre2"], ["hpost2", "write"]] as const) {
    const y1 = chainR[a]!.y + chainR[a]!.h;
    const y2 = b === "write" ? dec.y + dec.h : chainR[b]!.y;
    s.line(cx, y1, cx, y2, s.s.stream, 1.3, "", true, true);
  }
  s.line(cx, dec.y + dec.h, cx, nrm.y, s.s.ink, 1.5, "", true);
  s.irNode("norm", nrm.x, nrm.y, nrm.w, nrm.h);
  s.line(cx, nrm.y + nrm.h, cx, hed.y, s.s.ink, 1.5, "", true);
  s.irNode("head", hed.x, hed.y, hed.w, hed.h);
  // residual rails from the stream declarations: read ticks left, write right
  const gd = G("g-dec");
  for (let i = 0; i < streams; i++) {
    const [ix, iy] = groupAnchor(gd, dec, `in${i + 1}`, (x) => x);
    const [ox, oy] = groupAnchor(gd, dec, `out${i + 1}`, (x) => x);
    s.line(ix - 24, iy, ix - 6, iy, s.s.stream, 1.3, "", true, true);
    s.text(ix - 30, iy + 4, `S${i + 1}`, { size: 12, weight: 600, fill: s.s.stream, anchor: "end" });
    s.line(ox + 6, oy, ox + 24, oy, s.s.stream, 1.3, "", true, true);
    s.line(ix - 6, iy, ix - 6, dec.y + dec.h - 40, s.s.stream, 1.1);
    s.line(ox + 6, oy, ox + 6, dec.y + dec.h - 40, s.s.stream, 1.1);
  }
  // zoom cards: one per mechanism group + the stream card
  const cards: Array<[string, number, number]> = [
    ["g-kda", 224, 342], ["g-dsa", 302, 366], ["g-moe", 170, 472],
  ];
  let cyv = 96;
  const cxx = 640;
  const cw = 416;
  const mids: number[] = [];
  for (const [gid, ch, anchorY] of cards) {
    s.panel(cxx, cyv, cw, ch + 34, G(gid).label);
    drawGroup(s, gid, { x: cxx + 14, y: cyv + 40, w: cw - 28, h: ch - 16 }, gid === "g-moe" ? "tb" : "tb");
    const mid = cyv + (ch + 34) / 2;
    mids.push(mid);
    s.poly([[cx + 150, anchorY], [cxx - 12, anchorY], [cxx - 12, mid], [cxx, mid]], s.s.muted, 1.3, s.s.dash);
    cyv += ch + 34 + 22;
  }
  s.panel(cxx, cyv, cw, 184, `mHC — ${streams} streams, one shared sublayer pass (Fig 1c)`);
  drawStreamCard(s, { x: cxx + 14, y: cyv + 40, w: cw - 28, h: 134 });
  const mhcMid = cyv + 109;
  s.poly([[cx + 150, 531], [cxx - 12, 531], [cxx - 12, mhcMid], [cxx, mhcMid]], s.s.muted, 1.3, s.s.dash);
  // margin leaders
  const short = MARGIN.filter((t) => t.length <= 24);
  const long = MARGIN.filter((t) => t.length > 24);
  const leaderYs = [326, 366, 406, 446, 486];
  short.forEach((t, i) => {
    const ty = leaderYs[i]!;
    s.text(24, ty, t, { size: 12.5, weight: 600 });
    s.line(24 + t.length * 6.4, ty - 4, dec.x - 44, ty - 4, s.s.muted, 1.2, s.s.dash);
  });
  s.text(24, 880, "READING NOTES", { size: 12, weight: 700, font: s.s.mono, fill: s.s.muted });
  [...long, EQ3, OMISSION].forEach((t, i) => s.text(24, 906 + i * 24, t, { size: 12.5 }));
  legend(s, 24, 1184);
  s.text(1056, 1188, "A · paper-editorial", { size: 12, fill: s.s.muted, anchor: "end", font: s.s.mono });
  return s.end();
}

/** B: landscape sheet, horizontal spine, 2×2 panels, title block */
function compositionB(): string {
  const s = new Svg(1560, 950, SKINS.b);
  s.text(28, 40, `GLM-5.3-Flash (${billions(F.total)}-A${billions(F.active)}) — ENGINEERING SHEET`, { size: 22, weight: 700, font: s.s.mono });
  s.text(28, 62, OMISSION, { size: 12.5, fill: s.s.muted });
  const sy = 96;
  // slot boxes need >=192px width or the shrink-to-fit pass drops the 27-char
  // IR slot label below the 12px floor — dec/slots/norm/head sized for that
  const tok: R = { x: 40, y: sy, w: 180, h: 40 };
  const emb: R = { x: 240, y: sy, w: 210, h: 40 };
  const dec: R = { x: 470, y: sy - 18, w: 460, h: 76 };
  const sa: R = { x: 490, y: sy + 8, w: 200, h: 34 };
  const sf: R = { x: 710, y: sy + 8, w: 200, h: 34 };
  const nrm: R = { x: 960, y: sy, w: 170, h: 40 };
  const hed: R = { x: 1160, y: sy, w: 210, h: 40 };
  s.irNode("tok", tok.x, tok.y, tok.w, tok.h);
  s.irNode("embed", emb.x, emb.y, emb.w, emb.h);
  s.line(tok.x + tok.w, sy + 20, emb.x, sy + 20, s.s.ink, 1.6, "", true);
  s.line(emb.x + emb.w, sy + 20, dec.x, sy + 20, s.s.ink, 1.6, "", true);
  s.rect(dec.x, dec.y, dec.w, dec.h, "none", s.s.panelStroke, 1.8, 0);
  s.text(dec.x + 10, dec.y + 14, `DECODER ×${F.layers} (K,K,K,D ×${UNITS} + K)`, { size: 12.5, weight: 700, font: s.s.mono });
  s.irNode("slot-attn", sa.x, sa.y, sa.w, sa.h, { size: 12.5 });
  s.irNode("slot-ffn", sf.x, sf.y, sf.w, sf.h, { size: 12.5 });
  s.line(sa.x + sa.w, sy + 25, sf.x, sy + 25, s.s.ink, 1.5, "", true);
  s.line(dec.x + dec.w, sy + 20, nrm.x, sy + 20, s.s.ink, 1.6, "", true);
  s.irNode("norm", nrm.x, nrm.y, nrm.w, nrm.h);
  s.line(nrm.x + nrm.w, sy + 20, hed.x, sy + 20, s.s.ink, 1.6, "", true);
  s.irNode("head", hed.x, hed.y, hed.w, hed.h);
  // orange callout: the tick drops at x=730, clear of the write stubs
  // (x 520/620/720/820) and right of the fact columns (end x≈715); the text
  // sits below the stub arrowheads and left of the title block (x 1210)
  s.line(dec.x + 260, dec.y + dec.h, dec.x + 260, 218, s.s.accent, 1.3);
  s.text(dec.x + 270, 222, `${F.layers} layers (K,K,K,D ×${UNITS} + K) · ${streams} streams · ${F.heads} heads`, { size: 12, fill: s.s.accent, font: s.s.mono });
  // stream stubs: read above the decoder box, write below (rotated sides)
  const gd = G("g-dec");
  const rot = (x: Side): Side => (x === "top" ? "left" : x === "bottom" ? "right" : x === "left" ? "top" : "bottom");
  for (let i = 0; i < streams; i++) {
    const [ix, iy] = groupAnchor(gd, dec, `in${i + 1}`, rot);
    const [ox, oy] = groupAnchor(gd, dec, `out${i + 1}`, rot);
    s.line(ix, iy - 16, ix, iy - 3, s.s.stream, 1.3, "", true, true);
    s.text(ix - 4, iy - 20, `S${i + 1}`, { size: 12, weight: 600, fill: s.s.stream, anchor: "end" });
    s.line(ox, oy + 3, ox, oy + 16, s.s.stream, 1.3, "", true, true);
  }
  // fact block sits BELOW the write-stub arrowheads (tips reach y≈175), so no
  // stub pierces a text row; EQ3 follows, panels start under it
  MARGIN.forEach((t, i) => {
    const col = i < 4 ? 40 : 420;
    const yy = 190 + (i % 4) * 18;
    s.text(col, yy, t, { size: 12, font: s.s.mono, fill: s.s.muted });
  });
  s.text(40, 258, EQ3, { size: 12, font: s.s.mono, fill: s.s.muted });
  const panels: Array<[string, "lr" | "tb"]> = [["g-kda", "lr"], ["g-dsa", "lr"], ["g-moe", "tb"], ["stream", "tb"]];
  const pw = 730;
  const ph = 310;
  const px = [40, 800];
  const py = [268, 598];
  panels.forEach(([gid, dir], i) => {
    const x = px[i % 2]!;
    const y = py[Math.floor(i / 2)]!;
    if (gid === "stream") {
      s.panel(x, y, pw, ph, `mHC — ${streams} streams, shared pass (Fig 1c Eq 3)`);
      drawStreamCard(s, { x: x + 20, y: y + 44, w: pw - 40, h: ph - 76 });
    } else {
      s.panel(x, y, pw, ph, G(gid).label);
      drawGroup(s, gid, { x: x + 20, y: y + 44, w: pw - 40, h: ph - 76 }, dir, {
        mechFill: (id) => ["kda-core", "dsa-sel"].includes(id),
      });
    }
  });
  titleBlock(s, 1210, 150, "B blueprint");
  legend(s, 40, 916);
  s.text(1520, 920, "B · engineering-blueprint", { size: 12, fill: s.s.muted, anchor: "end", font: s.s.mono });
  return s.end();
}

/** C: narrow portrait, mechanism panels nested inside the decoder container,
 *  slots in a left column, mechanisms in a right column */
function compositionC(): string {
  const s = new Svg(1060, 1620, SKINS.c);
  s.text(24, 40, `GLM-5.3-Flash (${billions(F.total)}-A${billions(F.active)})`, { size: 24, weight: 700 });
  s.text(24, 62, "nested-containment reading: mechanisms live inside the repeat unit", { size: 12.5, fill: s.s.muted });
  s.text(24, 80, OMISSION, { size: 12.5, fill: s.s.muted });
  const cx = 530;
  const sx = cx - 230; // spine column (slots + entry/exit)
  const tok: R = { x: sx - 110, y: 100, w: 220, h: 34 };
  const emb: R = { x: sx - 120, y: 160, w: 240, h: 44 };
  const dec: R = { x: cx - 350, y: 240, w: 700, h: 1160 };
  s.irNode("tok", tok.x, tok.y, tok.w, tok.h);
  s.line(sx, tok.y + tok.h, sx, emb.y, s.s.ink, 1.5, "", true);
  s.irNode("embed", emb.x, emb.y, emb.w, emb.h);
  s.line(sx, emb.y + emb.h, sx, dec.y, s.s.ink, 1.5, "", true);
  s.rect(dec.x, dec.y, dec.w, dec.h, "#ffffff", s.s.panelStroke, 1.8, 14);
  s.text(dec.x + 12, dec.y + 22, `DECODER REPEAT UNIT ×${F.layers} (K,K,K,D ×${UNITS} + K)`, { size: 13.5, weight: 700 });
  const sa: R = { x: cx - 330, y: dec.y + 50, w: 200, h: 44 };
  const sf: R = { x: cx - 330, y: dec.y + 700, w: 200, h: 44 };
  const kda: R = { x: cx - 110, y: dec.y + 40, w: 440, h: 240 };
  const dsa: R = { x: cx - 110, y: dec.y + 300, w: 440, h: 300 };
  const moe: R = { x: cx - 110, y: dec.y + 620, w: 440, h: 240 };
  const mhc: R = { x: cx - 110, y: dec.y + 880, w: 440, h: 240 };
  s.line(sx, dec.y, sx, sa.y, s.s.ink, 1.5, "", true);
  const cchain: Array<[string, R]> = [
    ["hpre1", { x: sa.x, y: sa.y, w: sa.w, h: 30 }],
    ["slot-attn", { x: sa.x, y: sa.y + 40, w: sa.w, h: 44 }],
    ["hpost1", { x: sa.x, y: sa.y + 94, w: sa.w, h: 30 }],
    ["hpre2", { x: sf.x, y: sf.y, w: sf.w, h: 30 }],
    ["slot-ffn", { x: sf.x, y: sf.y + 40, w: sf.w, h: 44 }],
    ["hpost2", { x: sf.x, y: sf.y + 94, w: sf.w, h: 30 }],
  ];
  for (const [id, rc] of cchain) {
    if (id.startsWith("slot")) s.irNode(id, rc.x, rc.y, rc.w, rc.h, { fill: s.s.mech, stroke: s.s.mechStroke });
    else s.irNode(id, rc.x, rc.y, rc.w, rc.h, { size: 12.5 });
  }
  for (const [a, b] of [["hpre1", "slot-attn"], ["slot-attn", "hpost1"], ["hpre2", "slot-ffn"], ["slot-ffn", "hpost2"]] as const) {
    const ra = cchain.find((c) => c[0] === a)![1];
    const rb = cchain.find((c) => c[0] === b)![1];
    s.line(sx, ra.y + ra.h, sx, rb.y, s.s.ink, 1.5, "", true);
  }
  const r1 = cchain.find((c) => c[0] === "hpost1")![1];
  const r2 = cchain.find((c) => c[0] === "hpre2")![1];
  s.line(sx, r1.y + r1.h, sx, r2.y, s.s.stream, 1.3, "", true, true);
  const sa2 = cchain.find((c) => c[0] === "slot-attn")![1];
  const sf2 = cchain.find((c) => c[0] === "slot-ffn")![1];
  sa.y = sa2.y; sf.y = sf2.y;
  s.panel(kda.x, kda.y, kda.w, kda.h, G("g-kda").label);
  drawGroup(s, "g-kda", { x: kda.x + 30, y: kda.y + 40, w: kda.w - 60, h: kda.h - 60 }, "tb");
  s.panel(dsa.x, dsa.y, dsa.w, dsa.h, G("g-dsa").label);
  drawGroup(s, "g-dsa", { x: dsa.x + 60, y: dsa.y + 40, w: dsa.w - 120, h: dsa.h - 60 }, "tb");
  s.panel(moe.x, moe.y, moe.w, moe.h, G("g-moe").label);
  drawGroup(s, "g-moe", { x: moe.x + 50, y: moe.y + 40, w: moe.w - 100, h: moe.h - 60 }, "tb");
  s.panel(mhc.x, mhc.y, mhc.w, mhc.h, `mHC — ${streams} streams, one shared sublayer pass (Fig 1c)`);
  drawStreamCard(s, { x: mhc.x + 20, y: mhc.y + 36, w: mhc.w - 40, h: mhc.h - 60 });
  // realization links: slot → the mechanisms that fill it (partition, dashed).
  // No text on the links: the counts live in the panel titles and margin
  // notes, and any label here lands on the elbow or a panel border.
  s.line(sa.x + sa.w, sa.y + sa.h / 2, kda.x, sa.y + sa.h / 2, s.s.muted, 1.2, s.s.dash);
  s.poly([[sa.x + sa.w, sa.y + sa.h / 2 + 8], [cx - 120, sa.y + sa.h / 2 + 8], [cx - 120, dsa.y + 50], [dsa.x, dsa.y + 50]], s.s.muted, 1.2, s.s.dash);
  s.line(sf.x + sf.w, sf.y + sf.h / 2, moe.x, sf.y + sf.h / 2, s.s.muted, 1.2, s.s.dash);
  s.line(sx, sf.y + sf.h, sx, dec.y + dec.h, s.s.ink, 1.5, "", true);
  // residual rails: ticks outside, bundle inside the container edges
  const gd = G("g-dec");
  const iys: number[] = [];
  const oys: number[] = [];
  for (let i = 0; i < streams; i++) {
    const [, iy] = groupAnchor(gd, dec, `in${i + 1}`, (x) => x);
    const [, oy] = groupAnchor(gd, dec, `out${i + 1}`, (x) => x);
    iys.push(iy);
    oys.push(oy);
    s.line(dec.x - 26, iy, dec.x - 4, iy, s.s.stream, 1.3, "", true, true);
    s.text(dec.x - 32, iy + 4, `S${i + 1}`, { size: 12, weight: 600, fill: s.s.stream, anchor: "end" });
    s.line(dec.x + dec.w + 4, oy, dec.x + dec.w + 26, oy, s.s.stream, 1.3, "", true, true);
  }
  s.line(dec.x + 10, iys[0]!, dec.x + 10, iys[streams - 1]!, s.s.stream, 1.1);
  s.line(dec.x + dec.w - 10, oys[0]!, dec.x + dec.w - 10, oys[streams - 1]!, s.s.stream, 1.1);
  s.line(sx, dec.y + dec.h, sx, dec.y + dec.h + 30, s.s.ink, 1.5, "", true);
  s.irNode("norm", sx - 110, dec.y + dec.h + 30, 220, 34);
  s.line(sx, dec.y + dec.h + 64, sx, dec.y + dec.h + 90, s.s.ink, 1.5, "", true);
  s.irNode("head", sx - 120, dec.y + dec.h + 90, 240, 44);
  // margin notes both sides — same rule as A: leaders only carry SHORT facts,
  // long facts move to the reading-notes block. Leader ys sit between the
  // residual rail ticks (iy/oy = 385/675/965/1255) and clear of the spine
  // column, so no dashed line crosses a box or a rail arrow.
  const short = MARGIN.filter((t) => t.length <= 24);
  const long = MARGIN.filter((t) => t.length > 24);
  const pick = (frag: string): string => short.find((t) => t.includes(frag))!;
  const leftNotes: Array<[string, number]> = [
    [pick("KDA"), kda.y + 60],
    [pick("MLA/DSA"), dsa.y + 100],
    [pick("dense"), moe.y - 20],
  ];
  const rightNotes: Array<[string, number]> = [
    [pick("heads"), dsa.y + 60],
    [pick("context"), moe.y + 60],
    [pick("residual"), mhc.y + 210],
  ];
  for (const [t, ty] of leftNotes) {
    s.text(24, ty, t, { size: 12, weight: 600 });
    s.line(24 + t.length * 6.0 + 6, ty - 4, dec.x - 40, ty - 4, s.s.muted, 1.2, s.s.dash);
  }
  for (const [t, ty] of rightNotes) {
    s.text(1036, ty, t, { size: 12, weight: 600, anchor: "end" });
    s.line(dec.x + dec.w + 40, ty - 4, 1036 - t.length * 6.0 - 6, ty - 4, s.s.muted, 1.2, s.s.dash);
  }
  s.text(460, 1450, "READING NOTES", { size: 12, weight: 700, font: s.s.mono, fill: s.s.muted });
  [...long, EQ3].forEach((t, i) => s.text(460, 1476 + i * 24, t, { size: 12.5 }));
  legend(s, 24, 1560);
  s.text(1036, 1564, "C · nested-containment", { size: 12, fill: s.s.muted, anchor: "end", font: s.s.mono });
  return s.end();
}

// ---------------------------------------------------------------- emit
const outDir = dirname(fileURLToPath(import.meta.url));
const svgs: Record<string, string> = { a: compositionA(), b: compositionB(), c: compositionC() };
for (const [k, svg] of Object.entries(svgs)) {
  writeFileSync(`${outDir}/candidate-${k}.svg`, svg);
  console.log(`wrote candidate-${k}.svg`);
}

/** comparison board: the three candidates at a common scale with rubric totals */
function compositionBoard(): string {
  const s = new Svg(1700, 1480, SKINS.c);
  s.text(24, 34, "GLM-5.3-Flash — composition candidates (scoring: rubric.md)", { size: 16, weight: 700 });
  const nest = (k: string, x: number, y: number, w: number, h: number, vb: string): void => {
    const innerBody = svgs[k]!.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    s.out.push(`<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb}">${innerBody}</svg>`);
    s.rect(x, y, w, h, "none", "#b9c2d2", 1);
  };
  const sc = 0.62;
  const aw = 1080 * sc, ah = 1220 * sc, bw = 1560 * sc, bh = 950 * sc, cw = 1060 * sc, ch = 1620 * sc;
  nest("a", 24, 56, aw, ah, "0 0 1080 1220");
  s.text(24, 56 + ah + 16, "A · paper-editorial — 49/55 · recommended", { size: 12.5, weight: 700, font: s.s.mono });
  nest("b", 24, 56 + ah + 34, bw, bh, "0 0 1560 950");
  s.text(24, 56 + ah + 34 + bh + 16, "B · engineering-blueprint — 42/55", { size: 12.5, weight: 700, font: s.s.mono });
  const cx0 = 24 + bw + 24;
  nest("c", cx0, 56, cw, ch, "0 0 1060 1620");
  s.text(cx0, 56 + ch + 16, "C · nested-containment — 49/55 · tie, loses layout tiebreak", { size: 12.5, weight: 700, font: s.s.mono });
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
    const vp = k === "board" ? { width: 1760, height: 1560 } : k === "c" ? { width: 1200, height: 1700 } : { width: 1600, height: 1900 };
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
