# MMTRADE UI/UX Pro Max — R5 source integration

Source base: `main@6b5d2af7f5a4a4d249e279be3bf4e82a033440c8`. This is a real source refactor, not another global CSS/JS overlay.

## Design system
- Fintech, Persian RTL-first, dark emerald (#05150f), refined gold (#e9c58d) and readable mint (#81f5c3).
- Privately licensed Peyda, 18 faces and two families, standard / FaNum; served from the production-verified allowlisted `/miniapp/p74/mm-uux-r1/fonts/peyda/` path. Do not commit commercial font binaries.
- 44px touch targets, visible keyboard focus, motion preference compliance, responsive mobile/desktop layouts, consistent spacing, no unverified claims about profit or status.
- Source-native header cube composed of three CSS faces; preserves the existing configured Object Studio cube, coin, mountain stages, and user-provided artwork.
- Separate existing bottom navigation: do not introduce duplicate bars.
- Dynamic P77 profile uses a new semantic metrics wrapper; real account values, actions, and URLs remain bound to existing logic.
- Visual Studio retains real save, publish, undo/redo, preview, spatial editing and layer inspector handlers.
- Academy, Support, ePlanet and Copy Trade original source styles and primary actions updated rather than patched by an additional global skin.

## Verification
`node --test tests/uiux-promax-r5-source.test.mjs`
`node --check public/miniapp/p74/home.js`
`node --check public/miniapp/p74/profile/profile.js`
`git diff --check main...HEAD`

## Production safety
The active VPS has non-committed server changes and earlier R1–R4 design layers. The GitHub branch has NOT been deployed or merged. Do **not** replace `/root/miniapp10x` or `/srv/tenx-public/miniapp` blindly. Compare source/live HTML and scripts first, consolidate old design layers, back up and test in an independent worktree, then publish behind an isolated preview and inspect real Telegram WebView. Do not restart bot/API or run Chromium on the 4 GB VPS.

## Incomplete scope
Super Admin's large existing UI, each Visual Studio sub-tool, some legacy pages and UI within the Telegram bot commands require further page-specific redesign and tests; current changes cannot be called complete-project redesign.

UI/UX Pro Max skill reference: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md
