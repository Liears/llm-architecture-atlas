/**
 * GLM structural assertions (issue #35 acceptance 1, strengthened in round 2
 * review): path-relation checks over the compiled scene, not string matching
 * and not count-matching. Each violation is a GateFinding so it can enter the
 * persistent-red baseline with the issue that owns the fix.
 *
 * - schedule: exact K,K,K,D ×11 + K layer membership and the same visible
 *   chunks in the reviewed anatomy poster;
 * - mHC: every declared stream crosses the inset boundary and preserves its
 *   read/residual/write legs around the shared H-pre → F → H-post path;
 * - DSA: indexer → top-k → selected KV → MLA, with the selected edge carrying
 *   the dsa_topk claim;
 * - MoE: router fan-out to routed/shared experts and an exact two-branch
 *   merge. Unrelated double-outs/double-ins are rejected.
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

  // -- layer schedule: exact membership of K,K,K,D ×11 + tail K
  const linear = arch.topology.attention_groups.find((g) => g.kind === "linear_attention");
  const mla = arch.topology.attention_groups.find((g) => g.kind === "mla_sparse");
  const total = arch.facts.num_hidden_layers;
  const expectedLinear = new Set<number>();
  const expectedMla = new Set<number>();
  for (let i = 0; i < total; i++) {
    if (i === total - 1) expectedLinear.add(i); // tail K
    else if (i % 4 === 3) expectedMla.add(i); // the D in each K,K,K,D unit
    else expectedLinear.add(i);
  }
  const sameSet = (a: Set<number>, b: number[]): boolean =>
    a.size === b.length && b.every((x) => a.has(x));
  const scheduleOk =
    linear && mla &&
    sameSet(expectedLinear, linear.layers) &&
    sameSet(expectedMla, mla.layers);
  if (!scheduleOk) {
    push("schedule", "canvas", `layer schedule does not match K,K,K,D ×${Math.floor((total - 1) / 4)} + K membership over ${total} layers`);
  }
  const expectedKinds = Array.from({ length: total }, (_, layer) => expectedMla.has(layer) ? "D" : "K");
  const expectedChunks = Array.from({ length: Math.ceil(total / 4) }, (_, index) => expectedKinds.slice(index * 4, index * 4 + 4));
  const pattern = scene.groups.find((g) => g.id === "g-pattern");
  const visibleScheduleOk = expectedChunks.every((chunk, index) => {
    const id = chunk.length === 4 ? `pattern-${index}` : "pattern-tail";
    const node = scene.nodes.find((candidate) => candidate.id === id);
    return node?.detail?.startsWith(chunk.join("  ")) && pattern?.members.includes(id);
  });
  if (!visibleScheduleOk || pattern?.members.length !== expectedChunks.length) {
    push("schedule", "g-pattern", `scene does not express the source-derived ${total}-layer K,K,K,D ×${Math.floor((total - 1) / 4)} + K schedule`);
  }

  // -- mHC: four explicit boundary/read/residual/write paths around F
  const streams = arch.topology.residual?.streams ?? 4;
  if (!scene.streams || scene.streams.length < streams) {
    push(
      "mhc-streams",
      "mhc",
      `mHC: expected ${streams} declared cross-sublayer streams, found ${scene.streams?.length ?? 0} (placeholder self-rails until #34)`,
    );
  } else {
    const edgePairs = new Set(scene.edges.map((edge) => `${edge.from}->${edge.to}`));
    const sharedOperatorPath =
      edgePairs.has("mhc-hpre.out->mhc-f.in") && edgePairs.has("mhc-f.out->mhc-hpost.in");
    for (const stream of scene.streams) {
      const index = stream.id.replace(/^s/, "");
      const expectedPath = [
        `mhc-source.s${index}`, `g-mhc.in${index}`, `mhc-split-${index}.in`, `mhc-split-${index}.res`,
        `mhc-hres.in${index}`, `mhc-hres.out${index}`, `mhc-sum-${index}.res`, `mhc-sum-${index}.out`,
        `g-mhc.out${index}`, `mhc-sink.w${index}`,
      ];
      const firstHead = splitRef(stream.path[0]!);
      const lastHead = splitRef(stream.path[stream.path.length - 1]!);
      const firstKind = scene.nodes.find((n) => n.id === firstHead)?.kind;
      const lastKind = scene.nodes.find((n) => n.id === lastHead)?.kind;
      if (firstKind !== "split" || lastKind !== "merge") {
        push("mhc-streams", stream.id, `stream ${stream.id} must start at a split (read) node and end at a merge (write) node`);
      }
      const pathOk = stream.path.length === expectedPath.length && stream.path.every((ref, position) => ref === expectedPath[position]);
      const branchOk =
        edgePairs.has(`mhc-split-${index}.pre->mhc-hpre.in${index}`) &&
        edgePairs.has(`mhc-hres.out${index}->mhc-sum-${index}.res`) &&
        edgePairs.has(`mhc-hpost.out${index}->mhc-sum-${index}.post`);
      if (!pathOk || !branchOk || !sharedOperatorPath) {
        push("mhc-streams", stream.id, `stream ${stream.id} does not preserve the boundary/read/residual/write path around H-pre → F → H-post`);
      }
    }
  }

  // -- DSA: selected-KV path indexer → top-k → MLA core, claim-backed
  const selKv = scene.edges.find((e) => e.claimPath === "topology.attention.dsa_topk");
  const indexerToTopk = scene.edges.find((e) => splitRef(e.from) === "dsa-indexer" && splitRef(e.to) === "dsa-topk");
  const selectedToMla = scene.edges.find((e) => splitRef(e.from) === "dsa-selected" && splitRef(e.to) === "dsa-mla");
  if (!selKv || splitRef(selKv.from) !== "dsa-topk" || splitRef(selKv.to) !== "dsa-selected" || !selectedToMla) {
    push("dsa-selected-kv", "dsa-topk", "DSA selected-KV path dsa-topk → dsa-selected → dsa-mla with the dsa_topk claim is missing");
  }
  if (!indexerToTopk) {
    push("dsa-selected-kv", "dsa-indexer", "DSA indexer → top-k edge is missing");
  }

  // -- MoE: specific fan-out/fan-in contract
  const routerToExperts = scene.edges.find(
    (e) => splitRef(e.from) === "moe-router" && splitRef(e.to) === "moe-routed" && e.claimPath === "topology.experts.active_routed",
  );
  if (!routerToExperts) {
    push("moe-fanout", "moe-router", "MoE router → routed experts edge carrying the active_routed claim is missing");
  }
  const sharedFeed = scene.edges.find(
    (e) => splitRef(e.from) === "moe-router" && splitRef(e.to) === "moe-shared" && e.claimPath === "topology.experts.shared",
  );
  if (!sharedFeed) {
    push("moe-fanout", "moe-shared", "shared-expert feed edge carrying the experts.shared claim is missing");
  }
  const merge = scene.nodes.find((node) => node.id === "moe-merge" && node.kind === "merge");
  const sources = merge ? scene.edges.filter((edge) => splitRef(edge.to) === merge.id).map((edge) => splitRef(edge.from)) : [];
  const sourceSet = new Set(sources);
  const goodMerge = merge && sources.length === 2 && sourceSet.size === 2 && sourceSet.has("moe-routed") && sourceSet.has("moe-shared");
  if (!goodMerge) {
    push("moe-fanin", "moe-merge", "MoE merge inputs are not exactly the routed and shared expert branches");
  }

  return findings;
}
