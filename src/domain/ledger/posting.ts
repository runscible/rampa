import { Deposit } from '../deposits/deposit';
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
