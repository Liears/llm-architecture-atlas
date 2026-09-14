"""Config extraction adapters (issue #14): HF config.json -> evidence claims.

Family detection drives the field mapping; unknown families still yield the
generic claims. Every claim is `reported` with a locator pointing into the
source config, and flows through the Evidence Ledger — never straight to
production data.
"""

from __future__ import annotations

from typing import Any

from .ir import Claim, ClaimStatus, SourceKind, SourceRef

FAMILY_HINTS: dict[str, str] = {
    "deepseek": "deepseek",
    "kimi": "kimi",
    "glm": "glm",
    "mixtral": "mixtral",
    "qwen": "qwen",
    "llama": "llama",
}


def detect_family(config: dict[str, Any]) -> str:
    arch = str(config.get("architectures", [""])[0]).lower()
    for hint, family in FAMILY_HINTS.items():
        if hint in arch or hint in str(config.get("model_type", "")).lower():
            return family
    return "generic"


def claims_from_hf_config(config: dict[str, Any], url: str, revision: str = "main") -> list[Claim]:
    family = detect_family(config)
    src = SourceRef(kind=SourceKind.hf_config, url=url, revision=revision)

    def c(path: str, value: Any, locator: str, status: ClaimStatus = ClaimStatus.reported) -> Claim:
        return Claim(
            path=path, value=value, status=status,
            source=SourceRef(kind=src.kind, url=src.url, revision=src.revision, locator=locator),
        )

    def get(*names: str) -> Any:
        for n in names:
            if n in config:
                return config[n]
        return None

    out: list[Claim] = []
    layers = get("num_hidden_layers")
    if layers is not None:
        out.append(c("facts.num_hidden_layers", layers, "$.num_hidden_layers"))
    hidden = get("hidden_size")
    if hidden is not None:
        out.append(c("facts.hidden_size", hidden, "$.hidden_size"))
    heads = get("num_attention_heads")
    if heads is not None:
        out.append(c("facts.num_attention_heads", heads, "$.num_attention_heads"))
    kv = get("num_key_value_heads")
    if kv is not None:
        out.append(c("facts.num_key_value_heads", kv, "$.num_key_value_heads"))
    else:
        out.append(Claim(path="facts.num_key_value_heads", value=None, status=ClaimStatus.unknown))
    vocab = get("vocab_size")
    if vocab is not None:
        out.append(c("facts.vocab_size", vocab, "$.vocab_size"))
    ctx = get("max_position_embeddings")
    if ctx is not None:
        out.append(c("facts.context_tokens", ctx, "$.max_position_embeddings"))

    routed = get("n_routed_experts", "num_local_experts")
    active = get("num_experts_per_tok")
    shared = get("n_shared_experts")
    if routed is not None:
        out.append(c("topology.experts.routed_total", routed, "$.n_routed_experts|$.num_local_experts"))
        out.append(c("topology.experts.active_routed", active, "$.num_experts_per_tok"))
        out.append(c("topology.experts.shared", shared, "$.n_shared_experts"))

    # attention family classification
    if family == "deepseek" or get("kv_lora_rank") is not None:
        out.append(c("topology.attention.type", "mla", "$.kv_lora_rank"))
    elif kv is not None and heads is not None and kv < heads:
        out.append(c("topology.attention.type", "gqa", "$.num_key_value_heads"))
    elif kv is not None:
        out.append(c("topology.attention.type", "mha", "$.num_key_value_heads"))
    return out
