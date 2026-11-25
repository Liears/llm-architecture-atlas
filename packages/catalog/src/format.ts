/**
 * Shared formatters (issue #22): the single source for human-readable
 * parameter/context strings across catalog, detail, compare and compiler.
 */

/** 421_293_830 -> "421.3M"; 8_030_000_000 -> "8B"; 320_000_000_000 -> "320B"; 1_200_000_000_000 -> "1.2T"; null -> "—" */
export function formatParams(n: number | null): string {
  if (n === null) return "—";
  const trim = (v: number) => {
    const r = Math.round(v * 10) / 10;
    return Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1);
  };
  if (n >= 1e12) return `${trim(n / 1e12)}T`;
  if (n >= 1e9) return `${trim(n / 1e9)}B`;
  return `${trim(n / 1e6)}M`;
}

/** 512 -> "512"; 8_192 -> "8K"; 262_144 -> "256K"; 1_048_576 -> "1M"; null -> "—" */
export function formatContext(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1e6) {
    const m = Math.round((n / 1e6) * 10) / 10;
    return `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (n < 1024) return String(n);
  return `${Math.round(n / 1024)}K`;
}
