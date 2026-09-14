import { describe, expect, it } from "vitest";
import { DIAGRAM_ENGINE_VERSION } from "./index.js";

describe("diagram-engine", () => {
  it("exposes a semver version", () => {
    expect(DIAGRAM_ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
