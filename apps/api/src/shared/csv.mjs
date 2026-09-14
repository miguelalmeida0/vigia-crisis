function splitCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else current += char;
  }
  values.push(current);
  return values;
}

export function parseCsv(text) {
  const lines = String(text ?? '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((value) => value.trim());
  return lines.slice(1).map((line) => Object.fromEntries(
    splitCsvLine(line).map((value, index) => [headers[index], value.trim()])
  ));
}
