type Button = { id: string; label: string };

/** Default labels remain accepted by the bot even after a button is renamed. */
export function botMenuConflict(
  buttons: readonly Button[], defaults: readonly Button[], custom: readonly { label: string }[]
): string | null {
  const expected = new Set(defaults.map(button => button.id));
  if (buttons.length !== expected.size || new Set(buttons.map(button => button.id)).size !== expected.size ||
      buttons.some(button => !expected.has(button.id))) return 'duplicate_or_missing_builtin_id';
  const owners = new Map<string, string>();
  for (const button of [...defaults, ...buttons]) {
    const label = button.label.trim().normalize('NFC');
    const owner = owners.get(label);
    if (owner !== undefined && owner !== button.id) return 'menu_label_conflict';
    owners.set(label, button.id);
  }
  for (const item of custom) {
    const label = item.label.trim().normalize('NFC');
    if (owners.has(label)) return 'menu_label_conflict';
    owners.set(label, 'custom');
  }
  return null;
}
