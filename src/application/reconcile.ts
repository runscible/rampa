import { Break, BreakThresholds, DEFAULT_THRESHOLDS } from '../domain/breaks/break';
import { RepeatedId } from '../domain/breaks/context';
import { findBreaks } from '../domain/breaks/find-breaks';
import { Deposit, fingerprintDeposit } from '../domain/deposits/deposit';
import { fingerprintFundingEvent, FundingEvent } from '../domain/funding/funding-event';
import { accountBalances, assertBalanced, JournalEntry } from '../domain/ledger/ledger';
import { postDeposit, postFunding, postPayout } from '../domain/ledger/posting';
import { fingerprintPayoutEvent, PayoutEvent } from '../domain/payouts/payout-event';
import { FlaggedPayoutEvent, RejectedPayoutEvent, replayPayouts, totalInFlight } from '../domain/payouts/payout-state';
import { fingerprintRatePoint, RatePoint, RateTable } from '../domain/rates/rate-table';
import { dedupeById } from '../domain/shared/dedupe';
import { Money } from '../domain/shared/money';
import { parseInstant } from '../domain/shared/time';

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
  /** Pay-out events applied although a regular step was skipped (e.g. COMPLETED without CONFIRM). */
  irregularPayoutEvents: FlaggedPayoutEvent[];
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

  const deposits = dedupeById(input.deposits, (d) => d.txHash, fingerprintDeposit);
  const funding = dedupeById(input.fundingEvents, (e) => e.eventId, fingerprintFundingEvent);
  const payouts = dedupeById(input.payoutEvents, (e) => e.eventId, fingerprintPayoutEvent);
  const rates = dedupeById(input.rates, (r) => r.at.toISOString(), fingerprintRatePoint);
  const lifecycle = replayPayouts(payouts.unique.filter(upToCutoff));

  const byId = (a: JournalEntry, b: JournalEntry) => a.id.localeCompare(b.id);
  const depositEntries = deposits.unique.filter(upToCutoff).map(postDeposit).sort(byId);
  const fundingEntries = funding.unique.filter(upToCutoff).map(postFunding).sort(byId);
  const payoutEntries = lifecycle.accepted.flatMap((e) => postPayout(e) ?? []); // already in lifecycle order

  // Sorting by instant only is deliberate: the sort is stable, so entries at the same instant keep the order
  // of this list: deposits, then fundings, then payouts (a funding is applied before a payout at the same time).
  const ledger = [...depositEntries, ...fundingEntries, ...payoutEntries].sort((a, b) => a.at.getTime() - b.at.getTime());
  assertBalanced(ledger);

  const repeated = (kind: 'duplicates' | 'conflicts'): RepeatedId[] => [
    ...deposits[kind].map((d) => ({ id: d.txHash, at: d.at })),
    ...funding[kind].map((e) => ({ id: e.eventId, at: e.at })),
    ...payouts[kind].map((e) => ({ id: e.eventId, at: e.at })),
    ...rates[kind].map((r) => ({ id: r.at.toISOString(), at: r.at })),
  ];

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
      deposits: deposits.unique.filter(upToCutoff),
      fundingEvents: funding.unique.filter(upToCutoff),
      rates: new RateTable(rates.unique),
      lifecycle,
      ledger,
      duplicates: repeated('duplicates'),
      conflicts: repeated('conflicts'),
    }),
    ledger,
    ingestion: {
      duplicateIds: repeated('duplicates').map((r) => r.id),
      conflictingIds: repeated('conflicts').map((r) => r.id),
      irregularPayoutEvents: lifecycle.irregular,
      rejectedPayoutEvents: lifecycle.rejected,
    },
  };
}
