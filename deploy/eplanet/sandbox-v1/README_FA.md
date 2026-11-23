# MMTRADE ePlanet Sandbox V1

**A fully separate static simulation; no real broker account, IB API credentials, database, deposit or trading activity.**

## What is included

- Installer copies the *current VPS live ePlanet index.html and styles.css* into a brand-new sibling directory \`eplanet-sandbox\`, and copies its passive asset images.
- Removes all original scripts, inline JS handlers and live hyperlinks. All network API calls are blocked by sandbox-only CSP (\`connect-src 'none'\`).
- Adds separate 4-step logic, styled controls, mock ledger and mock registration inputs only.
- Mock scenarios: enough balance (two virtual successful checks, 61 seconds apart), low balance, wrong partner, unverified email, broker API error.
- Front-end state stored only in \`sessionStorage\` under \`MMTRADE_EPLANET_SANDBOX_V1_ONLY\`, not in Prisma or the production DB. Reloading the tab can preserve simulation state; Reset clears it.
- Unit tests written in Node built-in \`node:test\` covering order enforcement, failure modes, idempotency and success.
- Sandbox separate production folder: \`/srv/tenx-public/miniapp/p74/eplanet-sandbox\`.
- **Will not** restart systemd, run npm builds, edit production files, enable an IB integration, or auto-approve real users.

## VPS setup

\`\`\`bash
mkdir -p /root/MMTRADE_EPLANET_SANDBOX_V1
curl -fSL --retry 3 \
 'https://raw.githubusercontent.com/parsahojabrian-collab/mmtrade10x/e999c1f2f4292c7321612c8b51ac7c990e3e626c/deploy/eplanet/sandbox-v1/install.py' \
 -o /root/MMTRADE_EPLANET_SANDBOX_V1/install.py
python3 /root/MMTRADE_EPLANET_SANDBOX_V1/install.py audit &&
python3 /root/MMTRADE_EPLANET_SANDBOX_V1/install.py install &&
python3 /root/MMTRADE_EPLANET_SANDBOX_V1/install.py verify
\`\`\`

Open the sandbox on the **same host as the existing Mini App** by replacing the existing \`/miniapp/p74/eplanet/index.html\` URL with

\`\`\`
/miniapp/p74/eplanet-sandbox/index.html
\`\`\`

The exact public domain depends on the VPS Nginx routing. A successful file install does **not** prove public web delivery; confirm HTTP 200 on the sandbox page.

## Testing

1. Click **Run all 4 stages** for fake end-to-end success.
2. Click **Reset**, enter account \`DEMO_1001\` and fake email \`tester@example.test\`, complete registration.
3. Change the broker scenario to insufficient balance / partner mismatch / email unverified / API error; attempt Deposit and confirm Connect remains locked.
4. Choose Enough Balance and retry Deposit; Connect should unlock.
5. Open the bottom audit log; all events are virtual and do not represent real broker activities.

## Status and rollback

\`\`\`bash
python3 /root/MMTRADE_EPLANET_SANDBOX_V1/install.py status
python3 /root/MMTRADE_EPLANET_SANDBOX_V1/install.py verify
python3 /root/MMTRADE_EPLANET_SANDBOX_V1/install.py rollback
\`\`\`

Rollback only removes the two directories created for this sandbox, after checking file hashes, and never edits the original production ePlanet files.

## Limitations

This is **visual/UI/business-state simulation** using current VPS markup/CSS, not a real integration test of the live Deposit R2 backend and partner API. Those must still be separately tested with a dedicated test environment and controlled credentials when available. The fake amount threshold 100 is a fictional test unit, not USD or a real ePlanet policy.

The browser-facing sandbox URL could be publicly viewable if Nginx serves the directory. It has clear demo markings and no credentials or personal user data. Add access control at Nginx if public access is undesirable.
