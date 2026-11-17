import { Deposit, fingerprintDeposit } from '../domain/deposits/deposit';
import { fingerprintFundingEvent, FundingEvent } from '../domain/funding/funding-event';
import { fingerprintPayoutEvent, PayoutEvent } from '../domain/payouts/payout-event';
import { fingerprintRatePoint, RatePoint } from '../domain/rates/rate-table';
import { dedupeById, DedupeResult } from '../domain/shared/dedupe';

/** The four sources the service ingests, and the domain record each one carries. */
export interface FeedRecords {
  deposits: Deposit;
  fundingEvents: FundingEvent;
  payoutEvents: PayoutEvent;
  rates: RatePoint;
}

export type FeedName = keyof FeedRecords;

/** How a feed identifies a record and decides whether two deliveries of it are the same. */
export interface FeedKeys<T> {
  idOf(record: T): string;
  fingerprint(record: T): string;
}

export const FEEDS: { [F in FeedName]: FeedKeys<FeedRecords[F]> } = {
  deposits: { idOf: (d) => d.txHash, fingerprint: fingerprintDeposit },
  fundingEvents: { idOf: (e) => e.eventId, fingerprint: fingerprintFundingEvent },
  payoutEvents: { idOf: (e) => e.eventId, fingerprint: fingerprintPayoutEvent },
  rates: { idOf: (r) => r.at.toISOString(), fingerprint: fingerprintRatePoint },
};

/** Keys of one feed. The cast is the price of a table of correlated types; it lives here and nowhere else. */
export function feedKeys<F extends FeedName>(feed: F): FeedKeys<FeedRecords[F]> {
  return FEEDS[feed] as FeedKeys<FeedRecords[F]>;
}

/** First delivery of each id wins; repeats are classified as duplicates or conflicts. */
export function dedupeFeed<F extends FeedName>(feed: F, records: Array<FeedRecords[F]>): DedupeResult<FeedRecords[F]> {
  const { idOf, fingerprint } = feedKeys(feed);
  return dedupeById(records, idOf, fingerprint);
}
