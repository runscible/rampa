import { Deposit } from '../domain/deposits/deposit';
import { accountBalance, assertBalanced, JournalEntry } from '../domain/ledger/ledger';
import { postDeposit } from '../domain/ledger/posting';
import { Money } from '../domain/shared/money';
import { parseInstant } from '../domain/shared/time';

export interface ReconcileInput {
  deposits: Deposit[];
}

export interface ReconcileConfig {
  /** Report state as of this instant (ISO-8601 with offset). */
  cutoff: string;
}

export interface Balances {
  /** USDT sent to the provider but not yet converted to Bs. */
  usdtUnconverted: Money;
}

export interface ReconcileResult {
  balances: Balances;
  ledger: JournalEntry[];
}

/** Use case. Pure: domain objects in, balances + ledger out. The ledger is rebuilt from scratch on every call. */
export function reconcile(input: ReconcileInput, config: ReconcileConfig): ReconcileResult {
  const cutoff = parseInstant(config.cutoff).getTime();

  const ledger = input.deposits
    .filter((d) => d.at.getTime() <= cutoff)
    .map(postDeposit)
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
  assertBalanced(ledger);

  return { balances: { usdtUnconverted: accountBalance(ledger, 'USDT_WALLET_PENDING') }, ledger };
}
