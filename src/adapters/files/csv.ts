export interface CsvRow {
  /** 1-based line number in the source file (the header is line 1). */
  line: number;
  values: Record<string, string>;
}

export interface ParseError {
  line: number;
  reason: string;
}

export interface CsvResult {
  rows: CsvRow[];
  errors: ParseError[];
}

/** Splits a CSV line into trimmed cells (no quoted fields: none of our files need them). */
export function splitCells(line: string): string[] {
  return line.split(',').map((cell) => cell.trim());
}

/** Splits text into lines, tolerating both \n and \r\n. */
function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** Header cells of a CSV text, or null when the header is missing/blank. */
export function parseHeader(text: string): string[] | null {
  const first = splitLines(text)[0] ?? '';
  return first.trim() === '' ? null : splitCells(first);
}

/** Required columns absent from the header. */
export function missingColumns(header: string[], required: string[]): string[] {
  return required.filter((column) => !header.includes(column));
}

function parseRow(header: string[], rawLine: string, line: number): CsvRow | ParseError {
  const cells = splitCells(rawLine);
  if (cells.length !== header.length) {
    return { line, reason: `Expected ${header.length} columns, got ${cells.length}` };
  }
  return { line, values: Object.fromEntries(header.map((h, i) => [h, cells[i]])) };
}

/** Minimal CSV reader. Bad rows are reported, not thrown. */
export function parseCsv(text: string): CsvResult {
  const header = parseHeader(text);
  if (header === null) return { rows: [], errors: [{ line: 1, reason: 'Missing header' }] };

  const rows: CsvRow[] = [];
  const errors: ParseError[] = [];
  splitLines(text).forEach((rawLine, index) => {
    if (index === 0 || rawLine.trim() === '') return;
    const result = parseRow(header, rawLine, index + 1);
    if ('values' in result) rows.push(result);
    else errors.push(result);
  });
  return { rows, errors };
}

export interface TableResult<T> {
  records: T[];
  errors: ParseError[];
}

/** CSV -> typed records: checks required columns, maps each row with `convert`, collects errors by line. */
export function parseTable<T>(text: string, required: string[], convert: (row: CsvRow) => T): TableResult<T> {
  const { rows, errors } = parseCsv(text);
  const missing = missingColumns(parseHeader(text) ?? [], required);
  if (missing.length > 0) {
    return { records: [], errors: [...errors, { line: 1, reason: `Missing columns: ${missing.join(', ')}` }] };
  }

  const records: T[] = [];
  const rowErrors = rows.flatMap((row): ParseError[] => {
    try {
      records.push(convert(row));
      return [];
    } catch (e) {
      return [{ line: row.line, reason: (e as Error).message }];
    }
  });
  return { records, errors: [...errors, ...rowErrors].sort((a, b) => a.line - b.line) };
}
