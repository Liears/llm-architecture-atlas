import { describe, expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import { layoutWithElk } from "./elk.js";
import { glmScene } from "./test-scene.js";
import { mhcStreamsScene, insetsScene } from "./fixtures.js";

describe("layoutWithElk (adapter over injected engine)", () => {
  it("produces positioned nodes through the real ELK engine", async () => {
    const elk = new ELK();
    const scene = glmScene();
    const laid = await layoutWithElk(scene, elk as never);

    expect(laid.nodes).toHaveLength(scene.nodes.length);
    for (const node of laid.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.w).toBeGreaterThan(0);
    }
    for (const edge of laid.edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("lays out inset members inside their box (#33)", async () => {
    const elk = new ELK();
    const scene = insetsScene();
    const laid = await layoutWithElk(scene, elk as never);

    const dsa = laid.groups.find((g) => g.id === "g-dsa")!;
    expect(dsa.inset).toBe(true);
    const indexer = laid.nodes.find((n) => n.id === "indexer")!;
    const core = laid.nodes.find((n) => n.id === "core")!;
    expect(indexer.x).toBeGreaterThanOrEqual(dsa.x);
    expect(core.x + core.w).toBeLessThanOrEqual(dsa.x + dsa.w + 0.5);
    // group-local left-to-right direction
    expect(indexer.x).toBeLessThan(core.x);
  });

  it("agrees with the built-in backend on overlap freedom (both fixtures)", async () => {
    const elk = new ELK();
    for (const scene of [insetsScene(), mhcStreamsScene()]) {
      const laid = await layoutWithElk(scene, elk as never);
      const boxes = laid.groups.filter((g) => g.inset);
      for (let i = 0; i < laid.nodes.length; i++) {
        for (let j = i + 1; j < laid.nodes.length; j++) {
          const a = laid.nodes[i]!;
          const b = laid.nodes[j]!;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap).toBe(false);
        }
      }
      for (const box of boxes) {
        for (const node of laid.nodes) {
          const contained = box.w === 0 || (node.x >= box.x - 0.5 && node.y >= box.y - 0.5 && node.x + node.w <= box.x + box.w + 0.5 && node.y + node.h <= box.y + box.h + 0.5);
          const isMember = scene.groups.find((g) => g.id === box.id)?.members.includes(node.id);
          if (isMember) expect(contained).toBe(true);
        }
      }
    }
  });

  it("is deterministic across repeated runs (compound scene)", async () => {
    const elk = new ELK();
    const first = await layoutWithElk(insetsScene(), elk as never);
    for (let i = 0; i < 2; i++) {
      const again = await layoutWithElk(insetsScene(), elk as never);
      expect(again).toEqual(first);
    }
  });
});
