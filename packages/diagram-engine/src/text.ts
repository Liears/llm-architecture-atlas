/**
 * Deterministic text measurement (issue #5).
 *
 * A heuristic, not canvas measure: visual regression snapshots (issue #7)
 * must be reproducible across machines, and a per-class advance model is
 * stable by construction. Good enough for box sizing with the padding that
 * the layout engine applies; the renderer draws real text on top.
 */

const ASCII_NARROW = new Set("ijlt.,:;'|!()[]{}-");
const ASCII_WIDE = new Set("mwMW@%");
const DIGITS = new Set("0123456789");

export function charAdvance(ch: string, fontSize: number, bold: boolean): number {
  const em = fontSize * (bold ? 0.58 : 0.52);
  if (/[一-鿿　-〿＀-￯]/.test(ch)) return fontSize; // CJK fullwidth
  if (DIGITS.has(ch)) return em * 0.62;
  if (ASCII_WIDE.has(ch)) return em * 1.35;
  if (ASCII_NARROW.has(ch)) return em * 0.55;
  if (ch === " ") return em * 0.55;
  return em;
}

export function measureText(text: string, fontSize = 16, bold = false): number {
  let w = 0;
  for (const ch of text) w += charAdvance(ch, fontSize, bold);
  return w;
}
