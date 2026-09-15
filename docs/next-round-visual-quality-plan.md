---
type: overview
title: LLM Architecture Atlas 下一轮结构图质量计划
tags:
  - llm-architecture
  - visual-quality
  - roadmap
  - review
created: 2026-09-15
updated: 2026-09-15
---

# LLM Architecture Atlas 下一轮结构图质量计划

## 1. 结论

下一轮不扩充模型数量，先解决“结构语义不成立、构图超宽、移动端不可读、下钻名不副实、golden 只冻结像素”五个根因。

交付目标不是模仿 LLM Architecture Gallery，而是做出一套更适合验证和探索的表达：

- 精确：图上每个结构和数字都能回到固定 revision 的官方 config/code 或论文定位；
- 清楚：主干、重复单元、机制 inset、数据流、控制流和残差流有不同视觉层级；
- 可读：桌面首屏可读，手机使用专用阅读模式，不把完整桌面 SVG 缩成缩略图；
- 可探索：layer、module、node、edge 与 citation 双向联动；
- 可审核：结构突变、几何约束、整页截图和独立人工审图共同决定是否通过。

总跟踪：[#32](https://github.com/Liears/llm-architecture-atlas/issues/32)。

## 2. 当前基线

评审基线为 `main` 的 `f8c8c29`，线上页为
[GLM-5.3-Flash model detail](https://liears.github.io/llm-architecture-atlas/models/zai-org-glm-5-3-flash/)。

| 维度 | 当前结果 | 根因 |
|---|---|---|
| GLM 画布 | SVG `2345×700`，宽高比 3.35:1 | 全局 longest-path layout 把同 depth 的 DSA、MoE、mHC 节点横向铺开 |
| 桌面阅读 | 约 `1154×346` | 整图缩放后正文过小，主干只占画面一部分 |
| 手机阅读 | 约 `352×105` | `width:100%; height:auto` 只防溢出，不保证可读 |
| mHC | 4 个 `mhc → mhc` self-loop | Diagram IR 缺少跨 sublayer 多流和边界端口 |
| 下钻 | 点击 layer 后显示 label 与 evidence path 文本 | 没有 block/attention/moe DiagramScene |
| Evidence | 详情页展示完整原始表 | citation 与图、事实、layer 没有上下文联动 |
| 视觉回归 | 仅截图 generated `<img>` | golden 可以稳定保存错误构图，不检查整页和有效字号 |

这说明问题不在色板或圆角，而在语义模型、版面层级和验收方法。

## 3. 目标视觉语法

### 3.1 三层阅读结构

1. **Main spine**：只回答 token 如何穿过 embedding、decoder、norm 和 LM head。
2. **Pattern layer**：显示 layer schedule、Dense/MoE 分段与 residual strategy，不展开所有算子。
3. **Mechanism inset**：KDA、DSA、MoE、mHC 各自拥有局部方向和端口，通过 callout 与主干关联。

同一张图不再把三个层级平铺在一条水平线上。桌面导出可组合成出版级 poster；网页和手机按层级逐步披露。

### 3.2 组件语义

| 语义 | 图形责任 |
|---|---|
| data flow | 实线有向边；决定主阅读顺序 |
| residual stream | 独立 rail，必须有 read、mix、write 的起止点 |
| control/routing | 次要虚线；连接 selector/router 与被控制路径 |
| repeat | frame + schedule badge；显示模式，不复制 45 个完整 block |
| split/merge | 显式节点；MoE fan-out/fan-in 和多流聚合不可省略 |
| evidence status | 附着在 node/edge 的 citation 状态，不以颜色作为唯一编码 |

### 3.3 构图约束

- 默认桌面 overview 宽高比不超过 1.8:1；超出时必须拆成主图与 inset，而不是继续缩字。
- 默认阅读态关键节点文字的有效字号不低于 12 CSS px。
- group 先做局部布局，再参与页面级 composition；group frame 不是事后包围所有散落节点。
- renderer 只渲染 PositionedScene，禁止按 model id 写特判。
- canonical artifact 保持 SVG；交互外壳可以 pan/zoom，但不得改变下载图的确定性。

### 3.4 视觉原型门禁

正式实现 #34 前，先以同一份已审核的 GLM source brief 和 Diagram IR
生成 3 个低成本构图候选：论文编辑风、工程蓝图风、Atlas 自有风。候选只允许改变
composition、spacing、typography、shape 和 color token，不允许增加、删除或推断模型事实。

候选按以下顺序评审；前一项失败即淘汰，不以颜值抵消结构错误：

1. 结构忠实度：节点、边、端口、layer schedule 与 source brief 一致；
2. 阅读层级：main spine、pattern layer、mechanism inset 的主次明确；
3. 线条辨识度：data、residual、control/routing 不混淆；
4. 版面质量：留白、对齐、密度和文字尺度达到出版级；
5. 响应式潜力：构图能拆为 mobile reading states，而非只能缩放整张图。

原型可以使用外部 diagram skill 或 Excalidraw，但仅作为 PR 的评审材料。被选中的视觉决策
必须回写为仓库内可测试的 design token、layout constraint 或 renderer primitive；不得提交
由自然语言直接生成、脱离 Diagram IR 的 SVG 作为 canonical artifact。

## 4. 依赖图

```text
#33 Diagram IR / compound layout
        │
        ├──────────────┐
        ▼              ▼
#34 GLM vertical    #35 quality gates
        │              │
        └──────┬───────┘
               ▼
      #36 responsive canvas
               │
               ▼
      #37 real drill-down
          ┌────┴────┐
          ▼         ▼
 #38 detail UX   #39 Kimi reuse proof
```

推荐顺序：`#33 → (#34 + #35) → #36 → #37 → (#38 + #39)`。括号内任务可以并行，但每个 issue 使用独立 PR。

## 5. Issue 计划

| Issue | 交付 | 依赖 | 范围 | 审核重点 |
|---|---|---|---|---|
| [#33](https://github.com/Liears/llm-architecture-atlas/issues/33) | compound subgraph、跨层端口、split/merge、多流残差 | 无 | M | self-loop 负例、组内布局、稳定性 |
| [#34](https://github.com/Liears/llm-architecture-atlas/issues/34) | GLM 主干与 KDA/DSA/MoE/mHC 多尺度图 | #33 | M | 论文映射、结构关系、桌面可读性 |
| [#35](https://github.com/Liears/llm-architecture-atlas/issues/35) | 结构突变、几何可读性、整页 contact sheet | #33；最终基线取 #34 | M | 每个 mutation 确实让 CI 变红 |
| [#36](https://github.com/Liears/llm-architecture-atlas/issues/36) | overview/聚焦/缩放/移动端重排 | #34、#35 | M | 390/820/1440 真实浏览器 |
| [#37](https://github.com/Liears/llm-architecture-atlas/issues/37) | layer/module 子图与节点级 citation | #34、#36 | M | layers 0/3/4/44、URL、键盘 |
| [#38](https://github.com/Liears/llm-architecture-atlas/issues/38) | 详情页 hierarchy 与 Citation Panel | #36、#37 | M | 首屏权重、手机引用、a11y |
| [#39](https://github.com/Liears/llm-architecture-atlas/issues/39) | Kimi Linear 第二 golden | #33、#35、#36、#37 | M | 论文 Figure 3、组件复用、无特判 |

## 6. 分阶段执行

### Phase 0：语义、GLM 与门禁

#### Task 0.1：完成 #33

可能涉及：

- `packages/diagram-engine/src/types.ts`
- `packages/diagram-engine/src/positioned.ts`
- `packages/diagram-engine/src/layout.ts`
- `packages/diagram-engine/src/elk.ts`
- `packages/diagram-engine/src/validate.ts`
- 对应 schema、fixtures 与 tests

Checkpoint：validator 能拒绝 self-loop residual 和悬空端口；compound groups 在两种 layout backend 下均无 overlap。

#### Task 0.2：完成 #34

可能涉及：

- `packages/diagram-engine/src/glm-topology.ts`
- GLM architecture/evidence/brief
- renderer 中通用 node/edge/group primitives
- GLM structural snapshots 与导出 artifact

实施前置：使用冻结的 source brief/Diagram IR 完成 3 个构图候选和统一 rubric 评分，
记录选择理由；不得让 diagram skill 自行读取论文后直接决定拓扑。

Checkpoint：独立审核方对照固定 config 与四篇机制论文逐区签字；只确认文案存在不算通过。

#### Task 0.3：完成 #35

可能涉及：

- `apps/web/e2e/visual.spec.ts`
- page-level/readability tests
- diagram structural mutation fixtures
- CI artifact workflow

几何门禁至少覆盖 edge 穿过 node、edge 穿过 reserved/title/legend 区、业务边共线重叠、
文字溢出、viewBox 截断和外部/active SVG 内容。自动修正最多执行两轮，之后必须报告
未通过原因，禁止静默删除门禁或继续无限重画。

Checkpoint：至少四个已知错误突变能稳定使测试失败；PR contact sheet 已人工查看。

### Checkpoint A：GLM 可发布候选

- [ ] #33、#34、#35 各自通过独立 PR review；
- [ ] 三个构图候选使用同一份已审核事实输入，评审结果和淘汰理由已记录；
- [ ] GLM 图的结构、证据、几何和桌面视觉均通过；
- [ ] CI green 之外另有审图记录；
- [ ] 未通过项保留 issue 开放。

### Phase 1：响应式阅读和真正下钻

#### Task 1.1：完成 #36

先定义 reading states：overview、fit、focused module、custom zoom。手机默认进入 vertical overview，复杂 inset 通过明确操作打开。

Checkpoint：三个 viewport 无整页 overflow；手机默认态有效字号达标；下载 artifact 与页面状态解耦。

#### Task 1.2：完成 #37

以 GLM layer 0、3、4、44 为验收样本，分别覆盖 KDA/DSA、Dense/MoE 与尾层边界。每个子图复用 #34 的已审核组件。

Checkpoint：URL 可恢复 layer/view/claim；鼠标、键盘、触摸均能返回 overview。

#### Task 1.3：完成 #38

模型详情页默认展示结构摘要与图；Evidence Ledger 退到 advanced 层，Citation Panel 随当前选择显示最相关来源。

补充导出体验：提供复制 SVG、下载 SVG/PNG 和可选 evidence manifest；导出必须来自已审核的
canonical scene，不得把当前 viewport 的缩放、聚焦或临时批注固化为正式结构图。

Checkpoint：中英文、明暗主题和三个 viewport 的整页 before/after 均提交人工审核。

### Checkpoint B：产品阅读闭环

- [ ] 用户可从 overview 进入 layer，再到 node/edge citation；
- [ ] 页面后退、刷新与 URL 分享保持状态；
- [ ] Evidence 不再依赖手机横向查看原始表；
- [ ] 独立审核方记录真实浏览器结果。

### Phase 2：证明模板不是 GLM 特判

#### Task 2.1：完成 #39

用 Kimi Linear 的 27 层 KDA/MLA + MoE 组合验证组件复用。完成前不启动其余四模型的视觉迁移。

Checkpoint：隐藏标签后 KDA 与 MLA 仍可从拓扑形状区分；renderer 没有 GLM/Kimi model-id 分支。

## 7. 每个实现 PR 的材料

1. 使用 `Refs #N`，保持 issue 开放；
2. scope、非目标和已知限制；
3. 固定 revision 的 official config/code；
4. 论文 Figure/Table/Section/PDF page 与 exact-model/mechanism-only 标记；
5. paper-to-diagram map；
6. verification command 和结果；
7. desktop/tablet/mobile 整页与单图 before/after；
8. 对结构图修改，列出 mutation tests；
9. 明确写 `review pending`，等待独立审核。

实施者不自审、不自合并、不关闭关联 issue。合并或部署也不自动改变验收状态。

## 8. 工具与 skills 建议

| 阶段 | 推荐能力 | 用法 |
|---|---|---|
| 资料核对 | `research`、`source-driven-development` | 固定官方 revision，定位论文 Figure/Section/Page，先产出 source brief |
| 视觉方向 | `frontend-design`、`prototype` | 在进入 production renderer 前做 2–3 个 GLM 构图原型并盲评 |
| 结构实现 | `test-driven-development` | 先写 mHC、DSA、MoE、schedule 的失败测试，再改 IR/compiler |
| 浏览器验收 | `browser-testing-with-devtools` | 读取 DOM、computed size、console、a11y tree，并截图三个 viewport |
| 合并前审核 | `code-review`、`code-review-and-quality` | 分别核对仓库规范与 issue spec，报告仍未验证的标准 |

Figma 可用于人工构图草案和设计评审，但不作为事实源或 canonical renderer。Image generation 适合 moodboard，不适合生成正式模型结构图：它无法稳定保证节点、数字和连线正确。Mermaid、D2、Graphviz 可做布局 benchmark 或文档草图；正式链路继续采用 Architecture IR → Diagram IR → constraint/ELK layout → semantic SVG。

### 8.1 外部 diagram skills 的采用边界

参考文章：[《别再手画架构图了！3 个 AI Skill 一句话出图，我全装了》](https://mp.weixin.qq.com/s/8_q6oXUxXUJR_tSE-DZTLw)。

| 工具 | 可吸收能力 | 明确不采用 |
|---|---|---|
| [architecture-diagram](https://github.com/Cocoon-AI/architecture-diagram-generator) | 语义色彩、深色网格、独立 HTML 和复制/PNG/PDF 导出体验 | 单一暗色审美；自然语言直接生成正式模型拓扑 |
| [excalidraw-diagram-generator](https://github.com/github/awesome-copilot/blob/main/skills/excalidraw-diagram-generator/SKILL.md) | 可编辑构图草案、人工批注、评审现场调整 | `.excalidraw` 作为模型事实源或 canonical artifact |
| [fireworks-tech-graph](https://github.com/yizhiyanhua-ai/fireworks-tech-graph/blob/main/README.zh.md) | geometry gate、语义形状/箭头、确定性导出、显式 visual-review 状态和有界修正 | 把通用 Agent/RAG/UML 模板直接套在 Transformer 内部结构；GIF 作为本轮目标 |

这三类工具只进入 **prototype / review / validation** 环节，不进入事实编译链。任何外部
skill 的输出都必须能够由冻结的 source brief 和 Diagram IR 重建；无法重建的视觉元素视为
未经证实，不得进入正式 SVG。

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 自动布局继续决定信息层级 | 再次产生超宽图 | main spine/inset composition 先于局部 auto-layout |
| 为 GLM 写一次性特判 | 其他模型无法复用 | #39 作为强制第二 golden；renderer 禁止 model-id branch |
| 截图测试固化坏设计 | CI 全绿但产品仍难看 | 结构突变 + 几何断言 + 人工 contact sheet 三层门禁 |
| 手机端靠缩放解决 | 字号不可读 | mobile composition 与受控 canvas，不缩整张 poster |
| 论文被错误当作精确规格 | 图看似专业但事实错 | exact-model/mechanism-only 分级；精确值优先固定 config/code |
| 第三方画图 skill 产生漂亮但臆造的拓扑 | 审美改善但事实退化 | 只接收冻结 IR；结构忠实度先行门禁；输出仅作 prototype/review artifact |
| issue 再次过早关闭 | 验收信息丢失 | 实施者只标 `review pending`；独立审核方关闭 |

## 10. 本轮完成定义

- [ ] #33–#39 均通过独立验收，而非仅被合并；
- [ ] GLM 和 Kimi 两个不同拓扑的 golden model 达到结构、证据、桌面、移动端四项标准；
- [ ] 结构突变和页面可读性门禁进入 CI；
- [ ] 详情页形成 overview → layer/module → citation 的完整阅读路径；
- [ ] 再决定是否进入 Qwen、DeepSeek、Llama、Mixtral 的逐模型迁移。
