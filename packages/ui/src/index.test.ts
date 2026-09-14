import { describe, expect, it } from "vitest";
import { UI_VERSION } from "./index.js";

describe("ui", () => {
  it("exposes a semver version", () => {
    expect(UI_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
