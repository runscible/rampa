import { reconcile } from '../../src/application/reconcile';
import { createFundingEvent } from '../../src/domain/funding/funding-event';
import { assertBalanced } from '../../src/domain/ledger/ledger';
import { createPayoutEvent, PayoutEvent } from '../../src/domain/payouts/payout-event';

const CONFIG = { cutoff: '2026-10-05T20:00:00-04:00' };
const fundingEvents = [
  createFundingEvent({ eventId: 'fw_1', depositTxHash: '0x1', amountUsdt: 1000, rate: 10, amountBs: 10000, timestamp: '2026-10-05T08:00:00-04:00' }),
];
const at = (hhmm: string) => `2026-10-05T${hhmm}:00-04:00`;
const ev = (eventId: string, payoutId: string, type: string, amountBs: number, hhmm: string): PayoutEvent =>
  createPayoutEvent({ eventId, payoutId, type, amountBs, timestamp: at(hhmm) });

/** PREVIEW -> CONFIRM -> terminal events for one payout. */
const lifecycle = (id: string, amount: number, hhmm: [string, string], ...terminal: Array<[string, string]>): PayoutEvent[] => [
  ev(`${id}-pv`, id, 'PREVIEW', amount, hhmm[0]),
  ev(`${id}-cf`, id, 'CONFIRM', amount, hhmm[1]),
  ...terminal.map(([type, time]) => ev(`${id}-${type}`, id, type, amount, time)),
];
const run = (payoutEvents: PayoutEvent[], cutoff = CONFIG) => reconcile({ deposits: [], fundingEvents, payoutEvents, rates: [] }, cutoff);

