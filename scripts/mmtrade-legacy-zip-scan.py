#!/usr/bin/env python3
"""Read old MMTrade patch ZIPs as DATA. Never extract files or execute installers."""
import hashlib
import json
import re
import stat
import sys
import zipfile

MAX_ENTRIES = 320
MAX_ITEM = 2 * 1024 * 1024
MAX_TOTAL = 12 * 1024 * 1024
MAX_DIFF = 64
MAX_MANIFEST = 15
HEX = re.compile(r"^[a-fA-F0-9]{64}$")
SOURCE = (".ts", ".tsx", ".js", ".mjs", ".html", ".css", ".json")
DIFF = (".patch", ".diff")


def main(path):
    result = {"patches": [], "snapshots": [], "scripts": [], "unmatched": [], "warnings": []}
    with zipfile.ZipFile(path, "r") as archive:
        members = archive.infolist()
        if len(members) > MAX_ENTRIES:
            raise ValueError("too_many_zip_members")
        total = sum(info.file_size for info in members)
        if total > MAX_TOTAL:
            raise ValueError("zip_uncompressed_size_exceeded")
        digest_map = {}
        plans = []
        for info in members:
            name = info.filename.replace("\\", "/")
            if info.is_dir():
                continue
            mode = info.external_attr >> 16
            if mode and stat.S_ISLNK(mode):
                result["warnings"].append("symlink_ignored")
                continue
            if name.startswith("/") or ".." in name.split("/") or len(name) > 350 or "\x00" in name:
                result["warnings"].append("unsafe_member_name")
                continue
            if info.file_size > MAX_ITEM or info.flag_bits & 1:
                result["warnings"].append("oversized_or_encrypted_member")
                continue
            name_lower = name.lower()
            if name_lower.endswith((".py", ".sh")) and len(result["scripts"]) < 100:
                result["scripts"].append(name)
            # Hash all bounded, non-executable archive members, including STAGED/BOT without extensions.
            if name_lower.endswith((".py", ".sh", ".env", ".pem", ".key", ".p12")):
                continue
            data = archive.read(info)
            if len(data) != info.file_size:
                result["warnings"].append("size_mismatch")
                continue
            if name_lower.endswith(DIFF):
                if len(result["patches"]) < MAX_DIFF:
                    try:
                        result["patches"].append({"member": name, "content": data.decode("utf-8")})
                    except UnicodeDecodeError:
                        result["warnings"].append("non_utf8_patch")
            elif name_lower.endswith("/plan.json") or name_lower == "plan.json":
                if len(plans) < MAX_MANIFEST:
                    try:
                        plans.append((name, json.loads(data)))
                    except (UnicodeDecodeError, ValueError):
                        result["warnings"].append("invalid_plan_json")
            elif not name_lower.endswith((".py", ".sh", ".env", ".pem", ".key")):
                # Historical STAGED payloads may have no file extension.
                digest = hashlib.sha256(data).hexdigest()
                digest_map.setdefault(digest, (name, data))
        for plan_name, plan in plans:
            rows = plan.get("entries") if isinstance(plan, dict) else None
            if not isinstance(rows, dict):
                continue
            for key, item in list(rows.items())[:100]:
                if not isinstance(item, dict):
                    continue
                target = item.get("path")
                old_hash = item.get("old_sha256")
                new_hash = item.get("new_sha256")
                if not all(isinstance(v, str) for v in (target, old_hash, new_hash)):
                    continue
                if not HEX.fullmatch(old_hash) or not HEX.fullmatch(new_hash):
                    continue
                new_match = digest_map.get(new_hash.lower())
                if not new_match:
                    result["unmatched"].append({"plan": plan_name, "entry": str(key)[:100], "target": target[:250], "reason": "new_content_missing"})
                    continue
                member, data = new_match
                if len(result["snapshots"]) >= 100:
                    result["warnings"].append("too_many_snapshots")
                    continue
                try:
                    text = data.decode("utf-8")
                except UnicodeDecodeError:
                    result["unmatched"].append({"plan": plan_name, "entry": str(key)[:100], "target": target[:250], "reason": "non_utf8_snapshot"})
                    continue
                result["snapshots"].append({
                    "plan": plan_name, "entry": str(key)[:100], "member": member,
                    "path": target, "oldSha": old_hash.lower(), "newSha": new_hash.lower(), "content": text
                })
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main(sys.argv[1])
    except Exception as exc:
        print(json.dumps({"error": type(exc).__name__ + ":" + str(exc)[:120]}))
        sys.exit(2)
