/**
 * Compound fixture tests (#33): the mHC and inset fixtures are the contract
 * evidence for issues #33/#34 — validator accepts them, and every known
 * corruption (pseudo stream, dropped stream, port-less crossing) fails.
 */

import { describe, expect, it } from "vitest";
import type { DiagramScene } from "./types.js";
import { mhcStreamsScene, insetsScene } from "./fixtures.js";
import { validateScene } from "./validate.js";

describe("mhcStreamsScene (#33 acceptance)", () => {
  it("is valid: 4 streams each cross the sublayer boundary", () => {
    expect(validateScene(mhcStreamsScene())).toEqual([]);
  });

  it("has 4 residual streams with distinct boundary ports at every stage", () => {
    const scene = mhcStreamsScene();
    const streams = scene.edges.filter((e) => e.kind === "residual");
    expect(streams.map((e) => e.id)).toEqual(["s1", "p1", "r1", "s2", "p2", "r2", "s3", "p3", "r3", "s4", "p4", "r4"]);
    for (const stage of ["g-attn", "g-ffn"]) {
      const legs = streams.filter((e) => e.to.includes(stage) || e.from.includes(stage));
      expect(new Set(legs.map((e) => `${e.from}->${e.to}`)).size).toBe(legs.length);
    }
  });

  it("connects each read port to its corresponding write port, port-identity intact (round 2 regression)", () => {
    const reach = (scene: DiagramScene, stream: number): boolean => {
      // vertices: group ports AND declared node ports (split/merge stream
      // ports) stay DISTINCT — they carry stream identity; implicit node
      // in/out references collapse to the node id (a node's internal
      // connectivity is given). A cross-wired out2 → in1 therefore cannot
      // fake connectivity, while node-internal traversal needs no edge.
      const groupHeads = new Set(scene.groups.map((g) => g.id));
      const declared = new Map(scene.nodes.map((n) => [n.id, new Set(n.ports ?? [])]));
      const vertex = (ref: string): string => {
        const dot = ref.indexOf(".");
        if (dot === -1) return ref;
        const head = ref.slice(0, dot);
        const port = ref.slice(dot + 1);
        if (groupHeads.has(head)) return ref;
        if (declared.get(head)?.has(port)) return ref;
        return head;
      };
      const adjacency = new Map<string, string[]>();
      for (const edge of scene.edges) {
        const from = vertex(edge.from);
        const to = vertex(edge.to);
        adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
      }
      const start = `read.s${stream}`;
      const goal = `write.w${stream}`;
      const seen = new Set<string>([start]);
      const queue = [start];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const next of adjacency.get(cur) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      return seen.has(goal);
    };

    const scene = mhcStreamsScene();
    for (let i = 1; i <= 4; i++) expect(reach(scene, i)).toBe(true);

    // cross-wire stream 1's inter-stage leg onto stream 2's attention
    // out-port: stream 1 must lose its read → write connection
    const crossed = mhcStreamsScene();
    crossed.edges.find((e) => e.id === "p1")!.from = "g-attn.out2";
    expect(reach(crossed, 1)).toBe(false);
    expect(reach(crossed, 2)).toBe(true);

    // and dropping a stage's in→out connection breaks the stream the same way
    const broken = mhcStreamsScene();
    broken.edges = broken.edges.filter((e) => e.id !== "x-a3");
    expect(reach(broken, 3)).toBe(false);
  });

  it("reaches an independent write/merge port per stream", () => {
    const scene = mhcStreamsScene();
    const writes = scene.edges.filter((e) => e.id.startsWith("r"));
    expect(writes).toHaveLength(4);
    expect(new Set(writes.map((e) => e.to)).size).toBe(4);
    const merge = scene.nodes.find((n) => n.id === "write")!;
    expect(merge.kind).toBe("merge");
  });

  it("negative: turning a stream leg into a self-loop fails validation", () => {
    const scene = mhcStreamsScene();
    const p2 = scene.edges.find((e) => e.id === "p2")!;
    p2.to = p2.from;
    expect(validateScene(scene).join("\n")).toMatch(/residual edge p2: self-loop/);
  });

  it("keeps validating when a stream is dropped: stream count is a model fact, boundary crossing is the IR rule", () => {
    const scene = mhcStreamsScene();
    scene.edges = scene.edges.filter((e) => !e.id.endsWith("4") || !["s", "p", "r"].includes(e.id[0]!));
    expect(validateScene(scene)).toEqual([]);
  });

  it("negative: a stream leg bypassing the boundary port fails validation", () => {
    const scene = mhcStreamsScene();
    const s1 = scene.edges.find((e) => e.id === "s1")!;
    s1.to = "attn";
    expect(validateScene(scene).join("\n")).toMatch(/crosses group g-attn boundary without a boundary port/);
  });
});

describe("insetsScene (#33 acceptance)", () => {
  it("is valid with boundary ports on both insets", () => {
    expect(validateScene(insetsScene())).toEqual([]);
  });

  it("keeps DSA and MoE as separate insets with local direction", () => {
    const scene = insetsScene();
    const insets = scene.groups.filter((g) => g.kind === "inset");
    expect(insets.map((g) => g.id)).toEqual(["g-dsa", "g-moe"]);
    for (const g of insets) {
      expect(g.direction).toBe("left-to-right");
      expect(g.ports?.length).toBe(2);
    }
  });
});
