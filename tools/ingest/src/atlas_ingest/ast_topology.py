"""AST topology analyzer (issue #15): extract module composition and call
order from model source files. Status of every produced claim is `inferred`
until a human reviews it — AST is evidence, not truth."""

from __future__ import annotations

import ast
from typing import Any

from .ir import Claim, ClaimStatus, SourceKind, SourceRef


def analyze_module_source(source: str) -> dict[str, Any]:
    """Parse a modeling file and return structural facts.

    Returns {"classes": [...], "init_order": [...], "forward_order": [...]}
    for the first class that defines both __init__ and forward (the model
    class). Orders are the textual order of submodule assignments / calls.
    """
    tree = ast.parse(source)
    info: dict[str, Any] = {"classes": [], "init_order": [], "forward_order": []}
    target = None
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            info["classes"].append(node.name)
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        has_init = has_forward = False
        init_order: list[str] = []
        forward_order: list[str] = []
        for stmt in node.body:
            if isinstance(stmt, ast.FunctionDef) and stmt.name == "__init__":
                has_init = True
                for sub in ast.walk(stmt):
                    if isinstance(sub, ast.Assign) and isinstance(sub.value, ast.Call):
                        target_name = _callee_name(sub.value)
                        if target_name:
                            for t in sub.targets:
                                if isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name):
                                    init_order.append(t.attr)
                                elif isinstance(t, ast.Name):
                                    init_order.append(t.id)
            if isinstance(stmt, ast.FunctionDef) and stmt.name == "forward":
                has_forward = True
                for sub in ast.walk(stmt):
                    if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Attribute):
                        if isinstance(sub.func.value, ast.Name) and sub.func.value.id == "self":
                            forward_order.append(sub.func.attr)
                    if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Attribute) and isinstance(sub.func.value, ast.Attribute):
                        if sub.func.value.value and getattr(sub.func.value.value, "id", "") == "self":
                            forward_order.append(sub.func.value.attr)
        if has_init and has_forward and target is None:
            target = node.name
            info["init_order"] = init_order
            info["forward_order"] = forward_order
    if target:
        info["class"] = target
    return info


def _callee_name(call: ast.Call) -> str | None:
    func = call.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def claims_from_ast(source: str, url: str, locator_prefix: str = "modeling.py") -> list[Claim]:
    """Inferred claims: module composition and forward call order."""
    info = analyze_module_source(source)
    src = SourceRef(kind=SourceKind.source_code, url=url, locator=locator_prefix)
    claims: list[Claim] = [
        Claim(path="topology.class", value=info.get("class"), status=ClaimStatus.inferred, source=src),
        Claim(path="topology.init_order", value=info["init_order"], status=ClaimStatus.inferred, source=src),
        Claim(path="topology.forward_order", value=info["forward_order"], status=ClaimStatus.inferred, source=src),
    ]
    return claims
