/** Quotes a CSV cell and neutralises spreadsheet formulas (=, +, -, @) coming from user-controlled text. */
export function csvCellSafe(value: unknown): string {
  let s = String(value ?? '');
  const looksLikePhone = /^\+?\d[\d\s-]*$/.test(s);
  if ((/^\s*[=+\-@]/.test(s) && !looksLikePhone) || /^[\t\r]/.test(s)) s = "'" + s;
  return `"${s.replaceAll('"', '""')}"`;
}
