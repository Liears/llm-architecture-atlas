/**
 * GLM structural assertions (issue #35 acceptance 1, strengthened in round 2
 * review): path-relation checks over the compiled scene, not string matching
 * and not count-matching. Each violation is a GateFinding so it can enter the
 * persistent-red baseline with the issue that owns the fix.
 *
 * - schedule: exact K,K,K,D ×11 + K layer MEMBERSHIP (any 34/11 partition
 *   that misplaces a layer fails), plus scene expression of the repeat unit
 *   and explicit tail layer;
 * - mHC: when the scene declares streams, each must run read → stage →
 *   stage → write crossing group boundaries and visiting operator
 *   ingress/egress ports; undeclared/placeholder topology stays red;
 * - DSA: selected-KV edge topk → MLA core carrying the dsa_topk claim, plus
 *   indexer → topk;
 * - MoE: router → experts edge carrying the active_routed claim, a shared
 *   feed edge carrying the experts.shared claim, and a merge node whose
 *   inputs are exactly the routed experts and the shared expert (unrelated
 *   double-outs/double-ins are rejected).
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
  const unit = scene.nodes.find((n) => n.id === "unit");
  const tail = scene.nodes.find((n) => n.id === "tail-kda");
  const decoder = scene.groups.find((g) => g.id === "g-decoder");
  const unitExpressesSchedule =
    unit && mla && unit.label.includes(`× ${mla.layers.length} units`) &&
    (unit.claims ?? []).some((c) => c.claimPath === "topology.attention_groups[0]") &&
    (unit.claims ?? []).some((c) => c.claimPath === "topology.attention_groups[1]");
  if (!unitExpressesSchedule || !tail || !decoder?.repeat || decoder.repeat.count !== total) {
    push("schedule", "g-decoder", "scene does not express the 45-layer decoder with a repeating unit (schedule claims) and an explicit tail KDA layer");
  }

  // -- mHC: declared streams must be complete read→stage→stage→write paths
  const streams = arch.topology.residual?.streams ?? 4;
  if (!scene.streams || scene.streams.length < streams) {
    push(
      "mhc-streams",
      "mhc",
      `mHC: expected ${streams} declared cross-sublayer streams, found ${scene.streams?.length ?? 0} (placeholder self-rails until #34)`,
    );
  } else {
    const groupOfNode = new Map<string, string>();
    for (const g of scene.groups) for (const m of g.members) groupOfNode.set(m, g.id);
    for (const stream of scene.streams) {
      const groupsVisited = new Set<string>();
      let crossings = 0;
      let operatorHops = 0;
      let prev: string | undefined;
      for (let i = 0; i < stream.path.length; i++) {
        const ref = stream.path[i]!;
        const head = splitRef(ref);
        const grp = groupOfNode.get(head);
        if (grp) groupsVisited.add(grp);
        if (grp !== prev) crossings += 1; // every group change, including to/from the spine
        prev = grp;
        if (i + 1 < stream.path.length && splitRef(stream.path[i + 1]!) === head) {
          operatorHops += 1; // ingress→egress inside one operator
        }
      }
      const firstHead = splitRef(stream.path[0]!);
      const lastHead = splitRef(stream.path[stream.path.length - 1]!);
      const firstKind = scene.nodes.find((n) => n.id === firstHead)?.kind;
      const lastKind = scene.nodes.find((n) => n.id === lastHead)?.kind;
      if (firstKind !== "split" || lastKind !== "merge") {
        push("mhc-streams", stream.id, `stream ${stream.id} must start at a split (read) node and end at a merge (write) node`);
      }
      if (groupsVisited.size < 2 || crossings < 3) {
        push("mhc-streams", stream.id, `stream ${stream.id} visits ${groupsVisited.size} sublayer(s) with ${crossings} boundary crossings; expected >=2 sublayers and >=3 crossings`);
      }
      if (operatorHops < groupsVisited.size) {
        push("mhc-streams", stream.id, `stream ${stream.id} traverses ${operatorHops} operator(s); expected one ingress→egress hop per visited sublayer`);
      }
    }
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

  // -- MoE: specific fan-out/fan-in contract
  const routerToExperts = scene.edges.find(
    (e) => splitRef(e.from) === "router" && splitRef(e.to) === "experts" && e.claimPath === "topology.experts.active_routed",
  );
  if (!routerToExperts) {
    push("moe-fanout", "router", "MoE router → experts edge carrying the active_routed claim is missing");
  }
  const sharedFeed = scene.edges.find((e) => e.claimPath === "topology.experts.shared");
  if (!sharedFeed) {
    push("moe-fanout", "shared", "shared-expert feed edge carrying the experts.shared claim is missing");
  }
  const merges = scene.nodes.filter((n) => n.kind === "merge");
  const goodMerge = merges.find((m) => {
    const sources = scene.edges.filter((e) => splitRef(e.to) === m.id).map((e) => splitRef(e.from));
    const set = new Set(sources);
    return set.has("experts") && set.has("shared") && sources.length === set.size && [...set].every((s) => s === "experts" || s === "shared");
  });
  if (!goodMerge) {
    push("moe-fanin", "experts", "MoE has no merge node whose inputs are exactly the routed experts and the shared expert (explicit fan-in until #34)");
  }

  return findings;
}
