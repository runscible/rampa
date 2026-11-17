import { Money } from '../shared/money';
import { Instant, parseInstant } from '../shared/time';

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
  if (raw.txHash === '') throw new TypeError('tx_hash is empty');
  const amount = Money.parse('USDT', raw.amount);
  if (amount.isNegative() || amount.isZero()) throw new RangeError('amount_usdt must be positive');
  return { txHash: raw.txHash, amount, at: parseInstant(raw.timestamp) };
}
