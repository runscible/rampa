import { Currency, Money } from '../shared/money';
import { Instant } from '../shared/time';

/** Ledger accounts. Each account holds a single currency (see ACCOUNT_CURRENCY). */
export type Account = 'USDT_WALLET_PENDING' | 'PARTNER_PREFUND';

export const ACCOUNT_CURRENCY: Record<Account, Currency> = {
  USDT_WALLET_PENDING: 'USDT',
  PARTNER_PREFUND: 'USDT',
};

/** Signed amount: debit is positive, credit is negative. A balanced entry sums to zero per currency. */
export interface Line {
  account: Account;
  amount: Money;
}

export interface JournalEntry {
  /** Deterministic id derived from the source record, so rebuilding the ledger gives the same entries. */
  id: string;
  /** Effective time: when the movement happened, not when we ingested it. */
  at: Instant;
  lines: Line[];
}

/** Running total per currency for one entry. Throws if a line is booked on an account of another currency. */
function totalsByCurrency(entry: JournalEntry): Map<Currency, Money> {
  const totals = new Map<Currency, Money>();
  for (const { account, amount } of entry.lines) {
    if (amount.currency !== ACCOUNT_CURRENCY[account]) {
      throw new Error(`Entry ${entry.id}: ${account} cannot hold ${amount.currency}`);
    }
    totals.set(amount.currency, (totals.get(amount.currency) ?? Money.zero(amount.currency)).plus(amount));
  }
  return totals;
}

function assertEntryBalanced(entry: JournalEntry): void {
  for (const [currency, total] of totalsByCurrency(entry)) {
    if (!total.isZero()) throw new Error(`Entry ${entry.id} is not balanced in ${currency}: ${total}`);
  }
}

/** Throws on the first entry that is mis-booked or does not sum to zero per currency. */
export function assertBalanced(entries: JournalEntry[]): void {
  entries.forEach(assertEntryBalanced);
}

/** Balance of every account that appears in the entries (debit-positive), in a single pass. */
export function accountBalances(entries: JournalEntry[]): Map<Account, Money> {
  const balances = new Map<Account, Money>();
  for (const { lines } of entries) {
    for (const { account, amount } of lines) {
      balances.set(account, (balances.get(account) ?? Money.zero(ACCOUNT_CURRENCY[account])).plus(amount));
    }
  }
  return balances;
}

/** Balance of one account (zero if it has no lines). */
export function accountBalance(entries: JournalEntry[], account: Account): Money {
  return accountBalances(entries).get(account) ?? Money.zero(ACCOUNT_CURRENCY[account]);
}
