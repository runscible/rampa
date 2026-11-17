import { Break, BreakThresholds, DEFAULT_THRESHOLDS } from '../domain/breaks/break';
import { RepeatedId } from '../domain/breaks/context';
import { findBreaks } from '../domain/breaks/find-breaks';
import { Deposit } from '../domain/deposits/deposit';
import { FundingEvent } from '../domain/funding/funding-event';
import { accountBalances, assertBalanced, JournalEntry } from '../domain/ledger/ledger';
import { postDeposit, postFunding, postPayout } from '../domain/ledger/posting';
import { PayoutEvent } from '../domain/payouts/payout-event';
import { RejectedPayoutEvent, replayPayouts, totalInFlight } from '../domain/payouts/payout-state';
import { RatePoint, RateTable } from '../domain/rates/rate-table';
import { DedupeResult } from '../domain/shared/dedupe';
import { Money } from '../domain/shared/money';
import { parseInstant } from '../domain/shared/time';
import { dedupeFeed, FeedName, feedKeys, FeedRecords } from './feeds';

export interface ReconcileInput {
  deposits: Deposit[];
  fundingEvents: FundingEvent[];
  payoutEvents: PayoutEvent[];
  /** Hourly market reference rates. */
  rates: RatePoint[];
}

/** `cutoff` is required; the service levels default to the provider's documented ones. */
export type ReconcileConfig = { cutoff: string } & Partial<BreakThresholds>;

export interface Balances {
  /** USDT sent to the provider but not yet converted to Bs. */
  usdtUnconverted: Money;
  /** USDT the provider has converted to Bs. */
  usdtConverted: Money;
  /** Total Bs credited by funding events. */
  bsFunded: Money;
  /** Bs available at the provider (funded minus completed pay-outs). */
  bsAvailable: Money;
  /** Bs paid out: COMPLETED pay-outs net of REVERSED ones. */
  bsPaidOut: Money;
  /** Bs in confirmed pay-outs that are not final yet. */
  bsInFlight: Money;
}

export interface IngestionNotes {
  /** Ids (tx_hash, event_id or rate timestamp) delivered again with identical content (ignored). */
  duplicateIds: string[];
  /** Ids delivered again with different content (first one kept; needs review). */
  conflictingIds: string[];
  /** Pay-out events that made an illegal state transition (never applied). */
  rejectedPayoutEvents: RejectedPayoutEvent[];
}

export interface ReconcileResult {
  balances: Balances;
  /** Everything that does not reconcile or needs a human look, most severe first. */
  breaks: Break[];
  ledger: JournalEntry[];
  ingestion: IngestionNotes;
}

/** Use case. Pure: domain objects in, balances + breaks + ledger out. Everything is rebuilt from scratch on every call. */
export function reconcile(input: ReconcileInput, config: ReconcileConfig): ReconcileResult {
  const cutoff = parseInstant(config.cutoff);
  const thresholds: BreakThresholds = { ...DEFAULT_THRESHOLDS, ...config };
  const upToCutoff = <T extends { at: Date }>(item: T): boolean => item.at.getTime() <= cutoff.getTime();

  const deposits = dedupeFeed('deposits', input.deposits);
  const funding = dedupeFeed('fundingEvents', input.fundingEvents);
  const payouts = dedupeFeed('payoutEvents', input.payoutEvents);
  const rates = dedupeFeed('rates', input.rates);
  const lifecycle = replayPayouts(payouts.unique.filter(upToCutoff));

  const byId = (a: JournalEntry, b: JournalEntry) => a.id.localeCompare(b.id);
  const depositsInReport = deposits.unique.filter(upToCutoff);
  const fundingInReport = funding.unique.filter(upToCutoff);
  const depositEntries = depositsInReport.map(postDeposit).sort(byId);
  const fundingEntries = fundingInReport.map(postFunding).sort(byId);
  const payoutEntries = lifecycle.accepted.flatMap((e) => postPayout(e) ?? []); // already in lifecycle order

  // Sorting by instant only is deliberate: the sort is stable, so entries at the same instant keep the order
  // of this list: deposits, then fundings, then payouts (a funding is applied before a payout at the same time).
  const ledger = [...depositEntries, ...fundingEntries, ...payoutEntries].sort((a, b) => a.at.getTime() - b.at.getTime());
  assertBalanced(ledger);

  // Repeats are part of the report only if they happened by the cutoff, like everything else.
  const repeatsOf = <F extends FeedName>(feed: F, result: DedupeResult<FeedRecords[F]>, kind: 'duplicates' | 'conflicts'): RepeatedId[] =>
    result[kind].map((record) => ({ id: feedKeys(feed).idOf(record), at: record.at }));
  const repeated = (kind: 'duplicates' | 'conflicts'): RepeatedId[] =>
    [
      ...repeatsOf('deposits', deposits, kind),
      ...repeatsOf('fundingEvents', funding, kind),
      ...repeatsOf('payoutEvents', payouts, kind),
      ...repeatsOf('rates', rates, kind),
    ].filter(upToCutoff);
  const duplicates = repeated('duplicates');
  const conflicts = repeated('conflicts');

  const accounts = accountBalances(ledger);
  return {
    balances: {
      usdtUnconverted: accounts.get('USDT_WALLET_PENDING') ?? Money.zero('USDT'),
      usdtConverted: accounts.get('USDT_CONVERTED') ?? Money.zero('USDT'),
      bsFunded: (accounts.get('FX_CLEARING') ?? Money.zero('BS')).negate(),
      bsAvailable: accounts.get('BS_PROVIDER_BALANCE') ?? Money.zero('BS'),
      bsPaidOut: accounts.get('BS_PAID_OUT') ?? Money.zero('BS'),
      bsInFlight: totalInFlight(lifecycle.payouts),
    },
    breaks: findBreaks({
      cutoff,
      thresholds,
      deposits: depositsInReport,
      fundingEvents: fundingInReport,
      rates: new RateTable(rates.unique),
      lifecycle,
      ledger,
      duplicates,
      conflicts,
    }),
    ledger,
    ingestion: {
      duplicateIds: duplicates.map((r) => r.id),
      conflictingIds: conflicts.map((r) => r.id),
      rejectedPayoutEvents: lifecycle.rejected,
    },
  };
}
