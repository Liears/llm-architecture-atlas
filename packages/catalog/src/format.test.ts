import { describe, expect, it } from "vitest";
import { formatParams, formatContext } from "./format.js";

describe("formatParams (issue #22 — single formatter, no drift)", () => {
  it.each([
    [8_030_000_000, "8B"],
    [46_700_000_000, "46.7B"],
    [320_000_000_000, "320B"],
    [1_200_000_000_000, "1.2T"],
    [1_000_000_000_000, "1T"],
    [3_000_000_000, "3B"],
    [12_900_000_000, "12.9B"],
    [null, "—"],
  ] as Array<[number | null, string]>)("formats %s -> %s", (input, expected) => {
    expect(formatParams(input)).toBe(expected);
  });
});

describe("formatContext", () => {
  it.each([
    [8_192, "8K"],
    [262_144, "256K"],
    [1_048_576, "1M"],
    [163_840, "160K"],
    [null, "—"],
  ] as Array<[number | null, string]>)("formats %s -> %s", (input, expected) => {
    expect(formatContext(input)).toBe(expected);
  });
});
