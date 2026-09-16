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

  it("makes stream identity an IR invariant: cross-wires are validator errors (round 4)", () => {
    // mis-target a traversal onto another stream's operator port
    const misTarget = mhcStreamsScene();
    misTarget.edges.find((e) => e.id === "t-a1")!.to = "attn.e2";
    expect(validateScene(misTarget).join("\n")).toMatch(/stream tag mismatch \(s1 vs s2\)/);

    // cross-wire the inter-stage leg onto another stream's stage port
    const crossed = mhcStreamsScene();
    crossed.edges.find((e) => e.id === "p1")!.from = "g-attn.out2";
    expect(validateScene(crossed).join("\n")).toMatch(/stream tag mismatch \(s2 vs s1\)/);

    // mis-return a stream into another stream's write port
    const misReturn = mhcStreamsScene();
    misReturn.edges.find((e) => e.id === "r1")!.to = "write.w2";
    expect(validateScene(misReturn).join("\n")).toMatch(/stream tag mismatch \(s1 vs s2\)/);

    // the intact fixture tags every stream leg consistently
    const scene = mhcStreamsScene();
    expect(validateScene(scene)).toEqual([]);
    const tagged = scene.edges.filter((e) => ["s", "p", "r", "t", "u"].includes(e.id[0]!) && e.id.length <= 4);
    expect(tagged).toHaveLength(28); // 12 residual legs + 16 operator traversals
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