describe('reconcile with payout lifecycle', () => {
  it('COMPLETED moves Bs from available to paid out', () => {
    const r = run(lifecycle('P1', 2500, ['09:00', '09:01'], ['COMPLETED', '09:05']));
    expect(r.balances.bsPaidOut.toString()).toBe('2500.00');
    expect(r.balances.bsAvailable.toString()).toBe('7500.00');
    expect(r.balances.bsInFlight.toString()).toBe('0.00');
    expect(() => assertBalanced(r.ledger)).not.toThrow();
  });

  it('FAILED has no financial effect and is not in flight', () => {
    const r = run(lifecycle('P1', 2500, ['09:00', '09:01'], ['FAILED', '09:05']));
    expect(r.balances.bsPaidOut.toString()).toBe('0.00');
    expect(r.balances.bsAvailable.toString()).toBe('10000.00');
    expect(r.balances.bsInFlight.toString()).toBe('0.00');
  });

  it('REVERSED returns the funds to the balance', () => {
    const r = run(lifecycle('P1', 2500, ['09:00', '09:01'], ['COMPLETED', '09:05'], ['REVERSED', '10:00']));
    expect(r.balances.bsPaidOut.toString()).toBe('0.00');
    expect(r.balances.bsAvailable.toString()).toBe('10000.00');
  });

  it('CONFIRM without a terminal event is in flight (and reserves nothing)', () => {
    const r = run(lifecycle('P1', 2500, ['09:00', '09:01']));
    expect(r.balances.bsInFlight.toString()).toBe('2500.00');
    expect(r.balances.bsAvailable.toString()).toBe('10000.00');
  });

  it('an unconfirmed PREVIEW is ignored: not paid, not in flight', () => {
    const r = run([ev('pe_1', 'P1', 'PREVIEW', 2500, '09:00')]);
    expect(r.balances.bsInFlight.toString()).toBe('0.00');
    expect(r.balances.bsAvailable.toString()).toBe('10000.00');
  });

  it('a payout completed after the cutoff is still in flight at the cutoff', () => {
    const r = run(lifecycle('P1', 2500, ['19:50', '19:55'], ['COMPLETED', '20:05']));
    expect(r.balances.bsPaidOut.toString()).toBe('0.00');
    expect(r.balances.bsInFlight.toString()).toBe('2500.00');
  });

  it('the same event delivered twice is applied once and reported as duplicate', () => {
    const events = lifecycle('P1', 2500, ['09:00', '09:01'], ['COMPLETED', '09:05']);
    const r = run([...events, events[2]]);
    expect(r.balances.bsPaidOut.toString()).toBe('2500.00');
    expect(r.ingestion.duplicateIds).toEqual(['P1-COMPLETED']);
  });

  it('a second COMPLETED with a different id is not debited and is reported as rejected', () => {
    const events = [...lifecycle('P1', 2500, ['09:00', '09:01'], ['COMPLETED', '09:05']), ev('other-id', 'P1', 'COMPLETED', 2500, '09:06')];
    const r = run(events);
    expect(r.balances.bsPaidOut.toString()).toBe('2500.00');
    expect(r.ingestion.rejectedPayoutEvents.map((x) => x.event.eventId)).toEqual(['other-id']);
  });

  it('a COMPLETED without CONFIRM is still debited (money moved) and its chain is reported as incomplete', () => {
    const r = run([ev('pe_1', 'P1', 'PREVIEW', 2500, '09:00'), ev('pe_2', 'P1', 'COMPLETED', 2500, '09:05')]);
    expect(r.balances.bsPaidOut.toString()).toBe('2500.00');
    expect(r.breaks.filter((b) => b.type === 'INCOMPLETE_PAYOUT_CHAIN').map((b) => b.subject)).toEqual(['P1']);
    expect(r.ingestion.rejectedPayoutEvents).toEqual([]);
  });

  it('same id with different content keeps the first and reports a conflict', () => {
    const events = lifecycle('P1', 2500, ['09:00', '09:01'], ['COMPLETED', '09:05']);
    const r = run([...events, ev('P1-COMPLETED', 'P1', 'COMPLETED', 9999, '09:05')]);
    expect(r.balances.bsPaidOut.toString()).toBe('2500.00');
    expect(r.ingestion.conflictingIds).toEqual(['P1-COMPLETED']);
  });

  it('orders same-instant entries by lifecycle, not by id (COMPLETED before its REVERSED)', () => {
    const events = [
      ev('p-prev', 'P1', 'PREVIEW', 1000, '09:00'),
      ev('p-conf', 'P1', 'CONFIRM', 1000, '09:01'),
      ev('z-done', 'P1', 'COMPLETED', 1000, '10:00'),
      ev('a-rev', 'P1', 'REVERSED', 1000, '10:00'),
    ];
    expect(run(events).ledger.map((e) => e.id).filter((id) => id.startsWith('payout:'))).toEqual(['payout:z-done', 'payout:a-rev']);
  });

  it('orders a funding before a payout at the same instant', () => {
    const sameInstant = createFundingEvent({ eventId: 'fw_9', depositTxHash: '0x9', amountUsdt: 1, rate: 10, amountBs: 10, timestamp: at('10:00') });
    const events = [...lifecycle('P1', 1000, ['09:00', '09:01'], ['COMPLETED', '10:00'])];
    const r = reconcile({ deposits: [], fundingEvents: [sameInstant], payoutEvents: events, rates: [] }, CONFIG);
    const ids = r.ledger.filter((e) => e.at.getTime() === sameInstant.at.getTime()).map((e) => e.id);
    expect(ids).toEqual(['funding:fw_9', 'payout:P1-COMPLETED']);
  });

  it('gives the same result for any delivery order (permutation)', () => {
    const events = [
      ...lifecycle('P1', 1000, ['09:00', '09:01'], ['COMPLETED', '09:05'], ['REVERSED', '12:00']),
      ...lifecycle('P2', 2000, ['10:00', '10:01'], ['COMPLETED', '10:05']),
      ...lifecycle('P3', 500, ['11:00', '11:01']),
      ...lifecycle('P4', 700, ['11:30', '11:31'], ['FAILED', '11:40']),
    ];
    const a = run(events);
    const b = run([...events.slice(5), ...events.slice(0, 5)].reverse());
    expect(b.ledger.map((e) => e.id)).toEqual(a.ledger.map((e) => e.id));
    expect(b.balances).toEqual(a.balances);
    expect(a.balances.bsPaidOut.toString()).toBe('2000.00');
    expect(a.balances.bsAvailable.toString()).toBe('8000.00');
    expect(a.balances.bsInFlight.toString()).toBe('500.00');
  });
});
