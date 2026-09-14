---
type: source
title: LLM 架构图的准确性与高质量自动生成方案研究
sources:
  - "https://sebastianraschka.com/llm-architecture-gallery/"
  - "https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html"
  - "https://github.com/kieler/elkjs"
  - "https://graphviz.org/docs/layouts/dot/"
  - "https://d2lang.com/tour/layouts/"
  - "https://mermaid.js.org/config/layouts"
  - "https://reactflow.dev/learn/layouting/layouting"
  - "https://sprotty.org/docs/introduction/"
  - "https://js.cytoscape.org/"
  - "https://json-schema.org/draft/2020-12"
  - "https://docs.pydantic.dev/latest/concepts/json_schema/"
  - "https://playwright.dev/docs/test-snapshots"
  - "https://docs.astro.build/en/concepts/islands/"
created: 2026-09-14
updated: 2026-09-14
---

# LLM 架构图的准确性与高质量自动生成方案研究

## 结论先行

要让自动生成的模型架构图既准确，又稳定地比手工临摹更好看，关键不是寻找一个“更会画 SVG 的模型”，而是把绘图问题拆成四层，并让每层只做自己擅长的事：

```text
可追溯的模型事实
Architecture IR
        ↓ 模板选择与语义投影
DiagramSpec（图中必须出现什么、如何连接、何者重要）
        ↓ 受约束布局
LayoutResult（节点和边的确定坐标）
        ↓ 确定性渲染
SVG + 可交互网页 + PNG/PDF
```

推荐的首选技术路线是：

