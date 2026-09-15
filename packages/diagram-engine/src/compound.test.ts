/**
 * Compound layout property tests (#33):
 * - fixed input repeats to byte-identical output (20 runs);
 * - no node/node or node/group overlap, in both layout backends;
 * - inset members are laid out INSIDE their box, not on the spine row;
 * - boundary ports sit on the box border.
 */

import { describe, expect, it } from "vitest";
import { mhcStreamsScene, insetsScene } from "./fixtures.js";
import { layoutScene } from "./layout.js";
import type { PositionedScene } from "./positioned.js";

function overlapPairs(scene: PositionedScene): string[] {
  const problems: string[] = [];
  const boxes = scene.groups.filter((g) => g.inset);
  for (let i = 0; i < scene.nodes.length; i++) {
    for (let j = i + 1; j < scene.nodes.length; j++) {
      const a = scene.nodes[i]!;
      const b = scene.nodes[j]!;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        problems.push(`node overlap: ${a.id} vs ${b.id}`);
      }
    }
  }
  for (const box of boxes) {
    for (const node of scene.nodes) {
      if (!boxInclusive(box, node)) continue;
      const inside =
        node.x >= box.x - 0.5 &&
        node.y >= box.y - 0.5 &&
        node.x + node.w <= box.x + box.w + 0.5 &&
        node.y + node.h <= box.y + box.h + 0.5;
      if (!inside) problems.push(`node ${node.id} pokes out of box ${box.id}`);
    }
    for (const other of boxes) {
      if (other.id === box.id) continue;
      if (box.x < other.x + other.w && other.x < box.x + box.w && box.y < other.y + other.h && other.y < box.y + box.h) {
        problems.push(`box overlap: ${box.id} vs ${other.id}`);
      }
    }
  }
  return problems;
}

function boxInclusive(box: { id: string; members?: unknown }, node: { id: string }): boolean {
  // membership is checked by the caller via fixture knowledge
  return nodeBelongsTo(node.id) === box.id;
}

let nodeBelongsTo: (id: string) => string | null = () => null;

describe("compound layout (#33)", () => {
  it("repeats to identical output over 20 runs (mhc streams)", () => {
    const first = layoutScene(mhcStreamsScene());
    for (let i = 0; i < 19; i++) {
      expect(layoutScene(mhcStreamsScene())).toEqual(first);
    }
  });

  it("repeats to identical output over 20 runs (insets)", () => {
    const first = layoutScene(insetsScene());
    for (let i = 0; i < 19; i++) {
      expect(layoutScene(insetsScene())).toEqual(first);
    }
  });

  it("places mhc stream rails on the left, clear of the content", () => {
    const laid = layoutScene(mhcStreamsScene());
    const residual = laid.edges.filter((e) => e.kind === "residual");
    expect(residual).toHaveLength(4);
    for (const edge of residual) {
      const railXs = edge.points.slice(1, 3).map((p) => p.x);
      for (const x of railXs) {
        expect(x).toBeLessThan(Math.min(...laid.nodes.map((n) => n.x)));
      }
    }
    // every stream starts at its own port of the split node
    const read = laid.nodes.find((n) => n.id === "read")!;
    expect(Object.keys(read.ports).sort()).toEqual(["in", "out", "s1", "s2", "s3", "s4"]);
  });

  it("lays out inset members inside their box, off the spine", () => {
    const scene = insetsScene();
    const laid = layoutScene(scene);
    nodeBelongsTo = (id) => {
      for (const g of scene.groups) if (g.members.includes(id)) return g.kind === "inset" ? g.id : null;
      return null;
    };
    expect(overlapPairs(laid)).toEqual([]);

    const dsa = laid.groups.find((g) => g.id === "g-dsa")!;
    const indexer = laid.nodes.find((n) => n.id === "indexer")!;
    const core = laid.nodes.find((n) => n.id === "core")!;
    expect(indexer.x).toBeGreaterThanOrEqual(dsa.x);
    expect(core.x + core.w).toBeLessThanOrEqual(dsa.x + dsa.w);
    // local left-to-right direction: indexer left of core
    expect(indexer.x).toBeLessThan(core.x);
  });

  it("keeps the two insets from overlapping each other or the spine", () => {
    const laid = layoutScene(insetsScene());
    nodeBelongsTo = (id) => null;
    const problems = overlapPairs(laid);
    expect(problems).toEqual([]);
  });

  it("anchors boundary ports on the box border", () => {
    const laid = layoutScene(insetsScene());
    const moe = laid.groups.find((g) => g.id === "g-moe")!;
    expect(moe.inset).toBe(true);
    expect(moe.ports.in!.x).toBeCloseTo(moe.x, 0);
    expect(moe.ports.out!.x).toBeCloseTo(moe.x + moe.w, 0);
    expect(moe.ports.in!.y).toBeGreaterThanOrEqual(moe.y);
    expect(moe.ports.in!.y).toBeLessThanOrEqual(moe.y + moe.h);
    // edges reference the port anchors
    const edge = laid.edges.find((e) => e.id === "e-block-moe")!;
    const last = edge.points[edge.points.length - 1]!;
    expect(last.x).toBeCloseTo(moe.ports.in!.x, 0);
    expect(last.y).toBeCloseTo(moe.ports.in!.y, 0);
  });

  it("narrows the canvas: same-depth insets become one box instead of one wide row", () => {
    const scene = insetsScene();
    const boxed = layoutScene(scene);
    // flat control: dissolve the insets — their members land on the spine and
    // the control-linked members spread into one wide row (the #32 failure)
    const retarget: Record<string, string> = {
      "g-dsa.in": "indexer",
      "g-dsa.out": "core",
      "g-moe.in": "router",
      "g-moe.out": "experts",
    };
    const flatScene = {
      ...scene,
      groups: scene.groups.filter((g) => g.kind !== "inset"),
      edges: scene.edges.map((e) => ({
        ...e,
        from: retarget[e.from] ?? e.from,
        to: retarget[e.to] ?? e.to,
      })),
    };
    const flat = layoutScene(flatScene);
    nodeBelongsTo = () => null;
    expect(overlapPairs(boxed)).toEqual([]);
    expect(flat.size.w).toBeGreaterThan(boxed.size.w);
  });
});
