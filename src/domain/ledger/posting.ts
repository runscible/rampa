import { Deposit } from '../deposits/deposit';
import { FundingEvent } from '../funding/funding-event';
import { PayoutEvent, PayoutEventType } from '../payouts/payout-event';
import { JournalEntry } from './ledger';

/** USDT arrives at the provider's wallet: Dr USDT_WALLET_PENDING / Cr PARTNER_PREFUND. */
export function postDeposit(deposit: Deposit): JournalEntry {
  return {
    id: `deposit:${deposit.txHash}`,
    at: deposit.at,
    lines: [
      { account: 'USDT_WALLET_PENDING', amount: deposit.amount },
      { account: 'PARTNER_PREFUND', amount: deposit.amount.negate() },
    ],
  };
}

/**
 * The provider converts USDT to Bs.
 * USDT: Dr USDT_CONVERTED / Cr USDT_WALLET_PENDING. Bs: Dr BS_PROVIDER_BALANCE / Cr FX_CLEARING (the Bs side of the conversion).
 */
export function postFunding(event: FundingEvent): JournalEntry {
  return {
    id: `funding:${event.eventId}`,
    at: event.at,
    lines: [
      { account: 'USDT_CONVERTED', amount: event.amountUsdt },
      { account: 'USDT_WALLET_PENDING', amount: event.amountUsdt.negate() },
      { account: 'BS_PROVIDER_BALANCE', amount: event.amountBs },
      { account: 'FX_CLEARING', amount: event.amountBs.negate() },
    ],
  };
}

/** Id of the ledger entry a pay-out event produces (when it produces one). */
export const payoutEntryId = (eventId: string): string => `payout:${eventId}`;

/** How much each event type moves into BS_PAID_OUT: COMPLETED pays out, REVERSED returns the funds. Absent = no movement. */
const PAID_OUT_SIGN: Partial<Record<PayoutEventType, 1 | -1>> = { COMPLETED: 1, REVERSED: -1 };

/**
 * The provider debits the Bs balance when a pay-out is COMPLETED (Dr BS_PAID_OUT / Cr BS_PROVIDER_BALANCE)
 * and returns the funds when it is REVERSED (the exact inverse).
 * Other event types do not move money (the provider reserves nothing at PREVIEW or CONFIRM) and return null.
 * Callers must only post events accepted by the payout state machine.
 */
export function postPayout(event: PayoutEvent): JournalEntry | null {
  const sign = PAID_OUT_SIGN[event.type];
  if (sign === undefined) return null;
  const paid = sign === 1 ? event.amountBs : event.amountBs.negate();
  return {
    id: payoutEntryId(event.eventId),
    at: event.at,
    lines: [
      { account: 'BS_PAID_OUT', amount: paid },
      { account: 'BS_PROVIDER_BALANCE', amount: paid.negate() },
    ],
  };
}
