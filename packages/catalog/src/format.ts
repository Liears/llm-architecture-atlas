/**
 * Shared formatters (issue #22): the single source for human-readable
 * parameter/context strings across catalog, detail, compare and compiler.
 */

/** 8_030_000_000 -> "8B"; 320_000_000_000 -> "320B"; 1_200_000_000_000 -> "1.2T"; null -> "—" */
export function formatParams(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1e12) {
    const t = Math.round((n / 1e12) * 10) / 10;
    return `${Number.isInteger(t) ? t.toFixed(0) : t.toFixed(1)}T`;
  }
  const b = Math.round((n / 1e9) * 10) / 10;
  return `${Number.isInteger(b) ? b.toFixed(0) : b.toFixed(1)}B`;
}

/** 1_048_576 -> "1M"; 262_144 -> "256K"; 8_192 -> "8K"; null -> "—" */
export function formatContext(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1e6) {
    const m = Math.round((n / 1e6) * 10) / 10;
    return `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  return `${Math.round(n / 1024)}K`;
}
