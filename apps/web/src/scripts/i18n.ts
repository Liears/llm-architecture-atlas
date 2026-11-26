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
    "nav.catalog": "Catalog",
    "nav.concepts": "Concepts",
    "nav.compare": "Compare",
    "nav.changes": "RSS",
    "nav.source": "GitHub",
    "theme.toggle": "Theme",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "catalog.eyebrow": "Evidence-traceable Architecture Atlas",
    "catalog.title": "Catalog",
    "catalog.subtitle":
      "{n} architectures across two execution paradigms. Every diagram compiles from Architecture IR; every scalar fact resolves to a pinned source claim.",
    "catalog.paradigmAll": "All paradigms",
    "catalog.paradigmAr": "Autoregressive LM (System-2)",
    "catalog.paradigmS1": "System-1 Decision (Jev-class)",
    "catalog.statModels": "Models indexed",
    "catalog.statParadigms": "Execution paradigms",
    "catalog.statDebt": "Geometry gate debt",
    "catalog.search": "Search model, family, attention, readout…",
    "catalog.allFamilies": "All families",
    "catalog.sortLabel": "Sort: name",
    "catalog.sortParams": "Sort: total params ↓",
    "catalog.sortLayers": "Sort: layers ↓",
    "catalog.noMatch": "No models match the current filters.",
    "catalog.reset": "Reset filters",
    "catalog.inspect": "Inspect anatomy →",
    "catalog.compareBtn": "Compare",
    "catalog.compareA": "Slot A",
    "catalog.compareB": "Slot B",
    "catalog.compareLaunch": "Open side-by-side diff →",
    "catalog.compareHint": "Select any two models above to compare layer genomes and specs.",
    "catalog.paradigmGuideTitle": "Two architectural paradigms in one atlas",
    "catalog.paradigmArTitle": "Autoregressive Generative LLMs",
    "catalog.paradigmArDesc":
      "Predict next tokens sequentially through a causal decoder loop (Prefill + Decode), emitting prose, reasoning chains, or code.",
    "catalog.paradigmS1Title": "System-1 Non-Autoregressive Decision Models",
    "catalog.paradigmS1Desc":
      "Skip the token-by-token decode loop. Ingest state + typed queries in one forward pass to emit calibrated probabilities (choice, score, noul).",
    "detail.backCatalog": "← Catalog",
    "detail.overview": "Architecture Plate",
    "detail.viewOverview": "Overview",
    "detail.viewAttn": "Attention",
    "detail.viewFfn": "MoE / FFN",
    "detail.viewResidual": "Residual",
    "detail.viewDecision": "Decision",
    "detail.viewBlock": "Layer Block",
    "detail.resetOverview": "Back to Overview",
    "detail.fitView": "Fit",
    "detail.scrollView": "1:1 Pan",
    "detail.zoomView": "135%",
    "detail.copySvg": "Copy SVG",
    "detail.exportManifest": "Manifest",
    "detail.copied": "Copied",
    "detail.mobileBreakdown": "Mobile Structured Overview",
    "detail.mobileBreakdownNote": "Readable execution spine, repeating layer schedule, and interactive subsystem entry points (>=13px).",
    "detail.citationPanel": "Contextual Citation Inspector",
    "detail.citationDefaultNote": "Select any diagram node, specification card, or genome layer to inspect exact-model sources vs mechanism references.",
    "detail.advancedLedger": "Advanced: Full Evidence Ledger",
    "detail.factSheet": "Technical Specification",
    "detail.decisionSpec": "System-1 Decision Contract",
    "detail.readoutMode": "Readout mode",
    "detail.primitives": "Typed primitives",
    "detail.calibration": "Calibration",
    "detail.extras": "Execution features",
    "detail.genome": "Layer Genome & Drill-Down",
    "detail.genomeNote": "Click or use ← / → keys on any layer column to inspect its module class and filter linked evidence.",
    "detail.clearLayer": "Clear layer",
    "detail.evidence": "Evidence Ledger",
    "detail.evidenceNote":
      "Every visible number resolves to an immutable source claim. Inferred or unknown values are never shown as fact.",
    "detail.evidenceAll": "All",
    "detail.claim": "Claim",
    "detail.value": "Value",
    "detail.status": "Status",
    "detail.source": "Source",
    "detail.downloadSvg": "Download SVG",
    "detail.downloadPng": "Download PNG",
    "detail.reportCorrection": "Report correction",
    "detail.generatedFrom": "Architecture IR",
    "detail.revision": "Revision",
    "detail.compareWith": "Compare with…",
    "detail.compare": "Compare",
    "detail.compareNote": "Launch a side-by-side comparison with any other model in the atlas.",
    "fact.layers": "Layers",
    "fact.hiddenSize": "Hidden dim",
    "fact.heads": "Attn / KV heads",
    "fact.vocab": "Vocab size",
    "fact.context": "Context",
    "fact.params": "Parameters",
    "status.verified": "✓ verified",
    "status.reported": "• reported",
    "status.derived": "= derived",
    "status.inferred": "? inferred",
    "status.conflict": "! conflict",
    "status.unknown": "? unknown",
    "compare.eyebrow": "Two-model structural diff",
    "compare.back": "← Back to catalog",
    "compare.switchBtn": "Compare pair",
    "compare.paradigmCard": "Paradigm & Readout Comparison",
    "compare.fields": "Specification Diff",
    "compare.genome": "Layer Genome Alignment",
    "compare.genomeNote":
      "Columns align by layer index; shorter models pad with —. {n} aligned column(s) differ in attention type.",
    "compare.sharedNote": "Muted rows share identical values across both models.",
    "compare.totalParams": "Total params",
    "compare.activeParams": "Active params",
    "compare.layers": "Layers",
    "compare.context": "Context",
    "compare.decoder": "Architecture / Readout",
    "concepts.eyebrow": "Architectural Taxonomy",
    "concepts.title": "Concepts",
    "concepts.subtitle":
      "Core mechanisms across autoregressive LLMs and non-autoregressive System-1 decision models.",
    "concepts.groupSystemOne": "System-1 / Jev-Class Decision Paradigm",
    "concepts.groupAttention": "Attention & Sequence State",
    "concepts.groupCompute": "FFN, Residual & Auxiliary Heads",
    "concept.system-one.name": "System-1 Decision Model (Jev-class)",
    "concept.system-one.text":
      "A non-autoregressive model that replaces token-by-token generation with a single forward pass over state and typed questions, returning calibrated probabilities directly consumable by code.",
    "concept.primitives.name": "Typed Decision Primitives (Noul / Choice / Score / Box)",
    "concept.primitives.text":
      "Structured query contracts: Noul returns a Bernoulli true/false probability; Choice selects from discrete labels; Score maps onto an ordered rubric; Box localizes visual bounding coordinates.",
    "concept.rlcd.name": "RLCD — Reinforcement Learning for Calibrated Decisions",
    "concept.rlcd.text":
      "Post-training with strictly proper scoring rules (bounded log, spherical, and ranked probability scores) so reported probabilities match empirical correctness instead of overconfident classifier logits.",
    "concept.readout.name": "Marker Head vs. First-Token Logit Readout",
    "concept.readout.text":
      "Two open System-1 readout designs: Laya packs [MASK] option markers inside a bidirectional ModernBERT encoder with a 2-layer head + act/abstain head; OpenJev reuses a shared State prefix KV cache on a causal hybrid backbone and slices Pos-0 option-letter logits in one pass.",
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
    "concept.sliding-window.name": "Sliding Window + Global Alternating Attention",
    "concept.sliding-window.text":
      "Alternates local fixed-window attention layers (e.g. w=128 in ModernBERT/Laya) with periodic global full-attention layers to bound compute while preserving document-wide context.",
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
    "nav.catalog": "目录",
    "nav.concepts": "概念术语",
    "nav.compare": "对比",
    "nav.changes": "RSS",
    "nav.source": "GitHub",
    "theme.toggle": "主题",
    "theme.light": "浅色",
    "theme.dark": "深色",
    "catalog.eyebrow": "可溯源模型架构图谱",
    "catalog.title": "目录",
    "catalog.subtitle":
      "已收录 {n} 个模型，覆盖自回归生成与 System-1 非自回归决策两大范式。每张结构图均由 Architecture IR 编译生成，每个数字可溯源至固定版本证据。",
    "catalog.paradigmAll": "全部范式",
    "catalog.paradigmAr": "自回归生成大模型 (System-2)",
    "catalog.paradigmS1": "System-1 决策模型 (Jev 范式)",
    "catalog.statModels": "已收录模型",
    "catalog.statParadigms": "架构范式",
    "catalog.statDebt": "几何门禁债务",
    "catalog.search": "搜索名称、家族、注意力机制、读出方式…",
    "catalog.allFamilies": "全部家族",
    "catalog.sortLabel": "排序: 名称",
    "catalog.sortParams": "排序: 总参数 ↓",
    "catalog.sortLayers": "排序: 层数 ↓",
    "catalog.noMatch": "没有匹配的模型。",
    "catalog.reset": "重置筛选",
    "catalog.inspect": "查看结构解剖 →",
    "catalog.compareBtn": "加入对比",
    "catalog.compareA": "对比位 A",
    "catalog.compareB": "对比位 B",
    "catalog.compareLaunch": "打开双模型对比 →",
    "catalog.compareHint": "在上方卡片中任选两个模型，即可对齐层基因组与架构差异。",
    "catalog.paradigmGuideTitle": "图谱收录的两类核心执行范式",
    "catalog.paradigmArTitle": "自回归生成式 LLM（System-2）",
    "catalog.paradigmArDesc":
      "通过因果解码循环逐 token 生成自然语言、推理链或代码，擅长开放生成，但在结构化软件控制中需额外解析输出。",
    "catalog.paradigmS1Title": "System-1 非自回归决策模型（Jev 范式）",
    "catalog.paradigmS1Desc":
      "跳过逐 token 生成循环，单次前向读取状态与结构化题型（Choice / Score / Noul），直接输出经概率校准的强类型决策。",
    "detail.backCatalog": "← 返回目录",
    "detail.overview": "架构工程总图",
    "detail.viewOverview": "总览全图",
    "detail.viewAttn": "注意力机制",
    "detail.viewFfn": "MoE / FFN",
    "detail.viewResidual": "残差流",
    "detail.viewDecision": "决策头",
    "detail.viewBlock": "单层子图",
    "detail.resetOverview": "返回总览",
    "detail.fitView": "适应屏幕",
    "detail.scrollView": "1:1 平移",
    "detail.zoomView": "135%",
    "detail.copySvg": "复制 SVG",
    "detail.exportManifest": "证据清单 JSON",
    "detail.copied": "已复制",
    "detail.mobileBreakdown": "移动端结构化阅读概览",
    "detail.mobileBreakdownNote": "高可读字号展示执行主脊柱、层调度周期与机制下钻入口。",
    "detail.citationPanel": "上下文来源与证据检验面板",
    "detail.citationDefaultNote": "点击架构节点、参数规格卡或层基因组任意层，即可查看精确模型配置与机制论文定位。",
    "detail.advancedLedger": "高级视图：完整证据账本",
    "detail.factSheet": "核心规格参数",
    "detail.decisionSpec": "System-1 决策契约与读出机制",
    "detail.readoutMode": "读出机制",
    "detail.primitives": "支持原语",
    "detail.calibration": "校准方法",
    "detail.extras": "执行特性",
    "detail.genome": "层基因组与逐层下钻",
    "detail.genomeNote": "点击或使用 ← / → 方向键选中任意层，即可查看该层模块详情并高亮关联证据。",
    "detail.clearLayer": "清除选中",
    "detail.evidence": "证据账本",
    "detail.evidenceNote": "图中每个可见数字都对应一条固定来源声明；推断或未知项绝不伪装成事实。",
    "detail.evidenceAll": "全部",
    "detail.claim": "声明路径",
    "detail.value": "值",
    "detail.status": "状态",
    "detail.source": "来源",
    "detail.downloadSvg": "下载 SVG",
    "detail.downloadPng": "下载 PNG",
    "detail.reportCorrection": "报告勘误",
    "detail.generatedFrom": "Architecture IR",
    "detail.revision": "版本",
    "detail.compareWith": "与其他模型对比…",
    "detail.compare": "对比",
    "detail.compareNote": "在上方选择任意目录模型即可直接进入双模型对比页。",
    "fact.layers": "层数",
    "fact.hiddenSize": "隐藏维度",
    "fact.heads": "注意力 / KV 头",
    "fact.vocab": "词表规模",
    "fact.context": "上下文窗口",
    "fact.params": "参数量",
    "status.verified": "✓ 已验证",
    "status.reported": "• 官方给出",
    "status.derived": "= 公式推导",
    "status.inferred": "? 推断待核",
    "status.conflict": "! 来源冲突",
    "status.unknown": "? 未知",
    "compare.eyebrow": "双模型结构对比",
    "compare.back": "← 返回目录",
    "compare.switchBtn": "切换对比",
    "compare.paradigmCard": "范式与读出机制对照",
    "compare.fields": "规格字段对比",
    "compare.genome": "层基因组逐层对齐",
    "compare.genomeNote": "列按层号对齐；较短模型以 — 补齐。有 {n} 个对齐列的注意力类型不同。",
    "compare.sharedNote": "浅色行表示两个模型在该字段取值相同。",
    "compare.totalParams": "总参数",
    "compare.activeParams": "激活参数",
    "compare.layers": "层数",
    "compare.context": "上下文",
    "compare.decoder": "架构 / 读出方式",
    "concepts.eyebrow": "架构术语谱系",
    "concepts.title": "概念术语",
    "concepts.subtitle": "涵盖现代自回归混合大模型与非自回归 System-1 决策模型的核心结构机制。",
    "concepts.groupSystemOne": "System-1 / Jev 类非自回归决策范式",
    "concepts.groupAttention": "注意力与序列状态机制",
    "concepts.groupCompute": "前馈网络、残差流与辅助头",
    "concept.system-one.name": "System-1 决策模型（Jev 范式）",
    "concept.system-one.text":
      "摒弃逐 token 自回归文本生成循环，通过单次前向传播并行评估状态与类型化问题，直接输出可供程序分支消费的校准概率。",
    "concept.primitives.name": "类型化决策原语（Noul / Choice / Score / Box）",
    "concept.primitives.text":
      "结构化请求契约：Noul 返回布尔真假概率；Choice 从离散候选中单选；Score 按序数量表评分；Box 输出图像边界框坐标。",
    "concept.rlcd.name": "RLCD — 校准决策强化学习",
    "concept.rlcd.text":
      "采用严格适定评分规则（有界对数得分、球面得分与排序概率得分 RPS）进行后训练，使输出概率在统计上诚实反映真实准确率。",
    "concept.readout.name": "[MASK] 占位头 vs. 首 Token Logits 读出",
    "concept.readout.text":
      "开源界两大主流结构实现：Laya 基于双向 ModernBERT 编码器配合 [MASK] 占位符、2 层决策头与拒答头；OpenJev 则在因果混合骨干上复用共享 State 前缀 KV Cache，仅前向一步读取首位置选项字母 logits。",
    "concept.gqa.name": "GQA — 分组查询注意力",
    "concept.gqa.text": "多个查询头共享一组键值头，按分组比例缩小 KV 缓存，效果接近多头注意力。",
    "concept.mla.name": "MLA — 多头潜在注意力",
    "concept.mla.text": "把键值投影到共享低秩潜空间并只缓存潜向量，同上下文长度下每 token 缓存远小于 GQA。",
    "concept.dsa.name": "DSA — DeepSeek 稀疏注意力",
    "concept.dsa.text": "在 MLA 之上的稀疏注意力层：索引器为每个查询挑选少量 token，长上下文开销亚线性增长。",
    "concept.kda.name": "KDA — Kimi Delta Attention",
    "concept.kda.text": "门控 delta 规则线性注意力：以门控增量更新逐通道循环状态，每 token 开销恒定，无 KV 缓存。",
    "concept.sliding-window.name": "局部滑动窗口 + 周期性全局注意力",
    "concept.sliding-window.text": "在编码器中交替堆叠局部滑动窗口（如 ModernBERT/Laya 的 w=128）与周期性全局注意力层，兼顾长上下文效率与全局交互。",
    "concept.moe.name": "MoE — 混合专家",
    "concept.moe.text": "用大量专家 FFN 替换单一 FFN，路由器每 token 只激活 top-k 子集：总参数变大，单 token 计算量不变。",
    "concept.mhc.name": "mHC — 流形约束超连接",
    "concept.mhc.text": "用多条并行残差流经约束混合器替代简单残差相加，改善梯度流。",
    "concept.nope.name": "NoPE",
    "concept.nope.text": "部分注意力路径（如 GLM-5.3-Flash 的 MLA Q/K）不注入位置编码。",
    "concept.mtp.name": "MTP — 多 token 预测",
    "concept.mtp.text": "额外的预测层让模型一次预测多个未来 token，用于训练信号与投机解码。",
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
