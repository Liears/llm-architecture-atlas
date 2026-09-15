---
type: overview
title: LLM Architecture Atlas 发布后评审与质量加固计划
tags:
  - llm-architecture
  - code-review
  - visual-quality
  - roadmap
created: 2026-09-15
updated: 2026-09-15
---

# LLM Architecture Atlas 发布后评审与质量加固计划

## 1. 结论

当前版本已经从单张手写 SVG 演进成可部署的静态 Atlas，工程骨架和主要页面都已建立，但还不能按原开发计划认定为“开发完毕”。

最准确的状态是：

- 基础设施完成：pnpm workspace、Astro、Architecture IR、Evidence Ledger、Diagram IR、SVG renderer、Python ingest、CI、Pages 均已落地；
- 产品骨架完成：六模型目录、搜索筛选、详情、证据表、Genome、比较页、导出、中英文、RSS 已可访问；
- 可信度未过关：两个模型存在大面积事实错误，证据覆盖承诺没有被门禁真正强制；
- 核心视觉未过关：GLM 和其他五图仍是同一张九节点摘要骨架，尚未表达关键内部拓扑；
- 交互未过关：Compare Genome 实际不可见，详情页没有层下钻，移动端存在整页横向溢出；
- 可复现性未过关：Windows golden export 失败，README 中的 Python 一键测试流程不能在新环境直接执行。

因此下一阶段不是继续扩充模型数量，而是先完成可信度、可复现性和核心图形表达的 hardening。

