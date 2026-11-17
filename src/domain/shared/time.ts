import { DateTime } from 'luxon';

/** An absolute point in time. Always UTC internally; zones only matter when displaying. */
export type Instant = Date;
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/;

/** Parses ISO-8601 requiring an explicit offset: a timestamp without one is ambiguous. */
export function parseInstant(text: string): Instant {
  if (!HAS_OFFSET.test(text)) {
    throw new TypeError(`Timestamp needs an explicit UTC offset (ISO-8601): ${JSON.stringify(text)}`);
  }
  const parsed = DateTime.fromISO(text, { setZone: true });
  if (!parsed.isValid) throw new TypeError(`Invalid timestamp: ${JSON.stringify(text)}`);
  return parsed.toJSDate();
}

/** Formats an instant as local ISO-8601 with offset in an IANA zone, e.g. 2026-10-05T08:10:00-04:00. */
export function formatInZone(instant: Instant, timeZone: string): string {
  const local = DateTime.fromJSDate(instant, { zone: timeZone });
  if (!local.isValid) throw new RangeError(`Invalid time zone: ${JSON.stringify(timeZone)}`);
  return local.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
}
