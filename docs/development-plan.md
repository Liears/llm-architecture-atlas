---
type: overview
title: LLM Architecture Atlas 可落地开发计划
tags:
  - llm-architecture
  - visualization
  - roadmap
created: 2026-09-14
updated: 2026-09-14
---

# LLM Architecture Atlas 可落地开发计划

## 1. 结论先行

本项目不应从“自动解析任意模型并让 LLM 直接画图”起步，而应先完成一个更窄、但可以持续扩展的闭环：

```text
可审计的模型事实
  → Architecture IR
  → 结构验证
  → Diagram IR
  → 确定性布局
  → 自有视觉语言的 SVG
  → 网站、比较与导出
```

第一阶段的产品定义是：

> 一个面向 AI Infra 工程师与模型研究者的、证据可追溯、可分层阅读、可比较的 LLM 架构图谱。

第一阶段不是在线“万能模型解析器”。模型数据先通过仓库内的人工审核数据与确定性脚本维护，网站采用静态生成；等 IR、渲染器和质量门禁稳定后，再接 Hugging Face 配置解析、源码 AST 和 LLM 辅助提取。

这个顺序是项目能否落地的关键。旧计划里最有价值的资产是 Architecture IR、Evidence、Progressive Disclosure 和 Compare；需要调整的是一次性引入 Next.js、FastAPI、数据库、在线任务队列、AST、LLM 分析和全量模型支持的范围。

## 2. 产品目标与非目标

### 2.1 北极星体验

用户打开一个模型页面后，应能在五分钟内回答：

- 模型由哪些不同类型的层组成，重复模式是什么？
- Attention、FFN/MoE、Norm、位置编码分别是什么？
- 哪些参数是总量、哪些是每 token 激活量？
- 哪些结论来自 config、源码、论文或人工推断？
- 与另一个模型相比，差异会怎样影响 KV Cache、计算和通信？

### 2.2 首个可公开版本

首个公开版本只要求：

- 6 个高质量模型：Llama 3 8B、Mixtral 8x7B、DeepSeek V3、Qwen3-Next、Kimi Linear、GLM-5.3-Flash；
- Model Overview、Layer Genome、Transformer Block、Attention、MoE 四级视图；
- 两模型比较；
- 每个关键事实可展开查看来源、定位与验证状态；
- SVG、PNG 导出；
- 搜索、筛选、更新日志和基础移动端体验。

这 6 个模型覆盖 Dense、MoE、GQA、MLA、DSA、Linear/Delta Attention、Hybrid Layer Pattern、Shared Expert 和 mHC，足以验证 IR 与渲染器是否真的通用。

### 2.3 暂不纳入 MVP

- 在线解析任意 URL；
- 数据库、账号和用户收藏；
- 模型权重下载或运行时 trace；
- 训练图、CUDA Kernel、GPU Profiling；
- 从论文图片反向生成最终图；
- 多模态编码器的完整细节；
- 让 LLM 直接输出最终 SVG 坐标。

## 3. 当前资产与差距

### 3.1 当前仓库可保留的资产

- `figures/glm-5.3-flash.svg`：可以作为首个视觉回归样本和迁移输入；
- `figures/glm-5.3-flash.png`：可以作为旧版基线，不作为未来的生成源；
- `docs/site-design-notes.md`：已经拆解了参考站的信息架构与交互；
- 原始仓库的 MIT 许可与“只提交原创矢量图”的立场；
- 上游 `models.yml`：可以作为目录元数据的一个导入源，但不能替代本项目的 Architecture IR。

### 3.2 当前仓库的阻塞性问题

- SVG 使用约 200 行绝对坐标手工绘制，新增一个模型就要重新排版；
- 事实、拓扑、布局和样式混在一个 SVG 文件中，无法独立测试；
- 没有仓库内的 `models.yml`、IR、生成器、验证器和测试；
- `index.html` 引用未提交的版权原图，干净 clone 后对比页不能完整显示；
- GLM 图缺少原图的 MoE 激活说明及部分 mHC 多流连接，说明手工临摹会漏语义；
- 还没有真正的网站构建、路由、搜索、比较和发布链路。

### 3.3 参考站值得借鉴的部分

- 单页目录、过滤、排序、紧凑/详细密度切换；
- 模型卡片同时承担发现、事实表和比较入口；
- 全图缩略图与高清图分离；
- 对比器、KV Cache 计算器、变更日志与 RSS；
- 静态站和仓库数据驱动，维护成本低。

### 3.4 我们应形成的差异化

