import { Deposit } from '../domain/deposits/deposit';
import { fingerprintFundingEvent, FundingEvent } from '../domain/funding/funding-event';
import { accountBalances, assertBalanced, JournalEntry } from '../domain/ledger/ledger';
import { postDeposit, postFunding, postPayout } from '../domain/ledger/posting';
import { fingerprintPayoutEvent, PayoutEvent } from '../domain/payouts/payout-event';
import { dedupeById } from '../domain/shared/dedupe';
import { Money } from '../domain/shared/money';
import { parseInstant } from '../domain/shared/time';

export interface ReconcileInput {
  deposits: Deposit[];
  fundingEvents: FundingEvent[];
  payoutEvents: PayoutEvent[];
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
  /** Bs available at the provider (funded minus completed pay-outs). */
  bsAvailable: Money;
  /** Bs paid out through COMPLETED pay-outs. */
  bsPaidOut: Money;
}

export interface IngestionNotes {
  /** Events delivered again with identical content (ignored). */
  duplicateEventIds: string[];
  /** Events delivered again with different content (first one kept; needs review). */
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
  const payouts = dedupeById(input.payoutEvents, (e) => e.eventId, fingerprintPayoutEvent);

  const ledger = [
    ...input.deposits.filter(upToCutoff).map(postDeposit),
    ...funding.unique.filter(upToCutoff).map(postFunding),
    ...payouts.unique.filter(upToCutoff).flatMap((e) => postPayout(e) ?? []),
  ].sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
  assertBalanced(ledger);

  const accounts = accountBalances(ledger);
  return {
    balances: {
      usdtUnconverted: accounts.get('USDT_WALLET_PENDING') ?? Money.zero('USDT'),
      usdtConverted: accounts.get('USDT_CONVERTED') ?? Money.zero('USDT'),
      bsFunded: (accounts.get('FX_CLEARING') ?? Money.zero('BS')).negate(),
      bsAvailable: accounts.get('BS_PROVIDER_BALANCE') ?? Money.zero('BS'),
      bsPaidOut: accounts.get('BS_PAID_OUT') ?? Money.zero('BS'),
    },
    ledger,
    ingestion: {
      duplicateEventIds: [...funding.duplicates, ...payouts.duplicates].map((e) => e.eventId),
      conflictingEventIds: [...funding.conflicts, ...payouts.conflicts].map((e) => e.eventId),
    },
  };
}
