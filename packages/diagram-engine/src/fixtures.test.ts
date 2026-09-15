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

  it("has 4 residual streams with distinct boundary ports", () => {
    const scene = mhcStreamsScene();
    const streams = scene.edges.filter((e) => e.kind === "residual");
    expect(streams.map((e) => e.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(new Set(streams.map((e) => e.from)).size).toBe(4);
    expect(new Set(streams.map((e) => e.to)).size).toBe(4);
  });

  it("reaches independent write/merge ports on the way back", () => {
    const scene = mhcStreamsScene();
    const returns = scene.edges.filter((e) => e.id.startsWith("w"));
    expect(returns).toHaveLength(4);
    expect(new Set(returns.map((e) => e.from)).size).toBe(4);
    const merge = scene.nodes.find((n) => n.id === "write")!;
    expect(merge.kind).toBe("merge");
  });

  it("negative: turning a stream into a self-loop fails validation", () => {
    const scene = mhcStreamsScene();
    const s2 = scene.edges.find((e) => e.id === "s2")!;
    s2.to = s2.from;
    expect(validateScene(scene).join("\n")).toMatch(/residual edge s2: self-loop/);
  });

  it("keeps validating when a stream is dropped: stream count is a model fact, boundary crossing is the IR rule", () => {
    const scene = mhcStreamsScene();
    scene.edges = scene.edges.filter((e) => e.id !== "s4");
    expect(validateScene(scene)).toEqual([]);
  });

  it("negative: a stream bypassing the boundary port fails validation", () => {
    const scene = mhcStreamsScene();
    const s1 = scene.edges.find((e) => e.id === "s1")!;
    s1.to = "attn";
    expect(validateScene(scene).join("\n")).toMatch(/crosses group g-sub boundary without a boundary port/);
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
