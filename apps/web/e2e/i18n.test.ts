import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dict } from "../src/scripts/i18n";
import { localizeSvg, localizeSvgText } from "../src/scripts/svg-i18n";

describe("bilingual i18n dictionary & SVG localization", () => {
  it("keeps identical key sets across English and Chinese dictionaries", () => {
    const enKeys = Object.keys(dict.en).sort();
    const zhKeys = Object.keys(dict.zh).sort();
    expect(zhKeys).toEqual(enKeys);
    for (const k of zhKeys) {
      expect((dict.zh as Record<string, string>)[k]?.trim().length).toBeGreaterThan(0);
    }
  });

  it("localizes SVG diagram labels cleanly into Chinese across all 8 generated overview figures", () => {
    const figuresDir = resolve(__dirname, "../public/figures");
    const svgs = readdirSync(figuresDir).filter((f) => f.endsWith("-generated.svg"));
    expect(svgs.length).toBe(8);

    for (const file of svgs) {
      const raw = readFileSync(resolve(figuresDir, file), "utf8");
      expect(localizeSvg(raw, "en")).toBe(raw);
      const zh = localizeSvg(raw, "zh");
      expect(zh).toContain("架构总览");
      expect(zh).toContain("架构 IR v");
      expect(zh).not.toContain("Token ids");
      expect(zh).not.toContain("Decoder stack");
      expect(zh).not.toContain("Decoder pattern");
      expect(zh).not.toContain("representative sublayer");
      expect(zh).not.toContain("layer lenses");
    }
  });

  it("translates parametric subview & schedule strings cleanly without corrupting XML", () => {
    expect(localizeSvgText("DeepSeek V3 (671B) — overview", "zh")).toBe("DeepSeek V3 (671B) — 架构总览");
    expect(localizeSvgText("GLM-5.3-Flash (320B-A18B) — Layer 3 Block Subgraph", "zh")).toBe(
      "GLM-5.3-Flash (320B-A18B) — 第 3 层模块子图",
    );
    expect(localizeSvgText("Sparse MoE · layers 3–44", "zh")).toBe("稀疏 MoE · 第 3–44 层");
    expect(localizeSvgText("MoE · 42 / 45 layers", "zh")).toBe("MoE · 42 / 45 层");
    expect(localizeSvgText("ARCHITECTURE IR v0.1.0 · MOE", "zh")).toBe("架构 IR v0.1.0 · 专家路由");
    expect(localizeSvgText("288 · top-8", "zh")).toBe("288 · top-8");
    expect(localizeSvgText("256 total · top-8", "zh")).toBe("256 · top-8");
    expect(localizeSvgText("Q / KV Latent Proj", "zh")).toBe("Q / KV 潜空间投影");
    expect(localizeSvgText("Attention Zoom · 32 GQA", "zh")).toBe("注意力微结构 · 32 GQA");
    expect(localizeSvgText("Transformer Block · 32 layers", "zh")).toBe("Transformer 模块 · 32 层");
    expect(localizeSvgText("Marker Readout · 10 Full Attention + 18 Sliding Window (w=128)", "zh")).toBe(
      "占位读出 · 10 全局全注意力 + 18 滑动窗口 (w=128)",
    );
    expect(localizeSvgText("Gate Proj", "zh")).toBe("门控投影 Gate");
    const escaped = localizeSvg('<svg><title>Context &amp; Pos</title><text x="10" y="10">&lt;= 52 letters / chunk</text></svg>', "zh");
    expect(escaped).toContain("<title>上下文与位置编码</title>");
    expect(escaped).toContain("每批 ≤ 52 选项");
    const keptXml = localizeSvg('<svg><text x="10" y="10">A &amp; B &lt; C</text></svg>', "zh");
    expect(keptXml).toContain("A &amp; B &lt; C");
  });
});
