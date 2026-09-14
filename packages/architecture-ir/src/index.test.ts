import { describe, expect, it } from "vitest";
import { IR_VERSION } from "./index.js";

describe("architecture-ir", () => {
  it("exposes a semver IR version", () => {
    expect(IR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
