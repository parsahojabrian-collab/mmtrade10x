# MMTRADE — Peyda UI Font R1 (review-only)

## Approved scope
- The main Persian interface font becomes **Peyda** across MMTRADE web Mini App pages and visual/admin tooling.
- The existing brand identity, page compositions, P74 mountain steps, central cube, backgrounds, effects and floating bottom navigation are preserved.
- Select artistic headings continue to use **Doran**.
- The `FaNum` variant is opt-in for Persian numeral display; financial identifiers and Latin account IDs are not forcibly converted.
- Telegram's native chat bubbles and keyboards do **not** permit custom fonts. Bot logic and Telegram message behavior remain unchanged.

## Important: proprietary font, private binary delivery
The user's supplied `68 peyda.zip` contains FontIran/Peyda commercial and proprietary font files. Its bundled font CSS has a blank license field. **No WOFF2, WOFF or TTF font binaries are committed here.** Verify an appropriate self-hosting/web-embedding license before publishing the font assets.

The `public/miniapp/shared/mm-peyda-ui.css` file is intentionally **not linked to any production HTML in this PR**. It is safe to review without triggering missing-font requests or altering production.

## Private install sequence (NOT performed by this PR)
A separately delivered private package, `MMTRADE_PEYDA_R1.zip`, contains the authorized font assets, the same UI CSS, README, and a guarded `install.py`.
On the private server:
1. Transfer the private package into a secure directory **outside Git and any public web root**.
2. Run `python3 install.py audit --root /root/miniapp10x`.
3. Run `python3 install.py stage --root /root/miniapp10x` and inspect `STAGED/plan.json`.
4. Run `python3 install.py install --root /root/miniapp10x` only after staging review.
5. Run `python3 install.py verify --root /root/miniapp10x`.
6. Inspect in Telegram's webview and real browser before any separate live deployment.
7. If required, run `python3 install.py rollback --root /root/miniapp10x`.

The private installer adds a marked stylesheet link in Mini App / selected admin HTML, copies **18 WOFF2 files** to the local project source and keeps backups. It does **not** deploy, push, update the Nginx-served live directory, modify database/API/bot handlers, or restart services.

## Verification and risk
- Private-package installer validated in three synthetic-fixture tests: audit/stage/install/verify/rollback; source-drift rejection; missing-head rejection.
- The connected GitHub `main` head used for this branch was `6b5d2af7f5a4a4d249e279be3bf4e82a033440c8`.
- This does **not** prove all local server changes match GitHub. Follow the project's documented live-source comparison (P75) before any publication.
- Changing font metrics may shift wrapping and height in compact cards despite not changing CSS dimensions; verify 320/375/390/430px, long Persian labels, RTL direction, and mobile safe areas.
- No actual server, Telegram WebView or screenshot visual verification has yet been performed.
