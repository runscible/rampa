import { parseCsv } from '../../src/adapters/files/csv';

describe('parseCsv', () => {
  it('maps rows to objects by header', () => {
    expect(parseCsv('a,b\n1,2\n3,4\n')).toEqual({
      rows: [
        { line: 2, values: { a: '1', b: '2' } },
        { line: 3, values: { a: '3', b: '4' } },
      ],
      errors: [],
    });
  });

  it('handles CRLF, blank lines and surrounding whitespace', () => {
    const { rows, errors } = parseCsv('a,b\r\n 1 , 2 \r\n\r\n');
    expect(rows).toEqual([{ line: 2, values: { a: '1', b: '2' } }]);
    expect(errors).toEqual([]);
  });

  it('reports rows with the wrong number of columns and keeps the rest', () => {
    const { rows, errors } = parseCsv('a,b\n1,2\n3\n5,6');
    expect(rows.map((r) => r.line)).toEqual([2, 4]);
    expect(errors).toEqual([{ line: 3, reason: 'Expected 2 columns, got 1' }]);
  });

  it('reports an empty file', () => {
    expect(parseCsv('').errors).toEqual([{ line: 1, reason: 'Missing header' }]);
  });
});
