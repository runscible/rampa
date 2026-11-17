import { reconcile } from '../../src/application/reconcile';
import { createFundingEvent } from '../../src/domain/funding/funding-event';
import { assertBalanced } from '../../src/domain/ledger/ledger';
import { createPayoutEvent } from '../../src/domain/payouts/payout-event';

const CONFIG = { cutoff: '2026-10-05T20:00:00-04:00' };
const fundingEvents = [
  createFundingEvent({ eventId: 'fw_1', depositTxHash: '0x1', amountUsdt: 1000, rate: 10, amountBs: 10000, timestamp: '2026-10-05T08:00:00-04:00' }),
];
const payout = (eventId: string, type: string, amountBs: number, timestamp: string, payoutId = 'P001') =>
  createPayoutEvent({ eventId, payoutId, type, amountBs, timestamp });
const run = (payoutEvents: ReturnType<typeof payout>[]) => reconcile({ deposits: [], fundingEvents, payoutEvents }, CONFIG);

describe('reconcile with payouts', () => {
  it('a COMPLETED payout moves Bs from available to paid out', () => {
    const r = run([payout('pe_1', 'COMPLETED', 2500, '2026-10-05T09:00:00-04:00')]);
    expect(r.balances.bsPaidOut.toString()).toBe('2500.00');
    expect(r.balances.bsAvailable.toString()).toBe('7500.00');
    expect(() => assertBalanced(r.ledger)).not.toThrow();
  });

  it('PREVIEW and CONFIRM have no effect', () => {
    const r = run([payout('pe_1', 'PREVIEW', 2500, '2026-10-05T09:00:00-04:00'), payout('pe_2', 'CONFIRM', 2500, '2026-10-05T09:01:00-04:00')]);
    expect(r.balances.bsPaidOut.toString()).toBe('0.00');
    expect(r.balances.bsAvailable.toString()).toBe('10000.00');
  });

  it('the same COMPLETED delivered twice is debited once and reported', () => {
    const done = payout('pe_1', 'COMPLETED', 2500, '2026-10-05T09:00:00-04:00');
    const r = run([done, done]);
    expect(r.balances.bsPaidOut.toString()).toBe('2500.00');
    expect(r.ingestion.duplicateEventIds).toEqual(['pe_1']);
  });

  it('same id with different content keeps the first and reports a conflict', () => {
    const r = run([payout('pe_1', 'COMPLETED', 2500, '2026-10-05T09:00:00-04:00'), payout('pe_1', 'COMPLETED', 9999, '2026-10-05T09:00:00-04:00')]);
    expect(r.balances.bsPaidOut.toString()).toBe('2500.00');
    expect(r.ingestion.conflictingEventIds).toEqual(['pe_1']);
  });

  it('excludes payouts completed after the cutoff', () => {
    const r = run([payout('pe_1', 'COMPLETED', 2500, '2026-10-05T20:00:01-04:00')]);
    expect(r.balances.bsPaidOut.toString()).toBe('0.00');
  });

  it('is independent of event order', () => {
    const events = [payout('pe_1', 'COMPLETED', 1000, '2026-10-05T09:00:00-04:00', 'P1'), payout('pe_2', 'COMPLETED', 2000, '2026-10-05T10:00:00-04:00', 'P2')];
    const a = run(events);
    const b = run([...events].reverse());
    expect(b.ledger.map((e) => e.id)).toEqual(a.ledger.map((e) => e.id));
    expect(b.balances.bsAvailable.toString()).toBe(a.balances.bsAvailable.toString());
  });
});
