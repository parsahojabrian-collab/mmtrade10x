# Bot operations override

- Covers Telegram bot status, start/stop/restart, Mini App mode, welcome message, buttons, auto replies, custom menu, challenge destination, and logs.
- Separate service health from configuration; service actions live in a clearly labelled operational card.
- Destructive stop/restart requires confirmation; disable duplicate requests while busy.
- Configuration groups use tabs or sections with visible labels and unsaved-change feedback.
- Logs use a monospace LTR block with timestamp/severity and copy control.
- Never imply an action succeeded before the API confirms it; preserve all existing bot APIs and role guards.
