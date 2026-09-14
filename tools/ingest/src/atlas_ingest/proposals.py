"""LLM proposal flow (issue #16): AI-proposed claims enter a quarantine
area and never touch production data. A human approves by copying accepted
proposals into models/ in their own commit (auditable via git).

Rules enforced here:

- proposals validate against the same Claim schema (status must be
  `inferred` — an LLM cannot claim `verified`/`reported`);
- review() replays the ledger: verified claims cannot be overridden,
  disagreements become conflicts for the human to resolve.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, model_validator

from .ir import Claim, ClaimStatus, ModelDocument
from .ledger import Action, EvidenceLedger


class Proposal(BaseModel):
    """A quarantined set of AI-proposed claims for one model."""

    model_config = ConfigDict(extra="forbid")

    model_id: str
    proposed_by: str  # e.g. "llm:glm-extractor@1"
    basis: str  # free-text justification with source pointers
    claims: list[Claim]

    @model_validator(mode="after")
    def _llm_cannot_claim_certainty(self) -> Proposal:
        for c in self.claims:
            if c.status in (ClaimStatus.verified, ClaimStatus.reported):
                raise ValueError(
                    f"proposal claim {c.path!r} has status {c.status.value}; "
                    "LLM proposals must use inferred (or unknown)"
                )
        return self


class ReviewResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accepted: list[str]
    rejected: list[str]
    conflicts: list[str]


def load_proposal(path: Path) -> Proposal:
    return Proposal.model_validate(json.loads(path.read_text()))


def review_proposal(proposal: Proposal, existing: ModelDocument | None = None) -> ReviewResult:
    """Replay the proposal through a ledger seeded with existing claims."""
    ledger = EvidenceLedger()
    if existing is not None:
        ledger.merge(existing.claims)
    result = ReviewResult(accepted=[], rejected=[], conflicts=[])
    for claim in proposal.claims:
        res = ledger.add(claim)
        if res.action in (Action.added,):
            result.accepted.append(claim.path)
        elif res.action is Action.rejected:
            result.rejected.append(claim.path)
        elif res.action is Action.conflict:
            result.conflicts.append(claim.path)
    return result
