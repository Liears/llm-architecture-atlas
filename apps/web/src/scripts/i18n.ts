/**
 * Client-side i18n (EN/中文) for the atlas UI chrome.
 *
 * Elements opt in with data-i18n="key" (textContent) or
 * data-i18n-placeholder / data-i18n-aria. Model names, figure labels and
 * data values stay in their source language — they are identifiers, not UI.
 * Preference persists in localStorage; without JS the site reads in English.
 */

export type Lang = "en" | "zh";

export const dict = {
  en: {
    "lang.other": "中文",
    "nav.concepts": "Concepts",
    "nav.compare": "Example comparison",
    "nav.changes": "Changes (RSS)",
    "nav.source": "Source & issues",
    "catalog.title": "Catalog",
    "catalog.subtitle":
      "{n} models. Every figure is generated from an Architecture IR; every number traces to an evidence claim.",
    "catalog.search": "Search label, family, attention…",
    "catalog.allFamilies": "All families",
    "catalog.sortLabel": "Sort: label",
    "catalog.sortParams": "Sort: total params ↓",
    "catalog.sortLayers": "Sort: layers ↓",
    "catalog.noMatch": "No models match.",
    "catalog.reset": "Reset filters",
    "detail.overview": "Overview",
    "detail.factSheet": "Fact sheet",
    "detail.genome": "Architecture Genome",
    "detail.genomeNote": "One column per layer — top: attention, bottom: FFN/MoE.",
    "detail.evidence": "Evidence",
    "detail.evidenceNote":
      "Every visible number resolves to one of these claims. Inferred or unknown values are never shown as fact.",
    "detail.claim": "Claim",
    "detail.value": "Value",
    "detail.status": "Status",
    "detail.source": "Source",
    "detail.downloadSvg": "Download SVG",
    "detail.downloadPng": "Download PNG",
    "detail.reportCorrection": "report a correction",
    "detail.generatedFrom": "Generated from Architecture IR",
    "detail.revision": "revision",
    "detail.compare": "Compare",
    "detail.compareNote": "Compare this model with any other catalog model (see catalog).",
    "fact.layers": "Layers",
    "fact.hiddenSize": "Hidden size",
    "fact.heads": "Attention heads",
    "fact.vocab": "Vocab",
    "fact.context": "Context",
    "fact.params": "Params",
    "status.verified": "✓ verified",
    "status.reported": "• reported",
    "status.derived": "= derived",
    "status.inferred": "? inferred",
    "status.conflict": "! conflict",
    "status.unknown": "? unknown",
    "compare.fields": "Fields",
    "compare.genome": "Layer Genome alignment",
    "compare.genomeNote":
      "Columns align by layer index; the shorter model pads with —. {n} aligned column(s) differ in attention type.",
    "compare.sharedNote": "Gray rows: same value in both models.",
    "compare.totalParams": "Total params",
    "compare.activeParams": "Active params",
    "compare.layers": "Layers",
    "compare.context": "Context",
    "compare.decoder": "Decoder",
    "concepts.title": "Concepts",
    "concept.gqa.name": "GQA — Grouped-Query Attention",
    "concept.gqa.text":
      "Several query heads share one key/value head. Shrinks the KV cache by the grouping factor while staying close to MHA quality.",
    "concept.mla.name": "MLA — Multi-head Latent Attention",
    "concept.mla.text":
      "Projects keys and values into a shared low-rank latent that is cached instead of the full KV. Cache per token drops far below GQA at the same context.",
    "concept.dsa.name": "DSA — DeepSeek Sparse Attention",
    "concept.dsa.text":
      "A sparse attention stage on top of MLA: a lightning indexer selects a small token subset per query, so long-context cost grows sub-linearly.",
    "concept.kda.name": "KDA — Kimi Delta Attention",
    "concept.kda.text":
      "A gated delta-rule linear attention: recurrent per-channel state updated with a gated delta rule. Constant-memory per-token cost, no KV cache.",
    "concept.moe.name": "MoE — Mixture of Experts",
    "concept.moe.text":
      "The FFN is replaced by many expert FFNs; a router activates a small top-k subset per token. Total parameters grow, per-token compute does not.",
    "concept.mhc.name": "mHC — Manifold-constrained Hyper-Connections",
    "concept.mhc.text":
      "Replaces the plain residual add with several parallel residual streams mixed through a constrained combiner, improving gradient flow.",
    "concept.nope.name": "NoPE",
    "concept.nope.text":
      "No positional encoding on some attention paths (e.g. MLA Q/K in GLM-5.3-Flash): position information is not injected there.",
    "concept.mtp.name": "MTP — Multi-Token Prediction",
    "concept.mtp.text":
      "An extra prediction layer trains the model to emit several future tokens per step; used for training signal and speculative decoding.",
  },
  zh: {
    "lang.other": "EN",
    "nav.concepts": "概念术语",
    "nav.compare": "对比示例",
    "nav.changes": "更新订阅 (RSS)",
    "nav.source": "源码与 issue",
    "catalog.title": "目录",
    "catalog.subtitle": "已收录 {n} 个模型。每张图由 Architecture IR 生成,每个数字都可溯源到证据条目。",
    "catalog.search": "搜索名称、家族、注意力机制…",
    "catalog.allFamilies": "全部家族",
    "catalog.sortLabel": "排序:名称",
    "catalog.sortParams": "排序:总参数 ↓",
    "catalog.sortLayers": "排序:层数 ↓",
    "catalog.noMatch": "没有匹配的模型。",
    "catalog.reset": "重置筛选",
    "detail.overview": "总体结构",
    "detail.factSheet": "事实速览",
    "detail.genome": "架构基因组",
    "detail.genomeNote": "每列一层——上:注意力,下:FFN/MoE。",
    "detail.evidence": "证据",
    "detail.evidenceNote": "图中每个数字都对应这里的一条声明。推断与未知值绝不会伪装成事实。",
    "detail.claim": "声明路径",
    "detail.value": "值",
    "detail.status": "状态",
    "detail.source": "来源",
    "detail.downloadSvg": "下载 SVG",
    "detail.downloadPng": "下载 PNG",
    "detail.reportCorrection": "报告勘误",
    "detail.generatedFrom": "由 Architecture IR 生成",
    "detail.revision": "版本",
    "detail.compare": "对比",
    "detail.compareNote": "在目录页可将该模型与任意其他模型对比。",
    "fact.layers": "层数",
    "fact.hiddenSize": "隐藏维度",
    "fact.heads": "注意力头",
    "fact.vocab": "词表",
    "fact.context": "上下文",
    "fact.params": "参数",
    "status.verified": "✓ 已验证",
    "status.reported": "• 官方给出",
    "status.derived": "= 公式推导",
    "status.inferred": "? 推断待核",
    "status.conflict": "! 来源冲突",
    "status.unknown": "? 未知",
    "compare.fields": "字段",
    "compare.genome": "层基因组对齐",
    "compare.genomeNote": "列按层号对齐;较短的模型以 — 补齐。有 {n} 个对齐列的注意力类型不同。",
    "compare.sharedNote": "灰色行:两模型取值相同。",
    "compare.totalParams": "总参数",
    "compare.activeParams": "激活参数",
    "compare.layers": "层数",
    "compare.context": "上下文",
    "compare.decoder": "解码器",
    "concepts.title": "概念术语",
    "concept.gqa.name": "GQA — 分组查询注意力",
    "concept.gqa.text": "多个查询头共享一组键值头,按分组比例缩小 KV 缓存,效果接近多头注意力。",
    "concept.mla.name": "MLA — 多头潜在注意力",
    "concept.mla.text": "把键值投影到共享低秩潜空间并只缓存潜向量,同上下文长度下每 token 缓存远小于 GQA。",
    "concept.dsa.name": "DSA — DeepSeek 稀疏注意力",
    "concept.dsa.text": "在 MLA 之上的稀疏注意力层:索引器为每个查询挑选少量 token,长上下文开销亚线性增长。",
    "concept.kda.name": "KDA — Kimi Delta Attention",
    "concept.kda.text": "门控 delta 规则线性注意力:以门控增量更新逐通道循环状态,每 token 开销恒定,无 KV 缓存。",
    "concept.moe.name": "MoE — 混合专家",
    "concept.moe.text": "用大量专家 FFN 替换单一 FFN,路由器每 token 只激活 top-k 子集:总参数变大,单 token 计算量不变。",
    "concept.mhc.name": "mHC — 流形约束超连接",
    "concept.mhc.text": "用多条并行残差流经约束混合器替代简单残差相加,改善梯度流。",
    "concept.nope.name": "NoPE",
    "concept.nope.text": "部分注意力路径(如 GLM-5.3-Flash 的 MLA Q/K)不注入位置编码。",
    "concept.mtp.name": "MTP — 多 token 预测",
    "concept.mtp.text": "额外的预测层让模型一次预测多个未来 token,用于训练信号与投机解码。",
  },
} as const;

const STORAGE_KEY = "atlas-lang";

export function currentLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "zh" || saved === "en" ? saved : "en";
}

function translate(key: string, lang: Lang, extra?: Record<string, string>): string {
  let text: string = (dict[lang] as Record<string, string>)[key] ?? (dict.en as Record<string, string>)[key] ?? key;
  if (extra) for (const [k, v] of Object.entries(extra)) text = text.replace(`{${k}}`, v);
  return text;
}

export function applyLang(lang: Lang): void {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  localStorage.setItem(STORAGE_KEY, lang);
  const toggle = document.getElementById("lang-toggle");
  if (toggle) toggle.textContent = dict[lang]["lang.other"];
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const n = el.dataset.n;
    el.textContent = translate(el.dataset.i18n!, lang, n ? { n } : undefined);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-placeholder]").forEach((el) => {
    const target = el as HTMLInputElement;
    target.placeholder = translate(el.dataset.i18nPlaceholder!, lang);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", translate(el.dataset.i18nAria!, lang));
  });
}

export function initLang(): void {
  applyLang(currentLang());
  document.getElementById("lang-toggle")?.addEventListener("click", () => {
    applyLang(currentLang() === "zh" ? "en" : "zh");
  });
}

if (typeof document !== "undefined") initLang();
