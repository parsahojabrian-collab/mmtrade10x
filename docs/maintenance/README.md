# MMTrade10X — Superadmin Code Maintenance (R1)

This is a guarded maintenance center inside **Admin → سیستم و دسترسی‌ها → یکپارچه‌سازی و بهینه‌سازی**.

## Operations

| Action | Actual operation | Source safety |
| --- | --- | --- |
| Audit | Scans patch markers in bot, API and admin panel; attempts build and tests | Does not rewrite source |
| Integrate | Creates a single patch-marker inventory and removes exactly duplicate leading TS imports | Changes only a disposable Git worktree |
| Optimize | Removes exactly duplicate leading TS imports, then runs build and unit tests | Changes only a disposable Git worktree |

**Limitations:** This initial safe version does **not** infer equivalent behavior from arbitrary historical patches. It does **not** install OpenHands or Aider, perform AI refactors, merge patch versions with conflicting behavior, commit modifications automatically, restart services, or deploy to production. A reviewable patch is available only when an actual change is generated and **both** build and tests pass.

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
- `POST /admin/maintenance/jobs` with JSON `{ "mode": "audit" | "integrate" | "optimize" }`

## Rollout checklist

1. Review the draft PR and verify CI build/tests.
2. Ensure `/root/miniapp10x` (or the API service's `WorkingDirectory`) is the intended Git repository and contains the worker script.
3. Ensure the API service account has permission to create/remove Git worktrees and a private `.mmtrade-maintenance` directory; never add broad `sudo` privileges.
4. Check any tracked modifications on the server before a maintenance job.
5. Deploy using the normal, separately approved server rollout with backup/rollback plan. Do not merge merely because this panel exists.
6. Log in as a **named** SUPER_ADMIN, run **Audit** first, inspect test results, then run a dry-run integration job.

## Tests

`npm test` includes `tests/maintenance-safety.test.mjs` and checks that the worker audits in a disposable fixture and refuses to ignore uncommitted code.
