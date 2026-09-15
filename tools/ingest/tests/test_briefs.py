"""Architecture Brief gate (issue #30): all committed briefs validate;
negative fixtures must be rejected."""

import json
from pathlib import Path

import pytest

from atlas_ingest.brief import validate_brief

ROOT = Path(__file__).resolve().parents[3]
MODELS = ROOT / "models"
NEGATIVES = ROOT / "tests" / "fixtures" / "briefs" / "invalid"

briefs = sorted(MODELS.glob("*/*/main/brief.json"))


def test_every_model_has_a_brief() -> None:
    archs = {p.parent for p in MODELS.glob("*/*/main/architecture.json")}
    for d in archs:
        assert (d / "brief.json").exists(), f"missing brief for {d}"


def test_all_committed_briefs_validate() -> None:
    assert len(briefs) >= 6
    for f in briefs:
        brief = validate_brief(json.loads(f.read_text()))
        for source in brief.primary_sources:
            assert source.revision not in ("main", "master")


def test_floating_main_revision_rejected() -> None:
    with pytest.raises(Exception, match="floating revision"):
        validate_brief(json.loads((NEGATIVES / "floating-main.json").read_text()))


def test_wrong_model_specific_paper_rejected() -> None:
    with pytest.raises(Exception, match="downgrade to mechanism-only"):
        validate_brief(json.loads((NEGATIVES / "wrong-model-paper.json").read_text()))


def test_paper_without_locator_rejected() -> None:
    with pytest.raises(Exception):
        validate_brief(json.loads((NEGATIVES / "paper-without-locator.json").read_text()))


def test_mechanism_only_paper_cannot_be_primary() -> None:
    data = json.loads((ROOT / "models/zai-org/glm-5-3-flash/main/brief.json").read_text())
    for paper in data["papers"]:
        assert paper["role"] in ("mechanism-only", "model-specific")
        if paper["role"] == "model-specific":
            assert paper["verifies"] == data["model_id"]
    roles = {p["role"] for p in data["papers"]}
    assert "mechanism-only" in roles  # GLM brief must record that its papers are mechanism-only
