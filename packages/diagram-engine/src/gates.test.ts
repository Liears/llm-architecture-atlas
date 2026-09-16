/**
 * Geometry gate tests for the #33-owned minimal gate set: overlap,
 * containment, bounds, port-segment. Readability/debt gates, SVG safety and
 * bounded correction are #35 scope and are tested in PR #42.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import { compileOverviewScene } from "./compile.js";
import { compileGlmTopologyScene } from "./glm-topology.js";
import { layoutScene } from "./layout.js";
import { runSceneGates, geometryGates, HARD_GATES } from "./gates.js";
import { mhcStreamsScene, insetsScene, nestedScene } from "./fixtures.js";
import type { DiagramScene } from "./types.js";
import type { PositionedScene } from "./positioned.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const modelsRoot = `${root}/models`;

function pipelineFor(modelId: string): PositionedScene {
  const [orgRaw, ...rest] = modelId.split("/");
  if (!orgRaw) throw new Error(`bad modelId: ${modelId}`);
  const modelDir = `${modelsRoot}/${orgRaw.toLowerCase()}/${rest.join("/").toLowerCase().replace(/\./g, "-")}/main`;
  if (!existsSync(`${modelDir}/architecture.json`)) throw new Error(`missing IR for ${modelId}`);
  const arch = JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8")) as ModelDocument;
  const evidence = JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8")) as EvidenceFile;
  const scene = modelId === "zai-org/glm-5.3-flash"
    ? compileGlmTopologyScene(arch, evidence)
    : compileOverviewScene(arch, evidence);
  return layoutScene(scene, { fontSize: 16 });
}

const modelIds = readdirSync(`${root}/tests/structural`)
  .filter((f) => f.endsWith(".overview.json"))
  .map((f) => JSON.parse(readFileSync(`${root}/tests/structural/${f}`, "utf8")).modelId as string);

describe.each(modelIds)("committed model gates: %s", (modelId) => {
  it("passes the hard geometry gates (overlap/bounds/containment/ports)", () => {
    expect(runSceneGates(pipelineFor(modelId)).filter((f) => HARD_GATES.has(f.gate))).toEqual([]);
  });
});

const emptyScene: DiagramScene = {
  irVersion: "0.1.0",
  view: "overview",
  modelId: "fixture/gates",
  nodes: [],
  edges: [],
  groups: [],
  annotations: [],
  constraints: [],
};

function literal(partial: Partial<PositionedScene>): PositionedScene {
  return {
    scene: emptyScene,
    size: { w: 600, h: 400 },
    nodes: [],
    edges: [],
    groups: [],
    ...partial,
  } as PositionedScene;
}

describe("geometry gates (#33 minimal set)", () => {
  it("accepts the valid compound fixtures", () => {
    for (const scene of [insetsScene(), mhcStreamsScene(), nestedScene()]) {
      expect(runSceneGates(layoutScene(scene))).toEqual([]);
    }
  });

  it("flags overlapping nodes", () => {
    const scene = literal({
      nodes: [
        { id: "a", kind: "io", label: "A", x: 10, y: 10, w: 100, h: 40, ports: {} },
        { id: "b", kind: "io", label: "B", x: 60, y: 20, w: 100, h: 40, ports: {} },
      ],
    });
    expect(runSceneGates(scene).map((f) => f.gate)).toContain("overlap");
  });

  it("flags an ungrouped node parked inside an inset", () => {
    const scene = literal({
      scene: { ...emptyScene, groups: [{ id: "g", label: "G", kind: "inset", members: ["a"] }] },
      groups: [{ id: "g", label: "G", inset: true, x: 10, y: 10, w: 200, h: 100, ports: {} }],
      nodes: [
        { id: "a", kind: "io", label: "A", x: 20, y: 60, w: 40, h: 20, ports: {} },
        { id: "intruder", kind: "io", label: "I", x: 30, y: 30, w: 40, h: 20, ports: {} },
      ],
    });
    const findings = runSceneGates(scene);
    expect(findings.some((f) => f.gate === "overlap" && f.target === "intruder+g")).toBe(true);
  });

  it("flags a SIBLING group's member parked inside an inset (round 4 fix)", () => {
    const scene = literal({
      scene: {
        ...emptyScene,
        groups: [
          { id: "ga", label: "GA", kind: "inset", members: ["ma"] },
          { id: "gb", label: "GB", kind: "inset", members: ["mb"] },
        ],
      },
      groups: [
        { id: "ga", label: "GA", inset: true, x: 10, y: 10, w: 300, h: 200, ports: {} },
        { id: "gb", label: "GB", inset: true, x: 400, y: 10, w: 100, h: 60, ports: {} },
      ],
      nodes: [
        { id: "ma", kind: "io", label: "MA", x: 20, y: 20, w: 40, h: 20, ports: {} },
        // mb belongs to gb but is parked inside ga
        { id: "mb", kind: "io", label: "MB", x: 30, y: 60, w: 40, h: 20, ports: {} },
      ],
    });
    const findings = runSceneGates(scene);
    expect(findings.some((f) => f.gate === "overlap" && f.target === "mb+ga")).toBe(true);
  });

  it("treats geometric containment of insets as overlap without declared ancestry (round 4 fix)", () => {
    const scene = literal({
      scene: {
        ...emptyScene,
        groups: [
          { id: "outer", label: "O", kind: "inset", members: [] },
          { id: "inner", label: "I", kind: "inset", members: [] },
        ],
      },
      groups: [
        { id: "outer", label: "O", inset: true, x: 10, y: 10, w: 300, h: 200, ports: {} },
        { id: "inner", label: "I", inset: true, x: 30, y: 30, w: 80, h: 60, ports: {} },
      ],
    });
    expect(runSceneGates(scene).map((f) => f.target)).toContain("outer+inner");
  });

  it("accepts declared nesting (parent chain) as containment, not overlap", () => {
    expect(runSceneGates(layoutScene(nestedScene())).filter((f) => f.gate === "overlap")).toEqual([]);
  });

  it("flags a node straddling an inset border (partial overlap, round 5)", () => {
    const scene = literal({
      scene: { ...emptyScene, groups: [{ id: "g", label: "G", kind: "inset", members: ["a"] }] },
      groups: [{ id: "g", label: "G", inset: true, x: 100, y: 100, w: 200, h: 100, ports: {} }],
      nodes: [
        { id: "a", kind: "io", label: "A", x: 120, y: 140, w: 40, h: 20, ports: {} },
        // half in, half out of the box
        { id: "straddler", kind: "io", label: "S", x: 60, y: 120, w: 80, h: 40, ports: {} },
      ],
    });
    const findings = runSceneGates(scene);
    expect(findings.some((f) => f.gate === "overlap" && f.target === "straddler+g")).toBe(true);
  });

  it("flags out-of-canvas geometry", () => {
    const scene = literal({
      size: { w: 200, h: 200 },
      nodes: [{ id: "a", kind: "io", label: "A", x: 250, y: 10, w: 40, h: 30, ports: {} }],
      edges: [{ id: "e", kind: "flow", points: [{ x: 5, y: 5 }, { x: 400, y: 50 }] }],
    });
    const gates = runSceneGates(scene).map((f) => f.gate);
    expect(gates.filter((g) => g === "bounds")).toHaveLength(2);
  });

  it("flags a border port whose second coordinate leaves the box segment", () => {
    const scene = literal({
      scene: { ...emptyScene, groups: [{ id: "g", label: "G", kind: "inset", members: ["a"] }] },
      groups: [{ id: "g", label: "G", inset: true, x: 10, y: 10, w: 200, h: 100, ports: { p: { x: 10, y: 999 } } }],
      nodes: [{ id: "a", kind: "io", label: "A", x: 30, y: 30, w: 60, h: 30, ports: {} }],
    });
    expect(runSceneGates(scene).map((f) => f.gate)).toContain("port-border");
  });

  it("flags a member escaping its inset", () => {
    const scene = literal({
      scene: { ...emptyScene, groups: [{ id: "g", label: "G", kind: "inset", members: ["a"] }] },
      groups: [{ id: "g", label: "G", inset: true, x: 10, y: 10, w: 100, h: 60, ports: {} }],
      nodes: [{ id: "a", kind: "io", label: "A", x: 300, y: 300, w: 60, h: 30, ports: {} }],
    });
    expect(runSceneGates(scene).map((f) => f.gate)).toContain("containment");
  });

  it("keeps the message view in sync", () => {
    const scene = literal({
      nodes: [
        { id: "a", kind: "io", label: "A", x: 10, y: 10, w: 100, h: 40, ports: {} },
        { id: "b", kind: "io", label: "B", x: 60, y: 20, w: 100, h: 40, ports: {} },
      ],
    });
    expect(geometryGates(scene).join("\n")).toMatch(/node overlap: a vs b/);
  });
});
