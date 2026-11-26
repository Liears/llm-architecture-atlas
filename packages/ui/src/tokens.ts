/**
 * Semantic design tokens (issue #4, docs/development-plan.md §7.2).
 *
 * Direction: "logic analyzer + Swiss engineering monograph" without neon-on-black.
 * Every token is semantic (role-based); light and dark are equally
 * first-class, and the test suite enforces WCAG AA contrast for the pairs a
 * UI may combine. Colors never carry meaning alone — pair with shape, line
 * style and labels in the renderer.
 */

export type ThemeName = "light" | "dark";

export interface ThemeTokens {
  /** Page background. */
  paper: string;
  /** Body text and primary outlines. */
  ink: string;
  /** Secondary text. */
  muted: string;
  /** Raised surface (cards, insets). */
  panel: string;
  /** Recessed surface well (inset header bands, secondary wells). */
  surface: string;
  /** Subtle drafting micro-grid dot/line color. */
  grid: string;
  /** Hairlines and separators. */
  line: string;
  /** Attention / primary data flow. */
  attention: string;
  /** Linear / recurrent state. */
  state: string;
  /** FFN / MoE compute. */
  compute: string;
  /** System-1 decision head, typed readout, probability calibration. */
  decision: string;
  /** Conflict, unknown, warning. */
  conflict: string;
  /** Keyboard focus ring. */
  focus: string;
}

export const themes: Record<ThemeName, ThemeTokens> = {
  light: {
    paper: "#F5F7FA",
    ink: "#172033",
    muted: "#586377",
    panel: "#FFFFFF",
    surface: "#EDF1F7",
    grid: "#D7DFEC",
    line: "#B9C2D2",
    attention: "#1769E0",
    state: "#007A7A",
    compute: "#B45309",
    decision: "#6D28D9",
    conflict: "#B3383F",
    focus: "#1769E0",
  },
  dark: {
    paper: "#0B1220",
    ink: "#E6EBF4",
    muted: "#97A3B8",
    panel: "#111B2E",
    surface: "#17243C",
    grid: "#1E2D4A",
    line: "#3A465C",
    attention: "#6EA8FF",
    state: "#2DD4BF",
    compute: "#F5A623",
    decision: "#B89AFF",
    conflict: "#FF8A96",
    focus: "#9EC1FF",
  },
};

/** Shape and stroke tokens: semantic role -> value (renderer consumes these). */
export const radii = { node: 10, container: 16, chip: 6 } as const;

export const strokeWidths = {
  hairline: 1,
  outline: 2,
  flow: 2.5,
  emphasis: 4,
} as const;

export const fontStacks = {
  sans: '"Source Sans 3", "Noto Sans SC", system-ui, sans-serif',
  condensed: '"IBM Plex Sans Condensed", "Source Sans 3", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
} as const;

/** WCAG 2.x relative luminance of a #RRGGBB color. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #RRGGBB color: ${hex}`);
  const h = m[1]!;
  const chan = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  const [r, g, b] = [chan(0), chan(2), chan(4)];
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two #RRGGBB colors (1..21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
