"""Evidence Ledger semantics (issue #3): no silent overrides, conflict model."""

import json
from pathlib import Path

import pytest
from atlas_ingest.ir import Claim, ClaimStatus, SourceKind, SourceRef
from atlas_ingest.ledger import EvidenceLedger

FIXTURE = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "ir" / "glm-5.3-flash.example.json"


def claim(path: str, value, status: str) -> Claim:
    source = None if status == "unknown" else SourceRef(kind=SourceKind.model_card, locator="x")
    return Claim(path=path, value=value, status=status, source=source)


def test_add_first_claim_is_recorded() -> None:
    led = EvidenceLedger()
    r = led.add(claim("facts.num_hidden_layers", 45, "reported"))
    assert r.action == "added"
    assert led.resolve("facts.num_hidden_layers").value == 45


def test_verified_claim_rejects_weaker_disagreement() -> None:
    led = EvidenceLedger()
    led.add(claim("facts.num_hidden_layers", 45, "verified"))
    r = led.add(claim("facts.num_hidden_layers", 40, "reported"))
    assert r.action == "rejected"
    assert led.resolve("facts.num_hidden_layers").value == 45
    assert led.resolve("facts.num_hidden_layers").status is ClaimStatus.verified


def test_weaker_claim_with_same_value_is_a_noop() -> None:
    led = EvidenceLedger()
    led.add(claim("facts.num_hidden_layers", 45, "verified"))
    r = led.add(claim("facts.num_hidden_layers", 45, "inferred"))
    assert r.action == "kept"
    assert led.resolve("facts.num_hidden_layers").status is ClaimStatus.verified


def test_disagreement_without_verified_upgrades_to_conflict() -> None:
    led = EvidenceLedger()
    led.add(claim("facts.vocab_size", 155136, "reported"))
    r = led.add(claim("facts.vocab_size", 151552, "reported"))
    assert r.action == "conflict"
    resolved = led.resolve("facts.vocab_size")
    assert resolved.status is ClaimStatus.conflict
    # both sides survive in the record — nothing is silently dropped
    assert {155136, 151552} <= set(resolved.alternatives)


def test_verified_incoming_claim_replaces_weaker_value() -> None:
    led = EvidenceLedger()
    led.add(claim("facts.vocab_size", 151552, "inferred"))
    r = led.add(claim("facts.vocab_size", 155136, "verified"))
    assert r.action == "added"
    assert led.resolve("facts.vocab_size").status is ClaimStatus.verified
    assert led.resolve("facts.vocab_size").value == 155136


def test_unknown_never_overrides_anything() -> None:
    led = EvidenceLedger()
    led.add(claim("facts.hidden_size", 4096, "reported"))
    r = led.add(claim("facts.hidden_size", None, "unknown"))
    assert r.action == "kept"
    assert led.resolve("facts.hidden_size").value == 4096


def test_same_value_upgrades_to_stronger_status() -> None:
    led = EvidenceLedger()
    led.add(claim("facts.hidden_size", 4096, "inferred"))
    led.add(claim("facts.hidden_size", 4096, "reported"))
    assert led.resolve("facts.hidden_size").status is ClaimStatus.reported


def test_every_operation_leaves_a_trace() -> None:
    led = EvidenceLedger()
    led.add(claim("a", 1, "reported"))
    led.add(claim("a", 2, "reported"))
    led.add(claim("b", 3, "verified"))
    assert len(led.report) == 3
    assert {op.action for op in led.report} == {"added", "conflict", "added"}


def test_effective_values_exclude_conflict_and_unknown() -> None:
    led = EvidenceLedger()
    led.add(claim("a", 1, "reported"))
    led.add(claim("a", 2, "reported"))  # -> conflict
    led.add(claim("b", None, "unknown"))
    led.add(claim("c", 3, "verified"))
    eff = led.effective()
    assert eff == {"c": 3}


def test_ledger_round_trips_into_model_document() -> None:
    led = EvidenceLedger()
    led.add(claim("facts.num_hidden_layers", 45, "verified"))
    led.add(claim("facts.vocab_size", 155136, "reported"))
    doc = json.loads(FIXTURE.read_text())
    doc["claims"] = [c.model_dump(mode="json") for c in led.claims()]
    assert isinstance(doc["claims"], list) and len(doc["claims"]) == 2
    from atlas_ingest.ir import ModelDocument

    parsed = ModelDocument.model_validate(doc)
    assert parsed.claims[0].status is ClaimStatus.verified
