import { D } from '../shared/decimal';
import { Money } from '../shared/money';
import { Deposit } from '../deposits/deposit';
import { Break, createBreak } from './break';
import { BreakRule, minutesBetween } from './context';

const percent = (ratio: D | string): string => `${new D(ratio).times(100).toFixed(2)}%`;

const depositsByTx = (deposits: Deposit[]): Map<string, Deposit> => new Map(deposits.map((d) => [d.txHash, d]));

/** The provider converts at the reference rate in force when it sends the webhook, less at most `maxSpread`. */
const spreadExceeded: BreakRule = ({ fundingEvents, rates, thresholds }) =>
  fundingEvents.flatMap((e): Break[] => {
    const reference = rates.at(e.at);
    if (reference === undefined) {
      return [createBreak('MISSING_REFERENCE_RATE', e.eventId, `No reference rate at or before ${e.at.toISOString()}: spread cannot be checked`, e.at)];
    }
    const spread = reference.minus(e.rate).div(reference);
    if (!spread.greaterThan(thresholds.maxSpread)) return [];
    const reason = `Spread ${percent(spread)} exceeds ${percent(thresholds.maxSpread)} (provider rate ${e.rate}, reference ${reference})`;
    return [createBreak('SPREAD_EXCEEDED', e.eventId, reason, e.at)];
  });

const lateWebhook: BreakRule = ({ fundingEvents, deposits, thresholds }) => {
  const byTx = depositsByTx(deposits);
  return fundingEvents.flatMap((e): Break[] => {
    const deposit = byTx.get(e.depositTxHash);
    if (deposit === undefined) return [];
    const delay = minutesBetween(deposit.at, e.at);
    if (delay <= thresholds.fundingSlaMinutes) return [];
    return [createBreak('LATE_FUNDING_WEBHOOK', e.eventId, `Webhook arrived ${Math.round(delay)} min after the deposit (limit ${thresholds.fundingSlaMinutes} min)`, e.at)];
  });
};

const depositWithoutWebhook: BreakRule = ({ deposits, fundingEvents, cutoff, thresholds }) => {
  const funded = new Set(fundingEvents.map((e) => e.depositTxHash));
  return deposits.flatMap((d): Break[] => {
    const waiting = minutesBetween(d.at, cutoff);
    if (funded.has(d.txHash) || waiting <= thresholds.fundingSlaMinutes) return [];
    return [createBreak('DEPOSIT_WITHOUT_WEBHOOK', d.txHash, `${d.amount} USDT deposited ${Math.round(waiting)} min before the cutoff and no funding webhook yet (limit ${thresholds.fundingSlaMinutes} min)`, d.at)];
  });
};

const unknownDeposit: BreakRule = ({ fundingEvents, deposits }) => {
  const byTx = depositsByTx(deposits);
  return fundingEvents
    .filter((e) => !byTx.has(e.depositTxHash))
    .map((e) => createBreak('UNKNOWN_DEPOSIT', e.eventId, `Webhook refers to deposit ${e.depositTxHash}, which is not in the deposits file`, e.at));
};

const amountMismatch: BreakRule = ({ fundingEvents, deposits }) => {
  const byTx = depositsByTx(deposits);
  return fundingEvents.flatMap((e): Break[] => {
    const deposit = byTx.get(e.depositTxHash);
    if (deposit === undefined || deposit.amount.equals(e.amountUsdt)) return [];
    return [createBreak('AMOUNT_MISMATCH', e.eventId, `Webhook converts ${e.amountUsdt} USDT but the deposit was ${deposit.amount} USDT`, e.at)];
  });
};

/** Rounding differences up to this many Bs (either way) are not a mismatch. */
const BS_ROUNDING_TOLERANCE = Money.parse('BS', '0.01');

/**
 * The Bs a webhook credits has to be what its own rate implies. The spread rule only looks at the rate; this one
 * looks at the money that actually lands in the balance, so a provider that credits less (or more) than it announced
 * does not go unnoticed.
 */
const amountBsMismatch: BreakRule = ({ fundingEvents }) =>
  fundingEvents.flatMap((e): Break[] => {
    const expected = e.amountUsdt.convertAt('BS', e.rate);
    const difference = e.amountBs.minus(expected).abs();
    if (!difference.isGreaterThan(BS_ROUNDING_TOLERANCE)) return [];
    const reason = `Webhook credits ${e.amountBs} Bs but ${e.amountUsdt} USDT at ${e.rate} is ${expected} Bs (difference ${difference})`;
    return [createBreak('AMOUNT_BS_MISMATCH', e.eventId, reason, e.at)];
  });

const doubleFunding: BreakRule = ({ fundingEvents }) => {
  const byTx = new Map<string, string[]>();
  for (const e of fundingEvents) byTx.set(e.depositTxHash, [...(byTx.get(e.depositTxHash) ?? []), e.eventId]);
  return [...byTx.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([tx, ids]) => {
      const last = fundingEvents.filter((e) => e.depositTxHash === tx).reduce((a, b) => (b.at > a.at ? b : a));
      return createBreak('DOUBLE_FUNDING', tx, `Deposit converted by more than one webhook: ${ids.join(', ')}`, last.at);
    });
};

export const FUNDING_RULES: BreakRule[] = [spreadExceeded, lateWebhook, depositWithoutWebhook, unknownDeposit, amountMismatch, amountBsMismatch, doubleFunding];

