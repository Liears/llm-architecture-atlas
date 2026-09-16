/**
 * Structural validation for DiagramScene (pure checks, no layout).
 *
 * Compound-graph rules (#33):
 * - inset groups are compound layout units; an edge that crosses an inset
 *   boundary must land on a declared boundary port (groupId.port);
 * - residual edges are real multi-stream paths: no self-loops, and each must
 *   cross at least one sublayer (group) boundary;
 * - split nodes fan out to >=2 targets, merge nodes collect >=2 sources;
 * - groups form a tree (unique membership, acyclic parent chain).
 */

import type { DiagramScene, SemanticGroup } from "./types.js";

const COORDINATE_KEYS = new Set(["x", "y", "width", "height", "cx", "cy", "rx", "ry"]);

interface Endpoint {
  raw: string;
  head: string; // node or group id
  port?: string;
}

function parseEndpoint(raw: string): Endpoint {
  const dot = raw.indexOf(".");
  if (dot === -1) return { raw, head: raw };
  return { raw, head: raw.slice(0, dot), port: raw.slice(dot + 1) };
}

/** node id behind an endpoint: the head itself, or a group port's inner member. */
function endpointNode(end: Endpoint, groupById: Map<string, SemanticGroup>): string | null {
  const group = groupById.get(end.head);
  if (!group) return end.head;
  const port = group.ports?.find((p) => p.id === end.port);
  if (!port) return null;
  return port.inner.split(".")[0]!;
}

/** innermost group id containing the node, or null when on the spine. */
function groupOf(nodeId: string, memberGroup: Map<string, string>): string | null {
  return memberGroup.get(nodeId) ?? null;
}

/** whether an edge endpoint resolves to a node inside the group's subtree (any depth). */
function resolvesInside(
  targetGroup: string,
  end: Endpoint,
  groupById: Map<string, SemanticGroup>,
  memberGroup: Map<string, string>,
): boolean {
  const node = endpointNode(end, groupById);
  if (!node) return false;
  let g: string | null = memberGroup.get(node) ?? null;
  const seen = new Set<string>();
  while (g && !seen.has(g)) {
    if (g === targetGroup) return true;
    seen.add(g);
    g = groupById.get(g)?.parent ?? null;
  }
  return false;
}

function groupParentChain(id: string, groupById: Map<string, SemanticGroup>): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([id]);
  let cur = groupById.get(id)?.parent;
  while (cur) {
    if (seen.has(cur)) return [...chain, cur]; // cycle marker
    seen.add(cur);
    chain.push(cur);
    cur = groupById.get(cur)?.parent;
  }
  return chain;
}

