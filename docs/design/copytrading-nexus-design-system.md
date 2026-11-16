# MMTRADE10X — Copy Trading Nexus / Design System v0.1
Status: PROPOSAL ONLY. Approval required before modifying the live UI. Source of design principles: nextlevelbuilder/ui-ux-pro-max-skill (design-system generation, conversion-focused layout, accessibility and responsive checks). Visual reference: approved conceptual Nexus mockup; do not treat it as a pixel-perfect implementation specification.

## Product objective
Preserve MMTRADE10X identity and existing Home navigation while making "شروع اتصال به کپی‌ترید" the dominant action. Never imply guaranteed profits, risk-free trading, or that a connection is complete without backend confirmation.

## Visual tokens
Background #041710; surface #0B2119; glass fill rgba(10,44,32,.58); glass stroke rgba(112,255,193,.28); text #F8F2E9; secondary #B7D2C4; primary #23DC9D; accent gold #E4AD74; danger #FF647C. Persian font: existing DoranFaNum; no new font downloads. Radius: 12 / 18 / 26px; spacing scale: 4,8,12,16,24,32px.

## Layout (RTL, mobile-first)
1. Existing logo, profile, notification controls retained.
2. Nexus scene: luminous translucent central trading cube, subtle orbital rings, 4 non-primary feature tiles. Scene is decorative and must not intercept taps.
3. H1 "اتصال به کپی‌ترید MMTRADE 10X"; explanatory line with accurate non-promissory copy.
4. Primary CTA "شروع اتصال به کپی‌ترید" above the fold on common mobile heights, with actual ePlanet onboarding route validated before wiring.
5. Secondary education, support, risk explanation.
6. Existing 10X journey and navigation retained, connection affordance made more prominent after approval.

## UX states
Not connected → CTA starts onboarding.
In progress → "ادامه اتصال" restores server-backed progress.
Verification pending → show pending, no false success.
Connected → show verified status and destination.
Error → retry and support.
Unknown → show neutral state; never fabricate connection status.

## Rendering approach
CSS glass cards with backdrop-filter and translucent gradients; SVG/CSS rings; pre-rendered optimized transparent 3D hero asset initially. WebGL/Three.js only if device benchmarks justify it. Respect prefers-reduced-motion; fallback for backdrop-filter; no mandatory animation to navigate.

## QA acceptance gates
375px, 390px, 430px viewports; keyboard/focus and RTL; no text clipping; contrast >= 4.5:1 for normal text where applicable; tap targets >= 44px; no blocked scroll; Telegram WebView Android/iOS smoke tests; no broken original navigation; measure load and interaction latency; no changes to main or production until approved.

## Proposed implementation scope (not yet executed)
Create isolated preview HTML/CSS/JS in public/miniapp/p74/nexus-preview/, no live routing changes. Review screenshots and test results with stakeholder, then seek explicit approval for any integration into home.js/home.css.
