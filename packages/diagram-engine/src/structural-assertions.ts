/**
 * GLM structural assertions (issue #35 acceptance 1): path-relation checks
 * over the compiled scene, not string matching. Each violation is a
 * GateFinding so it can enter the persistent-red baseline with the issue
 * that owns the fix (#34 for the topology items that are placeholder-red
 * today).
 */

import type { DiagramScene } from "./types.js";
import type { ModelDocument } from "@atlas/architecture-ir";
import type { GateFinding } from "./gates.js";

function splitRef(ref: string): string {
  const dot = ref.indexOf(".");
  return dot === -1 ? ref : ref.slice(0, dot);
}

export function assertGlmStructure(scene: DiagramScene, arch: ModelDocument): GateFinding[] {
  const findings: GateFinding[] = [];
  const push = (gate: string, target: string, message: string): void => {
    findings.push({ gate, target, message });
  };

  // -- layer schedule: K,K,K,D ×11 + tail K, every layer covered once
  const linear = arch.topology.attention_groups.find((g) => g.kind === "linear_attention");
  const mla = arch.topology.attention_groups.find((g) => g.kind === "mla_sparse");
  const scheduleOk =
    linear && mla &&
    linear.layers.length === 34 && mla.layers.length === 11 &&
    [...linear.layers, ...mla.layers].length === arch.facts.num_hidden_layers &&
    new Set([...linear.layers, ...mla.layers]).size === arch.facts.num_hidden_layers;
  if (!scheduleOk) {
    push("schedule", "canvas", `layer schedule does not partition ${arch.facts.num_hidden_layers} layers into K,K,K,D ×11 + K`);
  }
  const unit = scene.nodes.find((n) => n.id === "unit");
  const tail = scene.nodes.find((n) => n.id === "tail-kda");
  const decoder = scene.groups.find((g) => g.id === "g-decoder");
  if (!unit || !tail || !decoder?.repeat || decoder.repeat.count !== arch.facts.num_hidden_layers) {
    push("schedule", "g-decoder", "scene does not express the 45-layer decoder with a repeating unit and an explicit tail KDA layer");
  }

  // -- mHC: `streams` residual paths crossing sublayer boundaries, each from
  //    a distinct read port to a distinct write port (placeholder self-rails
  //    in the current topology make this persistent-red until #34)
  const streams = arch.topology.residual?.streams ?? 4;
  const residual = scene.edges.filter((e) => e.kind === "residual");
  const distinctFrom = new Set(residual.map((e) => e.from));
  const distinctTo = new Set(residual.map((e) => e.to));
  if (residual.length < streams || distinctFrom.size < streams || distinctTo.size < streams) {
    push(
      "mhc-streams",
      "mhc",
      `mHC: expected ${streams} cross-sublayer residual streams with distinct read/write ports, found ${residual.length} residual edges (placeholder self-rails until #34)`,
    );
  }

  // -- DSA: selected-KV path indexer → top-k → MLA core, claim-backed
  const selKv = scene.edges.find((e) => e.claimPath === "topology.attention.dsa_topk");
  const indexerToTopk = scene.edges.find((e) => splitRef(e.from) === "indexer" && splitRef(e.to) === "topk");
  if (!selKv || splitRef(selKv.from) !== "topk" || splitRef(selKv.to) !== "dsa") {
    push("dsa-selected-kv", "topk", "DSA selected-KV edge topk → dsa with the dsa_topk claim is missing");
  }
  if (!indexerToTopk) {
    push("dsa-selected-kv", "indexer", "DSA indexer → top-k edge is missing");
  }

  // -- MoE: router fan-out (>=2 targets) and an explicit fan-in merge
  const routerOut = scene.edges.filter((e) => splitRef(e.from) === "router");
  if (routerOut.length < 2) {
    push("moe-fanout", "router", `MoE router fans out to ${routerOut.length} targets; expected routed experts plus the shared path (explicit fan-out until #34)`);
  }
  const mergeNodes = scene.nodes.filter((n) => n.kind === "merge");
  const fanIn = mergeNodes.find((m) => scene.edges.filter((e) => splitRef(e.to) === m.id).length >= 2);
  if (!fanIn) {
    push("moe-fanin", "experts", "MoE has no merge node collecting routed + shared outputs (explicit fan-in until #34)");
  }

  return findings;
}
