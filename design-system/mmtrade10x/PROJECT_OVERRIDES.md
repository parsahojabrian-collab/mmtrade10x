# Project-specific overrides for the generated UI/UX Pro Max output

The upstream generator's Financial Dashboard result is the source of the palette and dense dashboard direction. The generated type pairing is Fira Code + Fira Sans, but the existing project already serves Doran/DoranFaNum and the interface is Persian-first. Therefore:
- Keep Doran/DoranFaNum as the Persian UI font.
- Use Fira Code only for LTR technical identifiers and code values where it is available; use a system monospace fallback.
- Keep all overlays dark. The generated generic modal sample uses a white modal, which conflicts with the selected OLED system; use `--uix-surface` instead.
- The generator's landing-page pattern is not a page architecture for the authenticated admin dashboard. Page-specific overrides in `pages/` take precedence.
- Apply the generated palette through semantic tokens, not per-component hex values.
- The upstream data marks Financial Dashboard and Fintech/Crypto RTL as `partial`; mirror icons and directional charts and test every component rather than assuming a global RTL flip is enough.

## Existing implementation constraints
Preserve the live R6/R7/R8/R10/P51/P53/P54/P59/P60/P74 editor logic, endpoint contracts, route IDs, permission checks, dirty-state guards, and page publication/revision flow. Visual implementation may add wrappers and data attributes but must not change these contracts.