- 矢量且可交互，不是静态位图；
- 一个模型有多层视图，不把所有信息压在一张图里；
- 每个事实有来源和验证状态，而不是只有最终结论；
- 用 Layer Genome 精确表达混合层模式；
- 比较模式对齐相同语义模块，而不是只比较文字字段；
- 原生明暗主题与可访问配色，不对图片做整体反色；
- 图形从 IR 确定性生成，可做结构测试和视觉回归。

## 4. 核心架构

### 4.1 依赖图

```text
官方 config / 源码 / 技术报告 / 人工校订
                    │
                    ▼
          Source Snapshot + Locator
                    │
                    ▼
        Extraction Adapters（可替换）
                    │
                    ▼
       Architecture IR + Evidence Ledger
                    │
                    ▼
            Validator / Conflict Report
                    │
            ┌───────┴────────┐
            ▼                ▼
      Diagram Compiler    Architecture Diff
            │                │
            ▼                ▼
      Layout Constraints   Aligned Compare
            │
            ▼
       SVG Scene + A11y Tree
            │
      ┌─────┼────────┐
      ▼     ▼        ▼
     Web   PNG      PDF
```

### 4.2 深模块与接口

模块内部可以复杂，但调用方只接触小接口。

```ts
compileModel(sourceBundle): ValidationResult<ModelArchitecture>
compileDiagram(model, view, options): DiagramScene
renderDiagram(scene, target): SvgDocument | BinaryExport
diffArchitectures(a, b, options): ArchitectureDiff
```

- `architecture-ir` 模块隐藏字段规范、版本迁移、证据与冲突规则；
- `catalog` 模块隐藏数据加载、版本选择和索引生成；
- `diagram-engine` 模块隐藏模板选择、布局、文本测量和连线路由；
- `renderer-svg` 模块隐藏 SVG DOM、主题、可访问标注与导出；
- `ingest` 模块通过 Adapter 接入 Hugging Face、GitHub、论文和人工 YAML；
- Web 只消费验证后的模型与 DiagramScene，禁止读取原始 config。

只有存在生产与测试两种实现时才建立 Adapter seam。例如 Hugging Face Loader 同时需要远程 Adapter 与 fixture Adapter；单一的本地 YAML 读取无需提前抽象。

## 5. Architecture IR 设计原则

### 5.1 IR 分三层

1. `ModelFacts`：参数、层数、维度、上下文、许可证等事实；
2. `ModelTopology`：模块、端口、连接、重复层组和条件分支；
3. `EvidenceLedger`：每个字段的来源、定位、哈希、提取方式与状态。

IR 不保存最终像素坐标和颜色。布局提示只能是语义约束，例如 `direction: bottom-to-top`、`emphasize: true`、`group: attention`。

### 5.2 不用单一 confidence 数字掩盖冲突

每个 Claim 使用明确状态：

```text
verified     多个权威来源一致或已人工核验
reported     单一官方来源明确给出
derived      由可复现公式计算
inferred     由规则或 LLM 推断，等待复核
conflict     来源之间存在冲突
unknown      当前没有可靠证据
```

推荐字段：

```json
{
  "path": "decoder.layers[0:34].attention.type",
  "value": "kda",
  "status": "reported",
  "source": {
    "kind": "hf_config",
    "url": "https://huggingface.co/.../config.json",
    "revision": "commit-sha",
    "locator": "$.text_config.linear_attn_config.kda_layers"
  },
  "extractor": "config.glm5-next@1",
  "checked_at": "2026-09-14"
}
```

### 5.3 首批验证规则

- `hidden_size % num_attention_heads == 0`，但允许模型显式覆盖 head dimension；
- `num_key_value_heads <= num_attention_heads`；
- `experts.active <= experts.routed_total`；
- `shared + routed active` 与 activated parameter 描述不混为一谈；
- layer index 不越界且每一层恰好匹配一个 layer group；
- layer pattern 汇总数与 `num_hidden_layers` 一致；
- 图中每个可见数字必须能反查 Claim；
- `conflict` 与 `unknown` 不得在 UI 中伪装成确定事实。

## 6. 图形生成：准确且更好看的方法

### 6.1 禁止 LLM 直接画最终图

LLM 直接生成 SVG 的典型问题是：坐标漂移、遗漏连接、文字溢出、同类模型风格不一致、修改一处破坏多处，而且无法证明某个数字来自哪里。

LLM 的正确职责是：

