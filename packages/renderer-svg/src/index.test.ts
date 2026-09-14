import { describe, expect, it } from "vitest";
import { RENDERER_VERSION } from "./index.js";

describe("renderer-svg", () => {
  it("exposes a semver version", () => {
    expect(RENDERER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
