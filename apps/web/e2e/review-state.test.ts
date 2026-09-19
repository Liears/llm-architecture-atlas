/**
 * Unit tests for the #35 review-state machine (round 5). The binding rules
 * live in review-state.ts so they are provable without playwright:
 * enum validation, signature completeness, hash binding with auto-revert,
 * and — the round-4 P1 — that a `reviewed` state is REACHABLE: a signature
 * over shot hashes survives on a later head, because committing the
 * signature itself necessarily moves HEAD.
 */

import { describe, expect, it } from "vitest";
import {
  PENDING,
  parseCommittedReview,
  resolveEffectiveReview,
  reviewSatisfied,
  type ReviewState,
} from "./review-state.js";

const SHOTS = ["glm-full-1440x900.png", "glm-figure-1440x900.png"];
const HASHES: Record<string, string> = {
  "glm-full-1440x900.png": "a".repeat(64),
  "glm-figure-1440x900.png": "b".repeat(64),
};
const signed = (over: Partial<ReviewState> = {}): ReviewState => ({
  status: "reviewed",
  reviewer: "reviewer-x",
  date: "2026-09-17",
  head: "1".repeat(40),
  shots_sha256: { ...HASHES },
  ...over,
});

describe("parseCommittedReview", () => {
  it("treats a missing record as pending", () => {
    expect(parseCommittedReview(undefined, SHOTS)).toEqual(PENDING);
  });
  it("rejects statuses outside the enum", () => {
    expect(() => parseCommittedReview({ status: "approved" }, SHOTS)).toThrow(/not one of pending\/reviewed\/rejected\/skipped/);
  });
  it.each([
    ["reviewer", { reviewer: null }],
    ["date", { date: null }],
    ["head", { head: "not-a-sha" }],
    ["shots_sha256", { shots_sha256: null }],
    ["shots_sha256 coverage", { shots_sha256: { "glm-full-1440x900.png": "a".repeat(64) } }],
  ])("rejects a reviewed signature missing %s", (_name, over) => {
    expect(() => parseCommittedReview(signed(over as Partial<ReviewState>), SHOTS)).toThrow(/an unsigned review is not a review/);
  });
  it("accepts pending/rejected/skipped without signature fields", () => {
    for (const status of ["pending", "rejected", "skipped"] as const) {
      expect(parseCommittedReview({ status }, SHOTS).status).toBe(status);
    }
  });
});

describe("resolveEffectiveReview", () => {
  it("keeps a signature whose shot hashes still match, on any later head (reachability, round-4 P1)", () => {
    const { effective, revertNote } = resolveEffectiveReview(signed(), "2".repeat(40), HASHES);
    expect(effective.status).toBe("reviewed");
    expect(reviewSatisfied(effective)).toBe(true);
    expect(revertNote).toBeNull();
  });
  it("reverts to pending when a shot hash drifts, naming the shot", () => {
    const drifted = { ...HASHES, "glm-figure-1440x900.png": "c".repeat(64) };
    const { effective, revertNote } = resolveEffectiveReview(signed(), "2".repeat(40), drifted);
    expect(effective.status).toBe("pending");
    expect(reviewSatisfied(effective)).toBe(false);
    expect(revertNote).toMatch(/glm-figure-1440x900\.png/);
    expect(revertNote).toMatch(/reviewed by reviewer-x 2026-09-17/);
  });
  it("passes pending/rejected/skipped through untouched", () => {
    for (const status of ["pending", "rejected", "skipped"] as const) {
      const state = parseCommittedReview({ status }, SHOTS);
      expect(resolveEffectiveReview(state, "2".repeat(40), HASHES).effective).toEqual(state);
    }
  });
});
