import { Deposit } from '../deposits/deposit';
import { FundingEvent } from '../funding/funding-event';
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
