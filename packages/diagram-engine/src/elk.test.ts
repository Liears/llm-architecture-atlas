import { describe, expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import { layoutWithElk } from "./elk.js";
import { glmScene } from "./test-scene.js";

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
});
