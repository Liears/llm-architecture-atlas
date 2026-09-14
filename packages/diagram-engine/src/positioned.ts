/** Layout output types (issue #5): the only place coordinates may exist. */

import type { DiagramScene } from "./types.js";

export interface Point {
  x: number;
  y: number;
}

export interface PositionedNode {
  id: string;
  kind: string;
  label: string;
  detail?: string;
  claimPath?: string;
  x: number; // left
  y: number; // top (SVG convention, 0 at top)
  w: number;
  h: number;
  /** port name -> absolute anchor point */
  ports: Record<string, Point>;
}

export interface PositionedEdge {
  id: string;
  kind: string; // flow | skip | control
  label?: string;
  /** polyline waypoints, first = source anchor, last = target anchor */
  points: Point[];
}

export interface PositionedGroup {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  repeatBadge?: string;
}

export interface PositionedScene {
  scene: DiagramScene; // back-reference for annotations etc.
  size: { w: number; h: number };
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  groups: PositionedGroup[];
}

export interface LayoutOptions {
  padding?: number; // node inner padding, px
  gapX?: number; // horizontal gap between nodes in a row
  gapY?: number; // vertical gap between flow rows
  fontSize?: number;
  skipRailGap?: number; // distance between skip-edge rails
}
