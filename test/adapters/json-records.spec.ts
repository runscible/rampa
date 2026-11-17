import { parseJsonRecords, requireFields } from '../../src/adapters/files/json-records';

describe('parseJsonRecords', () => {
  const convert = (r: unknown) => (r as { n: number }).n * 2;

  it('converts every record', () => {
    expect(parseJsonRecords('[{"n":1},{"n":2}]', convert)).toEqual({ records: [2, 4], errors: [] });
  });

  it('reports a failing record by 1-based position and keeps the others', () => {
    const boom = (r: unknown) => {
      if ((r as { n: number }).n === 2) throw new Error('bad');
      return 1;
    };
    expect(parseJsonRecords('[{"n":1},{"n":2},{"n":3}]', boom)).toEqual({
      records: [1, 1],
      errors: [{ line: 2, reason: 'bad' }],
    });
  });

  it('reports invalid JSON and non-array JSON', () => {
    expect(parseJsonRecords('{nope', convert).errors).toEqual([{ line: 1, reason: 'Invalid JSON' }]);
    expect(parseJsonRecords('{}', convert).errors).toEqual([{ line: 1, reason: 'Expected a JSON array' }]);
  });
});

describe('requireFields', () => {
  it('returns the record when every field is a string or number', () => {
    expect(requireFields({ a: 'x', b: 1 }, ['a', 'b'])).toEqual({ a: 'x', b: 1 });
  });

  it('throws naming the missing or invalid field', () => {
    expect(() => requireFields({ a: 'x' }, ['a', 'b'])).toThrow(/b/);
    expect(() => requireFields({ a: null }, ['a'])).toThrow(/a/);
    expect(() => requireFields('nope', ['a'])).toThrow(/object/);
  });
});
