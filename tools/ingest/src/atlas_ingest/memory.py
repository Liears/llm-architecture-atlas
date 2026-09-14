"""Memory & KV-cache calculator (issue #17). Formulas with sources:

- KV cache per token, MHA/GQA (bf16/fp16, 2 = K and V):
    2 * layers * kv_heads * head_dim * bytes
  Source: standard transformer KV cache identity (HF docs, "KV cache" section).
- KV cache per token, MLA (DeepSeek-style), compressed latent:
    layers * (kv_lora_rank + rope_dim) * bytes
  Source: DeepSeek-V2/V3 tech report, MLA section (compressed KV + decoupled RoPE).
- Weights memory: total_params * bytes.
- Forward FLOPs per token (estimate, dense/MoE active params):
    2 * active_params
  Source: "Arithmetic intensity" rule of thumb (2 FLOPs per parameter per token);
  EXCLUDES attention score FLOPs -> labelled estimate.

Results distinguish exact vs estimate: `exact` is True only for pure
parameter-count formulas without attention-term estimates.
"""

from __future__ import annotations

from typing import Any

BYTES_PER_PARAM = {"bf16": 2, "fp16": 2, "fp32": 4, "int8": 1, "int4": 0.5}


def kv_cache_per_token_bytes(
    *,
    layers: int,
    kv_heads: int | None,
    head_dim: int,
    dtype: str = "bf16",
    mla_kv_lora_rank: int | None = None,
    mla_rope_dim: int | None = None,
) -> dict[str, Any]:
    byp = BYTES_PER_PARAM[dtype]
    if mla_kv_lora_rank is not None:
        per = layers * (mla_kv_lora_rank + (mla_rope_dim or 0)) * byp
        return {"bytes": per, "exact": True, "formula": "layers * (kv_lora_rank + rope_dim) * bytes"}
    if kv_heads is None:
        return {"bytes": None, "exact": False, "formula": "unknown (kv_heads not reported)"}
    per = 2 * layers * kv_heads * head_dim * byp
    return {"bytes": per, "exact": True, "formula": "2 * layers * kv_heads * head_dim * bytes"}


def weights_memory_bytes(total_params: int, dtype: str = "bf16") -> dict[str, Any]:
    return {"bytes": total_params * BYTES_PER_PARAM[dtype], "exact": True, "formula": "total_params * bytes"}


def forward_flops_per_token(active_params: int) -> dict[str, Any]:
    return {"flops": 2 * active_params, "exact": False, "formula": "2 * active_params (excludes attention scores)"}


def memory_report(arch: dict[str, Any], dtype: str = "bf16") -> dict[str, Any]:
    facts = arch["facts"]
    head_dim = facts.get("head_dim")
    hidden = facts["hidden_size"]
    heads = facts["num_attention_heads"]
    kv = facts.get("num_key_value_heads")
    kv_report = kv_cache_per_token_bytes(
        layers=facts["num_hidden_layers"],
        kv_heads=kv,
        head_dim=head_dim or hidden // heads if hidden % heads == 0 else hidden,
        dtype=dtype,
        mla_kv_lora_rank=facts.get("kv_lora_rank"),
        mla_rope_dim=facts.get("rope_dim"),
    )
    return {
        "dtype": dtype,
        "kv_cache_per_token": kv_report,
        "weights": weights_memory_bytes(facts["total_params"], dtype) if facts.get("total_params") else None,
        "forward_flops_per_token": forward_flops_per_token(facts["active_params"]) if facts.get("active_params") else None,
    }
