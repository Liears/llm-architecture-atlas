/**
 * Semantic SVG renderer (issue #5): PositionedScene -> themed SVG string.
 *
 - text stays text (selectable, font-configurable);
 - colors flow through CSS custom properties from @atlas/ui tokens, so a
   document carries both themes (see themes css block) without re-render;
 - structure is data-attributed (data-node-id, data-claim-path) for the web
   layer to hydrate interactions;
 - output is deterministic: fixed precision, declared order, no locale.
 */

import { diagramTypography, type PositionedScene } from "@atlas/diagram-engine";
import { strokeWidths, themes, fontStacks, radii, type ThemeName } from "@atlas/ui";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  const v = Math.round(n * 2) / 2;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function pt(p: { x: number; y: number }): string {
  return `${fmt(p.x)},${fmt(p.y)}`;
}

export interface RenderOptions {
  theme?: ThemeName;
  title?: string;
  description?: string;
  /** Visible editorial title. The accessible title is always emitted. */
  showTitle?: boolean;
}

/**
 * SVG safety scan (issue #35): the canonical artifact must stay inert and
 * self-contained. Scripts, event handlers, javascript: URLs and external
 * href/src references are findings, keyed to the document.
 */
export function scanSvgSafety(svg: string): Array<{ gate: string; target: string; message: string }> {
  const findings: Array<{ gate: string; target: string; message: string }> = [];
  if (/<script/i.test(svg)) findings.push({ gate: "svg-active", target: "svg", message: "rendered SVG contains a <script> element" });
  const handler = svg.match(/\son[a-z]+\s*=/i);
  if (handler) findings.push({ gate: "svg-active", target: "svg", message: `rendered SVG contains an event handler attribute (${handler[0].trim()})` });
  if (/javascript:/i.test(svg)) findings.push({ gate: "svg-active", target: "svg", message: "rendered SVG contains a javascript: URL" });
  const external = svg.match(/(?:href|src)\s*=\s*"(?!#)(?!data:)[^"]*"/i);
  if (external) findings.push({ gate: "svg-external", target: "svg", message: `rendered SVG references external content (${external[0]})` });
  return findings;
}

/**
 * Validate the rendered root viewBox against the positioned canvas. This is
 * deliberately a post-render gate: scene bounds can be correct while a
 * renderer regression emits a shifted or smaller viewBox that clips them.
 */
export function scanSvgViewBox(
  svg: string,
  expected: { w: number; h: number },
): Array<{ gate: string; target: string; message: string }> {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0];
  const raw = root?.match(/\bviewBox\s*=\s*"([^"]+)"/i)?.[1];
  const values = raw?.trim().split(/[\s,]+/).map(Number) ?? [];
  const expectedWidth = Math.round(expected.w * 2) / 2;
  const expectedHeight = Math.round(expected.h * 2) / 2;
  const valid =
    values.length === 4 &&
    values.every(Number.isFinite) &&
    values[0] === 0 &&
    values[1] === 0 &&
    values[2] === expectedWidth &&
    values[3] === expectedHeight;
  if (valid) return [];
  return [{
    gate: "svg-viewbox",
    target: "svg",
    message: `rendered SVG viewBox ${raw ? `"${raw}"` : "is missing"} does not cover canvas 0 0 ${expectedWidth} ${expectedHeight}`,
  }];
}

