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

import type { PositionedScene } from "@atlas/diagram-engine";
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
}

export function renderSvg(scene: PositionedScene, opts: RenderOptions = {}): string {
  const themeName = opts.theme ?? "light";
  const t = themes[themeName];
  const title = opts.title ?? `${scene.scene.modelId} — ${scene.scene.view}`;
  const description =
    opts.description ??
    `Generated architecture figure for ${scene.scene.modelId}. Every labeled value traces to an evidence claim in the Architecture IR.`;

  const cssVars = Object.entries(t)
    .map(([k, v]) => `--${k.replace(/[A-Z]/g, (c) => c.toLowerCase())}:${v.toLowerCase()}`)
    .join(";");
  const darkVars = Object.entries(themes.dark)
    .map(([k, v]) => `--${k.replace(/[A-Z]/g, (c) => c.toLowerCase())}:${v.toLowerCase()}`)
    .join(";");

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(scene.size.w)} ${fmt(scene.size.h)}" font-family="${esc(fontStacks.sans)}" role="img" aria-labelledby="atlas-title atlas-desc" data-atlas-model="${esc(scene.scene.modelId)}" data-atlas-view="${scene.scene.view}" data-atlas-ir="${esc(scene.scene.irVersion)}">`,
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
      `.attn{stroke:var(--attention)}` +
      `.compute{stroke:var(--compute)}</style>`,
  );
  lines.push(
    `  <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--ink)"/></marker></defs>`,
  );
  lines.push(`  <rect width="100%" height="100%" fill="var(--paper)"/>`);

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
    const kindClass = node.kind === "attention" ? " attn" : node.kind === "moe" || node.kind === "ffn" ? " compute" : "";
    lines.push(
      `  <g class="node${kindClass}" data-node-id="${esc(node.id)}"${claim}${claimsAttr}><title>${esc(node.label)}</title>` +
        `<rect class="n-box${kindClass}" x="${fmt(node.x)}" y="${fmt(node.y)}" width="${fmt(node.w)}" height="${fmt(node.h)}" rx="${radii.node}"/>` +
        `<text class="n-label" x="${fmt(node.x + node.w / 2)}" y="${fmt(node.y + node.h / 2 + (node.detail ? -4 : 5))}">${esc(node.label)}</text>` +
        (node.detail
          ? `<text class="n-detail" x="${fmt(node.x + node.w / 2)}" y="${fmt(node.y + node.h / 2 + 14)}">${esc(node.detail)}</text>`
          : "") +
        portDots +
        `</g>`,
    );
  }

  lines.push(`</svg>`);
  return lines.join("\n") + "\n";
}
