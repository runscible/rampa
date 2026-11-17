import { parseInstant } from '../src/time/time';
import { RateTable } from '../src/rates/rate-table';

const at = parseInstant;

describe('RateTable', () => {
  const table = new RateTable([
    { at: at('2026-10-05T08:00:00-04:00'), rate: '9.8388' },
    { at: at('2026-10-05T07:00:00-04:00'), rate: '9.8467' }, // out of order on purpose
    { at: at('2026-10-05T09:00:00-04:00'), rate: '9.8444' },
  ]);

  it('returns the latest rate at or before the instant', () => {
    expect(table.at(at('2026-10-05T08:18:00-04:00'))?.toString()).toBe('9.8388');
  });

  it('includes a rate published exactly at the instant', () => {
    expect(table.at(at('2026-10-05T09:00:00-04:00'))?.toString()).toBe('9.8444');
  });

  it('just before a rate still uses the previous one', () => {
    expect(table.at(at('2026-10-05T08:59:59-04:00'))?.toString()).toBe('9.8388');
  });

  it('works across offsets (same instant, different notation)', () => {
    expect(table.at(at('2026-10-05T12:30:00Z'))?.toString()).toBe('9.8388'); // 08:30 La Paz
  });

  it('returns undefined before the first rate', () => {
    expect(table.at(at('2026-10-05T06:59:59-04:00'))).toBeUndefined();
  });

  it('rejects rates with more than 6 decimals', () => {
    expect(() => new RateTable([{ at: at('2026-10-05T07:00:00-04:00'), rate: '9.1234567' }])).toThrow(RangeError);
  });

  it('rejects zero or negative rates', () => {
    expect(() => new RateTable([{ at: at('2026-10-05T07:00:00-04:00'), rate: '0' }])).toThrow();
  });
});
