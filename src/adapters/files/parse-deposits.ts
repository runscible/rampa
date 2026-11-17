import { createDeposit, Deposit } from '../../domain/deposits/deposit';
import { CsvRow, ParseError, parseTable } from './csv';

export interface ParsedDeposits {
  records: Deposit[];
  errors: ParseError[];
}

const REQUIRED = ['tx_hash', 'amount_usdt', 'timestamp'];

/** Maps a CSV row to the domain: column names stay here, the rules live in createDeposit. */
function toDeposit({ values }: CsvRow): Deposit {
  return createDeposit({ txHash: values.tx_hash, amount: values.amount_usdt, timestamp: values.timestamp });
}

export function parseDeposits(csv: string): ParsedDeposits {
  return parseTable(csv, REQUIRED, toDeposit);
}
