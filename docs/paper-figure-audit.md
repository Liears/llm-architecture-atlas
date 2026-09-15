---
type: source
title: GLM-5.3-Flash 论文、官方配置与架构图复核
tags:
  - llm-architecture
  - glm
  - diagram-audit
  - primary-sources
sources:
  - https://huggingface.co/zai-org/GLM-5.3-Flash/blob/eb9eb208eb0d988989d07a6a12d0fdeb5f52574a/config.json
  - https://arxiv.org/abs/2602.15763v2
  - https://arxiv.org/abs/2510.26692
  - https://arxiv.org/abs/2512.02556
  - https://arxiv.org/abs/2512.24880
created: 2026-09-15
updated: 2026-09-15
---

# GLM-5.3-Flash 论文、官方配置与架构图复核

## 结论

当前 generated SVG 不是 GLM-5.3-Flash 的架构图，而是一张带参数摘要的五节点流水线。它提到了 KDA、MLA/DSA、MoE 和 mHC，却没有把这些机制的输入、输出、层调度、路由和残差关系画出来。更严重的是，当前 `architecture.json` 把 0–33 层连续标成 KDA、34–44 层连续标成 MLA/DSA；官方配置实际是每四层 `K,K,K,D`，重复 11 次后再接 1 个 KDA 层。视觉上的“死板”是错误的结构模型被进一步过度压缩的结果，不应通过换颜色、圆角或自动布局来掩盖。

此外，当前图中的 `vocab 155,136` 与复核时锁定的官方配置 `154,880` 不一致；`evidence.json` 用 GLM-5 报告中的 `architecture table`、`FFN section` 和 `mHC section` 为 Flash 的 attention/FFN/mHC 背书，但这些定位不能证明对应的 Flash 事实，其中 `mHC section` 并不存在。这些都属于事实/证据错误，而非视觉偏好。

## 来源优先级与适用边界

