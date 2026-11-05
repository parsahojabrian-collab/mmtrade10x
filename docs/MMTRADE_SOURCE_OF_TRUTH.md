# MMTrade10X — Canonical source of truth

Main repository: `parsahojabrian-collab/mmtrade10x`, branch `main`.

Runtime code lives in `apps/api`, `apps/bot`, `packages`, `public/miniapp`,
plus migration, test and deployment source files. This snapshot reflects the
working files on the server at consolidation time; it is **not** proof that
all historical patch effects were successfully installed.

Legacy installers, patch scripts, old snapshots, generated distributions and
backup archives are not part of the canonical source tree. They are
quarantined outside the application root under
`/root/MMTRADE10X_SOURCE_UNIFY_BACKUPS/`.

The Nginx-served Mini App is often under `/srv/tenx-public/miniapp`.
Use the P75 live-source comparison before publication. The consolidation
does not modify the live deployment, Nginx, MySQL, or systemd services.

Never commit `.env`, tokens, keys, user uploads, database backups,
generated `dist`, or `node_modules`. Git history from earlier commits
may still contain old files until separately audited and rewritten.
