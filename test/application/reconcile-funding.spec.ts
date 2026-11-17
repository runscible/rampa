import { reconcile } from '../../src/application/reconcile';
import { createDeposit } from '../../src/domain/deposits/deposit';
import { createFundingEvent } from '../../src/domain/funding/funding-event';
import { assertBalanced } from '../../src/domain/ledger/ledger';

const CONFIG = { cutoff: '2026-10-05T20:00:00-04:00' };
const deposits = [
  createDeposit({ txHash: '0x1', amount: '5000.00', timestamp: '2026-10-05T08:10:00-04:00' }),
  createDeposit({ txHash: '0x2', amount: '1500.00', timestamp: '2026-10-05T17:40:00-04:00' }),
];
const funding = (over: Record<string, unknown> = {}) =>
  createFundingEvent({
    eventId: 'fw_001',
    depositTxHash: '0x1',
    amountUsdt: 5000,
    rate: 9.7945,
    amountBs: 48972.5,
    timestamp: '2026-10-05T08:18:00-04:00',
    ...over,
  });

describe('reconcile with funding events', () => {
  it('converts USDT and funds Bs', () => {
    const r = reconcile({ deposits, fundingEvents: [funding()] }, CONFIG);
    expect(r.balances.usdtUnconverted.toString()).toBe('1500.00');
    expect(r.balances.usdtConverted.toString()).toBe('5000.00');
    expect(r.balances.bsFunded.toString()).toBe('48972.50');
    expect(() => assertBalanced(r.ledger)).not.toThrow();
  });

  it('excludes funding events after the cutoff', () => {
    const late = funding({ timestamp: '2026-10-05T20:00:01-04:00' });
    const r = reconcile({ deposits, fundingEvents: [late] }, CONFIG);
    expect(r.balances.usdtConverted.toString()).toBe('0.00');
    expect(r.balances.bsFunded.toString()).toBe('0.00');
  });

  it('is idempotent: the same event delivered twice counts once and is reported', () => {
    const r = reconcile({ deposits, fundingEvents: [funding(), funding()] }, CONFIG);
    expect(r.balances.bsFunded.toString()).toBe('48972.50');
    expect(r.ingestion.duplicateEventIds).toEqual(['fw_001']);
  });

  it('keeps the first when the same id arrives with different content, and reports the conflict', () => {
    const r = reconcile({ deposits, fundingEvents: [funding(), funding({ amountBs: 50000 })] }, CONFIG);
    expect(r.balances.bsFunded.toString()).toBe('48972.50');
    expect(r.ingestion.conflictingEventIds).toEqual(['fw_001']);
  });

  it('gives the same result for any input order', () => {
    const second = funding({ eventId: 'fw_002', depositTxHash: '0x2', amountUsdt: 1500, amountBs: 14700, timestamp: '2026-10-05T17:50:00-04:00' });
    const a = reconcile({ deposits, fundingEvents: [funding(), second] }, CONFIG);
    const b = reconcile({ deposits: [...deposits].reverse(), fundingEvents: [second, funding()] }, CONFIG);
    expect(b.ledger.map((e) => e.id)).toEqual(a.ledger.map((e) => e.id));
    expect(b.balances.bsFunded.toString()).toBe(a.balances.bsFunded.toString());
  });
});
