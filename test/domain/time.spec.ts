import { formatInZone, parseInstant } from '../../src/domain/shared/time';

describe('parseInstant', () => {
  it('converts an offset timestamp to the right UTC instant', () => {
    expect(parseInstant('2026-10-05T08:10:00-04:00').toISOString()).toBe('2026-10-05T12:10:00.000Z');
  });

  it('accepts Z and compares equal instants written with different offsets', () => {
    const a = parseInstant('2026-10-05T12:10:00Z');
    const b = parseInstant('2026-10-05T08:10:00-04:00');
    expect(a.getTime()).toBe(b.getTime());
  });

  it('rejects timestamps without an explicit offset (ambiguous)', () => {
    expect(() => parseInstant('2026-10-05T08:10:00')).toThrow(/offset/i);
  });

  it.each(['', 'yesterday', '2026-13-45T00:00:00Z'])('rejects garbage %p', (bad) => {
    expect(() => parseInstant(bad)).toThrow();
  });
});

describe('formatInZone', () => {
  const instant = parseInstant('2026-10-05T12:10:00Z');

  it('formats in the configured IANA zone, with its offset', () => {
    expect(formatInZone(instant, 'America/La_Paz')).toBe('2026-10-05T08:10:00-04:00');
    expect(formatInZone(instant, 'America/Argentina/Buenos_Aires')).toBe('2026-10-05T09:10:00-03:00');
  });

  it('formats UTC with +00:00', () => {
    expect(formatInZone(instant, 'UTC')).toBe('2026-10-05T12:10:00+00:00');
  });

  it('rejects an unknown time zone', () => {
    expect(() => formatInZone(instant, 'Mars/Olympus')).toThrow();
  });
});
