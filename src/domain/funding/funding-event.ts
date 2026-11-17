import { RateTable } from '../rates/rate-table';
import { D } from '../shared/decimal';
import { Money } from '../shared/money';
import { Instant, parseInstant } from '../shared/time';
import { requireNonEmpty } from '../shared/validation';

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

/** Builds a FundingEvent enforcing its invariants. Throws with a readable reason on bad data. */
export function createFundingEvent(raw: RawFundingEvent): FundingEvent {
  return {
    eventId: requireNonEmpty('event_id', raw.eventId),
    depositTxHash: requireNonEmpty('deposit_tx_hash', raw.depositTxHash),
    amountUsdt: Money.parse('USDT', raw.amountUsdt).requirePositive('amount_usdt'),
    rate: RateTable.parseRate(String(raw.rate)),
    amountBs: Money.parse('BS', raw.amountBs).requirePositive('amount_bs'),
    at: parseInstant(raw.timestamp),
  };
}

/** Canonical content of an event: two deliveries are the same iff their fingerprints match. */
export function fingerprintFundingEvent(e: FundingEvent): string {
  return [e.depositTxHash, e.amountUsdt, e.rate, e.amountBs, e.at.toISOString()].join('|');
}