- 将难解析的文字或源码映射成受 Schema 约束的候选 Claim；
- 为候选 Claim 提供来源定位与理由；
- 对 IR 或渲染结果提出审查意见；
- 生成模板所需的语义提示，而不是像素坐标。

### 6.2 采用“模板 + 约束 + 自动布局”的混合方案

- 宏观图使用固定视觉模板：Decoder Stack、Dense Block、MoE Block、GQA、MLA、Linear Attention、mHC；
- 复杂子图使用 ELK.js 计算节点与端口位置；
- 关键结构使用显式约束保持阅读顺序、左右对称和对齐；
- 自定义 SVG Renderer 统一文字测量、圆角、箭头、线宽和响应式缩放；
- React Flow 只在需要拖拽、选择、缩放或可编辑画布时作为交互外壳，不负责出版级排版；
- Mermaid、D2、Graphviz 只用于文档、调试和布局实验，不作为最终品牌化渲染器。

这比纯手工 SVG 更稳定，也比完全自动布局更有审美控制。

### 6.3 Diagram IR

Architecture IR 先编译成面向视图的 Diagram IR：

```ts
type DiagramScene = {
  view: "overview" | "block" | "attention" | "moe" | "tensor";
  nodes: SemanticNode[];
  edges: SemanticEdge[];
  groups: SemanticGroup[];
  annotations: EvidenceAnnotation[];
  constraints: LayoutConstraint[];
};
```

这样同一 Architecture IR 可生成多张图，也可以替换布局引擎或导出器。

### 6.4 质量门禁

每张图必须同时通过四类测试：

1. Schema：IR 与 Diagram IR 可验证；
2. Structural：节点、边、端口、重复层数和所有可见数字符合 golden fixture；
3. Visual：Playwright 在固定字体、浏览器和 viewport 下做截图回归；
4. Human rubric：信息层级、交叉线、留白、缩放可读性、配色和原创性评分。

任何新模型都必须有来源快照、IR fixture、结构快照与至少三个 viewport 的视觉快照。

## 7. 视觉方向

### 7.1 主题、受众与页面唯一任务

- 主题：把大模型当作可以拆解、测量和对照的精密系统；
- 受众：AI Infra 工程师、模型研究者和技术决策者；
- 模型详情页的唯一任务：让用户从整体层模式下钻到一个可验证的技术细节。

### 7.2 视觉系统

视觉方向采用“逻辑分析仪 + 工程蓝图”，但避免常见的黑底霓虹科技风。

```text
Paper         #F5F7FA  页面底色
Ink           #172033  正文与主轮廓
Attention     #1769E0  Attention / 数据流
State         #008C8C  Linear / recurrent state
Compute       #D9822B  FFN / MoE
Conflict      #C94F5C  冲突、未知与警告
```

- 标题：IBM Plex Sans Condensed 或同类窄体工程字体；
- 正文：Source Sans 3 / Noto Sans SC；
- 数据与证据定位：IBM Plex Mono；
- 所有颜色同时配合形状、线型和标签，不能只靠颜色编码。

### 7.3 记忆点：Architecture Genome

模型页面最独特的视觉元素是一条“层基因图”：每一列代表一层，顶部编码 Attention，底部编码 FFN/MoE，特殊模块以端口或标记叠加。

```text
Layers   00 01 02 03 04 05 06 07 ... 44
Attn     K  K  K  M  K  K  K  M  ... K
FFN      D  D  D  E  E  E  E  E  ... E
         └──────────── hover / select ───┘
                         ↓
                  当前层完整结构
```

它比在一张大图旁写“34 KDA + 11 MLA”更准确，也天然适合 Hybrid Attention、层模式比较和异常层定位。

### 7.4 页面结构

```text
┌─────────────────────────────────────────────────────────────┐
│ Model / family / revision       Compare     Export          │
├──────────────┬──────────────────────────────┬───────────────┤
│ Facts        │ Architecture Genome          │ Evidence      │
│ 320B / A18B  │ K K K M K K K M ...         │ source        │
│ 45 layers    ├──────────────────────────────┤ locator       │
│ 1M context   │ Current view: Block / Attn   │ status        │
│ ...          │                              │ conflicts     │
│              │        interactive SVG       │               │
└──────────────┴──────────────────────────────┴───────────────┘
```

- 桌面端：事实、画布、证据三栏；
- 平板：证据收进抽屉；
- 移动端：Genome 横向滚动，详情单列；
- hover 只做局部路径强调；点击才改变选中状态；
- 唯一显著动效是从 Genome 层格过渡到结构详情，且尊重 `prefers-reduced-motion`。

