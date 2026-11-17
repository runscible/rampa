import { parseRates } from '../../src/adapters/files/parse-rates';

describe('parseRates', () => {
  it('parses hourly rates', () => {
    const { records, errors } = parseRates('timestamp,usdt_bs\n2026-10-05T07:00:00-04:00,9.8467\n2026-10-05T08:00:00-04:00,9.8388\n');
    expect(errors).toEqual([]);
    expect(records.map((r) => [r.at.toISOString(), r.rate])).toEqual([
      ['2026-10-05T11:00:00.000Z', '9.8467'],
      ['2026-10-05T12:00:00.000Z', '9.8388'],
    ]);
  });

  it('reports bad rows by line and a missing column', () => {
    const bad = parseRates('timestamp,usdt_bs\n2026-10-05T07:00:00-04:00,abc\n2026-10-05T08:00:00-04:00,0\n');
    expect(bad.records).toEqual([]);
    expect(bad.errors.map((e) => e.line)).toEqual([2, 3]);
    expect(parseRates('timestamp\n1').errors[0].reason).toMatch(/usdt_bs/);
  });
});
