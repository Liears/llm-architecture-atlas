import type { DiagramScene, EdgeKind } from "./types.js";

/**
 * One visible edge in a reduced view. Every path is an alternative source
 * route (for example one path per residual stream) that the visible edge
 * summarizes. The projection owns no facts; it only declares omission.
 */
export interface ProjectionLink {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  claimPath?: string;
  elides?: string[];
  paths: string[][];
}

export interface DiagramViewProjection {
  id: string;
  links: ProjectionLink[];
}

const head = (ref: string): string => ref.split(".")[0]!;

/**
 * Proves that a simplified composition cannot invent arrows. Source legs must
 * exist, connect in order and start/end at the visible link's endpoints.
 */
export function validateViewProjection(scene: DiagramScene, projection: DiagramViewProjection): string[] {
  const errors: string[] = [];
  const edges = new Map(scene.edges.map((edge) => [edge.id, edge] as const));
  const linkIds = new Set<string>();

  for (const link of projection.links) {
    if (linkIds.has(link.id)) errors.push(`duplicate projection link id: ${link.id}`);
    linkIds.add(link.id);
    if (link.paths.length === 0) errors.push(`projection ${link.id}: must declare at least one source path`);

    for (const [pathIndex, edgeIds] of link.paths.entries()) {
      if (edgeIds.length === 0) {
        errors.push(`projection ${link.id}: source path ${pathIndex} is empty`);
        continue;
      }
      const path = edgeIds.map((id) => {
        const edge = edges.get(id);
        if (!edge) errors.push(`projection ${link.id}: unknown source edge "${id}"`);
        return edge;
      });
      if (path.some((edge) => edge === undefined)) continue;
      const legs = path.filter((edge): edge is NonNullable<typeof edge> => edge !== undefined);
      const first = legs[0]!;
      const last = legs[legs.length - 1]!;
      if (head(first.from) !== head(link.from)) {
        errors.push(`projection ${link.id}: source path ${pathIndex} starts at ${head(first.from)}, expected ${head(link.from)}`);
      }
      if (head(last.to) !== head(link.to)) {
        errors.push(`projection ${link.id}: source path ${pathIndex} ends at ${head(last.to)}, expected ${head(link.to)}`);
      }
      for (let i = 0; i + 1 < legs.length; i += 1) {
        const left = legs[i]!;
        const right = legs[i + 1]!;
        if (left.to !== right.from && head(left.to) !== head(right.from)) {
          errors.push(
            `projection ${link.id}: disconnected source path ${pathIndex} between ${left.id} (${left.to}) and ${right.id} (${right.from})`,
          );
        }
      }
    }
  }
  return errors;
}