## 8. 推荐技术栈

### 8.1 第一阶段

| 能力 | 选择 | 原因 |
|---|---|---|
| Monorepo | pnpm workspace | 足够轻量，不先引入额外任务编排层 |
| 网站 | Astro + React islands | 目录页静态、模型图按需交互，适合内容型站点 |
| IR 源定义 | Python Pydantic v2 | 与 Hugging Face/AST 生态接近，可导出 JSON Schema |
| Web 类型 | JSON Schema 生成 TypeScript | 避免 Python/TypeScript 双份手写类型漂移 |
| 图形 | 自定义语义 SVG | 可控、可访问、可导出、可做品牌化视觉 |
| 布局 | ELK.js | 支持端口、层级节点与复杂有向图；只负责坐标 |
| 交互外壳 | 原生 SVG；需要编辑能力时再接 React Flow | 避免被节点编辑器默认外观限制 |
| 测试 | Pytest、Vitest、Playwright、axe-core | 覆盖数据、编译、视觉和无障碍 |
| 导出 | resvg | 统一 SVG 到 PNG/PDF 的服务端或 CLI 输出 |
| 发布 | GitHub Actions + 静态托管 | 先建立低成本、可复现发布链路 |

### 8.2 第二阶段再引入

- FastAPI：只有上线异步分析任务时才需要；
- SQLite/PostgreSQL：只有动态任务、用户数据或大量版本查询出现时才需要；
- 队列与对象存储：只有分析任务超出请求生命周期时才需要；
- React Flow：只有提供在线图形编辑器或强节点交互时才需要。

## 9. 目标仓库结构

```text
llm-architecture-atlas/
├── apps/
│   └── web/                       # Astro 页面与 React islands
├── packages/
│   ├── architecture-ir/           # JSON Schema、生成类型、迁移
│   ├── catalog/                   # 模型索引、版本选择、搜索数据
│   ├── diagram-engine/            # IR → Diagram IR → layout
│   ├── renderer-svg/              # SVG DOM、主题、a11y、导出
│   └── ui/                        # 非图形 UI 与设计 tokens
├── tools/
│   └── ingest/                    # Python Pydantic、HF、AST、LLM proposals
├── models/
│   └── <org>/<model>/<revision>/
│       ├── architecture.json
│       ├── evidence.json
│       └── sources.lock.json
├── tests/
│   ├── fixtures/
│   ├── structural/
│   └── visual/
├── docs/
│   ├── development-plan.md
│   ├── diagram-generation-research.md
│   └── site-design-notes.md
└── scripts/
```

## 10. 分阶段路线

### Phase 0：证明“能准确且更好看”

目标：只用 GLM-5.3-Flash 打通事实、IR、模板、布局、SVG 和质量门禁。

完成标准：生成图不再依赖手写坐标；原图中有意义的信息全部保留；构图和视觉语言与参考站明显不同；修改任意事实后所有视图同步更新。

### Phase 1：可公开浏览的静态 Atlas

目标：6 个模型、目录、详情、证据、比较、导出和更新日志组成完整静态产品。

完成标准：用户无需运行解析任务即可浏览；所有模型通过数据与视觉门禁；移动端和键盘操作可用。

### Phase 2：确定性数据采集

目标：输入 Hugging Face repo 与 revision，自动生成候选 IR 和冲突报告，不直接发布。

完成标准：Llama、Qwen、DeepSeek、Mixtral/GLM 五类 config Adapter 有 golden tests；网络失败不影响已有目录构建。

### Phase 3：源码与 LLM 辅助

目标：AST 补充拓扑，LLM 只创建带证据的 proposal，由人工批准后进入 catalog。

完成标准：AI 不能覆盖 verified Claim；proposal 与发布数据物理隔离；每次批准留下审计记录。

### Phase 4：AI Infra 与知识图谱

目标：KV Cache、权重/激活内存、FLOPs、并行通信与架构概念网络。

完成标准：公式有测试和来源；计算结果区分精确值、估计值与未知值。

## 11. Issue 任务清单

Issue 应保持单次专注会话可完成，标题使用阶段前缀，依赖写在正文。

