---
type: decision
title: Kimi Linear 48B-A3B hybrid KDA + MLA + MoE template verification
tags:
  - llm-architecture
  - diagram-engine
  - kimi-linear
created: 2026-11-25
updated: 2026-11-25
---

# Kimi Linear 48B-A3B Hybrid Attention & MoE Verification (`Refs #39`)

## Source Contract

- **Exact model config**: [config.json @ `e1df551a447157d4658b573f9a695d57658590e9`](https://huggingface.co/moonshotai/Kimi-Linear-48B-A3B-Instruct/raw/e1df551a447157d4658b573f9a695d57658590e9/config.json) (SHA256 `a6ac3c2c4b5aa72370f9727f49ffa4432715d20061889acdb37c688be853096e`).
- **Official model implementation**: [modeling_kimi.py @ `e1df551a447157d4658b573f9a695d57658590e9`](https://huggingface.co/moonshotai/Kimi-Linear-48B-A3B-Instruct/raw/e1df551a447157d4658b573f9a695d57658590e9/modeling_kimi.py) (`KimiMLAAttention` L335-380, `KimiDeltaAttention` L444-504, `KimiDecoderLayer` L783-815).
- **Model-specific paper**: [Kimi Linear (arXiv:2510.26692)](https://arxiv.org/abs/2510.26692), §4, Figure 3 (PDF p.6), §5.2 / Table 1 (PDF p.8).

## Paper-to-Diagram Map

| Region | Diagram Elements | Exact Source Evidence |
|---|---|---|
| Main Spine | `Token ids -> Token embedding (2,304d) -> Decoder stack (27L) -> Final RMSNorm -> LM head (163,840 vocab)` | `facts.hidden_size`, `facts.num_hidden_layers`, `facts.vocab_size` |
| Layer Schedule | `L0–3 (K,K,K,M · Dense→MoE)`, `L4–23 ((K,K,K,M) ×5 · MoE)`, `L24–26 (K,K,M · MoE tail)` | `$.linear_attn_config`, `$.first_k_dense_replace=1`, `modeling_kimi.py:799-805` |
| KDA Subtopology | 4-node recurrence pipeline: `Q/K/V ShortConv (k=4)` -> `KDA Decay Gate (A_log/dt)` -> `Delta State (20L)` -> `Output Gate (32 heads · d=128 · o_norm)` | `$.linear_attn_config`, `modeling_kimi.py:444-504`, Paper §4/Fig.3 |
| MLA Subtopology | 3-node compressed latent bypass: `Latent KV (512d)` -> `RoPE/NoPE` -> `MLA Attention (7L)` + bypass rail | `$.kv_lora_rank=512`, `$.qk_rope_head_dim=64`, `$.mla_use_nope=true`, `modeling_kimi.py:344-379` |
| Sparse MoE | `Router (top-8)` -> `Routed Experts (256 total, top-8)` + `Shared Expert (1 always-on)` -> `⊕ Merge` | `$.num_experts`, `$.num_experts_per_token`, `$.num_shared_experts=1` |

## Reuse & Structural Guarantees

- Rendered with the shared model-neutral `compileAutoregressivePoster()` (`editorial-overview.ts`) and `buildPosterGridBlueprint()` (`poster-grid.ts`), plus `compileLayerBlockSubview()` (`subview-compiler.ts`) for per-layer drill-down (`L0`, `L3`, `L26`).
- Zero `model-id` conditionals in `packages/renderer-svg/src/render.ts`.
- Verified non-isomorphic KDA vs MLA graphs with all labels stripped (`kimi-anatomy.test.ts`).