export function renderSvg(scene: PositionedScene, opts: RenderOptions = {}): string {
  const themeName = opts.theme ?? "light";
  const t = themes[themeName];
  const title = opts.title ?? `${scene.scene.modelId} — ${scene.scene.view}`;
  const description =
    opts.description ??
    `Generated architecture figure for ${scene.scene.modelId}. Every labeled value traces to an evidence claim in the Architecture IR.`;
  const posterMode = scene.composition === "editorial-poster" || opts.showTitle === true;
  const posterClass = posterMode ? ` class="atlas-poster"` : "";
  const typography = diagramTypography(posterMode ? "editorial-poster" : "generic");

  const cssVars = Object.entries(t)
    .map(([k, v]) => `--${k.replace(/[A-Z]/g, (c) => c.toLowerCase())}:${v.toLowerCase()}`)
    .join(";");
  const darkVars = Object.entries(themes.dark)
    .map(([k, v]) => `--${k.replace(/[A-Z]/g, (c) => c.toLowerCase())}:${v.toLowerCase()}`)
    .join(";");

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(scene.size.w)} ${fmt(scene.size.h)}" font-family="${esc(fontStacks.sans)}" role="img" aria-labelledby="atlas-title atlas-desc"${posterClass} data-atlas-model="${esc(scene.scene.modelId)}" data-atlas-view="${scene.scene.view}" data-atlas-ir="${esc(scene.scene.irVersion)}">`,
  );
  lines.push(`  <title id="atlas-title">${esc(title)}</title>`);
  lines.push(`  <desc id="atlas-desc">${esc(description)}</desc>`);
  lines.push(
    `  <style>:root{${cssVars};--font-sans:${esc(fontStacks.sans)};--font-mono:${esc(fontStacks.mono)}}` +
      `@media (prefers-color-scheme: dark){:root{${darkVars}}}` +
      `.n-box{fill:var(--panel);stroke:var(--ink);stroke-width:${strokeWidths.outline}}` +
      `.n-label{fill:var(--ink);font-size:16px;font-weight:700;text-anchor:middle}` +
      `.n-detail{fill:var(--muted);font-size:12.8px;text-anchor:middle}` +
      `.n-port{fill:var(--attention);stroke:none}` +
      `.e-flow{fill:none;stroke:var(--ink);stroke-width:${strokeWidths.flow};marker-end:url(#arrow)}` +
      `.e-skip{fill:none;stroke:var(--ink);stroke-width:${strokeWidths.outline};stroke-dasharray:6 5;marker-end:url(#arrow)}` +
      `.e-residual{fill:none;stroke:var(--attention);stroke-width:${strokeWidths.outline};stroke-dasharray:10 6;marker-end:url(#arrow)}` +
      `.e-control{fill:none;stroke:var(--muted);stroke-width:1.5;stroke-dasharray:2 4} .e-label{fill:var(--muted);font-size:11.5px;font-family:var(--font-mono)}` +
      `.g-frame{fill:none;stroke:var(--line);stroke-width:${strokeWidths.hairline}}` +
      `.g-inset{stroke:var(--muted);fill:var(--paper)}` +
      `.g-port{fill:var(--attention);stroke:var(--paper);stroke-width:1}` +
      `.g-label{fill:var(--muted);font-size:12.8px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}` +
      `.g-badge{fill:var(--attention);color:#fff}` +
      (posterMode
        ? `.atlas-poster .n-label{font-size:${typography.nodeLabel}px}.atlas-poster .n-detail{font-size:${typography.nodeDetail}px}` +
          `.atlas-poster .e-label{font-size:${typography.edgeLabel}px}.atlas-poster .g-frame{fill:var(--panel)}` +
          `.atlas-poster .g-inset{fill:var(--panel)}.atlas-poster .g-label{font-size:${typography.groupLabel}px;letter-spacing:.06em}` +
          `.poster-title{fill:var(--ink);font-size:26px;font-weight:800;letter-spacing:-.02em}` +
          `.poster-rule{stroke:var(--line);stroke-width:1}` +
          `.kind-attention .n-box,.kind-indexer .n-box,.kind-selector .n-box,.kind-selection .n-box{stroke:var(--attention)}` +
          `.kind-state .n-box,.kind-gate .n-box,.kind-mix .n-box{stroke:var(--state)}` +
          `.kind-moe .n-box,.kind-router .n-box,.kind-ffn .n-box{stroke:var(--compute)}` +
          `.kind-schedule .n-box{stroke:var(--line);stroke-width:1}` +
          `.kind-schedule-tail .n-box{stroke:var(--attention);stroke-width:3}` +
          `.kind-annotation .n-box{stroke:var(--muted);stroke-dasharray:4 4}`
        : "") +
      `.attn{stroke:var(--attention)}` +
      `.compute{stroke:var(--compute)}</style>`,
  );
  lines.push(
    `  <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--ink)"/></marker></defs>`,
  );
  lines.push(`  <rect width="100%" height="100%" fill="var(--paper)"/>`);
  if (opts.showTitle) {
    lines.push(`  <text class="poster-title" x="50" y="38">${esc(title)}</text>`);
    lines.push(`  <line class="poster-rule" x1="50" y1="52" x2="${fmt(scene.size.w - 50)}" y2="52"/>`);
  }

  for (const group of scene.groups) {
    // when a repeat badge is present the label text would collide on narrow frames
    const showLabel = !(group.repeatBadge && group.w < 300);
    const frameCls = group.inset ? "g-frame g-inset" : "g-frame";
    const portDots = Object.values(group.ports)
      .map((p) => `<rect class="g-port" x="${fmt(p.x - 3)}" y="${fmt(p.y - 3)}" width="6" height="6" rx="1.5"/>`)
      .join("");
    lines.push(
      `  <g class="grp" data-group-id="${esc(group.id)}"${group.claimPath ? ` data-claim-path="${esc(group.claimPath)}"` : ""}><rect class="${frameCls}" x="${fmt(group.x)}" y="${fmt(group.y)}" width="${fmt(group.w)}" height="${fmt(group.h)}" rx="${radii.container}"/>` +
        (showLabel ? `<text class="g-label" x="${fmt(group.x + 12)}" y="${fmt(group.y + 16)}">${esc(group.label)}</text>` : "") +
        portDots +
        (group.repeatBadge
          ? `<g transform="translate(${fmt(group.x + group.w - 58)},${fmt(group.y + 6)})"><rect width="52" height="20" rx="${radii.chip}" class="g-badge"/><text x="26" y="14" font-size="12" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(group.repeatBadge)}</text></g>`
          : "") +
        `</g>`,
    );
  }

  for (const edge of scene.edges) {
    const cls =
      edge.kind === "skip"
        ? "e-skip"
        : edge.kind === "residual"
          ? "e-residual" // residual streams are visually distinct (#33)
          : edge.kind === "control"
            ? "e-control"
            : "e-flow";
    const edgeClaim = edge.claimPath ? ` data-claim-path="${esc(edge.claimPath)}"` : "";
    const mid = edge.points[Math.floor(edge.points.length / 2)]!;
    const edgeLabel = edge.label
      ? `<text class="e-label" x="${fmt(mid.x + 6)}" y="${fmt(mid.y - 6)}">${esc(edge.label)}</text>`
      : "";
    lines.push(
      `  <polyline class="${cls}" data-edge-id="${esc(edge.id)}"${edgeClaim} points="${edge.points.map(pt).join(" ")}"/>${edgeLabel}`,
    );
  }

  for (const node of scene.nodes) {
    const claim = node.claimPath ? ` data-claim-path="${esc(node.claimPath)}"` : "";
    const claimsAttr = node.claims?.length ? ` data-claims='${esc(JSON.stringify(node.claims))}'` : "";
    const portDots = Object.entries(node.ports)
      .filter(([name]) => name !== "in" && name !== "out")
      .map(([, p]) => `<circle class="n-port" cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="3"/>`)
      .join("");
    const semanticKind = posterMode ? ` kind-${node.kind.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}` : "";
    const kindClass = node.kind === "attention" ? " attn" : node.kind === "moe" || node.kind === "ffn" ? " compute" : "";
    const labelSize = typography.nodeLabel;
    const detailSize = typography.nodeDetail;
    lines.push(
      `  <g class="node${semanticKind}${kindClass}" data-node-id="${esc(node.id)}"${posterMode ? ` data-node-kind="${esc(node.kind)}"` : ""}${claim}${claimsAttr}><title>${esc(node.label)}</title>` +
        `<rect class="n-box${kindClass}" x="${fmt(node.x)}" y="${fmt(node.y)}" width="${fmt(node.w)}" height="${fmt(node.h)}" rx="${radii.node}"/>` +
        `<text class="n-label"${posterMode ? ` font-size="${fmt(labelSize)}"` : ""} x="${fmt(node.x + node.w / 2)}" y="${fmt(node.y + node.h / 2 + (node.detail ? -4 : 5))}">${esc(node.label)}</text>` +
        (node.detail
          ? `<text class="n-detail"${posterMode ? ` font-size="${fmt(detailSize)}"` : ""} x="${fmt(node.x + node.w / 2)}" y="${fmt(node.y + node.h / 2 + 14)}">${esc(node.detail)}</text>`
          : "") +
        portDots +
        `</g>`,
    );
  }

  lines.push(`</svg>`);
  return lines.join("\n") + "\n";
}
