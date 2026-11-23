# MMTRADE ePlanet — Deposit Engine R1

Status: **installable / fail-closed / not automatically enabled**.

## What R1 installs

- `apps/api/src/eplanet-deposit-r1.ts`: signed ePlanet Partner API client, Telegram-protected check and status endpoints, persisted SystemSetting queue, background second confirmation, atomic workflow update, audit log.
- `public/miniapp/p74/eplanet/deposit-ui-r1.js` (source+live): isolated Deposit button and result view. It replaces the **manual submit button only while the Deposit modal is open**.
- Additive import and register hook in `apps/api/src/index.ts` and one versioned script tag in ePlanet HTML.
- Existing ePlanet app.js, styles.css, Registration R3A–R5, referral link, API routes and DB schema are not replaced.

**Important:** This first version monitors jobs only after the user starts a check, automatically schedules its second confirmation, and retries transient failures. It does not yet auto-enqueue every registered user nor indefinitely recheck accounts that failed an eligibility check. No false completed flags are issued when credentials, broker unit, or verified identity are absent.

## Install

```bash
mkdir -p /root/MMTRADE_EPLANET_DEPOSIT_R1
curl -fSL --retry 3 'https://raw.githubusercontent.com/parsahojabrian-collab/mmtrade10x/eb04e362444dcfee1c9d9ac7581eb5b1a6321249/deploy/eplanet/deposit-r1/install.py' -o /root/MMTRADE_EPLANET_DEPOSIT_R1/install.py
python3 /root/MMTRADE_EPLANET_DEPOSIT_R1/install.py audit
python3 /root/MMTRADE_EPLANET_DEPOSIT_R1/install.py install
python3 /root/MMTRADE_EPLANET_DEPOSIT_R1/install.py verify
```

Installer **fails closed** if source/live HTML differ, R5 baseline is missing, or TypeScript build fails. Installer takes backups, modifies source+live only after build validation, and DOES NOT restart the API service.

Before running the commands, review the code and take a server snapshot, especially in production.

## Configure

Required server-side environment variables (never in HTML/JS or a Telegram message):

- `EPLANET_DEPOSIT_ENABLED=1` (disabled by default)
- `EPLANET_DEPOSIT_API_KEY=` partner API key
- `EPLANET_DEPOSIT_API_SECRET=` secret matching that specific key
- `EPLANET_DEPOSIT_PARTNER_ID=` numerical partner ID registered to the key
- `EPLANET_DEPOSIT_MIN_BALANCE=` positive numeric threshold, same unit as broker's response
- `EPLANET_DEPOSIT_BALANCE_UNIT=` confirmed unit identifier, e.g. USD only if broker confirmed
- `EPLANET_DEPOSIT_UNIT_CONFIRMED=1` set only after broker confirms units

Do not enable without a live broker test. The Partner API balance is **aggregated for permitted accounts under the email**, not necessarily the exact MT account ID, and is **not proof of a specific deposit transaction**.

## Verified email binding

A user-entered broker email is NOT sufficient. A superadmin must obtain independent proof and attest the email after Registration is complete:

`POST /miniapp/eplanet/deposit/admin/bind-email`

Body: `{"userId":"<INTERNAL_USER_ID>","email":"verified@example.com","proofRef":"<INDEPENDENT_PROOF_REFERENCE>"}`

The auth scheme is the pre-existing superadmin session bearer token. The backend registers `EPLANET_BROKER_EMAIL_ATTESTED` in AuditLog. In R1 there is no automated proof acquisition endpoint from broker; approved Registration alone is NOT accepted as proof of email ownership.

## Internal Mini App API

- `POST /miniapp/eplanet/deposit/check`, body `{"initData":"...","requestId":"<UUID>"}`
- `POST /miniapp/eplanet/deposit/check/status`, body `{"initData":"...","checkId":"depchk_..."}`
- Both validate Telegram initData; no user-supplied partner ID, email or threshold is accepted.
- `GET /miniapp/eplanet/deposit/admin/health` requires superadmin.
- Two independent sufficient readings with >=60s gap are needed for approval; result writes to existing `EplanetUserWorkflow.depositCompleted` inside a locked transaction.

## Status expectations

- 202 `CHECK_ACCEPTED` or `CHECK_ALREADY_RUNNING`
- 403 `BROKER_EMAIL_UNVERIFIED`
- 409 `PREVIOUS_STEP_INCOMPLETE`
- 429 `CHECK_COOLDOWN` or `CHECK_LIMIT_REACHED`
- 503 `ENGINE_DISABLED` or `BROKER_NOT_CONFIGURED`
- Result statuses: `QUEUED`, `RUNNING`, `PENDING_CONFIRMATION`, `INSUFFICIENT_BALANCE`, `PARTNER_MISMATCH`, `INDETERMINATE`, `RETRYABLE_ERROR`, `VERIFIED`, `CONFIGURATION_ERROR`.

## Activate

After successful install, configure service environment securely, restart the **correct existing API service manually**, then confirm health and test against a real verified broker email before enabling R1.

## Rollback

`python3 /root/MMTRADE_EPLANET_DEPOSIT_R1/install.py rollback`

Rollback refuses if its installed files have changed. After rollback run the application's build and restart the API service to restore its running code.

## Known R1 limits

- Job queue is stored in existing SystemSetting JSON records to avoid schema changes; scheduler scans the latest 500 jobs. This must be moved to an indexed dedicated table before large-scale use.
- Workers run in-process on API instances and use a persistent lease and shared database lock to prevent concurrent decisions. A long external outage remains fail-closed.
- No financial transfer or deposit action is performed. No funds are held by MMTRADE.
- This package's actual server compatibility must be demonstrated by `audit`, `npm run build`, `verify`, API restart and live UI test, not by the repo commit alone.
