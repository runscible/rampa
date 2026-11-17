import { reconcile, ReconcileInput, ReconcileResult } from '../../src/application/reconcile';
import { createDeposit } from '../../src/domain/deposits/deposit';
import { createFundingEvent } from '../../src/domain/funding/funding-event';
import { createPayoutEvent, PayoutEvent } from '../../src/domain/payouts/payout-event';
import { createRatePoint } from '../../src/domain/rates/rate-table';

/** Local (UTC-4) time on the test day, as an ISO timestamp with offset. */
export const at = (hhmm: string): string => `2026-10-05T${hhmm}:00-04:00`;
export const CUTOFF = at('20:00');

export const dep = (txHash: string, amount: string, hhmm: string) => createDeposit({ txHash, amount, timestamp: at(hhmm) });

export const fw = (eventId: string, tx: string, usdt: number, rate: number | string, bs: number, hhmm: string) =>
  createFundingEvent({ eventId, depositTxHash: tx, amountUsdt: usdt, rate, amountBs: bs, timestamp: at(hhmm) });

export const rate = (hhmm: string, value: string) => createRatePoint({ timestamp: at(hhmm), rate: value });

export const ev = (eventId: string, payoutId: string, type: string, amountBs: number, hhmm: string): PayoutEvent =>
  createPayoutEvent({ eventId, payoutId, type, amountBs, timestamp: at(hhmm) });

/** PREVIEW -> CONFIRM -> terminal events for one payout. Event ids are `<payout>-<TYPE>`. */
export const lifecycle = (id: string, amount: number, hhmm: [string, string], ...terminal: Array<[string, string]>): PayoutEvent[] => [
  ev(`${id}-PREVIEW`, id, 'PREVIEW', amount, hhmm[0]),
  ev(`${id}-CONFIRM`, id, 'CONFIRM', amount, hhmm[1]),
  ...terminal.map(([type, time]) => ev(`${id}-${type}`, id, type, amount, time)),
];

export function run(input: Partial<ReconcileInput> = {}, cutoff: string = CUTOFF): ReconcileResult {
  return reconcile({ deposits: [], fundingEvents: [], payoutEvents: [], rates: [], ...input }, { cutoff });
}

export const breaksOf = (result: ReconcileResult, type: string) => result.breaks.filter((b) => b.type === type);
