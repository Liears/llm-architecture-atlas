/**
 * Compound layout property tests (#33):
 * - fixed input repeats to byte-identical output (20 runs);
 * - the hard geometry gates (node/node overlap, inset/inset overlap, member
 *   containment, non-member inside a foreign inset, bounds, port segments)
 *   hold on real layout output of every compound fixture, on BOTH backends;
 * - a parked-node mutation proves the suite actually detects node/group
 *   overlap (round 3: the previous helper checked containment only for
 *   declared members and could be neutered to zero checks);
 * - inset members are laid out INSIDE their box, not on the spine row;
 * - boundary ports sit on the box border.
 */

import { describe, expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import { mhcStreamsScene, insetsScene, nestedScene } from "./fixtures.js";
import { layoutScene } from "./layout.js";
import { layoutWithElk } from "./elk.js";
import { runSceneGates, HARD_GATES } from "./gates.js";
import type { PositionedScene } from "./positioned.js";

const hard = (scene: PositionedScene): string[] =>
  runSceneGates(scene).filter((f) => HARD_GATES.has(f.gate)).map((f) => `${f.gate}: ${f.message}`);

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

  it("keeps all hard geometry gates clean on every compound fixture (built-in backend)", () => {
    for (const scene of [insetsScene(), mhcStreamsScene(), nestedScene()]) {
      expect(hard(layoutScene(scene))).toEqual([]);
    }
  });

  it("keeps all hard geometry gates clean on every compound fixture (ELK backend)", async () => {
    const elk = new ELK();
    for (const scene of [insetsScene(), mhcStreamsScene(), nestedScene()]) {
      const laid = await layoutWithElk(scene, elk as never);
      expect(hard(laid)).toEqual([]);
    }
  });

  it("detects a node parked inside a foreign inset on real layout output", () => {
    const scene = insetsScene();
    const laid = layoutScene(scene);
    const dsa = laid.groups.find((g) => g.id === "g-dsa")!;
    // park a spine node squarely inside the DSA box, then re-run the gates
    const parked = laid.nodes.find((n) => n.id === "norm")!;
    parked.x = dsa.x + 20;
    parked.y = dsa.y + 30;
    const problems = hard(laid);
    expect(problems.some((p) => p.includes("norm") && p.includes("g-dsa"))).toBe(true);
  });

  it("places mhc stream rails on the left, clear of the content", () => {
    const laid = layoutScene(mhcStreamsScene());
    const residual = laid.edges.filter((e) => e.kind === "residual");
    expect(residual).toHaveLength(12); // 4 streams × 3 legs (read→attn→ffn→write)
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
    expect(hard(laid)).toEqual([]);

    const dsa = laid.groups.find((g) => g.id === "g-dsa")!;
    const indexer = laid.nodes.find((n) => n.id === "indexer")!;
    const core = laid.nodes.find((n) => n.id === "core")!;
    expect(indexer.x).toBeGreaterThanOrEqual(dsa.x);
    expect(core.x + core.w).toBeLessThanOrEqual(dsa.x + dsa.w);
    // local left-to-right direction: indexer left of core
    expect(indexer.x).toBeLessThan(core.x);
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

  it("stream stubs terminate on the operator border, not through its box", () => {
    const laid = layoutScene(mhcStreamsScene());
    const attn = laid.nodes.find((n) => n.id === "attn")!;
    const t = laid.edges.find((e) => e.id === "t-a1")!;
    const u = laid.edges.find((e) => e.id === "u-a1")!;
    // t-a1 ends at the operator's left (in) anchor, u-a1 starts at its right
    const tEnd = t.points[t.points.length - 1]!;
    const uStart = u.points[0]!;
    expect(tEnd.x).toBeCloseTo(attn.x, 0);
    expect(uStart.x).toBeCloseTo(attn.x + attn.w, 0);
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
    expect(hard(boxed)).toEqual([]);
    expect(flat.size.w).toBeGreaterThan(boxed.size.w);
  });
});