总跟踪：[Roadmap Issue #19](https://github.com/Liears/llm-architecture-atlas/issues/19)

| Issue | 任务 | 依赖 | 范围 | 验收重点 |
|---|---|---|---|---|
| [#1](https://github.com/Liears/llm-architecture-atlas/issues/1) | `[P0] 建立 pnpm/Astro/Python 基础与 CI` | 无 | M | build、typecheck、pytest、Playwright smoke 全绿 |
| [#2](https://github.com/Liears/llm-architecture-atlas/issues/2) | `[P0] 定义 Architecture IR v0.1` | #1 | M | JSON Schema、Pydantic、TS 类型、版本字段 |
| [#3](https://github.com/Liears/llm-architecture-atlas/issues/3) | `[P0] 建立 Evidence Ledger 与冲突模型` | #2 | M | Claim 状态、revision、locator、禁止静默覆盖 |
| [#4](https://github.com/Liears/llm-architecture-atlas/issues/4) | `[P0] 定义 Diagram IR 与语义设计 tokens` | #2 | M | 无像素坐标的 DiagramScene、浅/深主题、a11y tokens |
| [#5](https://github.com/Liears/llm-architecture-atlas/issues/5) | `[P0] 实现约束布局与 SVG Renderer` | #4 | M | ELK Adapter、端口、文本测量、稳定 SVG 输出 |
| [#6](https://github.com/Liears/llm-architecture-atlas/issues/6) | `[P0] 重建 GLM-5.3-Flash golden vertical slice` | #3、#5 | M | 所有数字可追溯，MoE/mHC 信息不缺失，独立构图 |
| [#7](https://github.com/Liears/llm-architecture-atlas/issues/7) | `[P0] 建立结构与视觉回归门禁` | #5、#6 | M | 结构快照、3 viewport 截图、阈值与更新流程 |
| [#8](https://github.com/Liears/llm-architecture-atlas/issues/8) | `[P1] 实现 Atlas 目录、搜索和筛选` | #1、#2 | M | 静态生成、URL 状态、无 JS 基础可读 |
| [#9](https://github.com/Liears/llm-architecture-atlas/issues/9) | `[P1] 实现模型详情与分层下钻` | #6、#8 | M | Overview、Genome、Block、Attention、MoE、Evidence |
| [#10](https://github.com/Liears/llm-architecture-atlas/issues/10) | `[P1] 实现 Architecture Genome 与双模型对齐比较` | #4、#9 | M | 混合层逐层对齐、差异高亮、共享字段弱化 |
| [#11](https://github.com/Liears/llm-architecture-atlas/issues/11) | `[P1] 接入首批六模型与概念页` | #7、#9 | M | 6 模型全部通过来源、结构和视觉审核 |
| [#12](https://github.com/Liears/llm-architecture-atlas/issues/12) | `[P1] SVG/PNG 导出、暗色与可访问性` | #5、#9 | M | 可复制文字、ARIA 描述、键盘、reduced motion |
| [#13](https://github.com/Liears/llm-architecture-atlas/issues/13) | `[P2] 实现 Hugging Face source snapshot CLI` | #2、#3 | M | revision 锁定、只拉文本、缓存、离线 fixture |
| [#14](https://github.com/Liears/llm-architecture-atlas/issues/14) | `[P2] 实现首批 config extraction adapters` | #13 | M | Llama/Qwen/DeepSeek/Mixtral/GLM golden tests |
| [#15](https://github.com/Liears/llm-architecture-atlas/issues/15) | `[P3] 实现 Python AST topology analyzer` | #13、#14 | M | 模块组成、forward 顺序、无法判断时返回 unknown |
| [#16](https://github.com/Liears/llm-architecture-atlas/issues/16) | `[P3] 实现 LLM proposal 与人工审批流` | #3、#15 | M | schema constrained、证据定位、不可直接发布 |
| [#17](https://github.com/Liears/llm-architecture-atlas/issues/17) | `[P4] 实现 KV Cache 与内存计算器` | #2、#10 | M | MHA/GQA/MLA 公式、单位测试、精确/估计标识 |
| [#18](https://github.com/Liears/llm-architecture-atlas/issues/18) | `[P1] 建立发布、更新日志与贡献流程` | #7、#8 | S | preview、静态发布、RSS、模型提交模板 |

### Checkpoint A：T01–T07

- 所有测试通过；
- GLM 页面可由 IR 一键重建；
- 不读取旧 SVG 坐标；
- 设计复核确认不再是参考图的贴版临摹。

### Checkpoint B：T08–T12、T18

- 6 模型可浏览与比较；
- Lighthouse/axe 无阻塞问题；
- 桌面、平板、手机截图通过；
- 发布流程可复现。

### Checkpoint C：T13–T16

- 新模型可以通过 CLI 生成 proposal；
- 不联网也能用 fixtures 完成测试；
- 人工批准前不会进入生产 catalog。

## 12. 模型接入顺序

1. GLM-5.3-Flash：混合 Attention、MoE、mHC，作为最难的渲染样本；
2. Llama 3 8B：最小 dense/GQA 基线；
3. Mixtral 8x7B：传统 MoE 基线；
4. DeepSeek V3：MLA、Shared Expert、MTP；
5. Qwen3-Next：Hybrid/Linear Attention 与层模式；
6. Kimi Linear：验证线性 Attention 模板能否跨模型复用。

先做最难样本是为了尽早暴露 IR 和 Diagram IR 的表达缺口；随后用简单模型验证接口没有为单个模型过拟合。

## 13. GitHub 跟踪规范

建议标签：

```text
priority:p0  priority:p1  priority:p2
area:ir      area:rendering  area:web  area:ingest
quality      documentation
```

每个 Issue 必须包含：

- 用户可观察结果；
- 最多 3 条验收标准；
- 可运行的验证命令或手工检查；
- 依赖 Issue；
- 预计涉及文件与 S/M 范围；
- 明确非目标。

Issue 完成不等于“代码写完”，还必须满足测试、文档、视觉快照和证据要求。

## 14. 工具与 Codex Skills 使用建议

### 14.1 直接用于项目

- `frontend-design`：建立独立视觉方向、token、版式与自我批评；
- `frontend-ui-engineering`：实现生产级交互和响应式 UI；
- `api-and-interface-design`：冻结 Architecture IR、Diagram IR 与模块接口；
- `source-driven-development`：解析器与计算公式只采用官方文档、配置和论文；
- `test-driven-development`：IR、parser、diff、calculator 均先写失败测试；
- `browser-testing-with-devtools`：真实浏览器验证 DOM、网络、性能与视觉；
- `code-review-and-quality`：每个阶段进入主分支前做多维审查；
- `doubt-driven-development`：对模型事实、计算公式、版权边界做独立复核；
- `performance-optimization`：模型数量增长后再处理首屏、SVG 与搜索索引性能。

### 14.2 有限使用

- `imagegen`：只用于品牌探索、纹理和营销插图，不能生成权威结构图；
- `visualize`：可快速验证 Genome 或比较交互，不作为生产源码；
- `lieflat-charts`：适合参数分布、模型时间线和统计报告，不适合核心拓扑图；
- Mermaid/D2：适合文档和 ADR；
- Graphviz：适合自动布局基准与调试输出。

## 15. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 为单个模型过拟合模板 | 新模型仍需重画 | 用 6 个互补模型验证；IR 不含坐标 |
| LLM 幻觉进入生产数据 | 架构错误 | proposal 隔离、字段级证据、verified 不可覆盖 |
| 自动布局可读性差 | 图正确但不好看 | 关键模板固定约束，ELK 只处理局部复杂图 |
| 字体导致视觉快照漂移 | CI 不稳定 | 固定字体文件、浏览器版本和 viewport |
| 复制参考站表达过多 | 原创性和版权风险 | 事实可复用，构图、视觉语法、文案和交互独立设计 |
| 过早建设后端 | 长期没有可见产品 | 静态站先行，在线任务出现真实需求后再引入 API/DB |
| 上游模型配置变更 | 历史结果不可复现 | 保存 revision、source hash 和 parser version |

## 16. MVP Definition of Done

- 6 个目标模型均有锁定 revision 的来源与 Evidence Ledger；
- 关键事实没有无来源值；
- Architecture IR 和 Diagram IR 均有版本与迁移策略；
- GLM-5.3-Flash 的 MoE 激活、mHC 四流和混合层模式完整表达；
- 所有图由生成器输出，不手改生成后的 SVG；
- 结构、视觉、无障碍和移动端测试通过；
- 支持搜索、筛选、详情、双模型比较和 SVG/PNG 导出；
- 更新一个 IR 字段后，卡片、详情、比较和图形同步变化；
- README、贡献流程、数据来源规范和更新日志齐全；
- 网站可由 CI 静态构建并发布。

## 17. 执行顺序

立即执行顺序只有三步：

1. 完成 T01–T03，冻结 Architecture IR 与证据模型；
2. 完成 T04–T07，用 GLM-5.3-Flash 证明生成图质量；
3. 通过 Checkpoint A 后再建设目录页和扩充模型。

在 Checkpoint A 之前，不开始 FastAPI、数据库、AST 或在线任意 URL 分析。
