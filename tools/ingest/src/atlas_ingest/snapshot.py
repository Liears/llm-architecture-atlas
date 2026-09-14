"""Source snapshot CLI (issue #13): fetch and lock HF model sources.

Offline-first: tests use fixture mode; the network fetcher is injectable so
CI never touches the network. Output layout:

    <out>/config.json
    <out>/README.md
    <out>/sources.lock.json   # sha256 + urls + revision
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import date
from pathlib import Path
from urllib.request import Request, urlopen

HF_RAW = "https://huggingface.co/{repo}/raw/{revision}/{path}"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _default_fetch(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "llm-architecture-atlas/0.1"})
    with urlopen(req, timeout=60) as r:  # noqa: S310 - fixed https scheme
        return r.read()


def snapshot(
    repo: str,
    out_dir: Path,
    revision: str = "main",
    files: tuple[str, ...] = ("config.json", "README.md"),
    fetch=None,
) -> dict:
    """Snapshot HF text sources into out_dir and return the lock dict.

    ``fetch`` is injectable for offline tests; when a fetch fails for one
    file the error is recorded and remaining files continue.
    """
    fetch = fetch or _default_fetch
    out_dir.mkdir(parents=True, exist_ok=True)
    locked: list[dict] = []
    for rel in files:
        url = HF_RAW.format(repo=repo, revision=revision, path=rel)
        dest = out_dir / rel
        try:
            data = (fetch)(url)
            dest.write_bytes(data)
            locked.append({"path": rel, "url": url, "sha256": hashlib.sha256(data).hexdigest(), "ok": True})
        except Exception as exc:  # network errors must not kill the run
            locked.append({"path": rel, "url": url, "ok": False, "error": str(exc)[:200]})
    lock = {
        "repo": repo,
        "revision": revision,
        "fetched_at": date.today().isoformat(),
        "files": locked,
    }
    (out_dir / "sources.lock.json").write_text(json.dumps(lock, indent=2) + "\n")
    return lock


def snapshot_from_fixture(fixture_dir: Path, out_dir: Path, repo: str, revision: str = "main") -> dict:
    """Build the same lock structure from local fixture files (no network)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    files = []
    for src in sorted(Path(fixture_dir).glob("*")):
        if src.is_file():
            shutil.copy(src, out_dir / src.name)
            files.append({"path": src.name, "url": f"fixture://{repo}/{src.name}", "sha256": sha256_file(src), "ok": True})
    lock = {"repo": repo, "revision": revision, "fetched_at": date.today().isoformat(), "files": files, "fixture": True}
    (out_dir / "sources.lock.json").write_text(json.dumps(lock, indent=2) + "\n")
    return lock


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="atlas-ingest.snapshot")
    p.add_argument("repo", help="HF repo id, e.g. meta-llama/Meta-Llama-3-8B")
    p.add_argument("--revision", default="main")
    p.add_argument("--out", required=True, help="output directory (models/<org>/<name>/main/sources)")
    p.add_argument("--fixture-dir", default=None, help="copy from a local fixture dir instead of the network")
    args = p.parse_args(argv)
    if args.fixture_dir:
        lock = snapshot_from_fixture(Path(args.fixture_dir), Path(args.out), args.repo, args.revision)
    else:
        lock = snapshot(args.repo, Path(args.out), args.revision)
    ok = sum(1 for f in lock["files"] if f.get("ok"))
    print(f"snapshot {args.repo}@{args.revision}: {ok}/{len(lock['files'])} files ok -> {args.out}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
