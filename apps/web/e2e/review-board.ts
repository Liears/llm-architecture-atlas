/**
 * HTML composer for the #35 review board (round 5): frozen before baseline
 * beside the current run's shots, titled with baseline dir, current head and
 * the inherited review state. Pure string builder so the e2e test only owns
 * screenshots, hashing and serving.
 */

export interface BoardInput {
  baselineDir: string | null;
  head: string;
  reviewLabel: string;
  revertNote: string | null;
  viewports: Array<[number, number]>;
  /** data-URL for a baseline shot, or null when the file is absent */
  beforeSrc: (file: string) => string | null;
}

export function composeBoardHtml(input: BoardInput): string {
  const beforeCell = (f: string, w: number): string => {
    const src = input.baselineDir ? input.beforeSrc(f) : null;
    if (!src) return `<td style="vertical-align:top;padding:4px"><div style="font:600 12px sans-serif">before: none</div></td>`;
    return `<td style="vertical-align:top;padding:4px"><div style="font:600 12px sans-serif">${f} (before)</div><img src="${src}" style="width:${w}px;display:block;border:1px solid #ccc"/></td>`;
  };
  const afterCell = (f: string, w: number): string =>
    `<td style="vertical-align:top;padding:4px"><div style="font:600 12px sans-serif">${f} (after)</div><img src="${f}" style="width:${w}px;display:block;border:1px solid #ccc"/></td>`;
  const rows = input.viewports
    .map(([w, h]) => {
      const cells = [
        beforeCell(`glm-full-${w}x${h}.png`, 300),
        beforeCell(`glm-figure-${w}x${h}.png`, 300),
        afterCell(`glm-full-${w}x${h}.png`, 300),
        afterCell(`glm-figure-${w}x${h}.png`, 300),
      ].join("");
      return `<tr><td style="font:700 13px sans-serif">${w}px</td>${cells}</tr>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font:13px sans-serif;margin:12px;background:#fff}</style></head><body>
<h3>GLM-5.3-Flash review board — before (${input.baselineDir ?? "none"}) | after at ${input.head.slice(0, 9)}, at 1440/820/390 (visual_review: ${input.reviewLabel})</h3>
${input.revertNote ? `<p style="color:#a00;font:600 12px sans-serif">${input.revertNote}</p>` : ""}
<table><tr><th></th><th colspan="2">before (frozen baseline)</th><th colspan="2">after (this run)</th></tr><tr><th></th><th>full page</th><th>figure</th><th>full page</th><th>figure</th></tr>${rows}</table>
</body></html>`;
}