| 等级 | 来源 | 精确定位 | 能证明什么 | 不能证明什么 |
|---|---|---|---|---|
| P0 | [GLM-5.3-Flash 官方 config，revision `eb9eb20…`](https://huggingface.co/zai-org/GLM-5.3-Flash/blob/eb9eb208eb0d988989d07a6a12d0fdeb5f52574a/config.json) | `text_config` 下的 `layer_types`、`mlp_layer_types`、`linear_attn_config`、`hc_mult`、expert、vocab/context 字段 | Flash 的精确层数、层调度、mHC stream 数、MoE 数量、hidden/head/vocab/context 等 | 机制内部为什么这样设计、矩阵计算细节 |
| P1 | [GLM-5 技术报告 v2](https://arxiv.org/abs/2602.15763v2) | §2.1 Architecture；§2.1.1 DSA；PDF pp.4–6 | GLM-5 系列采用 MLA/DSA 的背景与 DSA continued pre-training | GLM-5.3-Flash 的 320B/18B、45 层、mHC；报告正文模型是 744B/40B active、80 层 |
| P1 | [Kimi Linear 技术报告](https://arxiv.org/abs/2510.26692) | §4；Figure 3，PDF p.6；§5.2/Table 1，PDF p.8 | KDA 的 Q/K/V ShortConv、channel-wise decay、输出 gate，以及 3:1 KDA/MLA 混合块的机制 | GLM-5.3-Flash 的精确参数；仅为 `mechanism-only` |
| P1 | [DeepSeek-V3.2 技术报告](https://arxiv.org/abs/2512.02556) | §2.1；Figure 2，PDF pp.3–4 | DSA 在 MLA 上的 Lightning Indexer、Top-k selector 与被选 KV 路径 | GLM-5.3-Flash 的精确层表；仅为 `mechanism-only` |
| P1 | [mHC 论文](https://arxiv.org/abs/2512.24880) | Figure 1(c)，PDF p.1；§3–§4 | 多 residual streams，以及 pre/read、res/mix、post/write 三类映射 | GLM 使用几路 stream；四路必须由官方 config 的 `hc_mult=4` 证明 |
| P2 | [Raschka Gallery 的 GLM-5.3-Flash 图](https://www.sebastianraschka.com/llm-architecture-gallery/images/architectures/thumbnails/glm-5.3-flash.webp) | 整图 | 信息层级、构图密度、注释方式的视觉比较 | 任何需要发布为 `verified` 的事实；第三方图可能取整或滞后 |

## 官方配置快照

复核时间：2026-09-15。锁定 revision：`eb9eb208eb0d988989d07a6a12d0fdeb5f52574a`。

| 结构事实 | 官方值 | Locator | 当前图状态 |
|---|---:|---|---|
| decoder layers | 45 | `$.text_config.num_hidden_layers` | 只有一个 `Decoder stack ×45` 容器 |
| attention schedule | 34 KDA + 11 DSA/MLA，按 `K,K,K,D` 交错后再接 `K` | `$.text_config.layer_types`、`linear_attn_config.kda_layers/full_attn_layers` | IR 错写成前 34 层 KDA + 后 11 层 DSA；图又只剩横向摘要卡 |
| KDA heads / head dim | 64 / 128 | `$.text_config.linear_attn_config.num_heads/head_dim` | heads 未在 KDA 子图表达 |
| KDA ShortConv | kernel 4 | `$.text_config.linear_attn_config.short_conv_kernel_size` | 完全缺失 |
| DSA indexer | 32 heads、dim 128、Top-k 2048 | `index_n_heads/index_head_dim/index_topk` | Lightning Indexer 与 Top-k KV 路径完全缺失 |
| residual topology | mHC enabled，4 streams | `mhc`、`hc_mult` | 只有 `4 parallel streams` 文案；无四线、读入/混合/写回 |
| FFN schedule | 前 3 Dense，后 42 Sparse MoE | `first_k_dense_replace`、`mlp_layer_types` | 只有一句 `3 dense + 42 MoE` |
| MoE routing | 288 routed，Top-8，1 shared | `n_routed_experts/num_experts_per_tok/n_shared_experts` | 只有摘要；无 router、fan-out/fan-in 与 shared path |
| hidden size | 4,096 | `hidden_size` | 已显示 |
| vocabulary | 154,880 | `vocab_size` | 错写为 155,136 |
| context | 1,048,576 | `max_position_embeddings` | 以 1M 取整，必须在详情/evidence 提供精确值 |
| MTP | 1 prediction layer | `num_nextn_predict_layers` | overview 未说明省略，也没有单独视图 |

## 当前 Atlas 与 Gallery 的视觉/结构差距

| 维度 | 当前 Atlas generated SVG | Gallery GLM 图 | Atlas 应达到的目标 |
|---|---|---|---|
| 主干 | token→embedding→单个 stack→norm→output | 中央竖向 decoder block，attention/FFN 与残差相对位置清楚 | 保留清晰主干，同时支持选层下钻 |
| 层调度 | `34 KDA ⇄ 11 MLA/DSA` 文案 | 左侧层数注释，主 block 标出 attention 类型 | Genome 精确绘制 45 列 `K,K,K,D`，点击映射到 block |
| mHC | 一个 `4 parallel streams` 框 | 主 block 有 residual rail，另有四路读/混/写 inset | 四条可追踪 stream + pre/res/post mixer 端口和边 |
| MoE | `288 / 8 + 1` 文案 | router、shared/routed experts、fan-out/fan-in | 独立 MoE 子图，明确 shared path 与 Top-8 路由 |
| Attention | 只有类型名 | attention block 有 KDA 或 MLA+DSA 标签 | KDA 与 DSA 两套不同模板；DSA 至少画 indexer→Top-k→selected KV→MLA core |
| 信息层级 | 所有机制同级排成横向卡片 | overview、局部机制、参数注释有明显层级 | Overview 保持简洁，Block/Attention/MoE/Tensor 分层承载复杂度 |
| 证据 | claim 只挂在摘要节点 | 无字段级证据 | 节点、边和数字可点到固定 revision + 精确 locator |
| 精确性 | vocab 错；论文 locator 不存在 | vocab/context 使用近似取整 | overview 可取整但显式 `≈`；详情与 evidence 显示精确值 |

Gallery 明显比当前图更像结构图，但它仍是静态海报。Atlas 要超过它，优势不应只是“更漂亮”，而应是：固定来源、精确值、逐层 Genome、分级下钻、节点/边证据联动、冲突可见、可访问 SVG 和双模型逐层比较。

## GLM 必须实现的 paper-to-diagram map

| 视图 | 必备节点/边 | 主要证据 |
|---|---|---|
| Overview | token、embedding、45-layer decoder、final norm、LM head；MTP 以节点或显式 omitted annotation 表达 | GLM 官方 config |
| Genome | 45 个 attention cell：`K,K,K,D` 重复 11 次后 `K`；45 个 FFN cell：`Dense×3, MoE×42` | `layer_types`、`mlp_layer_types` |
| Block | RMSNorm→attention→mHC mixer→RMSNorm→FFN/MoE→mHC mixer；四路 residual rail 全程存在 | 官方 config + mHC Fig.1(c)/§4 |
| KDA | Q/K/V projections、kernel-4 ShortConv、channel-wise decay/state、output gate/norm | 官方 config + Kimi Linear §4/Fig.3 |
| MLA+DSA | latent KV path、Lightning Indexer、Top-k 2048 selector、selected KV→core attention、output | 官方 config + DeepSeek-V3.2 §2.1/Fig.2 |
| MoE | router、288 routed experts、Top-8 active、1 shared expert、fan-out/fan-in | GLM 官方 config；路由形态由官方实现复核 |
| Evidence | 每个数字、重复计数、非显然边能打开固定 revision 与精确 locator | Evidence Ledger + source lock |

## 审图门禁

1. 先批准 Architecture Brief，后进入 Diagram IR；不允许从模型名直接提示 LLM 生成最终 SVG。
2. 结构测试断言节点、端口、边、层覆盖与 repetition，而不是只断言文本包含 `KDA`/`mHC`。
3. 论文必须标明 `model-specific` 或 `mechanism-only`，并附 Figure/Table/Section/PDF page。找不到模型专属论文时写明缺失，用官方 config/code 兜底。
4. 第三方图只能用于视觉 rubric；如果它与固定官方配置冲突，以官方配置为准，并在图中标注近似/冲突。
5. Human review 必须回答：数据流能否顺着箭头读完、四路 residual 是否真的可追踪、router 的选择与汇聚是否可见、KDA 与 DSA 是否仅凭形状就能区分。

## 限制

- GLM-5.3-Flash 当前挂接的 GLM-5 报告不是专属结构论文，因此 Flash 的精确值主要依赖固定 revision 的官方配置和官方实现。
- `320B / 18B active` 在当前 config 中不是结构字段；发布前还应锁定官方 model card 的对应 revision，并将参数口径与 MoE active-expert 口径分开。
- 本文只完成来源与图形语义审计，不替代后续对 Transformers/官方 modeling code 的逐行实现复核。
