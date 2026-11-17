import { createDeposit, RawDeposit } from '../../domain/deposits/deposit';
import { createFundingEvent, RawFundingEvent } from '../../domain/funding/funding-event';
import { createPayoutEvent, RawPayoutEvent } from '../../domain/payouts/payout-event';
import { createRatePoint } from '../../domain/rates/rate-table';
import { FeedName, FeedRecords } from '../../application/feeds';

/**
 * How a record is written to and read from the database: as plain text values (the same shape the domain factories
 * accept), never as live objects. Reading goes through the factories, so what comes out of the database is validated.
 */
export interface Codec<T> {
  encode(record: T): unknown;
  decode(stored: unknown): T;
}

export const CODECS: { [F in FeedName]: Codec<FeedRecords[F]> } = {
  deposits: {
    encode: (d): RawDeposit => ({ txHash: d.txHash, amount: d.amount.toString(), timestamp: d.at.toISOString() }),
    decode: (stored) => createDeposit(stored as RawDeposit),
  },
  fundingEvents: {
    encode: (e): RawFundingEvent => ({
      eventId: e.eventId,
      depositTxHash: e.depositTxHash,
      amountUsdt: e.amountUsdt.toString(),
      rate: e.rate.toFixed(),
      amountBs: e.amountBs.toString(),
      timestamp: e.at.toISOString(),
    }),
    decode: (stored) => createFundingEvent(stored as RawFundingEvent),
  },
  payoutEvents: {
    encode: (e): RawPayoutEvent => ({
      eventId: e.eventId,
      payoutId: e.payoutId,
      type: e.type,
      amountBs: e.amountBs.toString(),
      timestamp: e.at.toISOString(),
    }),
    decode: (stored) => createPayoutEvent(stored as RawPayoutEvent),
  },
  rates: {
    encode: (r) => ({ timestamp: r.at.toISOString(), rate: r.rate }),
    decode: (stored) => createRatePoint(stored as { timestamp: string; rate: string }),
  },
};
