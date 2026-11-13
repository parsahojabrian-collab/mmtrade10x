# MMTrade10X — Superadmin Code Maintenance (R2: Legacy Patch Converter)

This is a guarded maintenance center inside **Admin → سیستم و دسترسی‌ها → یکپارچه‌سازی و بهینه‌سازی**.

## Operations

| Action | Actual operation | Source safety |
| --- | --- | --- |
| Audit | Finds patch markers and historical patches; previews applicability and attempts build/tests | Does not rewrite source |
| Integrate | Safely converts eligible legacy diffs/staged ZIPs, creates patch inventory, deduplicates leading imports | Changes only a disposable Git worktree |
| Convert legacy patches | Converts compatible old Git diffs and hash-matched STAGED/plan.json ZIP payloads | Changes only a disposable Git worktree; reports conflicts |
| Optimize | Removes exactly duplicate leading TS imports, then runs build and unit tests | Changes only a disposable Git worktree |

**Limits:** The converter never executes archived Python/shell installers. Only Git diffs with a clean preimage or exact SHA-256-verified staged replacements are applied. Conflicts and installer-only archives require review; this is not semantic AI refactoring or a guarantee that every historical patch can be merged. A reviewable patch is available only when a change is generated and **both** build and tests pass.

## Security and operations

- API calls require a named, active **SUPER_ADMIN** session; the legacy shared token is denied.
- Modes are allowlisted. No free-form shell command or file path is accepted from the browser.
- Only one job may execute at once; an on-disk lock prevents concurrent heavy jobs.
- The worker calls Git in a temporary, detached worktree; it does not checkout/overwrite the production source.
- For integrate/optimize, tracked local modifications in the production checkout block the job.
- An isolated copy of Git **HEAD** is used: uncommitted and untracked patches do not appear there.
- Node dependencies must already exist; the worker never runs a package installation or downloads dependencies.
- Builds/tests run with a restricted set of environment variables, no service credentials, a timeout, and bounded output.
- A failure leaves the running API/bot untouched. Job status/patches are stored in `.mmtrade-maintenance/` (Git-ignored).
- A staged patch is **not automatically applied**. Its correctness must be reviewed and deployment must be approved separately.
- A checkout with a branch behind the server source may not contain later server-only patches. Sync Git first, then audit.

## API routes

- `GET /admin/maintenance/status`
- `GET /admin/maintenance/jobs/:id`
- `GET /admin/maintenance/jobs/:id/patch` (authenticated text download)
- `POST /admin/maintenance/jobs` with JSON `{ "mode": "audit" | "integrate" | "legacy" | "optimize" }`

## Rollout checklist

1. Review the draft PR and verify CI build/tests.
2. Ensure `/root/miniapp10x` (or the API service's `WorkingDirectory`) is the intended Git repository and contains the worker script.
3. Ensure the API service account has permission to create/remove Git worktrees and a private `.mmtrade-maintenance` directory; never add broad `sudo` privileges.
4. Check any tracked modifications on the server before a maintenance job.
5. Deploy using the normal, separately approved server rollout with backup/rollback plan. Do not merge merely because this panel exists.
6. Log in as a **named** SUPER_ADMIN, run **Audit** first, inspect test results, then run a dry-run integration job.

## Tests

`npm test` includes `tests/maintenance-safety.test.mjs` and checks that the worker audits in a disposable fixture and refuses to ignore uncommitted code.

## Historical patch discovery and conversion

On the original production checkout `/root/miniapp10x`, the worker scans appropriately named `/root/MMTRADE*.zip`, `/root/MMVS*.zip`, `/root/P74*.zip` and similar historical archives, within size/count limits. It always scans `.mmtrade-maintenance/legacy-input/`. Elsewhere, the private input directory is the supported location.

**Supported:** standalone Git `.patch`/`.diff`; Git diffs inside ZIP; and `STAGED/plan.json` or `plan.json` entries containing `path`, `old_sha256`, `new_sha256` when exact SHA-verified replacement bytes are present in the archive (including extensionless STAGED payloads).

**Not automatically executed:** archived `install.py`, `deploy.py`, shell scripts, and installer-only ZIPs. They are inventoried as `requires_review`, never executed. A verified migration recipe or human-reviewed diff is required to preserve all side effects.

**Algorithm:** scan and deduplicate patch artifacts, detect already-integrated changes, check `git apply --check` in a detached worktree, apply only clean diffs, replace snapshot files only when the current file SHA-256 equals the recorded old hash, and retry staged version chains. Conflicting patches are reported and never force-applied. A combined review patch is exported only after Build and Unit Tests pass.

**Limits:** up to 80 source archives, 90 MiB aggregate compressed input, 24 MiB each, and 120 patch candidates; each ZIP also has strict uncompressed size/member limits. Excess inputs are marked as truncated. `legacy-input` is Git-ignored, private, and never committed.

**Important:** This can automatically consolidate machine-readable old changes, not infer the semantics of every historical installer. Conflicts and unverified source snapshots still need review. No automatic deploy or service restart occurs.

## Troubleshooting

- `dirty_production_tree`: synchronize or review live server changes with Git before write modes; Audit is still available.
- No archives discovered: check naming/permissions or copy ZIP/patch files to `.mmtrade-maintenance/legacy-input/`.
- Snapshot hash mismatch: investigate version drift, do not override the current source.
- Build/test failure: the worker keeps the report but does not mark the patch ready for review.
