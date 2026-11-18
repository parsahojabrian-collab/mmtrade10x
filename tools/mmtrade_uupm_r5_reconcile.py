#!/usr/bin/env python3
"""Read-only production inventory for MMTRADE UI/UX Pro Max R5.

No writes to the application, Nginx, bot, API or Git worktrees.
Only creates a timestamped JSON report under /root.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

BASE = "6b5d2af7f5a4a4d249e279be3bf4e82a033440c8"
SOURCE = Path("/root/miniapp10x")
LIVE = Path("/srv/tenx-public/miniapp")
REVIEW = Path("/root/mmtrade-uupm-r5-source-review")
ROOTS = [SOURCE / "public/miniapp", LIVE]
APP_FILES = [
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
FONT_RE = re.compile(r"\bDoran(?:FaNum)?\b|P74Doran|P77Doran|MMU-Doran|fonts/doran", re.I)
LAYER_RE = re.compile(r"(?:mm-uux-r[1-4]|mm-r[1-4]\.css|UIUX_PROMAX_R[1-4])", re.I)
CSS_REF_RE = re.compile(r"<link\b[^>]*rel=[\x22\x27]stylesheet[\x22\x27][^>]*>", re.I)
HREF_RE = re.compile(r"\bhref=[\x22\x27]([^\x22\x27]+)", re.I)


def digest(data: bytes | None) -> str | None:
    return hashlib.sha256(data).hexdigest()[:16] if data is not None else None


def safe_read(path: Path) -> bytes | None:
    if path.is_symlink():
        raise RuntimeError(f"SYMLINK_IN_AUDIT_SCOPE: {path}")
    if not path.is_file():
        return None
    if path.stat().st_size > 3_000_000:
        raise RuntimeError(f"FILE_TOO_LARGE: {path}")
    return path.read_bytes()


def git_show(ref: str, rel: str) -> bytes:
    r = subprocess.run(
        ["git", "-C", str(REVIEW), "show", f"{ref}:{rel}"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        timeout=10, check=False,
    )
    if r.returncode:
        raise RuntimeError(f"GIT_SHOW_FAILED: {ref}:{rel}: {r.stderr[:160]!r}")
    return r.stdout


def git_head(path: Path) -> str:
    return subprocess.check_output(
        ["git", "-C", str(path), "rev-parse", "HEAD"], text=True, timeout=10
    ).strip()


def compare_files() -> list[dict]:
    rows = []
    for rel in APP_FILES:
        base = git_show(BASE, rel)
        r5 = safe_read(REVIEW / rel)
        source = safe_read(SOURCE / rel)
        live_path = LIVE / rel.removeprefix("public/miniapp/")
        live = safe_read(live_path)
        if r5 is None:
            raise RuntimeError("R5_REVIEW_FILE_NOT_FOUND: " + rel)
        if not rel.startswith("public/miniapp/"):
            raise RuntimeError("UNEXPECTED_REPO_RELATIVE_PATH: " + rel)
        conflict = (source is not None and source != base and source != r5) or (
            live is not None and live != base and live != r5
        )
        rows.append({
            "path": rel, "source_exists": source is not None,
            "live_exists": live is not None,
            "base_hash16": digest(base), "r5_hash16": digest(r5),
            "source_hash16": digest(source), "live_hash16": digest(live),
            "source_changed_from_base": source is not None and source != base,
            "live_changed_from_base": live is not None and live != base,
            "source_live_identical": source == live if source is not None and live is not None else None,
            "source_is_r5": source == r5 if source is not None else False,
            "live_is_r5": live == r5 if live is not None else False,
            "needs_manual_merge": bool(conflict),
        })
    return rows


def inspect_html() -> tuple[list[dict], Counter]:
    rows = []
    totals = Counter()
    for title, root in [("source", ROOTS[0]), ("live", ROOTS[1])]:
        if not root.exists():
            raise RuntimeError("HTML_ROOT_MISSING: " + str(root))
        for path in sorted(root.rglob("*.html")):
            if any(p in {".git", "node_modules", "dist", "backups"} for p in path.parts):
                continue
            raw = safe_read(path)
            if raw is None:
                continue
            html = raw.decode("utf-8", errors="replace")
            refs = []
            for m in CSS_REF_RE.finditer(html):
                found = HREF_RE.search(m.group(0))
                if found:
                    refs.append(found.group(1))
            layers = [x for x in refs if LAYER_RE.search(x)]
            doran = len(FONT_RE.findall(html))
            if layers or doran:
                rows.append({
                    "root": title, "file": str(path.relative_to(root)),
                    "layers": layers[-8:], "last_link": refs[-1] if refs else None,
                    "doran_matches": doran,
                })
            totals[f"{title}_html_scanned"] += 1
            totals[f"{title}_with_r1_r4_links"] += int(bool(layers))
            totals[f"{title}_html_doran"] += int(doran > 0)
    return rows, totals


def inspect_font_debt() -> list[dict]:
    rows = []
    for label, root in [("source", SOURCE / "public/miniapp"), ("live", LIVE)]:
        for p in root.rglob("*"):
            if p.suffix.lower() not in {".css", ".html", ".js"}:
                continue
            if any(x in {"node_modules", "dist", "backups"} for x in p.parts):
                continue
            raw = safe_read(p)
            if raw is None:
                continue
            text = raw.decode("utf-8", errors="replace")
            matches = len(FONT_RE.findall(text))
            if matches:
                rows.append({"root": label, "path": str(p.relative_to(root)), "count": matches})
    return sorted(rows, key=lambda x: (-x["count"], x["root"], x["path"]))


def check_font_files() -> dict:
    counts = Counter()
    for label, root in [("source", SOURCE / "public/miniapp"), ("live", LIVE)]:
        for family, prefix in [("standard", "PeydaWeb-"), ("fanum", "PeydaWebFaNum-")]:
            for w in ["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"]:
                p = root / "p74/mm-uux-r1/fonts/peyda" / family / (prefix + w + ".woff2")
                b = safe_read(p)
                counts[label + "_present"] += int(b is not None)
                counts[label + "_valid_woff2"] += int(b is not None and b[:4] == b"wOF2")
    return dict(counts)


def main() -> None:
    print("===== R5 READ-ONLY RECONCILIATION =====", flush=True)
    if not (SOURCE.is_dir() and LIVE.is_dir() and REVIEW.is_dir()):
        raise RuntimeError("REQUIRED_ROOT_MISSING")
    actual = git_head(REVIEW)
    if actual == BASE:
        raise RuntimeError("R5_WORKTREE_AT_BASE_NOT_FEATURE")
    if not (REVIEW / "tests/uiux-promax-r5-source.test.mjs").is_file():
        raise RuntimeError("R5_TEST_FILE_MISSING")
    print("SOURCE_HEAD=", git_head(SOURCE), flush=True)
    print("REVIEW_HEAD=", actual, flush=True)
    rows = compare_files()
    html, counts = inspect_html()
    debt = inspect_font_debt()
    fonts = check_font_files()
    result = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "base": BASE, "review_head": actual,
        "summary": {
            "r5_app_files": len(rows),
            "source_conflicts": sum(x["source_changed_from_base"] and not x["source_is_r5"] for x in rows),
            "live_conflicts": sum(x["live_changed_from_base"] and not x["live_is_r5"] for x in rows),
            "manual_merge_candidates": sum(x["needs_manual_merge"] for x in rows),
            "r1_r4_live_pages": counts["live_with_r1_r4_links"],
            "remaining_doran_files": len(debt),
        },
        "files": rows,
        "html_summary": dict(counts),
        "html_design_links": html,
        "font_debt": debt,
        "private_fonts": fonts,
    }
    # Report is outside the application directories. No deploy occurs here.
    report_dir = Path("/root") / (
        "MMTRADE_R5_RECONCILE_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    )
    report_dir.mkdir(mode=0o700, exist_ok=False)
    report = report_dir / "audit.json"
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    report.chmod(0o600)
    print("SUMMARY=", json.dumps(result["summary"], ensure_ascii=False), flush=True)
    print("FONTS=", json.dumps(fonts, ensure_ascii=False), flush=True)
    print("===== SOURCE/LIVE PER FILE =====")
    for row in rows:
        print(("CONFLICT" if row["needs_manual_merge"] else "CLEAN") + " | " +
              row["path"] + " | src=" + str(row["source_hash16"]) +
              " | live=" + str(row["live_hash16"]), flush=True)
    print("===== TOP FONT DEBT =====")
    for row in debt[:25]:
        print(f'{row["root"]}: {row["path"]}: {row["count"]}', flush=True)
    print("REPORT=", report)
    print("PRODUCTION_WRITES=NONE")
    print("AUDIT=PASS")


if __name__ == "__main__":
    main()
