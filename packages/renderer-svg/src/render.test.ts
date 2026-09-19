import { describe, expect, it } from "vitest";
import { layoutScene } from "@atlas/diagram-engine";
import { renderSvg } from "./render.js";
import { glmScene } from "../../diagram-engine/src/test-scene.js";
import { mhcStreamsScene } from "../../diagram-engine/src/fixtures.js";

function positioned() {
  return layoutScene(glmScene(), { fontSize: 16 });
}

describe("renderSvg", () => {
  it("emits semantic, attributed, themed SVG", () => {
    const svg = renderSvg(positioned(), { theme: "light", title: "GLM-5.3-Flash" });
    expect(svg).toContain('data-atlas-model="zai-org/glm-5.3-flash"');
    expect(svg).toContain('data-node-id="block"');
    expect(svg).toContain('data-claim-path="facts.hidden_size"');
    expect(svg).toContain('class="e-skip"'); // skip edges are visually distinct
    expect(svg).toContain("--attention:#1769e0"); // theme vars inlined
    expect(svg).toContain('id="atlas-title"');
    expect(svg).toContain("<marker");
  });

  it("renders residual streams with the residual class (review regression)", () => {
    const svg = renderSvg(layoutScene(mhcStreamsScene(), { fontSize: 16 }), {});
    expect(svg).toContain('class="e-residual"');
    expect(svg).not.toContain('class="e-flow" data-edge-id="s1"');
  });

  it("switches themes via tokens, not re-layout", () => {
    const light = renderSvg(positioned(), { theme: "light" });
    const dark = renderSvg(positioned(), { theme: "dark" });
    expect(light).toContain("--paper:#f5f7fa");
    expect(dark).toContain("--paper:#0b1220");
    expect(light.length).toBe(dark.length); // geometry identical
  });

  it("adds editorial semantics only when poster mode is requested", () => {
    const regular = renderSvg(positioned());
    const poster = renderSvg(positioned(), { showTitle: true, title: "Editorial view" });
    expect(regular).not.toContain('class="atlas-poster"');
    expect(regular).not.toContain("data-node-kind");
    expect(poster).toContain('class="atlas-poster"');
    expect(poster).toContain('data-node-kind="stack"');
    expect(poster).toContain(">Editorial view</text>");
    expect(poster).toContain(".atlas-poster .e-label{font-size:15px}");
  });

  it("sizes the poster title rule from the scene width", () => {
    const scene = positioned();
    scene.size.w = 600;
    const poster = renderSvg(scene, { showTitle: true, title: "Narrow poster" });
    expect(poster).toContain('<line class="poster-rule" x1="50" y1="52" x2="550" y2="52"/>');
    expect(poster).not.toContain('x2="1390"');
  });

  it("escapes markup-significant characters in labels", () => {
    const scene = positioned();
    scene.nodes[0]!.label = 'Embed <layer> & "quotes"';
    const svg = renderSvg(scene);
    expect(svg).toContain("Embed &lt;layer&gt; &amp; &quot;quotes&quot;");
    expect(svg).not.toContain("Embed <layer>");
  });

  it("is deterministic byte-for-byte", () => {
    expect(renderSvg(positioned(), {})).toBe(renderSvg(positioned(), {}));
  });
});
