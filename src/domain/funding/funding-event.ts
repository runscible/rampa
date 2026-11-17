import { RateTable } from '../rates/rate-table';
import { D } from '../shared/decimal';
import { Money } from '../shared/money';
import { Instant, parseInstant } from '../shared/time';

/** The provider confirms that a deposit was converted to Bs. */
export interface FundingEvent {
  eventId: string;
  depositTxHash: string;
  amountUsdt: Money;
  /** Rate the provider applied (Bs per USDT), already net of its spread. */
  rate: D;
  amountBs: Money;
  at: Instant;
}

/** Untrusted values for a funding event, as they arrive from any source. */
export interface RawFundingEvent {
  eventId: string;
  depositTxHash: string;
  amountUsdt: string | number;
  rate: string | number;
  amountBs: string | number;
  timestamp: string;
}

function positive(label: string, amount: Money): Money {
  if (amount.isNegative() || amount.isZero()) throw new RangeError(`${label} must be positive`);
  return amount;
}

/** Builds a FundingEvent enforcing its invariants. Throws with a readable reason on bad data. */
export function createFundingEvent(raw: RawFundingEvent): FundingEvent {
  if (raw.eventId === '') throw new TypeError('event_id is empty');
  if (raw.depositTxHash === '') throw new TypeError('deposit_tx_hash is empty');
  return {
    eventId: raw.eventId,
    depositTxHash: raw.depositTxHash,
    amountUsdt: positive('amount_usdt', Money.parse('USDT', raw.amountUsdt)),
    rate: RateTable.parseRate(String(raw.rate)),
    amountBs: positive('amount_bs', Money.parse('BS', raw.amountBs)),
    at: parseInstant(raw.timestamp),
  };
}

/** Canonical content of an event: two deliveries are the same iff their fingerprints match. */
export function fingerprintFundingEvent(e: FundingEvent): string {
  return [e.depositTxHash, e.amountUsdt, e.rate, e.amountBs, e.at.toISOString()].join('|');
}
