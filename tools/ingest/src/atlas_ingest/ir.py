"""Architecture IR v0.1 — Pydantic source of truth.

Three layers (docs/development-plan.md §5.1):

- ``ModelFacts``: scalar facts (params, layers, dimensions, context, license)
- ``ModelTopology``: modules, layer groups, experts, residual scheme
- ``EvidenceLedger``: every claim with source, locator and status

The IR never stores pixel coordinates or colors. Layout hints must stay
semantic (``direction``, ``emphasize``, ``group``) — those live in the
Diagram IR (issue #4), not here.
"""

from __future__ import annotations

from datetime import date as Date
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

IR_VERSION = "0.1.0"


class ClaimStatus(str, Enum):
    """Evidence status of a claim (docs/development-plan.md §5.2)."""

    verified = "verified"  # multiple authoritative sources agree / manually checked
    reported = "reported"  # single official source states it
    derived = "derived"  # computed by a reproducible formula
    inferred = "inferred"  # rule/LLM inference, awaiting review
    conflict = "conflict"  # sources disagree
    unknown = "unknown"  # no reliable evidence yet


class SourceKind(str, Enum):
    hf_config = "hf_config"
    source_code = "source_code"
    tech_report = "tech_report"
    model_card = "model_card"
    manual = "manual"
    derived = "derived"


class SourceRef(BaseModel):
    """Where a claim comes from, down to a stable locator."""

    model_config = ConfigDict(extra="forbid")

    kind: SourceKind
    url: str | None = None
    revision: str | None = None  # commit sha / tag of the source
    locator: str | None = None  # JSONPath, file:line, table reference
    hash: str | None = None  # content hash when the source was snapshotted


class Claim(BaseModel):
    """A single statement about the model with its evidence."""

    model_config = ConfigDict(extra="forbid")

    path: str  # e.g. "facts.num_hidden_layers", "topology.attention_groups[0].layers"
    value: Any = None
    status: ClaimStatus
    source: SourceRef | None = None
    extractor: str | None = None  # e.g. "config.glm5@1"
    checked_at: Date | None = None
    note: str | None = None

    @model_validator(mode="after")
    def _source_rule(self) -> Claim:
        if self.status is ClaimStatus.unknown and self.source is not None:
            raise ValueError("unknown claims must not carry a source")
        if self.status is not ClaimStatus.unknown and self.source is None:
            raise ValueError(f"claim {self.path!r} with status {self.status.value} requires a source")
        return self


class ModelIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(description="org/name, e.g. zai-org/glm-5.3-flash")
    label: str
    family: str | None = None
    revision: str = "main"
    license: str | None = None


class ModelFacts(BaseModel):
    """Scalar facts; every UI-visible number must resolve to a Claim."""

    model_config = ConfigDict(extra="forbid")

    num_hidden_layers: int = Field(gt=0)
    hidden_size: int = Field(gt=0)
    num_attention_heads: int = Field(gt=0)
    num_key_value_heads: int | None = None
    head_dim: int | None = None  # explicit override when hidden_size % heads != 0
    vocab_size: int | None = None
    context_tokens: int | None = None
    total_params: int | None = None
    active_params: int | None = None


class AttentionKind(str, Enum):
    mha = "mha"
    gqa = "gqa"
    mla = "mla"
    mla_sparse = "mla_sparse"
    linear_attention = "linear_attention"
    sliding_window = "sliding_window"
    other = "other"


class FfnKind(str, Enum):
    dense_ffn = "dense_ffn"
    moe = "moe"
    other = "other"


class LayerGroup(BaseModel):
    """A run of layers sharing the same module kind (Layer Genome column run)."""

    model_config = ConfigDict(extra="forbid")

    label: str  # e.g. "KDA", "MLA/DSA", "Dense SwiGLU", "MoE"
    kind: str  # AttentionKind or FfnKind value; kept as str for cross-kind groups
    module: str | None = None
    layers: list[int] = Field(min_length=1)


class ExpertConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    routed_total: int | None = None
    active_routed: int | None = None
    shared: int | None = None


class ResidualScheme(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scheme: str  # "plain" | "mhc" | ...
    streams: int | None = None
    note: str | None = None


class PositionEncoding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str  # "rope" | "nope" | "mixed" | "alibi" | ...
    note: str | None = None


class ModelTopology(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attention_groups: list[LayerGroup] = Field(min_length=1)
    ffn_groups: list[LayerGroup] = Field(min_length=1)
    experts: ExpertConfig | None = None
    residual: ResidualScheme | None = None
    position_encoding: PositionEncoding | None = None


class ModelDocument(BaseModel):
    """Root of an Architecture IR document (one per model/revision)."""

    model_config = ConfigDict(extra="forbid")

    ir_version: Literal["0.1.0"] = "0.1.0"
    model: ModelIdentity
    facts: ModelFacts
    topology: ModelTopology
    claims: list[Claim] = Field(default_factory=list)
