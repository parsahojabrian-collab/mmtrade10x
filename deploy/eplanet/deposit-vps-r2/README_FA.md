# MMTRADE ePlanet — VPS Deposit Auto Verification R2

Purpose: adapt the Deposit R1 module to the actual production VPS code with `p37ChangeWorkflow` (CAS) and `eplanetSerialize<T>(work:()=>Promise<T>)` (in-process serializer), without requiring the nonexistent `p37LockWorkflow`.

## What the installer does

- Refuses to run if the source and live ePlanet HTML differ, or if the email R3 / dialog-close R5 markers are absent.
- Downloads the pinned R1 server module and client UI, verifies both Git blob SHA-1 hashes, and adapts the module to use its **own Prisma row-level transaction lock**.
- Inserts a single import and registration hook in `apps/api/src/index.ts`.
- Writes a new isolated UI script and one versioned script tag to source and live HTML.
- Checks UI JavaScript syntax and runs `npm run build` with a 1536 MiB Node heap cap.
- Writes a persistent installation journal **before modifying files** to permit rollback after lost SSH.
- Does not change ePlanet R3 email processing, dialog CSS or R5 close, partner referral, database schema or API environment. Does not restart the API.

## Installation

```bash
mkdir -p /root/MMTRADE_EPLANET_DEPOSIT_VPS_R2
curl -fSL --retry 3 \
 'https://raw.githubusercontent.com/parsahojabrian-collab/mmtrade10x/8e000ca0a03f38dd746d86de461aa2487373e9a9/deploy/eplanet/deposit-vps-r2/install.py' \
 -o /root/MMTRADE_EPLANET_DEPOSIT_VPS_R2/install.py
python3 /root/MMTRADE_EPLANET_DEPOSIT_VPS_R2/install.py audit
python3 /root/MMTRADE_EPLANET_DEPOSIT_VPS_R2/install.py install
python3 /root/MMTRADE_EPLANET_DEPOSIT_VPS_R2/install.py verify
```

**Note:** Commit-pinned installer URL above can be used even after later README commits; the installer points to pinned source modules.

If SSH sessions are unstable, use `tmux` or `nohup` on the **user VPS** to run install and read the resulting log. Do not rerun install blindly if interrupted. Use `status` and `rollback` for recovery.

## Status / rollback

```bash
python3 /root/MMTRADE_EPLANET_DEPOSIT_VPS_R2/install.py status
python3 /root/MMTRADE_EPLANET_DEPOSIT_VPS_R2/install.py rollback
```

Rollback restores original source/live files and removes isolated R2 add-ons; generated dist JavaScript must be rebuilt before subsequent API restart.

## Activation prerequisites (OFF by default)

Environment:
`EPLANET_DEPOSIT_ENABLED=1`, `EPLANET_DEPOSIT_API_KEY`, `EPLANET_DEPOSIT_API_SECRET`,
`EPLANET_DEPOSIT_PARTNER_ID`, `EPLANET_DEPOSIT_MIN_BALANCE`,
`EPLANET_DEPOSIT_BALANCE_UNIT`, `EPLANET_DEPOSIT_UNIT_CONFIRMED=1`.

Additionally, broker email must have independently attested ownership, bound by an authorized superadmin at
`POST /miniapp/eplanet/deposit/admin/bind-email`. The R2 module does not invent broker-email ownership proof.

After installing, restart the **correct** API service manually and perform a live health/API test; keep `EPLANET_DEPOSIT_ENABLED` unset until fully configured.

## Caveats

- Partner API balance is aggregated across eligible accounts by email; not a transaction-level deposit proof.
- R2 verifies >=2 sufficient broker balance readings at least 60s apart after the user starts a check; low balances are not automatically monitored indefinitely.
- Broker API keys and secrets never belong in the Mini App.
- This is an installation candidate. VPS-specific build, deployment and live broker check must pass before it is considered operational.
