import { createPayoutEvent, PayoutEvent } from '../../src/domain/payouts/payout-event';
import { nextState, replayPayouts } from '../../src/domain/payouts/payout-state';

describe('nextState', () => {
  it.each([
    [undefined, 'PREVIEW', 'PREVIEWED'],
    ['PREVIEWED', 'CONFIRM', 'CONFIRMED'],
    ['CONFIRMED', 'COMPLETED', 'COMPLETED'],
    ['CONFIRMED', 'FAILED', 'FAILED'],
    ['COMPLETED', 'REVERSED', 'REVERSED'],
    ['PREVIEWED', 'COMPLETED', 'COMPLETED'],
    [undefined, 'COMPLETED', 'COMPLETED'],
  ] as const)('%s + %s -> %s', (from, type, to) => {
    expect(nextState(from, type)).toBe(to);
  });

  it.each([
    ['COMPLETED', 'COMPLETED'],
    ['FAILED', 'COMPLETED'],
    ['CONFIRMED', 'REVERSED'],
    ['REVERSED', 'REVERSED'],
    [undefined, 'CONFIRM'],
  ] as const)('%s + %s is illegal', (from, type) => {
    expect(nextState(from, type)).toBeUndefined();
  });
});

let n = 0;
const ev = (payoutId: string, type: string, time: string, amount = 100, eventId = `e${++n}`): PayoutEvent =>
  createPayoutEvent({ eventId, payoutId, type, amountBs: amount, timestamp: `2026-10-05T${time}-04:00` });

describe('replayPayouts', () => {
  it('accepts a legal lifecycle and ends in the last state', () => {
    const r = replayPayouts([ev('P1', 'PREVIEW', '09:00:00'), ev('P1', 'CONFIRM', '09:01:00'), ev('P1', 'COMPLETED', '09:05:00')]);
    expect(r.rejected).toEqual([]);
    expect(r.accepted).toHaveLength(3);
    expect(r.payouts).toEqual([{ payoutId: 'P1', state: 'COMPLETED', amountBs: expect.anything() }]);
  });

  it('does not depend on delivery order', () => {
    const events = [ev('P1', 'PREVIEW', '09:00:00'), ev('P1', 'CONFIRM', '09:01:00'), ev('P1', 'COMPLETED', '09:05:00'), ev('P1', 'REVERSED', '10:00:00')];
    const a = replayPayouts(events);
    const b = replayPayouts([...events].reverse());
    expect(b.accepted.map((e) => e.eventId)).toEqual(a.accepted.map((e) => e.eventId));
    expect(b.payouts[0].state).toBe('REVERSED');
  });

  it('breaks same-instant ties by lifecycle order', () => {
    const r = replayPayouts([ev('P1', 'CONFIRM', '09:00:00'), ev('P1', 'PREVIEW', '09:00:00')]);
    expect(r.rejected).toEqual([]);
    expect(r.payouts[0].state).toBe('CONFIRMED');
  });

  it('rejects a second COMPLETED with a different event id (no double debit)', () => {
    const r = replayPayouts([
      ev('P1', 'PREVIEW', '09:00:00'),
      ev('P1', 'CONFIRM', '09:01:00'),
      ev('P1', 'COMPLETED', '09:05:00', 100, 'a'),
      ev('P1', 'COMPLETED', '09:06:00', 100, 'b'),
    ]);
    expect(r.accepted.filter((e) => e.type === 'COMPLETED').map((e) => e.eventId)).toEqual(['a']);
    expect(r.rejected).toEqual([expect.objectContaining({ event: expect.objectContaining({ eventId: 'b' }), reason: expect.stringMatching(/COMPLETED/) })]);
  });

  it('rejects REVERSED without a COMPLETED and keeps the payout state', () => {
    const r = replayPayouts([ev('P1', 'PREVIEW', '09:00:00'), ev('P1', 'CONFIRM', '09:01:00'), ev('P1', 'REVERSED', '09:02:00')]);
    expect(r.rejected).toHaveLength(1);
    expect(r.payouts[0].state).toBe('CONFIRMED');
  });

  it('accepts a COMPLETED without CONFIRM (money moved) and flags it as irregular', () => {
    const r = replayPayouts([ev('P1', 'PREVIEW', '09:00:00'), ev('P1', 'COMPLETED', '09:05:00', 100, 'done')]);
    expect(r.rejected).toEqual([]);
    expect(r.accepted.map((e) => e.eventId)).toContain('done');
    expect(r.irregular).toEqual([expect.objectContaining({ event: expect.objectContaining({ eventId: 'done' }), reason: expect.stringMatching(/CONFIRM/) })]);
    expect(r.payouts[0].state).toBe('COMPLETED');
  });

  it('does not flag a regular lifecycle', () => {
    const r = replayPayouts([ev('P1', 'PREVIEW', '09:00:00'), ev('P1', 'CONFIRM', '09:01:00'), ev('P1', 'COMPLETED', '09:05:00')]);
    expect(r.irregular).toEqual([]);
  });

  it('tracks each payout independently', () => {
    const r = replayPayouts([ev('P1', 'PREVIEW', '09:00:00'), ev('P2', 'PREVIEW', '09:00:00'), ev('P2', 'CONFIRM', '09:01:00')]);
    expect(r.payouts.map((p) => [p.payoutId, p.state])).toEqual([['P1', 'PREVIEWED'], ['P2', 'CONFIRMED']]);
  });
});
