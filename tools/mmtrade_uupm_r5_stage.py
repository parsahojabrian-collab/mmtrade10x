#!/usr/bin/env python3
"""Prepare offline three-way merges for R5; never change production files.

Usage: python3 -u tools/mmtrade_uupm_r5_stage.py
Writes a separate /root/MMTRADE_R5_MERGE_STAGE_YYYYmmdd_HHMMSS directory.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

BASE = "6b5d2af7f5a4a4d249e279be3bf4e82a033440c8"
SOURCE = Path("/root/miniapp10x")
LIVE = Path("/srv/tenx-public/miniapp")
REVIEW = Path("/root/mmtrade-uupm-r5-source-review")
PATHS = [
    "public/miniapp/10x-fonts.css",
    "public/miniapp/p74/home.css",
    "public/miniapp/p74/home.js",
    "public/miniapp/p74/profile/profile.css",
    "public/miniapp/p74/profile/profile.js",
    "public/miniapp/shared/mm-bottom-nav.css",
    "public/miniapp/p74/studio/index.html",
    "public/miniapp/p74/studio/studio.css",
    "public/miniapp/p74/learning/academy-home.css",
    "public/miniapp/p74/support/support.css",
    "public/miniapp/p74/eplanet/styles.css",
    "public/miniapp/p74/eplanet/index.html",
    "public/miniapp/p74/copytrade-academy/style.css",
    "public/miniapp/p74/copytrade-academy/index.html",
]


def read(path: Path) -> bytes | None:
    if path.is_symlink():
        raise RuntimeError(f"Refusing symlink: {path}")
    if not path.exists():
        return None
    if not path.is_file():
        raise RuntimeError(f"Not a regular file: {path}")
    if path.stat().st_size > 3_000_000:
        raise RuntimeError(f"File exceeds 3MB: {path}")
    return path.read_bytes()


def sha(data: bytes | None) -> str | None:
    return hashlib.sha256(data).hexdigest()[:16] if data is not None else None


def base_file(rel: str) -> bytes:
    proc = subprocess.run(
        ["git", "-C", str(REVIEW), "show", f"{BASE}:{rel}"],
        capture_output=True, timeout=12, check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Cannot load baseline: {rel}; {proc.stderr[:120]!r}")
    return proc.stdout


def merge(base: bytes, current: bytes, proposed: bytes, tmp: Path):
    if current == proposed:
        return "ALREADY_R5", current
    if current == base:
        return "DIRECT_R5", proposed
    if proposed == base:
        return "KEEP_CURRENT", current
    tmp.mkdir(parents=True, exist_ok=True)
    ours = tmp / "current"
    ancestor = tmp / "base"
    theirs = tmp / "proposed"
    for p, b in [(ours, current), (ancestor, base), (theirs, proposed)]:
        p.write_bytes(b)
    proc = subprocess.run(
        ["git", "merge-file", "--diff3", "--stdout", "-L", "CURRENT",
         "-L", "BASE", "-L", "R5", str(ours), str(ancestor), str(theirs)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        timeout=12, check=False,
    )
    if proc.returncode == 0:
        return "MERGED_CLEAN", proc.stdout
    if proc.returncode == 1 and b"<<<<<<< CURRENT" in proc.stdout:
        return "MANUAL_CONFLICT", proc.stdout
    raise RuntimeError(
        f"git merge-file error ({proc.returncode}): {proc.stderr[:160]!r}"
    )


def main():
    if not SOURCE.is_dir() or not LIVE.is_dir() or not REVIEW.is_dir():
        raise RuntimeError("Missing source, live, or R5 review directory")
    if not (REVIEW / "tests/uiux-promax-r5-source.test.mjs").is_file():
        raise RuntimeError("R5 review worktree is not ready")
    name = "MMTRADE_R5_MERGE_STAGE_" + datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    stage = Path("/root") / name
    stage.mkdir(mode=0o700, exist_ok=False)
    rows = []
    counts = Counter()
    for rel in PATHS:
        if not rel.startswith("public/miniapp/") or ".." in Path(rel).parts:
            raise RuntimeError("Out-of-scope path: " + rel)
        before = base_file(rel)
        target = read(REVIEW / rel)
        if target is None:
            raise RuntimeError("Missing R5 file: " + rel)
        for label, original in [
            ("source", SOURCE / rel),
            ("live", LIVE / rel.removeprefix("public/miniapp/")),
        ]:
            current = read(original)
            if current is None:
                status, merged = "MISSING", None
            else:
                scratch = stage / "_work" / label / rel
                status, merged = merge(before, current, target, scratch)
            out = stage / "proposed" / label / rel
            if merged is not None:
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(merged)
            row = {
                "path": rel, "scope": label, "status": status,
                "original_path": str(original),
                "original_sha16": sha(current),
                "proposed_sha16": sha(target),
                "output_sha16": sha(merged),
                "output_path": str(out) if merged is not None else None,
            }
            rows.append(row)
            counts[label + "_" + status] += 1
            print(f'{label.upper():6} {status:16} {rel}', flush=True)
    result = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "baseline": BASE,
        "source_dir": str(SOURCE),
        "live_dir": str(LIVE),
        "review_dir": str(REVIEW),
        "counts": dict(counts),
        "files": rows,
        "note": (
            "STAGING ONLY. Conflict markers are intentionally retained. "
            "Do not copy proposed files into production until every conflict "
            "has been resolved, regression tests and visual review have passed."
        ),
    }
    manifest = stage / "manifest.json"
    manifest.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest.chmod(0o600)
    print("COUNTS=" + json.dumps(dict(counts), ensure_ascii=False), flush=True)
    print("STAGE_DIR=" + str(stage), flush=True)
    print("PRODUCTION_WRITES=NONE", flush=True)
    print("STAGE=PASS", flush=True)


if __name__ == "__main__":
    main()
