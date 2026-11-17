import { parseDeposits } from '../ingest/parse-deposits';
import { accountBalance, assertBalanced, JournalEntry } from '../ledger/ledger';
import { postDeposit } from '../ledger/posting';
import { Money } from '../money/money';
import { parseInstant } from '../time/time';

export interface ReconcileInput {
  /** Raw contents of usdt_deposits.csv. */
  deposits: string;
}

export interface ReconcileConfig {
  /** Report state as of this instant (ISO-8601 with offset). */
  cutoff: string;
}

export interface SourceParseError {
  file: string;
  line: number;
  reason: string;
}

export interface Balances {
  /** USDT sent to the provider but not yet converted to Bs. */
  usdtUnconverted: Money;
}

export interface ReconcileResult {
  balances: Balances;
  ledger: JournalEntry[];
  parseErrors: SourceParseError[];
}

/** Pure function: raw files in, balances + ledger out. The ledger is rebuilt from scratch on every call. */
export function reconcile(input: ReconcileInput, config: ReconcileConfig): ReconcileResult {
  const cutoff = parseInstant(config.cutoff).getTime();
  const { records, errors } = parseDeposits(input.deposits);

  const ledger = records
    .filter((d) => d.at.getTime() <= cutoff)
    .map(postDeposit)
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
  assertBalanced(ledger);

  return {
    balances: { usdtUnconverted: accountBalance(ledger, 'USDT_WALLET_PENDING') },
    ledger,
    parseErrors: errors.map((e) => ({ file: 'usdt_deposits.csv', ...e })),
  };
}
