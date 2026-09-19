/**
 * Gate mutation tests (#35): each known corruption turns exactly its gate
 * red. Valid fixtures must pass all geometry gates; the wide/overlap/
 * bounds/port/containment mutations are hand-built PositionedScene literals
 * so the gates are tested against geometry, not against the layout engine's
 * willingness to produce it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";
import { layoutScene } from "./layout.js";
import { compileForModel, positionForModel } from "./gates-report.js";
import { runSceneGates, geometryGates, fontGates, effectiveFontPx, layoutWithCorrection, HARD_GATES, type GateFinding } from "./gates.js";
import { renderSvg, scanSvgSafety } from "../../renderer-svg/src/render.js";
import { mhcStreamsScene, insetsScene } from "./fixtures.js";
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
  const scene = compileForModel(arch, evidence);
  return positionForModel(scene).positioned;
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

describe("review round-1 false negatives (must stay dead)", () => {
  it("rejects a border port whose second coordinate is outside the box segment", () => {
    const scene = literal({
      scene: { ...emptyScene, groups: [{ id: "g", label: "G", kind: "inset", members: ["a"] }] },
      groups: [{ id: "g", label: "G", inset: true, x: 10, y: 10, w: 200, h: 100, ports: { p: { x: 10, y: 999 } } }],
      nodes: [{ id: "a", kind: "io", label: "A", x: 30, y: 30, w: 60, h: 30, ports: {} }],
    });
    expect(runSceneGates(scene).map((f) => f.gate)).toContain("port-border");
  });

  it("rejects a non-member node parked entirely inside an inset", () => {
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
});

describe("new geometry/safety gates (#35 round 2)", () => {
  it("flags an edge passing through a node box", () => {
    const scene = literal({
      nodes: [{ id: "a", kind: "io", label: "A", x: 100, y: 100, w: 80, h: 40, ports: {} }],
      edges: [{ id: "e", kind: "flow", points: [{ x: 10, y: 120 }, { x: 300, y: 120 }] }],
    });
    expect(runSceneGates(scene).map((f) => f.gate)).toContain("edge-node");
  });

  it("flags an edge crossing a group label strip", () => {
    const scene = literal({
      scene: { ...emptyScene, groups: [{ id: "g", label: "Group label", kind: "stack", members: [] }] },
      groups: [{ id: "g", label: "Group label", inset: false, x: 50, y: 50, w: 300, h: 120, ports: {} }],
      edges: [{ id: "e", kind: "flow", points: [{ x: 10, y: 60 }, { x: 400, y: 60 }] }],
    });
    expect(runSceneGates(scene).map((f) => f.gate)).toContain("edge-reserved");
  });

  it("flags collinear overlapping business edges", () => {
    const scene = literal({
      edges: [
        { id: "e1", kind: "flow", points: [{ x: 10, y: 50 }, { x: 200, y: 50 }] },
        { id: "e2", kind: "control", points: [{ x: 100, y: 50 }, { x: 300, y: 50 }] },
      ],
    });
    expect(runSceneGates(scene).map((f) => f.gate)).toContain("edge-overlap");
  });

  it("flags label text wider than the node box", () => {
    const scene = literal({
      nodes: [{ id: "a", kind: "io", label: "A very long label that cannot fit", x: 0, y: 0, w: 60, h: 40, ports: {} }],
    });
    expect(runSceneGates(scene).map((f) => f.gate)).toContain("text-overflow");
  });
});

describe("scanSvgSafety (#35)", () => {
  it("accepts the inert canonical document", () => {
    const svg = renderSvg(layoutScene(insetsScene()), {});
    expect(scanSvgSafety(svg)).toEqual([]);
  });

  it("rejects scripts, handlers and external references", () => {
    expect(scanSvgSafety('<svg><script>alert(1)</script></svg>').map((f) => f.gate)).toContain("svg-active");
    expect(scanSvgSafety('<svg><rect onclick="x()"/></svg>').map((f) => f.gate)).toContain("svg-active");
    expect(scanSvgSafety('<svg><image href="https://evil.example/x.png"/></svg>').map((f) => f.gate)).toContain("svg-external");
  });
});

describe("bounded correction (#35)", () => {
  it("spends at most two correction rounds then reports hard reds", () => {
    const alwaysRed = (): GateFinding[] => [{ gate: "overlap", target: "x", message: "stub red" }];
    const result = layoutWithCorrection(insetsScene(), [{ fontSize: 16 }, { fontSize: 16, gapX: 48 }, { fontSize: 16, gapX: 56 }], alwaysRed);
    expect(result.rounds).toBe(2);
    expect(result.hard).toHaveLength(1);
  });

  it("stops at the first variant that clears the hard gates", () => {
    let calls = 0;
    const redUntilSecond = (p: PositionedScene): GateFinding[] => {
      calls += 1;
      return calls < 2 ? [{ gate: "overlap", target: "x", message: "stub red" }] : [];
    };
    const result = layoutWithCorrection(insetsScene(), [{ fontSize: 16 }, { fontSize: 16, gapX: 48 }, { fontSize: 16, gapX: 56 }], redUntilSecond);
    expect(result.rounds).toBe(1);
    expect(result.hard).toEqual([]);
  });
});

describe("geometryGates (#35)", () => {
  it("accepts the valid compound fixtures (hard gates clean; debt tracked in baselines)", () => {
    const hard = (scene: PositionedScene) => runSceneGates(scene).filter((f) => HARD_GATES.has(f.gate));
    expect(hard(layoutScene(insetsScene()))).toEqual([]);
    expect(hard(layoutScene(mhcStreamsScene()))).toEqual([]);
  });

  it("mutation: overlapping nodes turn the overlap gate red", () => {
    const scene = literal({
      nodes: [
        { id: "a", kind: "io", label: "A", x: 10, y: 10, w: 100, h: 40, ports: {} },
        { id: "b", kind: "io", label: "B", x: 60, y: 20, w: 100, h: 40, ports: {} },
      ],
    });
    expect(geometryGates(scene).join("\n")).toMatch(/node overlap: a vs b/);
  });

  it("mutation: out-of-canvas node and edge waypoint turn the bounds gate red", () => {
    const scene = literal({
      size: { w: 200, h: 200 },
      nodes: [{ id: "a", kind: "io", label: "A", x: 250, y: 10, w: 40, h: 30, ports: {} }],
      edges: [{ id: "e", kind: "flow", points: [{ x: 5, y: 5 }, { x: 400, y: 50 }] }],
    });
    const errors = geometryGates(scene).join("\n");
    expect(errors).toMatch(/node a exceeds the 200×200 canvas/);
    expect(errors).toMatch(/edge e waypoint \(400,50\) exceeds the canvas/);
  });

  it("mutation: a flat same-depth row breaks the aspect cap", () => {
    const row = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      kind: "io",
      label: `N${i}`,
      x: i * 110,
      y: 10,
      w: 100,
      h: 40,
      ports: {},
    }));
    const scene = literal({ size: { w: 1100, h: 60 }, nodes: row });
    expect(geometryGates(scene).join("\n")).toMatch(/aspect ratio \d+\.\d+:1 exceeds 1.8:1/);
  });

  it("mutation: a boundary port floating inside the box is rejected", () => {
    const scene = literal({
      scene: {
        ...emptyScene,
        groups: [{ id: "g", label: "G", kind: "inset", members: ["a"] }],
      },
      groups: [
        {
          id: "g",
          label: "G",
          inset: true,
          x: 10,
          y: 10,
          w: 200,
          h: 100,
          ports: { p: { x: 110, y: 60 } },
        },
      ],
      nodes: [{ id: "a", kind: "io", label: "A", x: 30, y: 30, w: 60, h: 30, ports: {} }],
    });
    expect(runSceneGates(scene).map((f) => f.message).join("\n")).toMatch(/is not on the group border segment/);
  });

  it("mutation: an inset member escaping its box is rejected", () => {
    const scene = literal({
      scene: {
        ...emptyScene,
        groups: [{ id: "g", label: "G", kind: "inset", members: ["a"] }],
      },
      groups: [{ id: "g", label: "G", inset: true, x: 10, y: 10, w: 100, h: 60, ports: {} }],
      nodes: [{ id: "a", kind: "io", label: "A", x: 300, y: 300, w: 60, h: 30, ports: {} }],
    });
    expect(geometryGates(scene).join("\n")).toMatch(/inset g does not contain member a/);
  });
});

describe("fontGates (#35)", () => {
  it("computes effective size from the display scale", () => {
    const laid = layoutScene(insetsScene());
    const { label } = effectiveFontPx(laid, laid.size.w);
    expect(label).toBeCloseTo(16, 5);
    const half = effectiveFontPx(laid, laid.size.w / 2);
    expect(half.label).toBeCloseTo(8, 5);
  });

  it("mutation: whole-figure scaling to phone width drops below the 12px floor", () => {
    const laid = layoutScene(insetsScene());
    expect(fontGates(laid, { referenceWidth: 390 }).map((f) => f.message).join("\n")).toMatch(/below 12px/);
  });

  it("passes at desktop reference width for a portrait composition", () => {
    const laid = layoutScene(mhcStreamsScene());
    expect(fontGates(laid, { referenceWidth: 1150 })).toEqual([]);
  });
});

describe("round-4 overlap fixes", () => {
  it("flags a SIBLING group's member parked inside an inset", () => {
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
        { id: "mb", kind: "io", label: "MB", x: 30, y: 60, w: 40, h: 20, ports: {} },
      ],
    });
    const findings = runSceneGates(scene);
    expect(findings.some((f) => f.gate === "overlap" && f.target === "mb+ga")).toBe(true);
  });

  it("treats geometric containment of insets as overlap without declared ancestry", () => {
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

  it("flags a node straddling an inset border (partial overlap, round 5)", () => {
    const scene = literal({
      scene: { ...emptyScene, groups: [{ id: "g", label: "G", kind: "inset", members: ["a"] }] },
      groups: [{ id: "g", label: "G", inset: true, x: 100, y: 100, w: 200, h: 100, ports: {} }],
      nodes: [
        { id: "a", kind: "io", label: "A", x: 120, y: 140, w: 40, h: 20, ports: {} },
        { id: "straddler", kind: "io", label: "S", x: 60, y: 120, w: 80, h: 40, ports: {} },
      ],
    });
    const findings = runSceneGates(scene);
    expect(findings.some((f) => f.gate === "overlap" && f.target === "straddler+g")).toBe(true);
  });
});

describe("round-6 nesting containment", () => {
  it("flags a declared child inset straddling its parent frame", () => {
    const straddling = literal({
      scene: {
        ...emptyScene,
        groups: [
          { id: "p", label: "P", kind: "inset", members: [] },
          { id: "c", label: "C", kind: "inset", members: [], parent: "p" },
        ],
      },
      groups: [
        { id: "p", label: "P", inset: true, x: 100, y: 100, w: 200, h: 100, ports: {} },
        { id: "c", label: "C", inset: true, x: 250, y: 120, w: 100, h: 60, ports: {} },
      ],
    });
    expect(runSceneGates(straddling).some((f) => f.gate === "containment" && f.target === "p+c")).toBe(true);
  });

  it("flags a declared child inset fully outside its parent frame", () => {
    const escaped = literal({
      scene: {
        ...emptyScene,
        groups: [
          { id: "p", label: "P", kind: "inset", members: [] },
          { id: "c", label: "C", kind: "inset", members: [], parent: "p" },
        ],
      },
      groups: [
        { id: "p", label: "P", inset: true, x: 100, y: 100, w: 200, h: 100, ports: {} },
        { id: "c", label: "C", inset: true, x: 400, y: 400, w: 80, h: 60, ports: {} },
      ],
    });
    expect(runSceneGates(escaped).some((f) => f.gate === "containment" && f.target === "p+c")).toBe(true);
  });
});
