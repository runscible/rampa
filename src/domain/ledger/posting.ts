import { Deposit } from '../deposits/deposit';
import { FundingEvent } from '../funding/funding-event';
import { PayoutEvent } from '../payouts/payout-event';
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

/**
 * The provider debits the Bs balance when a pay-out is COMPLETED (Dr BS_PAID_OUT / Cr BS_PROVIDER_BALANCE)
 * and returns the funds when it is REVERSED (the exact inverse).
 * Other event types do not move money (the provider reserves nothing at PREVIEW or CONFIRM) and return null.
 * Callers must only post events accepted by the payout state machine.
 */
export function postPayout(event: PayoutEvent): JournalEntry | null {
  if (event.type !== 'COMPLETED' && event.type !== 'REVERSED') return null;
  const paid = event.type === 'COMPLETED' ? event.amountBs : event.amountBs.negate();
  return {
    id: `payout:${event.eventId}`,
    at: event.at,
    lines: [
      { account: 'BS_PAID_OUT', amount: paid },
      { account: 'BS_PROVIDER_BALANCE', amount: paid.negate() },
    ],
  };
}
