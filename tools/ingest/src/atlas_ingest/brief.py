"""Architecture Brief (issue #30): the auditable source pack for one model.

Rules enforced by :func:`validate_brief`:

- every primary source pins an immutable revision — a floating ``main`` is
  rejected (negative fixture: tests/fixtures/briefs/invalid/floating-main.json);
- every paper carries a role (`model-specific` | `mechanism-only`) and at
  least one exact locator (Figure/Table/Section/PDF page);
- a `model-specific` paper must declare which model id it verifies; a paper
  verifying another model is rejected (negative fixture:
  tests/fixtures/briefs/invalid/wrong-model-paper.json);
- mechanism-only papers can never appear as primary sources.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PaperRole(str, Enum):
    model_specific = "model-specific"
    mechanism_only = "mechanism-only"
    secondary_visual = "secondary-visual"


class PrimarySource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["config", "code", "model_card"]
    url: str
    revision: str
    sha256: str | None = None

    @field_validator("revision")
    @classmethod
    def _pinned(cls, v: str) -> str:
        if v in ("", "main", "master"):
            raise ValueError(f"floating revision {v!r} rejected: pin an immutable commit/tag")
        return v


class Paper(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str
    title: str
    role: PaperRole
    locators: list[str] = Field(min_length=1)  # Figure/Table/Section/PDF page
    verifies: str | None = None  # required for model-specific papers

    @model_validator(mode="after")
    def _role_rules(self) -> Paper:
        if self.role is PaperRole.model_specific and not self.verifies:
            raise ValueError(
                f"model-specific paper {self.url!r} must declare `verifies: <model_id>`"
            )
        return self


class PaperToDiagram(BaseModel):
    model_config = ConfigDict(extra="forbid")

    element: str
    locator: str
    status: str = "verified"


class ArchitectureBrief(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_id: str
    primary_sources: list[PrimarySource] = Field(min_length=1)
    papers: list[Paper] = Field(default_factory=list)
    visual_references: list[Paper] = Field(default_factory=list)
    paper_to_diagram: list[PaperToDiagram] = Field(default_factory=list)
    notes: str | None = None

    @model_validator(mode="after")
    def _model_specific_must_verify_this_model(self) -> ArchitectureBrief:
        for paper in self.papers:
            if paper.role is PaperRole.model_specific and paper.verifies != self.model_id:
                raise ValueError(
                    f"paper {paper.url!r} claims model-specific for {paper.verifies!r} "
                    f"but this brief is {self.model_id!r} — downgrade to mechanism-only"
                )
        return self


def validate_brief(data: dict) -> ArchitectureBrief:
    return ArchitectureBrief.model_validate(data)
