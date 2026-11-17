import { Break } from '../breaks/break';
import { Deposit } from '../deposits/deposit';
import { FundingEvent } from '../funding/funding-event';
import { Money } from '../shared/money';

/**
 * One on-chain deposit and everything the provider said about it: what came in, which webhooks converted it and what
 * they credited, plus the breaks that concern it. A webhook for a deposit nobody saw has a view with no deposit.
 */
export interface DepositView {
  txHash: string;
  deposit: Deposit | null;
  /** Webhooks for this deposit, by time. More than one is itself a break, and all of them are counted. */
  fundings: FundingEvent[];
  depositedUsdt: Money;
  convertedUsdt: Money;
  creditedBs: Money;
  /** Breaks about the deposit itself or about any of its webhooks. */
  breaks: Break[];
}

export function buildDepositViews(deposits: Deposit[], fundings: FundingEvent[], breaks: Break[]): DepositView[] {
  const txHashes = [...new Set([...deposits.map((d) => d.txHash), ...fundings.map((f) => f.depositTxHash)])].sort((a, b) => a.localeCompare(b));

  return txHashes.map((txHash) => {
    const deposit = deposits.find((d) => d.txHash === txHash) ?? null;
    const converted = fundings
      .filter((f) => f.depositTxHash === txHash)
      .sort((a, b) => a.at.getTime() - b.at.getTime() || a.eventId.localeCompare(b.eventId));
    const ids = new Set([txHash, ...converted.map((f) => f.eventId)]);
    return {
      txHash,
      deposit,
      fundings: converted,
      depositedUsdt: deposit?.amount ?? Money.zero('USDT'),
      convertedUsdt: converted.reduce((sum, f) => sum.plus(f.amountUsdt), Money.zero('USDT')),
      creditedBs: converted.reduce((sum, f) => sum.plus(f.amountBs), Money.zero('BS')),
      breaks: breaks.filter((b) => ids.has(b.subject)),
    };
  });
}
