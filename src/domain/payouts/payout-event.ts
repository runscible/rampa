import { Money } from '../shared/money';
import { Instant, parseInstant } from '../shared/time';

export const PAYOUT_EVENT_TYPES = ['PREVIEW', 'CONFIRM', 'COMPLETED', 'FAILED', 'REVERSED'] as const;
export type PayoutEventType = (typeof PAYOUT_EVENT_TYPES)[number];

/** One lifecycle event of a pay-out, as reported by the provider. */
export interface PayoutEvent {
  eventId: string;
  payoutId: string;
  type: PayoutEventType;
  amountBs: Money;
  at: Instant;
}

/** Untrusted values for a payout event, as they arrive from any source. */
export interface RawPayoutEvent {
  eventId: string;
  payoutId: string;
  type: string;
  amountBs: string | number;
  timestamp: string;
}

function isPayoutEventType(type: string): type is PayoutEventType {
  return (PAYOUT_EVENT_TYPES as readonly string[]).includes(type);
}

/** Builds a PayoutEvent enforcing its invariants. Throws with a readable reason on bad data. */
export function createPayoutEvent(raw: RawPayoutEvent): PayoutEvent {
  if (raw.eventId === '') throw new TypeError('event_id is empty');
  if (raw.payoutId === '') throw new TypeError('payout_id is empty');
  if (!isPayoutEventType(raw.type)) throw new TypeError(`Unknown payout event type: ${JSON.stringify(raw.type)}`);
  const amountBs = Money.parse('BS', raw.amountBs);
  if (amountBs.isNegative() || amountBs.isZero()) throw new RangeError('amount_bs must be positive');
  return { eventId: raw.eventId, payoutId: raw.payoutId, type: raw.type, amountBs, at: parseInstant(raw.timestamp) };
}

/** Canonical content of an event: two deliveries are the same iff their fingerprints match. */
export function fingerprintPayoutEvent(e: PayoutEvent): string {
  return [e.payoutId, e.type, e.amountBs, e.at.toISOString()].join('|');
}
