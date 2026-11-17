import { D } from '../shared/decimal';
import { Instant, parseInstant } from '../shared/time';

/** Rates keep up to 6 decimals: Bs/USDT today, but other assets can move a lot more. */
export const RATE_DECIMALS = 6;

export interface RatePoint {
  at: Instant;
  rate: string;
}

/** Builds a RatePoint from untrusted text. Throws with a readable reason on bad data. */
export function createRatePoint(raw: { timestamp: string; rate: string }): RatePoint {
  RateTable.parseRate(raw.rate);
  return { at: parseInstant(raw.timestamp), rate: raw.rate };
}

/** Canonical content of a rate: 9.80 and 9.8 are the same rate. */
export function fingerprintRatePoint(point: RatePoint): string {
  return new D(point.rate).toString();
}

/** Reference rate lookup: the latest rate published at or before a given instant. */
export class RateTable {
  private readonly points: { atMs: number; rate: D }[];

  constructor(points: RatePoint[]) {
    this.points = points
      .map((p) => ({ atMs: p.at.getTime(), rate: RateTable.parseRate(p.rate) }))
      .sort((a, b) => a.atMs - b.atMs);
  }

  static parseRate(text: string): D {
    const rate = new D(text);
    if (!rate.isFinite() || !rate.isPositive() || rate.isZero()) {
      throw new TypeError(`Rate must be a positive number: ${JSON.stringify(text)}`);
    }
    if (rate.decimalPlaces() > RATE_DECIMALS) {
      throw new RangeError(`Rate ${text} has more than ${RATE_DECIMALS} decimals`);
    }
    return rate;
  }

  at(instant: Instant): D | undefined {
    const target = instant.getTime();
    let found: D | undefined;
    for (const point of this.points) {
      if (point.atMs > target) break;
      found = point.rate;
    }
    return found;
  }
}
