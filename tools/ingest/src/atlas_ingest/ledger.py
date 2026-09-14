"""Evidence Ledger (issue #3): claim bookkeeping with no silent overrides.

Semantics (docs/development-plan.md §5.2, §15):

- every :meth:`add` returns a :class:`Resolution` and appends to ``report``;
  nothing is dropped without a trace.
- a ``verified`` claim can only be replaced by another ``verified`` claim.
  Weaker disagreement is *rejected* outright.
- two weaker claims that disagree are upgraded to ``conflict``; both values
  survive in ``alternatives`` so a human can resolve them later.
- same value + stronger incoming status upgrades the stored claim.
- ``unknown`` claims never override anything.

``effective()`` exposes only claims a UI may present as fact: conflict and
unknown paths are excluded (§5.3 — they must never masquerade as certainty).
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict

from .ir import Claim, ClaimStatus

_STATUS_STRENGTH: dict[ClaimStatus, int] = {
    ClaimStatus.unknown: 0,
    ClaimStatus.inferred: 1,
    ClaimStatus.derived: 2,
    ClaimStatus.reported: 3,
    ClaimStatus.verified: 4,
}


class Action(str, Enum):
    added = "added"  # stored / upgraded
    kept = "kept"  # incoming was weaker or equivalent; existing unchanged
    conflict = "conflict"  # stored claim upgraded to conflict status
    rejected = "rejected"  # incoming denied by a verified claim


class Resolution(BaseModel):
    """What happened when a claim met the ledger."""

    model_config = ConfigDict(extra="forbid")

    path: str
    action: Action
    existing_status: ClaimStatus | None = None
    incoming_status: ClaimStatus | None = None


class EvidenceLedger:
    """Path-keyed claim store with override rules and a full decision log."""

    def __init__(self) -> None:
        self._claims: dict[str, Claim] = {}
        self.report: list[Resolution] = []

    # ----------------------------------------------------------------- API

    def add(self, claim: Claim) -> Resolution:
        resolution = self._apply(claim)
        self.report.append(resolution)
        return resolution

    def merge(self, claims: list[Claim]) -> list[Resolution]:
        return [self.add(c) for c in claims]

    def resolve(self, path: str) -> Claim | None:
        return self._claims.get(path)

    def claims(self) -> list[Claim]:
        return list(self._claims.values())

    def effective(self) -> dict[str, Any]:
        """Path -> value for claims a UI may present as established fact."""
        return {
            path: c.value
            for path, c in self._claims.items()
            if c.status in (ClaimStatus.verified, ClaimStatus.reported, ClaimStatus.derived, ClaimStatus.inferred)
        }

    # ------------------------------------------------------------- internals

    def _apply(self, incoming: Claim) -> Resolution:
        existing = self._claims.get(incoming.path)
        if existing is None:
            self._store(incoming)
            return Resolution(path=incoming.path, action=Action.added, incoming_status=incoming.status)

        if incoming.status is ClaimStatus.unknown:
            return Resolution(
                path=incoming.path, action=Action.kept,
                existing_status=existing.status, incoming_status=incoming.status,
            )

        if existing.status is ClaimStatus.unknown:
            # an unknown slot is empty: any valued claim fills it
            self._store(incoming)
            return Resolution(
                path=incoming.path, action=Action.added,
                existing_status=existing.status, incoming_status=incoming.status,
            )

        if not _values_disagree(existing.value, incoming.value):
            # agreement is harmless: only a strictly stronger status upgrades
            if _STATUS_STRENGTH[incoming.status] > _STATUS_STRENGTH[existing.status]:
                self._store(incoming)
                return Resolution(
                    path=incoming.path, action=Action.added,
                    existing_status=existing.status, incoming_status=incoming.status,
                )
            return Resolution(
                path=incoming.path, action=Action.kept,
                existing_status=existing.status, incoming_status=incoming.status,
            )

        if existing.status is ClaimStatus.verified and incoming.status is not ClaimStatus.verified:
            # §15: AI (or anything weaker) must not overwrite a verified claim.
            return Resolution(
                path=incoming.path, action=Action.rejected,
                existing_status=existing.status, incoming_status=incoming.status,
            )

        # values disagree here
        if incoming.status is ClaimStatus.verified and existing.status is not ClaimStatus.verified:
            self._store(incoming)
            return Resolution(
                path=incoming.path, action=Action.added,
                existing_status=existing.status, incoming_status=incoming.status,
            )
        merged = self._to_conflict(existing, incoming)
        self._claims[incoming.path] = merged
        return Resolution(
            path=incoming.path, action=Action.conflict,
            existing_status=existing.status, incoming_status=incoming.status,
        )

    def _store(self, claim: Claim) -> None:
        self._claims[claim.path] = claim.model_copy(deep=True)

    def _to_conflict(self, existing: Claim, incoming: Claim) -> Claim:
        alternatives: list[Any] = [existing.value, incoming.value]
        for extra in existing.alternatives or []:
            if extra not in alternatives:
                alternatives.append(extra)
        return Claim(
            path=existing.path,
            value=None,
            status=ClaimStatus.conflict,
            alternatives=alternatives,
            note=f"disagreement between {existing.status.value} and {incoming.status.value} claims",
            source=existing.source or incoming.source,
        )


def _values_disagree(a: Any, b: Any) -> bool:
    if a is None or b is None:
        return a != b
    return a != b
