import { describe, expect, it } from "vitest";
import { contrast, fontStacks, themes, strokeWidths } from "./tokens.js";

/** Text-bearing accents must reach WCAG AA (4.5:1) on their theme's paper. */
const ACCENTS = ["attention", "state", "compute", "conflict"] as const;

describe("design tokens", () => {
  it("provides light and dark themes with the same token set", () => {
    const lightKeys = Object.keys(themes.light).sort();
    const darkKeys = Object.keys(themes.dark).sort();
    expect(darkKeys).toEqual(lightKeys);
    expect(lightKeys).toContain("focus"); // a11y: keyboard focus is a token
  });

  it.each([["light", themes.light], ["dark", themes.dark]] as const)(
    "%s: accents meet WCAG AA contrast on paper",
    (_name, t) => {
      for (const role of ACCENTS) {
        expect(contrast(t[role], t.paper), `${role} on ${_name} paper`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each([["light", themes.light], ["dark", themes.dark]] as const)(
    "%s: ink and muted text are readable on paper and panel",
    (_name, t) => {
      expect(contrast(t.ink, t.paper), "ink on paper").toBeGreaterThanOrEqual(7); // body text
      expect(contrast(t.muted, t.paper), "muted on paper").toBeGreaterThanOrEqual(4.5); // secondary text
      expect(contrast(t.ink, t.panel), "ink on panel").toBeGreaterThanOrEqual(7);
    },
  );

  it("keeps stroke widths ordered for the renderer", () => {
    expect(strokeWidths.hairline).toBeLessThan(strokeWidths.outline);
    expect(strokeWidths.outline).toBeLessThan(strokeWidths.flow);
    expect(strokeWidths.flow).toBeLessThan(strokeWidths.emphasis);
  });

  it("ships mono and condensed stacks for evidence locators and titles", () => {
    expect(fontStacks.mono).toMatch(/IBM Plex Mono/);
    expect(fontStacks.condensed).toMatch(/IBM Plex Sans Condensed/);
  });
});
