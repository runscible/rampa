import { Money } from '../shared/money';
import { Instant, parseInstant } from '../shared/time';
import { requireNonEmpty } from '../shared/validation';

/** An on-chain USDT deposit received by the provider's wallet. */
export interface Deposit {
  txHash: string;
  amount: Money;
  at: Instant;
}

/** Untrusted text values for a deposit, as they arrive from any source (CSV, API, ...). */
export interface RawDeposit {
  txHash: string;
  amount: string;
  timestamp: string;
}

/** Builds a Deposit enforcing its invariants. Throws with a readable reason on bad data. */
export function createDeposit(raw: RawDeposit): Deposit {
  return {
    txHash: requireNonEmpty('tx_hash', raw.txHash),
    amount: Money.parse('USDT', raw.amount).requirePositive('amount_usdt'),
    at: parseInstant(raw.timestamp),
  };
}

/** Canonical content of a deposit: two deliveries of the same tx_hash are the same iff their fingerprints match. */
export function fingerprintDeposit(d: Deposit): string {
  return [d.amount, d.at.toISOString()].join('|');
}