- Python/Pydantic 维护 Architecture IR，并导出 JSON Schema Draft 2020-12；前端和构建阶段都验证同一份 Schema。Pydantic 官方支持从模型生成 Draft 2020-12 JSON Schema（[`model_json_schema`](https://docs.pydantic.dev/latest/concepts/json_schema/)）。
- TypeScript 实现 `Architecture IR -> DiagramSpec` 的领域模板系统；模板决定阅读顺序、语义层级、端口和布局约束。
- 使用 ELK.js 的 layered 算法做“宏观布局和正交布线”，不用它决定节点内部排版。ELK layered 支持端口、复合图、跨层级边和 straight/orthogonal/spline 路由，适合模型结构这种有明确方向的块图（[ELK Layered 官方说明](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)）。
- 用自研的纯 SVG React/TypeScript 渲染器负责节点、文字、标注、配色、交互和矢量导出；不要把 React Flow 的 HTML 节点截图当作权威图稿。
- 用 Playwright 做网页和图稿视觉回归，用结构化 graph lint 做语义回归，用人工领域审核批准新增模型。

这是“模板驱动 + 自动布局 + 少量可审计布局提示”的路线，不是追求 100% 无人工介入。高品质编辑图通常需要人类决定信息重点；系统应把这类判断保存为可审查的 `layoutHints`，而不是散落在 SVG 坐标里。

## 1. 当前仓库和目标基线

当前仓库只有一个手写的 `figures/glm-5.3-flash.svg`，README 同时提出未来从 `models.yml` 生成图稿。现状存在三个结构性问题：

1. 数据、布局、样式都写死在一个 SVG 文件中，无法分别验证。
2. 模型若直接生成 SVG，很容易漏掉语义连接、数字说明和重复流，例如 GLM-5.3-Flash 的多路残差流与 MoE 激活说明。
3. “像不像参考图”只能靠肉眼判断，没有事实一致性、图语义一致性和视觉回归门禁。

Sebastian Raschka 的线上 Gallery 已经不是单纯图片列表：当前页面提供模型搜索和筛选、双模型比较、内存计算器、来源链接、模型事实卡和主题切换（[LLM Architecture Gallery](https://sebastianraschka.com/llm-architecture-gallery/)）。因此，本项目不能把“更好”定义为更接近其静态图片；应定义为：

- 每个字段和每条重要连线可追溯；
- 同一视觉语法覆盖不同模型；
- 可从 overview 逐层进入 block、attention、MoE 和 tensor flow；
- 两个模型能对齐比较，而不是只把两张图并排；
- 图稿可重建、可验证、可导出、可无障碍访问。

## 2. 为什么自由生成 SVG 会持续失败

LLM 自由生成 SVG 同时承担了事实提取、信息取舍、图结构建模、几何布局、字体排版和风格设计六项工作。只要其中一项出错，最终图仍可能“看起来合理”，但实际上丢字段、少连线或连接到错误模块。这类错误很难通过图片像素比较发现。

正确边界应是：

- LLM 可以从受限源码片段中提出 Architecture IR 补丁；
- LLM 必须为每个推断提供来源、证据片段和置信级别；
- LLM 可以选择已有图模板、建议 `layoutHints`、生成解释性文案；
- LLM 不生成最终节点坐标、SVG path 或颜色值；
- 确定性代码负责验证、布局、样式和导出；
- 人类只审核冲突证据、未知创新模块和最终视觉质量。

换句话说，模型是“研究助理和结构化转换器”，不是“自由手绘引擎”。

## 3. 必须新增的中间层：DiagramSpec

原项目计划已经正确识别了 Architecture IR 的重要性，但 Architecture IR 仍不应直接交给图形引擎。Architecture IR 描述“模型是什么”，DiagramSpec 描述“这一张图要表达什么”。两者分离后，同一模型才能生成 overview、block、attention、MoE、tensor 和 compare 等不同视图。

建议的最小 DiagramSpec：

```ts
type DiagramSpec = {
  schemaVersion: "1";
  modelRevision: string;          // HF commit / Git commit / report version
  view: "overview" | "block" | "attention" | "moe" | "tensor" | "compare";
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  annotations: Annotation[];
  groups: DiagramGroup[];
  layout: LayoutPolicy;
  theme: ThemeId;
};

type DiagramNode = {
  id: string;                     // 稳定 ID，不含坐标
  kind: "embedding" | "norm" | "attention" | "ffn" | "moe" |
        "router" | "expert" | "residual" | "projection" | "output";
  label: string;
  semanticRef: string;            // 指向 Architecture IR 的 JSON Pointer
  evidenceRefs: string[];
  ports: { id: string; side: "N" | "E" | "S" | "W"; role: string }[];
  emphasis: "primary" | "secondary" | "context";
  detailLevel: 0 | 1 | 2 | 3 | 4;
  badges?: string[];
};

type DiagramEdge = {
  id: string;
  kind: "data" | "residual" | "routing" | "control" | "repeat";
  source: { node: string; port: string };
  target: { node: string; port: string };
  semanticRef?: string;
  multiplicity?: number | string; // 如 ×45、Top-8、4 streams
};

type LayoutPolicy = {
  direction: "UP" | "DOWN" | "RIGHT";
  nodeOrder: string[];
  align: string[][];
  sameRank: string[][];
  preferredEdgeShape: "orthogonal" | "straight";
  layoutHints?: LayoutHint[];      // 相对约束，避免默认使用绝对坐标
};
```

强制要求：

- 图中所有事实节点必须有 `semanticRef`，图中所有来源数字必须有 `evidenceRefs`。
- 残差、路由、多流和循环不是装饰线，必须成为有类型的 edge。
- `multiplicity` 必须结构化，不能只写进任意文本标注。
- 默认只允许相对约束（顺序、对齐、端口、同层、方向）；极少数手工绝对坐标必须带理由并通过评审。
- 图形主题只读取 `kind`、`emphasis` 和状态，不读取具体模型名，避免每个模型发展成一套私有画法。

## 4. 图形与布局工具对比

| 方案 | 适合做什么 | 优点 | 主要限制 | 在本项目中的角色 |
|---|---|---|---|---|
| **ELK.js** | 有层级、端口和嵌套容器的定向块图 | layered 算法支持正交边、端口约束、compound graph 和跨层级连接；ELK.js 只计算坐标，不绑架渲染层（[ELK.js README](https://github.com/kieler/elkjs)） | 选项很多；纯自动结果可能有多余折点，且对称性不一定理想 | **首选布局内核**。负责宏观节点与边坐标 |
| **Graphviz dot** | 构建期生成传统层次图、快速基准 | 专门面向有方向的 hierarchical/layered graph，并试图减少交叉和边长（[dot 官方文档](https://graphviz.org/docs/layouts/dot/)）；可直接输出 SVG（[SVG 输出](https://graphviz.org/docs/outputs/svg/)） | 精细的领域节点、响应式交互和编辑级微排版较难；最终 XML 和字体受版本/环境影响 | 作为 CLI 基线、布局 A/B 测试和文档图，不作为主渲染器 |
| **D2** | 快速写架构草图、ADR 和布局原型 | 简洁 DSL，可切换 Dagre/ELK/TALA；官方说明 ELK 更成熟且适合层次图（[D2 layouts](https://d2lang.com/tour/layouts/)） | DSL 会形成第二套模型；第三方布局 shim 的能力并不完全一致；很难做到本项目独特的节点内部语法 | 用于设计原型和文档，不作为 Architecture IR 的长期渲染契约 |
| **Mermaid** | README、Issue、轻量设计文档 | 生态普及；当前 v12 已将 ELK 作为多种图类型的默认布局（[Mermaid layouts](https://mermaid.js.org/config/layouts)） | 节点内部构图、端口、复杂残差流、精细标注和品牌化受限 | 只用于文档和早期讨论，不生成正式架构图 |
| **React Flow** | 交互式节点编辑、拖拽、缩放、选择和展开 | 自带 zoom/pan/selection，节点是 React 组件，可定制；可与 ELK 集成（[布局综述](https://reactflow.dev/learn/layouting/layouting)、[ELK 示例](https://reactflow.dev/examples/layout/elkjs)） | 自身没有布局引擎；节点通常是 HTML、边是 SVG。官方图片下载示例依赖 `html-to-image`，并特别锁定到旧版以规避导出问题（[Download Image 示例](https://reactflow.dev/examples/misc/download-image)），不适合作为稳定的纯矢量出版链 | 可选的“人工校图/布局编辑器”或复杂 explorer 外壳；不作为 canonical SVG renderer |
| **Sprotty** | 模型驱动、可扩展的 SVG 图编辑器 | 原生 SVG、CSS 可样式化、动画、客户端/服务器模型，并有 ELK 集成（[Sprotty 官方介绍](https://sprotty.org/docs/introduction/)） | DI、模型协议和生态概念较重，MVP 学习与维护成本明显高于自研小型 SVG renderer | 当未来需要多人校图、Language Server、复杂编辑器时再评估 |
| **Cytoscape.js** | 大型关系网络、探索和图分析 | 高度优化，支持 compound nodes 和大量布局扩展（[Cytoscape.js 官方文档](https://js.cytoscape.org/)） | 主渲染路径是 bitmap canvas；官方导出核心为 PNG/JPEG，复杂样式和大量边会增加开销。它更擅长“网络图”，不擅长出版级模块框图 | 未来的模型家族/知识图谱视图可采用；不用于单模型 canonical 架构图 |
| **自研 SVG** | 出版级图稿、可访问交互和精确视觉语言 | 完全控制形状、字距、标注、层级、DOM 语义、打印和主题；SVG 支持分组、文本替代、ARIA 关系和键盘焦点（[W3C SVG Accessibility](https://www.w3.org/TR/SVG/access)） | 必须自行实现组件库、文本测量、hit area 和少量交互；不能自己重写复杂布局算法 | **首选渲染器**，与 ELK.js 组合 |
| **Canvas/WebGL** | 上万节点的高吞吐网络图 | 大规模场景性能好 | 位图输出、文本和 DOM 可访问性、打印级矢量导出较弱；当前单模型架构图规模根本不需要 | 暂不使用；只在知识图谱规模经 profiling 证明 SVG 不够时引入 |

### 关于 TALA 的时点说明

D2 官方旧页面仍将 TALA 描述为独立的闭源组件，并指出它较新、布局变化可能因一个标签改动而级联（[TALA 页面](https://d2lang.com/tour/tala/)）；但 D2 官方在 2026-09-07 宣布 TALA 已按与 D2 相同的 MPL-2.0 许可开源，并强调其会优化对称、距离、流向和聚类等审美目标（[官方公告](https://d2lang.com/blog/tala-is-open-source/)）。它值得作为离线 benchmark 候选，但刚开源一周，不宜替代 ELK 成为 MVP 的核心依赖。应先用同一批 DiagramSpec 对 ELK/TALA 跑盲评，再决定是否为非严格层次的 overview 提供第二布局后端。

## 5. 推荐的可落地技术栈

网站外壳建议使用 Astro，模型目录和事实页保持静态 HTML，只把架构画布、筛选器和比较器作为 React islands 水合。Astro 官方说明 islands architecture 会让页面主体保持静态，只向明确标记的交互模块发送 JavaScript（[Astro islands](https://docs.astro.build/en/concepts/islands/)）；这与“内容目录为主、少数高交互画布为辅”的产品形态匹配。

### 5.1 权威数据与跨端验证

- **后端事实模型：Pydantic v2**。现有计划以 Python 做 Hugging Face 配置和 AST 解析，这一选择合理。
- **交换标准：JSON Schema Draft 2020-12**。该版本明确提供 core、validation 和官方 meta-schema（[JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)）。
- **浏览器验证：Ajv strict mode**。可以在构建期生成 standalone validator，减少启动成本并避免运行时动态代码编译（[Ajv standalone 官方说明](https://github.com/ajv-validator/ajv/blob/master/docs/standalone.md)）。
- Architecture IR 和 DiagramSpec 各自有 Schema；每次 schema version 变更必须有 migration 和 fixture 更新。

不建议同时手写 Pydantic 类型、TypeScript 类型和 YAML 约定。单一事实源应是 Pydantic 模型及其生成的 JSON Schema，TypeScript 类型和验证器均由构建流程生成。

### 5.2 模板和布局

- `packages/diagram-spec`：DiagramSpec 类型、Schema 和 graph lint。
- `packages/diagram-templates`：纯函数模板，例如 `overviewDense(ir)`、`overviewMoe(ir)`、`attentionMla(ir)`、`attentionGqa(ir)`、`moeTopK(ir)`、`hybridLayerPattern(ir)`。
- `packages/layout-elk`：把 DiagramSpec 映射到 ELK graph；预设端口、group、顺序和正交 routing。
- `packages/svg-renderer`：只接收已经有坐标的 LayoutResult，输出纯 SVG。
- `apps/web`：页面、搜索、比较、详情面板、交互和路由。

ELK 必须固定非零随机种子；官方说明种子控制布局伪随机数，设为 0 会从系统时间等来源产生种子（[ELK randomSeed](https://eclipse.dev/elk/reference/options/org-eclipse-elk-randomSeed.html)）。此外，应对输入节点和边做稳定排序，设置 `considerModelOrder.strategy`，必要时对编辑审核后的模板启用强制节点顺序；ELK 官方明确提供保留或强制 model order 的选项（[Consider Model Order](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-considerModelOrder-strategy.html)、[Force Node Model Order](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-crossingMinimization-forceNodeModelOrder.html)）。

建议的确定性构建约束：

1. 锁定 Node、ELK.js、浏览器和字体版本。
2. 节点、端口和边按稳定 ID 排序。
3. 固定 `elk.randomSeed = 1`，默认使用 orthogonal routing。
4. 字体尺寸在布局前由统一 text-measure service 计算；字体文件随仓库分发。
5. 将坐标归一到 0.1 px，并按稳定次序序列化 SVG 属性。
6. 在 CI 中重新生成全部 LayoutResult 和 SVG，要求工作树无 diff。
7. PNG 预览统一由同一个渲染器和字体环境生成。`resvg-js` 支持加载指定字体、裁切和 SVG-to-PNG，可作为稳定的构建期栅格化工具（[resvg-js 官方仓库](https://github.com/thx/resvg-js)）。

### 5.3 权威图稿与交互层共用一套 SVG

网页不需要把架构图改造成一堆 HTML card。用 React 生成 `<svg>`，每个节点是带稳定 ID 的 `<g>`：

- `<g role="group" aria-labelledby="...">` 表示模块；
- `<title>` 和 `<desc>` 提供简要说明及来源状态；
- 点击节点打开右侧证据与参数面板；
- hover/focus 只高亮相关的 upstream/downstream 路径；
- `detailLevel` 控制语义缩放：缩小时只显示组名，放大时显示尺寸、专家数、head 数等；
- download 直接保存同一份 SVG，而非对网页截图；PNG/PDF 是派生产物。

这样在线交互、README 图片、打印海报和测试基线使用同一份坐标与视觉语法，避免“网页一套图、导出又一套图”。

## 6. 如何在视觉上超过 Gallery

“更好看”应转化为可实现的设计系统，而不是让模型猜审美。

### 6.1 统一视觉语法

建议只保留少量稳定语义：

- 主数据流：粗实线、最深色；
- residual/mHC：较细但高对比的独立轨道，不与数据流共用颜色；
- routing/Top-k：橙色或紫色，并用线型/箭头形状提供第二编码，不能只依赖颜色；
- attention：冷色；FFN/MoE：暖色；norm/embedding/output：中性色；
- 共同结构降低饱和度，模型创新模块使用 accent；
- 容器不靠大面积重灰底，改用轻 tint、留白和标题 rail 建立层级。

文字与背景至少满足 WCAG AA 的 4.5:1（普通文字）或 3:1（大字）对比度（[W3C 对比度说明](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)）。同时为线型、图标或标签提供非颜色编码。

### 6.2 节点内部微排版必须是模板，不交给布局引擎

每个 node kind 使用固定的内部栅格：

- 8 px 基线网格；
- 标题、主数值、次级解释三档字阶；
- 数值与单位分别排版，例如 `320B total` / `18B active`；
- badge 固定位置，不能挤压主标签；
- 所有节点先计算内容所需尺寸，再交给 ELK 排布；
- 禁止 SVG 中手写空格对齐和大量任意 `tspan x/y`。

当前 GLM SVG 的一个明显脆弱点就是文字通过手工 `tspan` 和坐标对齐；一旦换字体、改文案或本地化，就会漂移。节点组件应由布局函数测量并产生稳定的 text lines。

### 6.3 信息分层而非一张图塞满全部事实

比静态海报更强的核心是 progressive disclosure：

- Level 0：规模、上下文、层型分布和最重要创新；
- Level 1：模型主干和 layer group；
- Level 2：单个 Transformer block，明确 residual；
- Level 3：attention 或 MoE 内部；
- Level 4：tensor shape、KV cache、参数量和通信。

每一层都应是独立 DiagramSpec，而不是在一张巨图上隐藏 DOM 元素。这样各层布局可单独优化，移动端也能使用不同构图。

### 6.4 “架构差异”使用对齐语法，而不是两张图并排

compare 模板先对 Architecture IR 做语义匹配，再布局：

- 相同模块放在同一 rank 和同一水平位置；
- 相同部分弱化；
- 只在一方存在的模块用 `+/-` 和轮廓样式表达；
- 数值变化使用 delta badge；
- attention、FFN、layer pattern 可逐层展开；
- 每个差异都能点击查看双方来源。

这会形成比静态 Gallery 更强的产品优势，而且依赖的是 IR 和模板能力，不依赖更多装饰。

### 6.5 用“视觉质量函数”约束自动布局

在布局后计算以下指标，并让 CI 对阈值失败：

- 节点重叠数 = 0；
- edge 穿过非端点节点数 = 0；
- 标签越界/裁切数 = 0；
- 主流程逆向边数 = 0；
- 未连接节点数 = 0（明确允许的 annotation 除外）；
- 交叉数不超过该模板的基线；
- 相同类型节点的尺寸离散度在允许范围内；
- 对齐偏差不超过 0.5 px；
- 画布留白率和最大宽高比在模板定义范围内；
- compare 视图中已匹配节点的 rank 对齐率 = 100%。

ELK、Graphviz 和 TALA 可以对同一 DiagramSpec 生成候选 LayoutResult，再由上述硬指标过滤、由加权软指标排序，最后在新增模板时做一次人工盲评。不要让 LLM 直接“看图打分”成为唯一选择器。

## 7. 准确性和验证工作流

### 7.1 三类测试必须分开

**事实测试（Architecture IR）**

- Schema validation；
- `hidden_size % num_attention_heads == 0` 等领域 invariant；
- layer range 覆盖且不重复；
- `top_k <= routed_experts`；
- total/activated parameters 的派生公式保存输入与公式版本；
- 每个核心字段至少一个 evidence；冲突来源不得静默覆盖。

**图语义测试（DiagramSpec）**

- 每个 node/edge ID 唯一；
- 引用的 node、port、semanticRef、evidenceRef 必须存在；
- 核心路径从 embedding 到 output 可达；
- residual、routing、repeat、multiplicity 按模板契约出现；
- 从 IR 到 DiagramSpec 的字段覆盖清单做 golden snapshot；
- GLM-5.3-Flash 这类多残差流模型要有专门的 topology test，而不是仅测文字是否存在。

**像素与交互测试（Layout/SVG/Web）**

- SVG DOM snapshot：稳定 ID、节点数、边数、viewBox、无非法/重复 ID；
- layout metric：无重叠、无裁切、无非法交叉；
- Playwright 对固定浏览器环境做 element screenshot；官方说明 `toHaveScreenshot()` 会保存基准并在后续运行比较，同时提醒操作系统、浏览器、硬件等会影响结果，因此 CI 必须统一环境（[Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)）；
- viewport：至少 desktop、tablet、mobile；theme：light/dark；
- Playwright + axe 做自动无障碍检查，同时保留键盘和屏幕阅读器人工抽查；Playwright 官方也明确指出自动检查只能发现部分问题（[Accessibility testing](https://playwright.dev/docs/accessibility-testing)）。

### 7.2 模型发布与 PR 审核流程

```text
固定模型 revision
  → 拉取 config / 官方源码 / 官方报告
  → 静态解析出 Architecture IR
  → 校验与冲突报告
  → 生成各级 DiagramSpec
  → graph lint
  → ELK layout + layout lint
  → SVG/PNG/Web 视觉快照
  → 领域审核 + 视觉审核
  → 合并并发布
```

每个新增模型 PR 必须展示：

- 固定 revision 和来源清单；
- 核心字段 evidence matrix；
- 未解决冲突和推断字段；
- Architecture IR diff；
- DiagramSpec semantic diff；
- SVG/PNG before/after；
- graph lint、视觉回归和无障碍结果。

“置信度 0.97”不能替代证据。来源类型应使用枚举，例如 `config`、`source-code`、`technical-report`、`model-card`、`derived`、`llm-inference`；数值置信度只用于排序人工复核队列。

## 8. 分阶段落地建议

### P0：用 GLM-5.3-Flash 证明生成链（1–2 周）

- 定义 DiagramSpec v1 和 graph lint。
- 将现有 SVG 反向整理成 GLM fixture，而不是继续修改 SVG 坐标。
- 实现 `overviewMoeHybrid` 模板，必须表达 45 blocks、34 KDA、11 MLA/DSA、4 路 mHC、288 experts、Top-8、shared expert 与 active 参数。
- ELK.js 输出 LayoutResult，自研 renderer 输出 SVG。
- 建立无重叠、无穿越、无裁切、关键语义存在和 Playwright screenshot 测试。
- 用当前手写图和 Gallery 原图做盲评；P0 的目标是信息不丢失和重建稳定，不是一次完成最终视觉品牌。

### P1：形成小而完整的模板语言（2–4 周）

- 增加 Dense/GQA、Dense/MHA、MoE/GQA、MoE/MLA 四类 overview。
- 增加 Transformer block、GQA、MLA、MoE detail 模板。
- 选 Llama 3、Qwen3、DeepSeek V3、GLM-5.3-Flash 做四个 golden model。
- 建立 design tokens、字体、颜色、间距、线型和 annotation 组件。
- 输出 SVG 与 PNG，网页支持节点 hover/focus、来源侧栏和层级切换。

### P2：做出真正超过静态图库的体验（3–5 周）

- 语义对齐 compare view，不只是图片并排。
- evidence inspector：点击数字或模块直接看到 config key、源码行或报告页。
- semantic zoom 和 progressive disclosure。
- KV cache / 参数量等派生数据展示公式、输入和版本。
- 移动端专用 DiagramSpec/layout policy。

### P3：扩大覆盖并降低维护成本（持续）

- family adapter + parser fixture；新模型优先复用模板，不新增私有 SVG。
- 自动发现 upstream revision 变化并生成 IR diff，不能自动发布未经审核的新图。
- 对不规则新架构允许新增 node kind 和模板，但必须先更新 Schema/ADR。
- 用 ELK/TALA/Graphviz candidate benchmark 维护布局质量数据集。

## 9. 可使用的 Codex skills

结合当前可用 skills，真正有帮助的是：

| Skill | 使用阶段 | 具体价值 |
|---|---|---|
| `source-driven-development` | 解析器、布局和框架实现 | 要求实现决策建立在官方文档上，降低库 API 过时和模型配置误读 |
| `api-and-interface-design` | Architecture IR、DiagramSpec、renderer 边界 | 设计版本化 Schema、稳定 ID、模板接口和布局后端接口 |
| `codebase-design` | 拆分 packages | 避免 parser、IR、template、layout、renderer、web 重新耦合 |
| `frontend-design` | 视觉语法和页面体验 | 建立差异化字体、色彩、层级、留白和交互方向；适合先设计一套 GLM prototype |
| `frontend-ui-engineering` | SVG 组件和 explorer 页面 | 实现可复用节点、响应式布局、交互侧栏、状态和可访问性 |
| `test-driven-development` / `tdd` | IR invariant、graph lint、模板 | 先为 GLM 丢失的 residual/Top-8 等语义写失败测试，再实现生成器 |
| `browser-testing-with-devtools` | 每个 UI 里程碑 | 在真实浏览器检查 DOM、字体、布局、console、network 和交互 |
| `code-review-and-quality` | 合并前 | 分别审查数据正确性、模板语义、代码质量和回归风险 |
| `performance-optimization` | 模型数量与知识图谱扩大后 | 用 profiling 决定是否真的需要 Canvas/WebGL，避免过早优化 |
| `documentation-and-adrs` | 选择 IR、DiagramSpec、ELK、SVG 时 | 记录不可逆接口和技术取舍，防止未来又回到手写 SVG |
| `doubt-driven-development` | 新 attention/MoE 架构和派生公式 | 对高置信但代价高的架构判断做独立反证检查 |
| `imagegen` | 仅用于品牌 moodboard、背景纹理或非事实性 hero illustration | **不能**用于生成架构连线、数字或权威图稿；位图生成不具备结构正确性和可重建性 |
| `visualize:visualize` | 概念演示与交互原型 | 可快速验证 compare、semantic zoom 等交互构想；正式交付仍应进入 repo 的 DiagramSpec/SVG 管线 |

优先组合建议：`source-driven-development` → `api-and-interface-design` → `frontend-design` → `tdd` → `frontend-ui-engineering` → `browser-testing-with-devtools` → `code-review-and-quality`。

## 10. 最终建议

当前最该做的不是继续批量手写 100 张 SVG，而是暂停扩图，先把 GLM-5.3-Flash 变成一个完整的 vertical slice：

```text
可追溯 GLM Architecture IR
  → DiagramSpec
  → graph lint
  → ELK LayoutResult
  → 自研纯 SVG
  → 网页交互
  → Playwright + 人工双审
```

如果这条链能无损表达 4 路 mHC、混合 attention layer pattern、MoE 路由和激活参数，它就足以检验核心抽象是否成立。完成后再扩到 Llama、Qwen、DeepSeek；届时每个新模型主要新增数据和少量模板适配，而不是重新做一张容易退化的手工图。

技术上，ELK.js + 纯 SVG 是当前风险、控制力和可维护性最均衡的组合。React Flow 保留为未来的校图工具或 explorer 容器；Graphviz/D2/Mermaid 用于原型和文档；Sprotty、Cytoscape、TALA 都有明确的后续适用场景，但不应进入 MVP 的关键路径。
