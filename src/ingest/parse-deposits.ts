import { Money } from '../money/money';
import { Instant, parseInstant } from '../time/time';
import { CsvRow, ParseError, parseTable } from './csv';

export interface Deposit {
  txHash: string;
  amount: Money;
  at: Instant;
}

export interface ParsedDeposits {
  records: Deposit[];
  errors: ParseError[];
}

const REQUIRED = ['tx_hash', 'amount_usdt', 'timestamp'];

/** Validates one CSV row and builds a Deposit. Throws with a readable reason on bad data. */
function toDeposit({ values }: CsvRow): Deposit {
  if (values.tx_hash === '') throw new TypeError('tx_hash is empty');
  const amount = Money.parse('USDT', values.amount_usdt);
  if (amount.isNegative() || amount.isZero()) throw new RangeError('amount_usdt must be positive');
  return { txHash: values.tx_hash, amount, at: parseInstant(values.timestamp) };
}

export function parseDeposits(csv: string): ParsedDeposits {
  return parseTable(csv, REQUIRED, toDeposit);
}
