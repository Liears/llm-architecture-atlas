import { describe, expect, it } from "vitest";
import type { DiagramScene } from "./types.js";
import { validateViewProjection, type DiagramViewProjection } from "./projection.js";

const source: DiagramScene = {
  irVersion: "0.1.0",
  view: "overview",
  modelId: "fixture/projection",
  nodes: [
    { id: "a", kind: "io", label: "A" },
    { id: "middle", kind: "ffn", label: "Middle" },
    { id: "b", kind: "output", label: "B" },
    { id: "other", kind: "output", label: "Other" },
  ],
  edges: [
    { id: "e1", from: "a", to: "middle", kind: "flow" },
    { id: "e2", from: "middle", to: "b", kind: "flow" },
  ],
  groups: [],
  annotations: [],
  constraints: [],
};

const projection = (overrides: Partial<DiagramViewProjection["links"][number]> = {}): DiagramViewProjection => ({
  id: "overview",
  links: [{ id: "p-ab", from: "a", to: "b", kind: "flow", paths: [["e1", "e2"]], ...overrides }],
});

describe("validateViewProjection", () => {
  it("accepts a collapsed link backed by a continuous source path", () => {
    expect(validateViewProjection(source, projection())).toEqual([]);
  });

  it("rejects missing source edges", () => {
    expect(validateViewProjection(source, projection({ paths: [["e1", "missing"]] }))).toContain(
      'projection p-ab: unknown source edge "missing"',
    );
  });

  it("rejects disconnected source legs", () => {
    const broken = structuredClone(source);
    broken.edges[1] = { id: "e2", from: "other", to: "b", kind: "flow" };
    expect(validateViewProjection(broken, projection()).join("\n")).toMatch(/disconnected source path/);
  });

  it("rejects a path whose endpoints do not match the visible link", () => {
    expect(validateViewProjection(source, projection({ to: "other" })).join("\n")).toMatch(/ends at b, expected other/);
  });
});
