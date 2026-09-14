/** Structural validation for DiagramScene (pure checks, no layout). */

import type { DiagramScene } from "./types.js";

const COORDINATE_KEYS = new Set(["x", "y", "width", "height", "cx", "cy", "rx", "ry"]);

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

  const edgeIds = new Set<string>();
  for (const edge of scene.edges) {
    if (edgeIds.has(edge.id)) errors.push(`duplicate edge id: ${edge.id}`);
    edgeIds.add(edge.id);
    for (const end of [edge.from, edge.to] as const) {
      const nodeId = end.split(".")[0]!;
      if (!nodeIds.has(nodeId)) errors.push(`edge ${edge.id}: endpoint "${end}" does not reference a known node`);
    }
  }

  for (const group of scene.groups) {
    for (const member of group.members) {
      if (!nodeIds.has(member)) errors.push(`group ${group.id}: member "${member}" is not a known node`);
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
      if (!nodeIds.has(t)) errors.push(`constraint ${c.type}: unknown target ${t}`);
    }
  }

  return errors;
}
