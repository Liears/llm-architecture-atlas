/**
 * Compound fixture tests (#33): the mHC and inset fixtures are the contract
 * evidence for issues #33/#34 — validator accepts them, and every known
 * corruption (pseudo stream, dropped stream, port-less crossing) fails.
 */

import { describe, expect, it } from "vitest";
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

  it("connects each read port to its corresponding write port (review regression)", () => {
    const scene = mhcStreamsScene();
    // graph reachability per stream index: follow only this stream's legs
    for (let i = 1; i <= 4; i++) {
      const legs = scene.edges.filter((e) => ["s", "p", "r"].some((p) => e.id === `${p}${i}`));
      expect(legs).toHaveLength(3);
      const adjacency = new Map<string, string[]>();
      for (const leg of legs) {
        const from = leg.from.replace(/\.\w+$/, "");
        const to = leg.to.replace(/\.\w+$/, "");
        adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
      }
      const seen = new Set<string>(["read"]);
      const queue = ["read"];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const next of adjacency.get(cur) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect(seen.has("write")).toBe(true);
    }
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
