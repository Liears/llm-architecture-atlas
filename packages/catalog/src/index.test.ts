import { describe, expect, it } from "vitest";
import { CATALOG_VERSION } from "./index.js";

describe("catalog", () => {
  it("exposes a semver catalog version", () => {
    expect(CATALOG_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
