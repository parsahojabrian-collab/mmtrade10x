#!/usr/bin/env python3
"""Repair only the confirmed corrupt published ePlanet Spatial layout entries.
Requires a SUPER_ADMIN bearer token. Never logs or persists the credential.
Uses official revision-checked Spatial draft and publish endpoints.
"""
import getpass
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://mmtrade.parsahojabrian.ir"
ROUTE = "/admin/mmvs/layout/eplanet"
BACKUP = Path("/root/MMTRADE_EPLANET_SPATIAL_BACKUP_" +
              datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S") + ".json")
TARGETS = {
    "img.hero-coin",
    "section.progress-panel",
    "div.hero-glow",
    "div.hero-copy",
    "div.progress-head",
    "div.progress-track",
    "#progressHint",
    "#pageSubtitle",
    "section.hero",
}
# Only known broken geometry; do not touch other 30 layout items or DOM moves.

def abort(reason):
    print("ABORT:", reason)
    sys.exit(2)

token = getpass.getpass("SUPER_ADMIN_TOKEN (input hidden): ").strip()
if not token:
    abort("missing token")
headers = {"Authorization": "Bearer " + token, "Accept": "application/json",
           "Content-Type": "application/json"}
def request(method, suffix="", payload=None):
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    req = urllib.request.Request(BASE + ROUTE + suffix, data=body,
                                 headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20, context=ssl.create_default_context()) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read(2048).decode())
            reason = detail.get("error") or detail.get("message") or str(e.code)
        except Exception:
            reason = str(e.code)
        abort(f"HTTP_{e.code} {reason}")
    except Exception as e:
        abort(f"REQUEST_FAILED {type(e).__name__}: {str(e)[:140]}")

state = request("GET")
rev = state.get("revision")
published = state.get("published")
draft = state.get("draft")
if not isinstance(rev, int) or not isinstance(published, dict):
    abort("invalid revision/published shape")
if draft is not None:
    abort("UNPUBLISHED_SPATIAL_DRAFT_EXISTS - do not overwrite another edit")
items = published.get("items")
if not isinstance(items, list) or len(items) < 9:
    abort("invalid or incomplete published layout")
matching = [item for item in items if isinstance(item, dict) and item.get("selector") in TARGETS]
if len(matching) != len(TARGETS) or {item.get("selector") for item in matching} != TARGETS:
    abort("EXPECTED_9_SELECTORS_NOT_PRESENT - no changes made")
other = [item for item in items if item not in matching]
if len(other) != len(items) - 9:
    abort("unexpected item count")
if published.get("domMoves") not in (None, []):
    abort("DOM_MOVES_PRESENT - not modifying complex layout")
clean = dict(published)
clean["items"] = other
assert len(clean["items"]) == len(items) - 9
# Persist complete original state before any write. File is mode 0600.
fd = os.open(str(BACKUP), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w", encoding="utf8") as f:
    json.dump({"revision": rev, "published": published, "draft": draft,
               "removed": matching}, f, ensure_ascii=False, indent=2)
print("BACKUP:", BACKUP)
print("BEFORE_ITEMS:", len(items), "AFTER_ITEMS:", len(other))
print("REMOVING:", ", ".join(sorted(TARGETS)))

draft_response = request("PUT", "/draft", {"expectedRevision": rev, "layout": clean})
saved_rev = draft_response.get("revision")
if not draft_response.get("ok") or saved_rev != rev + 1:
    abort("draft write did not return expected revision; publish skipped")
print("DRAFT_SAVED_REVISION:", saved_rev)
publication = request("POST", "/publish", {"expectedRevision": saved_rev})
if not publication.get("ok") or publication.get("revision") != rev + 2:
    abort("publish response not confirmed; inspect revision before retrying")
post = request("GET")
saved = post.get("published")
if not isinstance(saved, dict) or any(i.get("selector") in TARGETS for i in saved.get("items", [])):
    abort("POST_VERIFY_FAILED - manual review required")
if saved.get("items") != other:
    abort("OTHER_LAYOUT_ITEMS_CHANGED - manual review required")
print("EPLANET_SPATIAL_SURGICAL_FIX=PASS")
print("PUBLISHED_REVISION:", post.get("revision"))
print("REMAINING_LAYOUT_ITEMS:", len(saved["items"]))
print("OTHER_PAGES_CHANGED=NO")
