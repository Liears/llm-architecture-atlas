/**
 * Bilingual SVG text localization helper (EN -> 中文).
 *
 * Keeps `apps/web/public/figures/*.svg` deterministic and canonical in English while
 * allowing interactive overview & subview diagrams in the browser to switch cleanly
 * between English and concise idiomatic Chinese without altering box geometry.
 */

import type { Lang } from "./i18n";

const EXACT_ZH: Record<string, string> = {
  // Top execution spine & callouts
  "Token ids": "输入 Token ID",
  "Token embedding": "词嵌入层",
  "Token + Type Emb": "词嵌入 + 类型编码",
  "Embed + Vision": "词嵌入 + 视觉融合",
  "Decoder stack": "解码器堆叠",
  "Decoder pattern": "解码器周期",
  "Final RMSNorm": "最终 RMSNorm",
  "LM head": "词表输出头",
  "MTP omitted": "省略 MTP 头",
  "1 prediction layer": "1 层多步预测",
  "representative sublayer": "典型单层结构",
  "layer lenses": "机制拆解视角",
  "State + Typed Q": "状态 + 类型化问题",
  "State + Image + Q": "状态 + 图像 + 问题",
  "Bidirectional Encoder": "双向编码器",
  "Decision Head": "决策输出头",
  "Calibrated Scorer": "概率校准评分器",
  "Typed JSON": "强类型 JSON",
  "Single-Pass Prefill": "单步预填充",

  // Group panel headers
  "mHC anatomy · Figure 1(c) / Eq. 3": "mHC 多流残差 · 图 1(c) / 式 (3)",
  "Context & Footprint": "上下文与参数规模",
  "Context & Pos": "上下文与位置编码",
  "Parameter Budget": "参数预算",
  "Calibration & Scale": "概率校准与规模",
  "Calibration & Shuffle": "校准与顺序不变",
  "System-1 Marker & Act Readout": "System-1 占位标记与拒答读出",
  "System-1 Prefix & Letter Readout": "System-1 前缀与字母读出",
  "Dense FFN Block": "稠密 FFN 模块",

  // Attention, State, MoE, Residual & System-1 nodes
  "Query Projections": "Query 投影",
  "Query Proj": "Query 投影",
  "Q / KV Latent Proj": "Q / KV 潜空间投影",
  "Compressed KV Cache": "压缩 KV 缓存",
  "Shared KV Cache": "共享 KV 缓存",
  "Latent KV": "潜向量 KV",
  "Grouped KV": "分组 KV",
  "Shared Prefix KV": "共享前缀 KV",
  "Delta State": "Delta 循环状态",
  "Delta Decay": "Delta 衰减门控",
  "KDA Decay Gate": "KDA 衰减门控",
  "Output Gate": "输出门控",
  "Gate": "门控",
  "Indexer": "闪电索引器",
  "selected KV": "筛选 KV",
  "Pre-FFN Norm": "FFN 前 Norm",
  "Input RMSNorm": "输入 RMSNorm",
  "Post-Attn Norm": "注意力后 Norm",
  "MLA Attention": "MLA 注意力",
  "Dense SwiGLU": "稠密 SwiGLU",
  "Dense GeGLU": "稠密 GeGLU",
  "Sliding Window (w=128)": "滑动窗口 (w=128)",
  "Router": "路由器",
  "Routed Experts": "路由专家",
  "Routed": "路由专家",
  "Shared Expert": "共享专家",
  "Shared": "共享专家",
  "⊕ Merge": "⊕ 融合相加",
  "⊕ MoE Merge": "⊕ MoE 融合相加",
  "⊕ Residual": "⊕ 残差相加",
  "⊕ Attn Residual": "⊕ 注意力残差",
  "⊕ FFN Residual": "⊕ FFN 残差",
  "⊕ Residual Add": "⊕ 残差相加",
  "⊕ 4-Stream Mix": "⊕ 4 流残差混合",
  "Residual Fork": "残差流分叉",
  "Attention / FFN Block": "注意力 / FFN 模块",
  "Pre-Norm · H-pre": "前置 Norm · H-pre",
  "Post-Attn · H-pre": "Attn 后 · H-pre",
  "Full Attention": "全局全注意力",
  "Prompt + [MASK] Pack": "提示词 + [MASK] 拼装",
  "[MASK] Gather & MLP": "[MASK] 汇集 + MLP",
  "Abstain Act Head": "拒答决策头",
  "Pos-0 Logit Readout": "首位置 Logits 读出",
  "Temp Scaling": "温度缩放校准",
  "RLCD Proper Scoring": "RLCD 严格适定评分",
  "Model Scale": "模型参数规模",
  "+ Decision Head": "+ 决策输出头",
  "+ Vision Tower": "+ 视觉编码塔",
  "ONE sublayer F": "单层变换 F",
  "Prompt + [MASK]": "提示词 + [MASK]",
  "Typed Readout": "类型化读出",
  "Typed Primitives": "类型化决策原语",
  "Calibration": "概率校准",

  // Node subtitles & details
  "low-rank latent vector": "低秩潜空间向量",
  "compressed bottleneck": "低秩压缩瓶颈",
  "bottleneck · norm": "瓶颈 · 归一化",
  "decoupled key": "解耦位置 Key",
  "decoupled Q/K": "解耦 Q/K",
  "routed + shared": "路由 + 共享相加",
  "routed + residual": "路由 + 残差",
  "merge": "融合相加",
  "short conv": "短卷积",
  "decay / state": "衰减 / 状态",
  "recurrent": "循环递推",
  "output": "门控输出",
  "streams": "并行残差流",
  "manifold mix": "流形混合矩阵",
  "per-stream add": "逐流残差相加",
  "write": "写回",
  "attention or FFN": "注意力或 FFN",
  "pre-norm residual": "前置归一化残差",
  "skip + attn": "跳连 + 注意力",
  "skip + MLP": "跳连 + MLP",
  "calibrated probs": "校准后概率",
  "1 step · no decode": "单步前向 · 无自回归",
  "Fixed temp + order invariance": "固定温度 + 选项乱序不变",
  "4 → 1 read": "4 流读入 → 1",
  "1 → 4 write": "1 写回 → 4 流",
  "2L head + scorer + act": "2 层决策头 + 校准 + 拒答",
  "probs + act/abstain": "校准概率 + 行动/拒答",
  "Act/Escalate Head": "行动 / 升级决策头",

  // Subview group headers & banners
  "Attention Subsystem": "注意力机制子系统",
  "FFN & Expert Routing": "FFN 与专家路由",
  "Residual & Positional Path": "残差流与位置编码",
  "mHC Multi-Stream Residual": "mHC 多流残差连接",
  "System-1 Readout & Calibration": "System-1 决策读出与校准",
  "Single-Pass Execution & Readout": "单步前向与读出流水线",
  "Typed Primitives & Calibration Contract": "类型化原语与校准契约",
  "Residual Stream & Positional Encoding": "残差流与位置编码",
  "KDA Recurrent Attention": "KDA 门控循环线性注意力",
  "Gated DeltaNet Linear Attention": "Gated DeltaNet 线性注意力",
  "Hybrid Backbone (3:1 GDN + GQA)": "混合骨干 (3:1 GDN + GQA)",
  "1-Step Readout & Calibration": "单步读出与温度校准",
  "Prefix Cache & Sequence Packing": "前缀缓存与序列拼装",
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function encodeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function localizeSvgText(raw: string, lang: Lang): string {
  if (lang === "en") return raw;
  const trimmed = raw.trim();
  if (EXACT_ZH[trimmed]) return EXACT_ZH[trimmed];

  // Title banner: "<Model> — overview" / "<Model> — Layer N Block Subgraph" / "<Model> — <Subview>"
  if (trimmed.endsWith(" — overview")) {
    return `${trimmed.slice(0, -" — overview".length)} — 架构总览`;
  }
  const blockTitle = trimmed.match(/^(.+?) — Layer (\d+) Block Subgraph$/);
  if (blockTitle) return `${blockTitle[1]} — 第 ${blockTitle[2]} 层模块子图`;
  for (const [enTitle, zhTitle] of [
    ["Attention Subsystem", "注意力机制子系统"],
    ["FFN & Expert Routing", "FFN 与专家路由"],
    ["Residual & Positional Path", "残差流与位置编码"],
    ["mHC Multi-Stream Residual", "mHC 多流残差连接"],
    ["System-1 Readout & Calibration", "System-1 决策读出与校准"],
  ] as const) {
    if (trimmed.endsWith(` — ${enTitle}`)) {
      return `${trimmed.slice(0, -(` — ${enTitle}`.length))} — ${zhTitle}`;
    }
  }

  // Watermark badge
  const irWatermark = trimmed.match(/^ARCHITECTURE IR v(.+?) · ([A-Z0-9_-]+)$/);
  if (irWatermark) {
    const viewMap: Record<string, string> = {
      OVERVIEW: "总览",
      BLOCK: "单层子图",
      ATTENTION: "注意力",
      MOE: "专家路由",
      FFN: "前馈",
      RESIDUAL: "残差流",
    };
    return `架构 IR v${irWatermark[1]} · ${viewMap[irWatermark[2]] ?? irWatermark[2]}`;
  }

  // Group headers & parametric phrases
  if (trimmed.startsWith("Attention · ")) {
    return `注意力机制 · ${localizeSvgText(trimmed.slice("Attention · ".length), "zh")}`;
  }
  if (trimmed.startsWith("Layer Genome · ")) {
    return `层基因组 · ${localizeSvgText(trimmed.slice("Layer Genome · ".length), "zh")}`;
  }
  if (trimmed.startsWith("Backbone Schedule · ")) {
    return `骨干调度 · ${trimmed.slice("Backbone Schedule · ".length)}`;
  }
  if (trimmed.startsWith("Backbone Mix · ")) {
    const rest = trimmed
      .slice("Backbone Mix · ".length)
      .replace(/Full Attention/g, "全局注意力")
      .replace(/Sliding Window/g, "滑动窗口")
      .replace(/Gated Attention \(GQA\)/g, "门控注意力 (GQA)")
      .replace(/Gated DeltaNet/g, "Gated DeltaNet");
    return `骨干配比 · ${rest}`;
  }
  if (trimmed.startsWith("Sparse MoE · ")) {
    const layersRange = trimmed.match(/^Sparse MoE · layers (\d+[–-]\d+)$/);
    if (layersRange) return `稀疏 MoE · 第 ${layersRange[1]} 层`;
    const expCount = trimmed.match(/^Sparse MoE · (\d+) experts$/);
    if (expCount) return `稀疏 MoE · ${expCount[1]} 专家`;
  }
  const layerGroupHead = trimmed.match(/^LAYER (\d+) · (.+)$/);
  if (layerGroupHead) {
    return `第 ${layerGroupHead[1]} 层 · ${layerGroupHead[2].replace("ATTENTION", "注意力")}`;
  }
  const modGroupTail = trimmed.match(/^(.+?) · (\d+) layers \((.+)\)$/);
  if (modGroupTail) {
    return `${localizeSvgText(modGroupTail[1], "zh")} · ${modGroupTail[2]} 层 (${modGroupTail[3]})`;
  }
  const ffnGroupRatio = trimmed.match(/^(.+?) · (\d+) \/ (\d+) layers$/);
  if (ffnGroupRatio) {
    return `${localizeSvgText(ffnGroupRatio[1], "zh")} · ${ffnGroupRatio[2]} / ${ffnGroupRatio[3]} 层`;
  }
  const genomeMeta = trimmed.match(/^(\d+)-layer genome$/);
  if (genomeMeta) return `${genomeMeta[1]} 层基因组`;
  const kdaDsa = trimmed.match(/^(KDA|DSA) · (\d+) layers$/);
  if (kdaDsa) return `${kdaDsa[1]} · ${kdaDsa[2]} 层`;

  let out = trimmed;
  out = out.replace(/^Total (\d+) layers$/, "共 $1 层");
  out = out.replace(/^(\d+) \/ (\d+) layers \(([A-Z])\)$/, "$1 / $2 层 ($3)");
  out = out.replace(/^(\d+) layers · (\d+) heads$/, "$1 层 · $2 头");
  out = out.replace(/^(\d+) layers · (.+)$/, (_, n, rest) => `${n} 层 · ${localizeSvgText(rest, "zh")}`);
  out = out.replace(/^(\d+) linear layers$/, "$1 层线性注意");
  out = out.replace(/^(\d+) layers$/, "$1 层");
  out = out.replace(/^hidden ([\d,]+)$/, "隐藏维 $1");
  out = out.replace(/^vocab ([\d,]+)$/, "词表 $1");
  out = out.replace(/^width ([\d,]+)$/, "宽度 $1");
  out = out.replace(/^([\d.]+[BMK]) total · ([\d.]+[BMK]) active$/, "总参 $1 · 激活 $2");
  out = out.replace(/^([\d.]+[BMK]) dense · ([\dK]+) ctx$/, "稠密 $1 · $2 上下文");
  out = out.replace(/^([\d.]+[BMK]) dense · ([\dK]+) tok ctx$/, "稠密 $1 · $2 上下文");
  out = out.replace(/^(\d+) total · top-(\d+)$/, "$1 · top-$2");
  out = out.replace(/^(\d+) · top-(\d+)$/, "$1 · top-$2");
  out = out.replace(/^top-(\d+) gate$/, "top-$1 门控");
  out = out.replace(/^(\d+) always-on$/, "$1 个常驻");
  out = out.replace(/^(\d+) Q heads$/, "$1 Q 头");
  out = out.replace(/^(\d+) KV heads$/, "$1 KV 头");
  out = out.replace(/^(\d+) heads$/, "$1 头");
  out = out.replace(/^(\d+) heads · d=(\d+)$/, "$1 头 · d=$2");
  out = out.replace(/^4 → 1 read$/, "4 → 1 读入");
  out = out.replace(/^1 → 4 write$/, "1 → 4 写回");
  out = out.replace(/Dense→MoE at L(\d+)/g, "L$1 起转 MoE");
  out = out.replace(/Dense→MoE/g, "稠密→MoE");
  out = out.replace(/tail KDA/g, "尾层 KDA");
  out = out.replace(/KDA \+ MLA/g, "KDA + MLA");
  out = out.replace(/<= (\d+) letters \/ chunk/g, "每批 ≤ $1 选项");
  out = out.replace(/(\d+)L vision encoder · (\d+)d/, "$1 层视觉塔 · $2 维");
  return out;
}

/**
 * Localize `<text>...</text>` and `<title>...</title>` labels inside an SVG markup string cleanly.
 */
export function localizeSvg(svgMarkup: string, lang: Lang): string {
  if (lang === "en") return svgMarkup;
  return svgMarkup.replace(
    /(<(?:text|title)\b[^>]*>)([^<]+)(<\/(?:text|title)>)/g,
    (_m, open: string, inner: string, close: string) => {
      const decoded = decodeXmlEntities(inner);
      const localized = localizeSvgText(decoded, lang);
      return `${open}${encodeXmlText(localized)}${close}`;
    },
  );
}
