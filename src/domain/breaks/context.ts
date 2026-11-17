import { Deposit } from '../deposits/deposit';
import { FundingEvent } from '../funding/funding-event';
import { JournalEntry } from '../ledger/ledger';
import { ReplayResult } from '../payouts/payout-state';
import { RateTable } from '../rates/rate-table';
import { Instant } from '../shared/time';
import { Break, BreakThresholds } from './break';

/** An id delivered more than once (tx hash, event id or rate timestamp) and when it happened. */
export interface RepeatedId {
  id: string;
  at: Instant;
}

/** Everything the rules look at: already deduplicated and cut off at the report instant. */
export interface BreakContext {
  cutoff: Instant;
  thresholds: BreakThresholds;
  deposits: Deposit[];
  fundingEvents: FundingEvent[];
  rates: RateTable;
  lifecycle: ReplayResult;
  /** Ledger sorted by instant. */
  ledger: JournalEntry[];
  duplicates: RepeatedId[];
  conflicts: RepeatedId[];
}

export type BreakRule = (context: BreakContext) => Break[];

export const minutesBetween = (from: Instant, to: Instant): number => (to.getTime() - from.getTime()) / 60_000;
