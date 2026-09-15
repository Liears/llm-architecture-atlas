"""Tests for issues #13-#17: snapshot CLI, adapters, AST, proposals, memory."""

import json
from pathlib import Path

import pytest

from atlas_ingest.adapters import claims_from_hf_config, detect_family
from atlas_ingest.ast_topology import analyze_module_source, claims_from_ast
from atlas_ingest.ledger import EvidenceLedger
from atlas_ingest.memory import kv_cache_per_token_bytes, memory_report
from atlas_ingest.proposals import Proposal, review_proposal
from atlas_ingest.snapshot import snapshot, snapshot_from_fixture
from atlas_ingest.ir import Claim, ClaimStatus, ModelDocument

FIX = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
ROOT = Path(__file__).resolve().parents[3]


def load_cfg(name: str) -> dict:
    return json.loads((FIX / "hf" / name / "config.json").read_text())


# ---------------------------------------------------------------- #13 snapshot

def test_snapshot_fixture_mode_writes_lock(tmp_path: Path) -> None:
    lock = snapshot_from_fixture(FIX / "hf" / "llama3", tmp_path / "sources", "meta-llama/Meta-Llama-3-8B")
    assert lock["fixture"] is True
    assert lock["files"][0]["ok"] is True
    assert (tmp_path / "sources" / "sources.lock.json").exists()
    assert lock["files"][0]["sha256"] != ""


def test_snapshot_records_network_failure(tmp_path: Path) -> None:
    def boom(url: str) -> bytes:
        raise ConnectionError("unreachable")

    lock = snapshot("x/y", tmp_path / "s", fetch=boom)
    assert all(f["ok"] is False for f in lock["files"])  # errors recorded, not raised


# ---------------------------------------------------------------- #14 adapters

def test_detect_families() -> None:
    assert detect_family(load_cfg("deepseek")) == "deepseek"
    assert detect_family(load_cfg("mixtral")) == "mixtral"
    assert detect_family(load_cfg("llama3")) == "llama"


def test_llama_claims_include_gqa() -> None:
    claims = claims_from_hf_config(load_cfg("llama3"), "https://huggingface.co/meta-llama/Meta-Llama-3-8B")
    by_path = {c.path: c for c in claims}
    assert by_path["topology.attention.type"].value == "gqa"
    assert by_path["facts.num_hidden_layers"].value == 32
    assert by_path["facts.num_key_value_heads"].value == 8


def test_deepseek_claims_flag_mla_and_moe() -> None:
    claims = claims_from_hf_config(load_cfg("deepseek"), "https://huggingface.co/deepseek-ai/DeepSeek-V3")
    by_path = {c.path: c for c in claims}
    assert by_path["topology.attention.type"].value == "mla"
    assert by_path["topology.experts.routed_total"].value == 256
    assert by_path["facts.num_key_value_heads"].status is ClaimStatus.unknown


def test_adapter_output_flows_through_ledger(tmp_path: Path) -> None:
    claims = claims_from_hf_config(load_cfg("glm"), "https://huggingface.co/zai-org/GLM-5.3-Flash")
    led = EvidenceLedger()
    led.merge(claims)
    eff = led.effective()
    assert eff["topology.experts.routed_total"] == 288
    assert eff["facts.num_hidden_layers"] == 45


@pytest.mark.parametrize("name", ["llama3", "mixtral", "deepseek", "qwen3next", "glm"])
def test_golden_configs_produce_layers_claim(name: str) -> None:
    claims = claims_from_hf_config(load_cfg(name), f"https://huggingface.co/{name}")
    assert any(c.path == "facts.num_hidden_layers" for c in claims)


# ---------------------------------------------------------------- #15 AST

SRC = (FIX / "src" / "modeling.py").read_text()


def test_ast_extracts_module_order() -> None:
    info = analyze_module_source(SRC)
    assert info["class"] == "MiniHybridModel"
    assert info["init_order"] == ["embed", "attn", "norm", "moe", "head"]
    assert info["forward_order"][:2] == ["embed", "attn"]


def test_ast_claims_are_inferred_with_locator() -> None:
    claims = claims_from_ast(SRC, "https://example.org/modeling.py")
    assert all(c.status is ClaimStatus.inferred for c in claims)
    assert claims[0].source.locator == "modeling.py"


# ---------------------------------------------------------------- #16 proposals

def _existing_doc() -> ModelDocument:
    doc = ModelDocument.model_validate(
        json.loads((ROOT / "models/zai-org/glm-5-3-flash/main/architecture.json").read_text())
    )
    evidence = json.loads((ROOT / "models/zai-org/glm-5-3-flash/main/evidence.json").read_text())
    doc.claims = [Claim.model_validate(c) for c in evidence["claims"]]
    return doc


def test_proposal_cannot_claim_verified() -> None:
    with pytest.raises(Exception):
        Proposal(
            model_id="zai-org/glm-5-3-flash",
            proposed_by="llm:test@1",
            basis="unit test",
            claims=[Claim(path="facts.hidden_size", value=1, status="verified", source=None)],
        )


def test_review_accepts_inferred_and_rejects_conflicts_with_verified() -> None:
    doc = _existing_doc()
    proposal = Proposal(
        model_id="zai-org/glm-5-3-flash",
        proposed_by="llm:test@1",
        basis="unit test",
        claims=[
            Claim(path="facts.num_key_value_heads", value=8, status="inferred",
                  source={"kind": "source_code", "locator": "modeling.py:1"}),
            Claim(path="facts.hidden_size", value=2048, status="inferred",
                  source={"kind": "source_code", "locator": "modeling.py:2"}),
        ],
    )
    result = review_proposal(proposal, doc)
    assert result.accepted == ["facts.num_key_value_heads"]  # unknown slot filled
    assert result.conflicts == ["facts.hidden_size"]  # reported vs inferred -> conflict for human review


def test_proposals_never_touch_production_data() -> None:
    doc = _existing_doc()
    proposal = Proposal(
        model_id="zai-org/glm-5-3-flash",
        proposed_by="llm:test@1",
        basis="unit test",
        claims=[Claim(path="facts.vocab_size", value=1, status="inferred",
                      source={"kind": "source_code", "locator": "x"})],
    )
    review_proposal(proposal, doc)
    assert doc.facts.vocab_size == 154880  # untouched


# ---------------------------------------------------------------- #17 memory

def test_kv_cache_gqa_llama3() -> None:
    r = kv_cache_per_token_bytes(layers=32, kv_heads=8, head_dim=128, dtype="bf16")
    assert r["bytes"] == 2 * 32 * 8 * 128 * 2  # 128 KiB/token
    assert r["exact"] is True


def test_kv_cache_mla_compressed() -> None:
    r = kv_cache_per_token_bytes(layers=61, kv_heads=None, head_dim=0, dtype="bf16",
                                 mla_kv_lora_rank=512, mla_rope_dim=64)
    assert r["bytes"] == 61 * (512 + 64) * 2
    assert r["exact"] is True


def test_kv_cache_unknown_reports_estimate() -> None:
    r = kv_cache_per_token_bytes(layers=10, kv_heads=None, head_dim=128)
    assert r["bytes"] is None and r["exact"] is False


def test_memory_report_flags_estimates() -> None:
    report = memory_report(json.loads((ROOT / "models/meta-llama/llama-3-8b/main/architecture.json").read_text()))
    assert report["kv_cache_per_token"]["exact"] is True
    assert report["forward_flops_per_token"]["exact"] is False  # estimate
