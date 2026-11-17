import { Money } from '../shared/money';
import { Instant } from '../shared/time';
import { JournalEntry } from '../ledger/ledger';
import { Break, createBreak } from './break';
import { BreakRule } from './context';

interface Interval {
  start: Instant;
  /** Lowest balance reached (negative). */
  lowest: Money;
}

/** Groups consecutive entries that happened at the same instant (the ledger is sorted by instant). */
function byInstant(ledger: JournalEntry[]): JournalEntry[][] {
  const groups: JournalEntry[][] = [];
  for (const entry of ledger) {
    const last = groups[groups.length - 1];
    if (last && last[0].at.getTime() === entry.at.getTime()) last.push(entry);
    else groups.push([entry]);
  }
  return groups;
}

const providerBalanceChange = (entries: JournalEntry[]): Money =>
  entries
    .flatMap((e) => e.lines)
    .filter((l) => l.account === 'BS_PROVIDER_BALANCE')
    .reduce((sum, l) => sum.plus(l.amount), Money.zero('BS'));

const describe = (interval: Interval, end: Instant | undefined): Break => {
  const until = end ? `until ${end.toISOString()}` : 'and still negative at the cutoff';
  const reason = `Provider Bs balance negative from ${interval.start.toISOString()} ${until}; maximum shortfall ${interval.lowest.negate()} Bs`;
  return createBreak('NEGATIVE_BALANCE', interval.start.toISOString(), reason, interval.start);
};

/**
 * The provider does not reserve balance, so a pay-out can complete without funds. One break per interval in which the
 * Bs balance is below zero, judged after netting everything that happened at the same instant.
 */
export const negativeBalance: BreakRule = ({ ledger }) => {
  const breaks: Break[] = [];
  let balance = Money.zero('BS');
  let open: Interval | undefined;

  for (const entries of byInstant(ledger)) {
    balance = balance.plus(providerBalanceChange(entries));
    const at = entries[0].at;
    if (balance.isNegative()) {
      if (open === undefined) open = { start: at, lowest: balance };
      else if (balance.minus(open.lowest).isNegative()) open.lowest = balance;
    } else if (open !== undefined) {
      breaks.push(describe(open, at));
      open = undefined;
    }
  }
  if (open !== undefined) breaks.push(describe(open, undefined));
  return breaks;
};

export const BALANCE_RULES: BreakRule[] = [negativeBalance];
