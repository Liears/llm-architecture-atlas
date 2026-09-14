import { describe, expect, it } from "vitest";
import { glmScene } from "./test-scene.js";
import { layoutScene } from "./layout.js";
import { measureText } from "./text.js";

describe("layoutScene", () => {
  it("is deterministic across runs", () => {
    expect(layoutScene(glmScene())).toEqual(layoutScene(glmScene()));
  });

  it("stacks flow bottom-to-top: first node lowest, last node highest", () => {
    const laid = layoutScene(glmScene());
    const y = (id: string) => laid.nodes.find((n) => n.id === id)!.y;
    expect(y("tok")).toBeGreaterThan(y("embed"));
    expect(y("embed")).toBeGreaterThan(y("block"));
    expect(y("block")).toBeGreaterThan(y("norm"));
    expect(y("norm")).toBeGreaterThan(y("head"));
  });

  it("sizes boxes from measured text with padding", () => {
    const laid = layoutScene(glmScene());
    const head = laid.nodes.find((n) => n.id === "head")!;
    expect(head.w).toBeGreaterThanOrEqual(measureText(head.label, 16, true) + 28);
  });

  it("routes skip edges through right rails", () => {
    const laid = layoutScene(glmScene());
    const skip = laid.edges.find((e) => e.kind === "skip")!;
    const xs = skip.points.map((p) => p.x);
    expect(Math.max(...xs)).toBeGreaterThan(Math.min(...xs) + 20); // leaves the column
    expect(laid.size.w).toBeGreaterThan(Math.max(...laid.nodes.map((n) => n.x + n.w)));
  });

  it("frames groups around members with a repeat badge", () => {
    const laid = layoutScene(glmScene());
    const g = laid.groups[0]!;
    const block = laid.nodes.find((n) => n.id === "block")!;
    expect(g.x).toBeLessThanOrEqual(block.x);
    expect(g.y + g.h).toBeGreaterThanOrEqual(block.y + block.h);
    expect(g.repeatBadge).toBe("45 ×");
  });

  it("exposes declared side ports as anchors", () => {
    const scene = glmScene();
    scene.nodes.find((n) => n.id === "block")!.ports = ["q", "kv"];
    const laid = layoutScene(scene);
    const block = laid.nodes.find((n) => n.id === "block")!;
    expect(block.ports.q!.x).toBeCloseTo(block.x, 0);
    expect(block.ports.kv!.x).toBeCloseTo(block.x + block.w, 0);
  });
});
