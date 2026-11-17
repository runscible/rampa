import { Deposit } from '../domain/deposits/deposit';
import { fingerprintFundingEvent, FundingEvent } from '../domain/funding/funding-event';
import { accountBalances, assertBalanced, JournalEntry } from '../domain/ledger/ledger';
import { postDeposit, postFunding } from '../domain/ledger/posting';
import { dedupeById } from '../domain/shared/dedupe';
import { Money } from '../domain/shared/money';
import { parseInstant } from '../domain/shared/time';

export interface ReconcileInput {
  deposits: Deposit[];
  fundingEvents: FundingEvent[];
}

export interface ReconcileConfig {
  /** Report state as of this instant (ISO-8601 with offset). */
  cutoff: string;
}

export interface Balances {
  /** USDT sent to the provider but not yet converted to Bs. */
  usdtUnconverted: Money;
  /** USDT the provider has converted to Bs. */
  usdtConverted: Money;
  /** Total Bs credited by funding events. */
  bsFunded: Money;
}

export interface IngestionNotes {
  /** Funding events delivered again with identical content (ignored). */
  duplicateEventIds: string[];
  /** Funding events delivered again with different content (first one kept; needs review). */
  conflictingEventIds: string[];
}

export interface ReconcileResult {
  balances: Balances;
  ledger: JournalEntry[];
  ingestion: IngestionNotes;
}

/** Use case. Pure: domain objects in, balances + ledger out. The ledger is rebuilt from scratch on every call. */
export function reconcile(input: ReconcileInput, config: ReconcileConfig): ReconcileResult {
  const cutoff = parseInstant(config.cutoff).getTime();
  const upToCutoff = <T extends { at: Date }>(item: T): boolean => item.at.getTime() <= cutoff;

  const funding = dedupeById(input.fundingEvents, (e) => e.eventId, fingerprintFundingEvent);

  const ledger = [
    ...input.deposits.filter(upToCutoff).map(postDeposit),
    ...funding.unique.filter(upToCutoff).map(postFunding),
  ].sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
  assertBalanced(ledger);

  const accounts = accountBalances(ledger);
  return {
    balances: {
      usdtUnconverted: accounts.get('USDT_WALLET_PENDING') ?? Money.zero('USDT'),
      usdtConverted: accounts.get('USDT_CONVERTED') ?? Money.zero('USDT'),
      bsFunded: (accounts.get('FX_CLEARING') ?? Money.zero('BS')).negate(),
    },
    ledger,
    ingestion: {
      duplicateEventIds: funding.duplicates.map((e) => e.eventId),
      conflictingEventIds: funding.conflicts.map((e) => e.eventId),
    },
  };
}
