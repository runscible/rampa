import { ParseError } from './csv';

export interface JsonRecordsResult<T> {
  records: T[];
  /** `line` is the 1-based position of the record in the JSON array. */
  errors: ParseError[];
}

/** JSON array -> typed records. A record that fails `convert` is reported by position; the rest are kept. */
export function parseJsonRecords<T>(json: string, convert: (record: unknown) => T): JsonRecordsResult<T> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { records: [], errors: [{ line: 1, reason: 'Invalid JSON' }] };
  }
  if (!Array.isArray(data)) return { records: [], errors: [{ line: 1, reason: 'Expected a JSON array' }] };

  const records: T[] = [];
  const errors: ParseError[] = [];
  data.forEach((item, index) => {
    try {
      records.push(convert(item));
    } catch (e) {
      errors.push({ line: index + 1, reason: (e as Error).message });
    }
  });
  return { records, errors };
}

/** Checks that `record` is an object whose listed fields are all strings or numbers. */
export function requireFields<F extends string>(record: unknown, fields: readonly F[]): Record<F, string | number> {
  if (typeof record !== 'object' || record === null) throw new TypeError('Record is not an object');
  const values = record as Record<string, unknown>;
  for (const field of fields) {
    if (typeof values[field] !== 'string' && typeof values[field] !== 'number') {
      throw new TypeError(`Missing or invalid field: ${field}`);
    }
  }
  return values as Record<F, string | number>;
}
