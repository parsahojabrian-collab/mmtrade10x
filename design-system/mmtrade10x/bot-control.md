# MMTrade10X — Bot Control UI/UX Pro Max design system

## Scope
Scoped visual redesign of the Telegram bot and Super Admin bot-management view. Preserve business logic, permissions, API endpoints, configuration IDs, and registration/support state machines.

## Design direction
- Product: Persian RTL crypto-learning interface; style: **Premium Dark Fintech**.
- Tokens: base `#081522`; surface `#101F2E`; raised `#15283A`; line `#294254`; text `#EDF7FB`; muted `#9DB1C1`; emerald `#46E2B3`; blue `#62B5FF`.
- Typeface: Vazirmatn, Tahoma, sans-serif. Diagnostic logs and brand labels retain LTR.
- Controls: minimum 44px height; 10–12px radius; 8 / 12 / 16 / 24 / 32px spacing.
- Motion: 160ms hover with reduced-motion fallback.

## Bot manager information architecture
1. Service health and operational commands
2. Execution mode and welcome content
3. Built-in button settings
4. Automatic keyword replies
5. Custom menu content and media blocks
6. Challenge lesson destination and save actions
7. Read-only logs

## Telegram UX
Telegram's native `Keyboard` and `InlineKeyboard` cannot be styled with CSS. Preserve each button's identity and handler. Pair short labels while keeping long actions full width. Use safe HTML-escaped message cards with section titles, tone, registration progress, and concise next steps.

## Accessibility & operational safety
Use RTL reading order, keyboard focus indicators, live feedback, responsive layout and reduced-motion support. Communicate service status with text, not color alone. Disable controls during active operations. Preserve consent, contact verification, and support persistence logic. Never write changes directly to a production working tree with diverged patches.

## Validation
In a clean checkout run `npm run db:generate && npm run build && npm test`. New bot presentation tests cover escaping, progress and menu grouping. Separately inspect any existing unrelated test failures before merging.