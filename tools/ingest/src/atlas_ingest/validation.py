"""Structural validation rules (docs/development-plan.md §5.3).

Every rule returns a human-readable error string; an empty list means the
document is structurally sound. Evidence-level coverage (every visible number
resolves to a claim) is checked at render time in issue #6/#7.
"""

from __future__ import annotations

from collections import Counter

from .ir import ModelDocument


def validate_model(doc: ModelDocument) -> list[str]:
    errors: list[str] = []
    facts, topo = doc.facts, doc.topology
    n = facts.num_hidden_layers

    if facts.head_dim is None and facts.hidden_size % facts.num_attention_heads != 0:
        errors.append(
            f"hidden_size ({facts.hidden_size}) not divisible by num_attention_heads "
            f"({facts.num_attention_heads}); set head_dim to override explicitly"
        )

    if facts.num_key_value_heads is not None and facts.num_key_value_heads > facts.num_attention_heads:
        errors.append(
            f"num_key_value_heads ({facts.num_key_value_heads}) exceeds "
            f"num_attention_heads ({facts.num_attention_heads})"
        )

    if topo.experts is not None:
        e = topo.experts
        if e.routed_total is not None and e.active_routed is not None and e.active_routed > e.routed_total:
            errors.append(
                f"active_routed ({e.active_routed}) exceeds routed_total ({e.routed_total})"
            )

    _check_group_coverage(topo.attention_groups, n, "attention", errors)
    _check_group_coverage(topo.ffn_groups, n, "ffn", errors)
    return errors


def _check_group_coverage(groups, n: int, kind: str, errors: list[str]) -> None:
    """Layers covered exactly once by the groups of one kind."""
    seen: Counter[int] = Counter()
    for g in groups:
        for idx in g.layers:
            if not 0 <= idx < n:
                errors.append(f"{kind} group {g.label!r}: layer index {idx} out of range [0, {n})")
            else:
                seen[idx] += 1
    duplicated = sorted(i for i, c in seen.items() if c > 1)
    if duplicated:
        errors.append(f"{kind} group coverage: layers covered more than once: {duplicated}")
    missing = sorted(set(range(n)) - set(seen))
    if missing:
        errors.append(f"{kind} group coverage: {len(missing)} layer(s) not covered by any group")
