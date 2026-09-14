"""Tests for Architecture IR v0.1: schema shape, validation rules, drift guard."""

import json
import subprocess
import sys
from pathlib import Path

import pytest
from atlas_ingest.ir import Claim, ClaimStatus, LayerGroup, ModelDocument
from atlas_ingest.validation import validate_model

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE = REPO_ROOT / "tests" / "fixtures" / "ir" / "glm-5.3-flash.example.json"
SCHEMA_OUT = REPO_ROOT / "packages" / "architecture-ir" / "schema" / "architecture-ir.schema.json"


def load_example() -> ModelDocument:
    return ModelDocument.model_validate(json.loads(FIXTURE.read_text()))


# ---------------------------------------------------------------- schema / model

def test_document_has_ir_version() -> None:
    doc = load_example()
    assert doc.ir_version == "0.1.0"


def test_claim_statuses_exist() -> None:
    assert {s.value for s in ClaimStatus} == {
        "verified", "reported", "derived", "inferred", "conflict", "unknown",
    }


def test_unknown_claim_requires_no_source() -> None:
    c = Claim(path="decoder.num_key_value_heads", value=None, status="unknown")
    assert c.source is None


def test_non_unknown_claim_requires_source() -> None:
    with pytest.raises(ValueError):
        Claim(path="decoder.layers[0].attention.type", value="kda", status="reported")


# ---------------------------------------------------------------- validation rules

def test_valid_glm_example_passes() -> None:
    errors = validate_model(load_example())
    assert errors == []


def test_hidden_size_must_divide_by_heads() -> None:
    doc = load_example()
    doc.facts.hidden_size = 4095
    errors = validate_model(doc)
    assert any("hidden_size" in e for e in errors)


def test_kv_heads_cannot_exceed_heads() -> None:
    doc = load_example()
    doc.facts.num_key_value_heads = 128
    errors = validate_model(doc)
    assert any("num_key_value_heads" in e for e in errors)


def test_active_experts_cannot_exceed_routed() -> None:
    doc = load_example()
    doc.topology.experts.routed_total = 5
    errors = validate_model(doc)
    assert any("routed_total" in e for e in errors)


def test_layer_groups_must_cover_all_layers_exactly_once() -> None:
    doc = load_example()
    doc.topology.attention_groups[0].layers = list(range(44))
    errors = validate_model(doc)
    assert any("coverage" in e for e in errors)


def test_layer_index_out_of_bounds_rejected() -> None:
    doc = load_example()
    doc.topology.attention_groups[1].layers = list(range(34, 46))
    errors = validate_model(doc)
    assert any("out of range" in e for e in errors)


# ---------------------------------------------------------------- schema export

def test_exported_schema_is_stable_and_committed() -> None:
    """The committed JSON Schema must equal a fresh export (drift guard)."""
    fresh = json.loads(subprocess.run(
        [sys.executable, "-m", "atlas_ingest.schema"], check=True, capture_output=True, text=True, cwd=REPO_ROOT,
    ).stdout)
    committed = json.loads(SCHEMA_OUT.read_text())
    assert fresh == committed


def test_example_validates_against_json_schema() -> None:
    schema = json.loads(SCHEMA_OUT.read_text())
    import jsonschema  # dev dependency of atlas-ingest

    jsonschema.validate(json.loads(FIXTURE.read_text()), schema)
