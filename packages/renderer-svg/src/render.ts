/**
 * Semantic SVG renderer (issue #5, elevated drafting grammar):
 * PositionedScene -> themed SVG string.
 *
 * - text stays text (selectable, font-configurable);
 * - colors flow through CSS custom properties from @atlas/ui tokens, so a
 *   document carries both themes without re-render;
 * - structure is data-attributed (data-node-id, data-claim-path) for the web
 *   layer to hydrate interactions;
 * - output is deterministic: fixed precision, declared order, no locale.
 */

import { diagramTypography, type PositionedScene, type Point } from "@atlas/diagram-engine";
import { strokeWidths, themes, fontStacks, radii, type ThemeName } from "@atlas/ui";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  const v = Math.round(n * 2) / 2;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function pt(p: Point): string {
  return `${fmt(p.x)},${fmt(p.y)}`;
}

/**
 * Convert an orthogonal or polyline waypoint sequence into a crisp SVG path
 * with subtle rounded bends (preserving start/end anchors exactly).
 */
function roundedEdgePath(points: Point[], radius = 7): string {
  if (points.length === 0) return "";
  if (points.length <= 2) return `M ${points.map(pt).join(" L ")}`;
  const segs: string[] = [`M ${pt(points[0]!)}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const len1 = Math.hypot(d1x, d1y);
    const len2 = Math.hypot(d2x, d2y);
    if (len1 < 1 || len2 < 1) {
      segs.push(`L ${pt(curr)}`);
      continue;
    }
    const r = Math.min(radius, len1 * 0.4, len2 * 0.4);
    const pIn = { x: curr.x - (d1x / len1) * r, y: curr.y - (d1y / len1) * r };
    const pOut = { x: curr.x + (d2x / len2) * r, y: curr.y + (d2y / len2) * r };
    segs.push(`L ${pt(pIn)} Q ${pt(curr)} ${pt(pOut)}`);
  }
  segs.push(`L ${pt(points[points.length - 1]!)}`);
  return segs.join(" ");
}

function accentRoleForKind(kind: string): "attention" | "state" | "compute" | "decision" | null {
  const k = kind.toLowerCase();
  if (["attention", "indexer", "selector", "selection"].includes(k)) return "attention";
  if (["state", "gate", "mix", "cache"].includes(k)) return "state";
  if (["moe", "router", "ffn"].includes(k)) return "compute";
  if (["decision", "calibration", "action", "readout", "vision"].includes(k)) return "decision";
  return null;
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
      `.n-box.attn{stroke:var(--attention)}.n-box.compute{stroke:var(--compute)}` +
      `.n-stack-shadow{fill:var(--surface);stroke:var(--line);stroke-width:1.25}` +
      `.n-accent{stroke:none}` +
      `.n-accent-attention{fill:var(--attention)}.n-accent-state{fill:var(--state)}.n-accent-compute{fill:var(--compute)}.n-accent-decision{fill:var(--decision)}` +
      `.n-label{fill:var(--ink);font-size:16px;font-weight:700;text-anchor:middle}` +
      `.n-detail{fill:var(--muted);font-size:12.8px;text-anchor:middle}` +
      `.n-port{fill:var(--attention);stroke:var(--panel);stroke-width:1}` +
      `.e-flow{fill:none;stroke:var(--ink);stroke-width:${strokeWidths.flow};stroke-linecap:round;stroke-linejoin:round;marker-end:url(#arrow)}` +
      `.e-skip{fill:none;stroke:var(--ink);stroke-width:${strokeWidths.outline};stroke-dasharray:6 5;stroke-linecap:round;stroke-linejoin:round;marker-end:url(#arrow)}` +
      `.e-residual{fill:none;stroke:var(--attention);stroke-width:${strokeWidths.outline};stroke-dasharray:10 6;stroke-linecap:round;stroke-linejoin:round;marker-end:url(#arrow-residual)}` +
      `.e-control{fill:none;stroke:var(--muted);stroke-width:1.6;stroke-dasharray:2 4;stroke-linecap:round;stroke-linejoin:round;marker-end:url(#arrow-muted)}` +
      `.e-label{fill:var(--muted);font-size:11.5px;font-family:var(--font-mono);paint-order:stroke;stroke:var(--paper);stroke-width:4.5px;stroke-linejoin:round}` +
      `.g-frame{fill:none;stroke:var(--line);stroke-width:${strokeWidths.hairline}}` +
      `.g-inset{stroke:var(--line);stroke-width:1.4;fill:var(--panel)}` +
      `.g-header{fill:var(--surface);stroke:none}` +
      `.g-port{fill:var(--attention);stroke:var(--paper);stroke-width:1.2}` +
      `.g-label{fill:var(--muted);font-size:12.8px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}` +
      `.g-badge{fill:var(--attention)}` +
      (posterMode
        ? `.atlas-poster .n-label{font-size:${typography.nodeLabel}px}.atlas-poster .n-detail{font-size:${typography.nodeDetail}px}` +
          `.atlas-poster .e-label{font-size:${typography.edgeLabel}px}.atlas-poster .g-frame{fill:var(--panel);stroke-width:1.25}` +
          `.atlas-poster .g-inset{fill:var(--panel)}.atlas-poster .g-label{font-size:${typography.groupLabel}px;letter-spacing:.06em}` +
          `.poster-title{fill:var(--ink);font-size:24px;font-weight:800;letter-spacing:-.02em}` +
          `.poster-meta{fill:var(--muted);font-size:11.5px;font-family:var(--font-mono);letter-spacing:.06em}` +
          `.poster-rule{stroke:var(--line);stroke-width:1.25}` +
          `.kind-attention .n-box,.kind-indexer .n-box,.kind-selector .n-box,.kind-selection .n-box{stroke:var(--attention)}` +
          `.kind-state .n-box,.kind-gate .n-box,.kind-mix .n-box,.kind-cache .n-box{stroke:var(--state)}` +
          `.kind-moe .n-box,.kind-router .n-box,.kind-ffn .n-box{stroke:var(--compute)}` +
          `.kind-decision .n-box,.kind-calibration .n-box,.kind-action .n-box,.kind-readout .n-box,.kind-vision .n-box{stroke:var(--decision)}` +
          `.kind-io .n-box,.kind-output .n-box{stroke:var(--ink);stroke-width:2.2}` +
          `.kind-norm .n-box{fill:var(--surface);stroke:var(--muted);stroke-width:1.6}` +
          `.kind-schedule .n-box{stroke:var(--line);stroke-width:1.25}` +
          `.kind-schedule-tail .n-box{stroke:var(--attention);stroke-width:2.6}` +
          `.kind-schedule-decision .n-box{stroke:var(--decision);stroke-width:2.4}` +
          `.kind-annotation .n-box{fill:var(--surface);stroke:var(--muted);stroke-dasharray:4 4}`
        : "") +
      `</style>`,
  );
  lines.push(
    `  <defs>` +
      `<pattern id="atlas-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="0.9" fill="var(--grid)"/></pattern>` +
      `<marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,1 L9.5,5 L0,9 z" fill="var(--ink)"/></marker>` +
      `<marker id="arrow-residual" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,1 L9.5,5 L0,9 z" fill="var(--attention)"/></marker>` +
      `<marker id="arrow-muted" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M0,1.5 L8.5,5 L0,8.5 z" fill="var(--muted)"/></marker>` +
      `</defs>`,
  );
  lines.push(`  <rect width="100%" height="100%" fill="var(--paper)"/>`);
  lines.push(`  <rect width="100%" height="100%" fill="url(#atlas-dots)" opacity="0.85"/>`);
  if (opts.showTitle) {
    lines.push(`  <text class="poster-title" x="50" y="38">${esc(title)}</text>`);
    lines.push(
      `  <text class="poster-meta" x="${fmt(scene.size.w - 50)}" y="37" text-anchor="end">ARCHITECTURE IR v${esc(scene.scene.irVersion)} · ${esc(scene.scene.view.toUpperCase())}</text>`,
    );
    lines.push(`  <line class="poster-rule" x1="50" y1="52" x2="${fmt(scene.size.w - 50)}" y2="52"/>`);
  }

  for (const group of scene.groups) {
    // when a repeat badge is present the label text would collide on narrow frames
    const showLabel = !(group.repeatBadge && group.w < 300);
    const frameCls = group.inset ? "g-frame g-inset" : "g-frame";
    const headerBand = group.inset && showLabel
      ? `<rect class="g-header" x="${fmt(group.x + 1)}" y="${fmt(group.y + 1)}" width="${fmt(Math.max(0, group.w - 2))}" height="22" rx="${Math.max(2, radii.container - 2)}"/>`
      : "";
    const portDots = Object.values(group.ports)
      .map((p) => `<rect class="g-port" x="${fmt(p.x - 3.5)}" y="${fmt(p.y - 3.5)}" width="7" height="7" rx="2"/>`)
      .join("");
    lines.push(
      `  <g class="grp" data-group-id="${esc(group.id)}"${group.claimPath ? ` data-claim-path="${esc(group.claimPath)}"` : ""}>` +
        `<rect class="${frameCls}" x="${fmt(group.x)}" y="${fmt(group.y)}" width="${fmt(group.w)}" height="${fmt(group.h)}" rx="${radii.container}"/>` +
        headerBand +
        (showLabel ? `<text class="g-label" x="${fmt(group.x + 14)}" y="${fmt(group.y + 17)}">${esc(group.label)}</text>` : "") +
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
          ? "e-residual"
          : edge.kind === "control"
            ? "e-control"
            : "e-flow";
    const edgeClaim = edge.claimPath ? ` data-claim-path="${esc(edge.claimPath)}"` : "";
    const mid = edge.points[Math.floor(edge.points.length / 2)]!;
    const edgeLabel = edge.label
      ? `<text class="e-label" x="${fmt(mid.x + 6)}" y="${fmt(mid.y - 6)}">${esc(edge.label)}</text>`
      : "";
    lines.push(
      `  <path class="${cls}" data-edge-id="${esc(edge.id)}"${edgeClaim} d="${roundedEdgePath(edge.points)}"/>${edgeLabel}`,
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
    const roleAccent = posterMode ? accentRoleForKind(node.kind) : null;
    const stackShadow = posterMode && node.kind === "stack" && node.w > 40
      ? `<rect class="n-stack-shadow" x="${fmt(node.x + 4)}" y="${fmt(node.y + 4)}" width="${fmt(node.w)}" height="${fmt(node.h)}" rx="${radii.node}"/>`
      : "";
    const accentBar = roleAccent && node.w >= 48 && node.h >= 24
      ? `<rect class="n-accent n-accent-${roleAccent}" x="${fmt(node.x + 2)}" y="${fmt(node.y + 4)}" width="4" height="${fmt(node.h - 8)}" rx="2"/>`
      : "";
    const labelSize = typography.nodeLabel;
    const detailSize = typography.nodeDetail;
    lines.push(
      `  <g class="node${semanticKind}${kindClass}" data-node-id="${esc(node.id)}"${posterMode ? ` data-node-kind="${esc(node.kind)}"` : ""}${claim}${claimsAttr}><title>${esc(node.label)}</title>` +
        stackShadow +
        `<rect class="n-box${kindClass}" x="${fmt(node.x)}" y="${fmt(node.y)}" width="${fmt(node.w)}" height="${fmt(node.h)}" rx="${radii.node}"/>` +
        accentBar +
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
