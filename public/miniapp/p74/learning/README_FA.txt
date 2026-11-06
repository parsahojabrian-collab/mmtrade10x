MMTrade10X — Stage 1 Unified Scene R4

Only three files: reference-r4.css, reference-r4.js and assets/reference-r4/scene-background.webp.
Built against stage1.html + stage.css + reference-r3.css/js already deployed.
The 13 visual assets already on the user's server must be present in:
assets/MMTrade10X_Separated_Elements_R1/

This overlay:
- Uses the existing tall approved background in a single continuous image across Stage 1.
- Replaces the old baked hero (R3) with independently positioned transparent images.
- Keeps the seven lesson cards, their controls, status APIs and Stage-2 gate unchanged.
- Does not update database or bot or API.

To deploy: extract ZIP into public/miniapp/p74/learning, add stylesheet
<link rel="stylesheet" href="./reference-r4.css?v=R4"> after R3 CSS,
and script <script defer src="./reference-r4.js?v=R4"></script> after R3 JS,
then rsync only the three files and updated stage1.html to the live folder.

Rollback: restore the saved stage1.html and reload; original R3 remains intact.
