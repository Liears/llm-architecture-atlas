export type DiagramTypographyMode = "generic" | "editorial-poster";

export interface DiagramTypography {
  nodeLabel: number;
  nodeDetail: number;
  groupLabel: number;
  edgeLabel: number;
}

/** Single typography contract shared by geometry gates and SVG rendering. */
export function diagramTypography(mode: DiagramTypographyMode): DiagramTypography {
  return mode === "editorial-poster"
    ? { nodeLabel: 16, nodeDetail: 15, groupLabel: 15, edgeLabel: 15 }
    : { nodeLabel: 16, nodeDetail: 12.8, groupLabel: 12.8, edgeLabel: 11.5 };
}
