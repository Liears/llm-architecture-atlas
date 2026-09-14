"""Export the Architecture IR JSON Schema to stdout.

Usage:
    python -m atlas_ingest.schema            # print schema
    python -m atlas_ingest.schema --write P  # write schema to file P

The committed copy lives at packages/architecture-ir/schema/architecture-ir.schema.json;
the drift guard in tests/test_ir.py keeps them in sync.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .ir import ModelDocument


def build_schema() -> dict:
    schema = ModelDocument.model_json_schema()
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["$id"] = "https://github.com/Liears/llm-architecture-atlas/architecture-ir.schema.json"
    schema["title"] = "LLM Architecture IR"
    return schema


def main() -> None:
    schema = build_schema()
    if len(sys.argv) >= 3 and sys.argv[1] == "--write":
        out = Path(sys.argv[2])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {out}", file=sys.stderr)
    else:
        print(json.dumps(schema, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