总跟踪：[Post-implementation quality hardening #29](https://github.com/Liears/llm-architecture-atlas/issues/29)

## 2. 评审范围

- 固定基线：a2aa450
- 当前评审点：c32c67b
- 比较范围：a2aa450...c32c67b
- 浏览器：Chromium，1440×900 与 390×844
- 对照规范：docs/development-plan.md、Issues #1–#19、CONTRIBUTING.md
- 外部事实来源：
  - [GLM-5.3-Flash 官方 config](https://huggingface.co/zai-org/GLM-5.3-Flash/blob/main/config.json)
  - [Qwen3-Next-80B-A3B-Instruct 官方 config](https://huggingface.co/Qwen/Qwen3-Next-80B-A3B-Instruct/blob/main/config.json)
  - [Kimi-Linear-48B-A3B-Instruct 官方 config](https://huggingface.co/moonshotai/Kimi-Linear-48B-A3B-Instruct/blob/main/config.json)
  - [LLM Architecture Gallery](https://sebastianraschka.com/llm-architecture-gallery/)

## 3. 已经做得好的部分

### 3.1 工程基础

- Astro 静态构建成功，共生成 23 个页面；
- TypeScript typecheck 为 0 errors / 0 warnings；
- Vitest 共 13 个 test files、52 个 tests 全部通过；
- 安装 Playwright Chromium 后，目录、详情、语言切换、比较路由、RSS 和旧图兼容共 6 个 smoke tests 通过；
- GitHub Pages 已成功部署，CI 与 Deploy workflow 最新运行成功；
- Architecture IR、Evidence Ledger、DiagramScene、布局与 SVG renderer 已形成明确模块边界；
- SVG 保留文本和语义 data attributes，具备继续做证据联动的基础。

### 3.2 页面基础

- 目录页搜索、family 筛选和排序可用，URL 状态可复现；
- 英文/中文切换可用并能持久化；
- 详情页能展示生成图、Fact sheet、Genome 和 Evidence；
- 手机目录页为单列卡片，基础阅读体验正常；
- 设计清爽、克制，没有复制参考 Gallery 的图片或原版构图。

## 4. 关键发现

### 4.1 P0：模型事实与来源不可信

Qwen3-Next：

- 官方 config：48 层、16 attention heads、2 KV heads、full_attention_interval=4；
- 当前 IR：32 attention heads、16 KV heads；
- 当前 attention groups 只覆盖 24/48 层，另外 24 层落为 unknown；
- 正确模式应是每四层中三层 Gated DeltaNet、一层 full attention，而不是 12+12。

Kimi Linear：

- 当前 evidence 指向不存在的 moonshotai/Kimi-Linear-48B-A3B；
- 官方可核验仓库为 moonshotai/Kimi-Linear-48B-A3B-Instruct；
- 官方 config：27 层、hidden 2304、vocab 163840、256 experts、8 active；
- 当前 IR：48 层、hidden 2048、vocab 151936、512 experts、6 active；
- 当前 attention groups 同样只覆盖一半层数。

跟踪：[Issue #20](https://github.com/Liears/llm-architecture-atlas/issues/20)

### 4.2 P0：证据承诺存在假阳性

- 五个非 GLM 模型展示 active_params，但 evidence 中没有对应 claim；
- embedding 节点同时显示 hidden 与 vocab，却只挂 hidden_size claim；
- MoE 节点同时显示 routed、active、shared，却只挂 routed_total claim；
- Context 节点同时显示 context、total params、active params，却只挂 context claim；
- 当前门禁只检查“含数字的节点是否至少有一个 claim”，因此无法发现以上遗漏。

这直接违反页面上的“Every visible number resolves to one of these claims”。

跟踪：[Issue #21](https://github.com/Liears/llm-architecture-atlas/issues/21)

### 4.3 P0：详情页参数单位错误

GLM 详情页将 320B 显示为 0.3B total / 18B active。原因是 total_params 除以 1e12 后仍拼接 B。目录、详情、比较和 compiler 分别维护 formatter，已经发生逻辑漂移。

跟踪：[Issue #22](https://github.com/Liears/llm-architecture-atlas/issues/22)

### 4.4 P0：本地与跨平台验收不可复现

- Windows 运行 pnpm export:golden 时路径被拼成 D:/D:/Work/...，直接 ENOENT；
- 新环境直接运行 README 中的 pnpm pytest 会因 atlas_ingest 未安装而在 collection 阶段失败；
- 使用 PYTHONPATH 后，43 个 Python tests 中有 schema drift test 失败，说明 schema 输出受到未锁定 Pydantic 版本影响；
- 本地系统 pnpm 与 packageManager 版本不同时，onlyBuiltDependencies 会被忽略；
- CI 没有 regenerate golden 后检查 git diff，也没有运行全目录 validate_model。

跟踪：[Issue #23](https://github.com/Liears/llm-architecture-atlas/issues/23)

### 4.5 P0：GLM 图仍是摘要，而不是结构图

当前图只包含 token、embedding、decoder stack、norm、output 五节点主链，以及 attention、MoE、mHC、context 四个摘要框：

- 没有四条 mHC stream；
- 没有 residual/skip edge；
- 没有 merge/router 的输入输出关系；
- 没有从前三层 Dense 切换到后 42 层 MoE 的结构；
- 没有逐层 KDA 与 MLA/DSA 模式；
- 证据只挂在摘要节点，不能定位到关键边或子模块。

这与原 #6 的“mHC 四流完整表达、关键连线有证据”仍有明显差距。

跟踪：[Issue #24](https://github.com/Liears/llm-architecture-atlas/issues/24)

### 4.6 P1：Compare Genome 在浏览器中不可见

真实 DOM 中存在 90 个 gcell，但计算样式为 width: 0px、height: 0px。flex shrink 把单元格压缩为零。

此外 compare 当前只保留 attention label：

- 不比较 FFN/MoE；
- 通过 as never 构造不完整 GenomeLayer；
- 非空单元格几乎都使用同一种 attention 色；
- 用户只能打开一个固定示例，没有任意双模型选择入口。

跟踪：[Issue #25](https://github.com/Liears/llm-architecture-atlas/issues/25)

### 4.7 P1：详情页没有真正下钻

原计划要求 Overview、Block、Attention、MoE、Evidence 之间联动。目前只有静态 overview img、不可交互的 Genome 色块和完整 Evidence 表。

缺少：

- 选择某一层查看完整结构；
- hover 路径聚焦；
- Attention/FFN/MoE 子视图；
- 选择节点后过滤证据；
- 键盘选择状态与 reduced-motion 处理。

跟踪：[Issue #26](https://github.com/Liears/llm-architecture-atlas/issues/26)

### 4.8 P1：移动端整页横向溢出

390px 测试中：

- document clientWidth：375px；
- document scrollWidth：684px；
- Evidence table 宽度约 664px。

现有视觉测试只截图详情页中的生成 SVG，不截图页面，因此无法发现表格、标题、导航或比较区的布局问题。

跟踪：[Issue #27](https://github.com/Liears/llm-architecture-atlas/issues/27)

### 4.9 P1：六张生成图结构同质化

六张 generated SVG 都是：

- 9 个 nodes；
- 8 个 claim attributes；
- 文件大小约 5.8KB；
- 相同的主链和四个横向摘要框。

当前实现证明了 IR → Scene → SVG 的主链能够工作，但尚未证明 Diagram IR 可以表达不同模型的真实结构，也没有达到“逻辑分析仪 + 工程蓝图”的视觉目标。

跟踪：[Issue #28](https://github.com/Liears/llm-architecture-atlas/issues/28)

## 5. 两轴代码审查

### 5.1 Standards

硬性问题：

1. 五个非 GLM 模型的 active_params 被详情页展示但无 evidence claim，违反 CONTRIBUTING.md 中“每个 UI 字段必须有 claim”的规则。
2. CI 未执行 export:golden 后的 clean-diff 检查，视觉回归只覆盖 GLM，因此手改其他 generated SVG 仍可能通过 CI，未完全落实“生成文件禁止手改”。

判断性代码味道：

1. 参数格式化在目录、详情和 compare 中重复实现，已经出现 320B → 0.3B 的漂移，属于 Duplicated Code。

### 5.2 Spec

1. #6 部分实现：GLM mHC 只有文字摘要，无四流 residual/skip 拓扑。
2. #7/#11 部分实现：Qwen/Kimi 层覆盖错误，而 CI 未执行已有的全目录结构验证。
3. #9 部分实现：模型页没有 Block、Attention、MoE 下钻和证据联动。
4. #10 部分实现：compare 只比 attention，FFN/特殊模块没有进入 diff，且可见 cell 被压为零。
5. #12 偏离实现：计划采用 resvg 的稳定 PNG 导出，当前改为浏览器 Canvas；视觉可接受但跨环境输出不可复现。
6. 中英文切换是有价值的计划外功能，但它不应挤占 P0 事实与图形质量门禁。

## 6. 依赖图

    #20 模型真值 ─────┬──→ #21 证据门禁 ──→ #24 GLM 完整拓扑 ──┐
                      │                                        │
                      └──→ #25 Genome 双轨比较 ──→ #26 层下钻 ├──→ #28 差异化模板
                                                               │
    #22 单位 formatter ─────────────────────────────────────────┤
                                                               │
    #23 可复现验收 ───────────────→ #27 响应式/页面视觉回归 ────┘

## 7. 落地计划

### Phase A：恢复可信度与可复现性

#### Task A1：修正 Qwen/Kimi 真值

- Issue：[20](https://github.com/Liears/llm-architecture-atlas/issues/20)
- 验收：官方 repo/revision 固定；每个事实与 locator 一致；所有层恰好覆盖一次。
- 验证：全目录 validate_model、重新生成 artifacts、人工核对官方 config。
- 范围：M。

#### Task A2：建立逐 Claim 发布门禁

- Issue：[21](https://github.com/Liears/llm-architecture-atlas/issues/21)
- 验收：所有 UI 字段和图中文字逐项有 claim；缺 claim 时隐藏或 fail build；CI 有负例。
- 验证：移除任一已展示 claim 后测试必须失败。
- 依赖：A1。
- 范围：M。

#### Task A3：统一数值 formatter

- Issue：[22](https://github.com/Liears/llm-architecture-atlas/issues/22)
- 验收：目录、详情、比较、SVG 的 B/T/K/M 表示一致。
- 验证：8B、46.7B、320B、1T、null 边界测试。
- 范围：S。

#### Task A4：修复跨平台开发闭环

- Issue：[23](https://github.com/Liears/llm-architecture-atlas/issues/23)
- 验收：Windows/Linux 一键 bootstrap + verify；schema 可复现；golden regenerate 后 clean diff。
- 验证：两个 runner 执行同一命令。
- 范围：M。

### Checkpoint A

- 六模型事实经官方来源复核；
- 模型结构和 evidence coverage 均为零错误；
- 所有测试命令能从干净 clone 执行；
- Windows/Linux regenerate 后 git diff 为空；
- GLM 详情显示 320B，而不是 0.3B。

### Phase B：兑现核心架构体验

#### Task B1：GLM 完整拓扑

- Issue：[24](https://github.com/Liears/llm-architecture-atlas/issues/24)
- 验收：显式 mHC 四流、KDA/MLA-DSA、Dense→MoE、residual/route 边与证据。
- 验证：结构快照、三 viewport 截图、人工 rubric。
- 依赖：A2。
- 范围：M。

#### Task B2：Genome 双轨比较

- Issue：[25](https://github.com/Liears/llm-architecture-atlas/issues/25)
- 验收：cell 可见；Attention/FFN 双轨；same/different/unknown/padding 可区分；任意双模型可选。
- 验证：DOM 宽高断言、Qwen/GLM/Llama 比较截图。
- 依赖：A1。
- 范围：M。

#### Task B3：层下钻与证据联动

- Issue：[26](https://github.com/Liears/llm-architecture-atlas/issues/26)
- 验收：Genome 选择驱动 Block/Attention/FFN 子图与 Evidence panel。
- 验证：鼠标、键盘、reduced-motion E2E。
- 依赖：B1、B2。
- 范围：M。

### Checkpoint B

- GLM 图不再依靠四个摘要框代替拓扑；
- 用户能从 Genome 定位某层并追到具体证据；
- 任意两个模型可按 Attention 与 FFN 层模式比较；
- 键盘可以完成选择、切换和返回。

### Phase C：页面质量与差异化视觉

#### Task C1：响应式与页面级视觉回归

- Issue：[27](https://github.com/Liears/llm-architecture-atlas/issues/27)
- 验收：390px 无 document 级横向溢出；三类页面均有页面级快照；Windows/Linux 策略一致。
- 验证：document scrollWidth 断言与三 viewport Playwright。
- 依赖：A4。
- 范围：S/M。

#### Task C2：差异化语义模板

- Issue：[28](https://github.com/Liears/llm-architecture-atlas/issues/28)
- 验收：Dense、MoE、MLA、Hybrid Linear、mHC 五种结构由 IR 驱动；六图不再同构。
- 验证：结构快照、六模型 contact sheet、人工 rubric。
- 依赖：A1、A2、B1。
- 范围：M，按模板拆成小提交。

### Checkpoint C

- 桌面、平板、手机页面均无阻塞布局问题；
- 六张图一眼可见真实架构差异；
- 数据流、控制流、残差流和不确定性不只依赖颜色；
- 每张图同时通过 Schema、Structural、Visual、Human 四类门禁。

## 8. 如何在视觉上真正超过参考 Gallery

目标不应是“把当前框画得更精致”，而是让图比静态海报提供更多信息密度和可验证性。

### 8.1 三层信息结构

1. Overview：回答模型整体由什么组成；
2. Layer/Block：回答某层内部数据如何流动；
3. Tensor/Evidence：回答维度、路由和每个事实从哪里来。

Overview 必须保持简洁，但不能用文字摘要替代关键拓扑。复杂性通过可选择的下钻承担。

### 8.2 模板是语义组件，不是固定版式

需要建立以下可组合模板：

- Dense decoder + MHA/GQA；
- MoE router + routed/shared experts；
- MLA latent KV path；
- Linear/recurrent attention state path；
- Hybrid attention layer schedule；
- mHC multi-stream residual；
- MTP/speculative heads。

每个模板定义节点、端口、允许的边、证据槽位与布局约束，再由 ELK/自定义布局求坐标。

### 8.3 视觉语言

- 主数据流：实线、有方向箭头；
- residual/skip：较细弧线或独立 rail；
- router/control：短虚线；
- inferred/unknown：纹理或点划线，并显示状态；
- Attention、State、Compute 使用既定蓝/青/橙，但同时配合形状和标签；
- 层编号、tensor shape、claim locator 使用等宽字体；
- 模型族 accent 只用于小面积识别，不改变全局语义色。

### 8.4 比参考 Gallery 多出的价值

- 每层 Genome 可选择；
- 两模型逐层对齐；
- 节点和边能追溯到 evidence claim；
- 冲突与推断显式可见；
- SVG 可复制、可搜索、可访问；
- 同一 IR 可生成 overview、block、attention、moe 和 tensor 多视图。

## 9. 测试现状与目标

| Gate | 当前结果 | 目标 |
|---|---|---|
| pnpm build | 通过，23 pages | 持续通过 |
| pnpm typecheck | 通过，0 warnings | 持续通过 |
| Vitest | 52/52 通过，但 AJV date format 被忽略 | 0 errors / 0 warnings |
| Python tests | 新环境 import 失败；PYTHONPATH 模式 43 pass / 1 schema drift fail | 干净 clone 一条命令全绿 |
| Model validation | Qwen/Kimi 各缺 24 attention layers | 六模型零错误 |
| Playwright smoke | 安装 Chromium 后 6/6 通过 | 持续通过 |
| Visual regression | Windows 缺 baseline，3/3 失败 | 跨平台策略明确且全绿 |
| Mobile layout | 375 client / 684 scroll | document 无横向溢出 |
| Golden export | Windows D:/D:/ 路径失败 | Windows/Linux 输出相同 |

## 10. 完成定义

新的 hardening 路线只有在以下条件同时成立时才能关闭：

- 六模型事实与官方来源一致；
- 所有可见数字、结构节点和关键边均有精确 claim；
- Qwen/Kimi 不存在 missing/duplicated layer；
- GLM mHC/MoE/KDA-MLA 以结构而非摘要文字表达；
- Genome 与 compare 在三个 viewport 可见且可操作；
- 模型页支持至少四级视图和证据联动；
- Windows/Linux 均可从干净 clone 完成 verify；
- 六模型通过结构快照、页面视觉快照和人工视觉 rubric；
- GitHub Pages 部署与 CI 同时保持绿色。