export function validateScene(scene: DiagramScene): string[] {
  const errors: string[] = [];

  const nodeIds = new Set<string>();
  for (const node of scene.nodes) {
    if (nodeIds.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    nodeIds.add(node.id);
    for (const key of Object.keys(node)) {
      if (COORDINATE_KEYS.has(key)) errors.push(`node ${node.id}: coordinate key "${key}" is forbidden in Diagram IR`);
    }
    if (node.parent && !scene.nodes.some((n) => n.id === node.parent)) {
      errors.push(`node ${node.id}: unknown parent ${node.parent}`);
    }
  }

  // -- groups: known members, unique membership, acyclic parent tree, valid ports
  const groupById = new Map<string, SemanticGroup>();
  for (const group of scene.groups) {
    if (groupById.has(group.id)) errors.push(`duplicate group id: ${group.id}`);
    groupById.set(group.id, group);
    for (const key of Object.keys(group)) {
      if (COORDINATE_KEYS.has(key)) errors.push(`group ${group.id}: coordinate key "${key}" is forbidden in Diagram IR`);
    }
    for (const member of group.members) {
      if (!nodeIds.has(member)) errors.push(`group ${group.id}: member "${member}" is not a known node`);
    }
    const portIds = new Set<string>();
    for (const port of group.ports ?? []) {
      if (portIds.has(port.id)) errors.push(`group ${group.id}: duplicate port "${port.id}"`);
      portIds.add(port.id);
      const innerNode = port.inner.split(".")[0]!;
      if (!group.members.includes(innerNode)) {
        errors.push(`group ${group.id}: port "${port.id}" inner "${port.inner}" does not reference a member node`);
      }
    }
  }
  for (const group of scene.groups) {
    if (group.parent && !groupById.has(group.parent)) {
      errors.push(`group ${group.id}: unknown parent ${group.parent}`);
    }
    const chain = groupParentChain(group.id, groupById);
    if (chain.includes(group.id)) {
      errors.push(`group ${group.id}: parent cycle ${[group.id, ...chain].join(" -> ")}`);
    }
  }

  // membership must be unique: a node lives in exactly one group (or none)
  const memberGroup = new Map<string, string>();
  for (const group of scene.groups) {
    for (const member of group.members) {
      const existing = memberGroup.get(member);
      if (existing) {
        errors.push(`node ${member} belongs to multiple groups: ${existing} and ${group.id}`);
      } else {
        memberGroup.set(member, group.id);
      }
    }
  }

  // -- edges: known endpoints, boundary-port discipline, residual semantics
  const edgeIds = new Set<string>();
  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const edge of scene.edges) {
    if (edgeIds.has(edge.id)) errors.push(`duplicate edge id: ${edge.id}`);
    edgeIds.add(edge.id);

    const from = parseEndpoint(edge.from);
    const to = parseEndpoint(edge.to);
    const ends = [from, to];

    for (const end of ends) {
      if (!nodeIds.has(end.head) && !groupById.has(end.head)) {
        errors.push(`edge ${edge.id}: endpoint "${end.raw}" does not reference a known node`);
        continue;
      }
      if (groupById.has(end.head)) {
        const group = groupById.get(end.head)!;
        if (!end.port || !group.ports?.some((p) => p.id === end.port)) {
          errors.push(`edge ${edge.id}: endpoint "${end.raw}" does not match a boundary port of group ${end.head}`);
        }
      } else if (end.port) {
        // node-qualified tails must exist: implicit in/out anchors are always
        // allowed, anything else must be declared in SemanticNode.ports (#33
        // dangling-port negative, round 2)
        const node = scene.nodes.find((n) => n.id === end.head);
        if (node && end.port !== "in" && end.port !== "out" && !(node.ports ?? []).includes(end.port)) {
          errors.push(`edge ${edge.id}: endpoint "${end.raw}" references undeclared port on node ${end.head}`);
        }
      }
    }

    const fromNode = endpointNode(from, groupById);
    const toNode = endpointNode(to, groupById);
    if (fromNode && nodeIds.has(fromNode)) outDegree.set(fromNode, (outDegree.get(fromNode) ?? 0) + 1);
    if (toNode && nodeIds.has(toNode)) inDegree.set(toNode, (inDegree.get(toNode) ?? 0) + 1);

    // a boundary port connected to a raw node INSIDE its own group is a
    // stream traversal and must pair with the port's inner member; raw nodes
    // outside the group are boundary crossings and stay exempt
    for (const [end, other] of [[from, to], [to, from]] as const) {
      const group = groupById.get(end.head);
      const portDef = group?.ports?.find((p) => p.id === end.port);
      if (!portDef || !group) continue;
      if (other.port || groupById.has(other.head)) continue;
      if (!resolvesInside(group.id, other, groupById, memberGroup)) continue;
      if (other.head !== portDef.inner.split(".")[0]!) {
        errors.push(`edge ${edge.id}: boundary port ${end.head}.${end.port} must pair with its inner member ${portDef.inner} inside the group`);
      }
    }

    // boundary discipline, ancestry-aware (#33 review fix): walk every group
    // on the endpoint's ancestor chain — a group's boundary counts as crossed
    // when the other endpoint does NOT resolve inside that group's subtree,
    // and the edge must then reference that group's boundary port. Edges
    // between an outer member and a nested group's port stay internal to the
    // outer group (the nested port sits inside the outer frame).
    for (const [end, other] of [[from, to], [to, from]] as const) {
      const node = endpointNode(end, groupById);
      if (!node) continue;
      let g = groupOf(node, memberGroup);
      const walked = new Set<string>();
      while (g && !walked.has(g)) {
        walked.add(g);
        const group = groupById.get(g);
        if (!group) break; // unknown parent: reported by the group-tree checks
        const guarded = group.kind === "inset" || (group.ports?.length ?? 0) > 0;
        if (guarded && !resolvesInside(g, other, groupById, memberGroup)) {
          const referencesBoundary = ends.some((e) => e.head === g && e.port);
          if (!referencesBoundary) {
            errors.push(`edge ${edge.id}: crosses group ${g} boundary without a boundary port`);
          }
        }
        g = group.parent ?? null;
      }
    }

    if (edge.kind === "residual") {
      if (fromNode && toNode && fromNode === toNode) {
        errors.push(`residual edge ${edge.id}: self-loop ${edge.from} -> ${edge.to} is not a real stream`);
      }
      const fromGroup = fromNode ? groupOf(fromNode, memberGroup) : null;
      const toGroup = toNode ? groupOf(toNode, memberGroup) : null;
      if (fromGroup === toGroup) {
        errors.push(`residual edge ${edge.id}: does not cross a sublayer boundary`);
      }
    }
  }

  // -- explicit fan control (#32 visual grammar): split out, merge in
  for (const node of scene.nodes) {
    if (node.kind === "split" && (outDegree.get(node.id) ?? 0) < 2) {
      errors.push(`split node ${node.id} must fan out to at least 2 targets`);
    }
    if (node.kind === "merge" && (inDegree.get(node.id) ?? 0) < 2) {
      errors.push(`merge node ${node.id} must collect at least 2 sources`);
    }
  }

  for (const ann of scene.annotations) {
    const inNodes = nodeIds.has(ann.target);
    const inEdges = edgeIds.has(ann.target);
    if (!inNodes && !inEdges) errors.push(`annotation for claim "${ann.claimPath}": unknown target ${ann.target}`);
  }

  for (const c of scene.constraints) {
    const targets = "target" in c ? [c.target] : "targets" in c ? c.targets : [];
    for (const t of targets) {
      // order/align may target inset groups: boxes are layout units (#33)
      if (!nodeIds.has(t) && !groupById.has(t)) {
        errors.push(`constraint ${c.type}: unknown target ${t}`);
      }
    }
  }

  return errors;
}
