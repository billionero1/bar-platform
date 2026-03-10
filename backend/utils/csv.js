function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  const escaped = str.replace(/"/g, '""');
  if (/[",\n]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

export function rowsToCsv(headers, rows) {
  const head = headers.map((h) => escapeCell(h.label)).join(',');
  const body = rows
    .map((row) => headers.map((h) => escapeCell(row[h.key])).join(','))
    .join('\n');
  return `${head}\n${body}\n`;
}
