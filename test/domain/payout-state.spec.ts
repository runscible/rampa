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
    // no money moves at these steps, so a gap before them does not stop the history from being recorded
    [undefined, 'CONFIRM', 'CONFIRMED'],
    [undefined, 'FAILED', 'FAILED'],
    ['PREVIEWED', 'FAILED', 'FAILED'],
  ] as const)('%s + %s -> %s', (from, type, to) => {
    expect(nextState(from, type)).toBe(to);
  });

  it.each([
    ['COMPLETED', 'COMPLETED'],
    ['FAILED', 'COMPLETED'],
    ['CONFIRMED', 'REVERSED'],
    ['REVERSED', 'REVERSED'],
    // a reversal gives money back, so it needs the completion it undoes
    [undefined, 'REVERSED'],
    ['PREVIEWED', 'REVERSED'],
    ['COMPLETED', 'CONFIRM'],
    ['COMPLETED', 'FAILED'],
    ['CONFIRMED', 'PREVIEW'],
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
    expect(r.payouts).toEqual([expect.objectContaining({ payoutId: 'P1', state: 'COMPLETED' })]);
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

  it('accepts a COMPLETED without CONFIRM (money moved) and reports the chain as incomplete', () => {
    const r = replayPayouts([ev('P1', 'PREVIEW', '09:00:00'), ev('P1', 'COMPLETED', '09:05:00', 100, 'done')]);
    expect(r.rejected).toEqual([]);
    expect(r.accepted.map((e) => e.eventId)).toContain('done');
    expect(r.payouts[0].state).toBe('COMPLETED');
    expect(r.incomplete).toEqual([expect.objectContaining({ payoutId: 'P1', state: 'COMPLETED', missing: ['CONFIRM'] })]);
  });

  describe('chain completeness: every step the final state implies must have been received', () => {
    const chain = (...types: string[]) => replayPayouts(types.map((type, i) => ev('P1', type, `09:0${i}:00`)));

    it.each([
      [['PREVIEW'], 'PREVIEWED', []],
      [['PREVIEW', 'CONFIRM'], 'CONFIRMED', []],
      [['PREVIEW', 'CONFIRM', 'COMPLETED'], 'COMPLETED', []],
      [['PREVIEW', 'CONFIRM', 'FAILED'], 'FAILED', []],
      [['PREVIEW', 'CONFIRM', 'COMPLETED', 'REVERSED'], 'REVERSED', []],
      [['CONFIRM'], 'CONFIRMED', ['PREVIEW']],
      [['CONFIRM', 'COMPLETED'], 'COMPLETED', ['PREVIEW']],
      [['PREVIEW', 'FAILED'], 'FAILED', ['CONFIRM']],
      [['COMPLETED'], 'COMPLETED', ['PREVIEW', 'CONFIRM']],
      [['FAILED'], 'FAILED', ['PREVIEW', 'CONFIRM']],
      [['PREVIEW', 'COMPLETED', 'REVERSED'], 'REVERSED', ['CONFIRM']],
    ] as const)('%j ends %s and lacks %j', (types, state, missing) => {
      const r = chain(...types);
      expect(r.rejected).toEqual([]);
      expect(r.payouts[0].state).toBe(state);
      expect(r.incomplete.map((i) => i.missing)).toEqual(missing.length === 0 ? [] : [missing]);
    });

    it('a step that arrived out of order still counts as received: the order problem is reported separately', () => {
      const r = replayPayouts([ev('P1', 'CONFIRM', '09:00:00'), ev('P1', 'PREVIEW', '09:01:00')]);
      expect(r.rejected).toHaveLength(1);
      expect(r.payouts[0].state).toBe('CONFIRMED');
      expect(r.incomplete).toEqual([]);
    });

    it('a CONFIRM whose PREVIEW never arrived keeps its confirmation instant, so it can be timed', () => {
      const [p] = chain('CONFIRM').payouts;
      expect(p.confirmedAt?.toISOString()).toBe('2026-10-05T13:00:00.000Z');
    });

    it('each pay-out is judged on its own', () => {
      const r = replayPayouts([ev('P1', 'PREVIEW', '09:00:00'), ev('P1', 'CONFIRM', '09:01:00'), ev('P2', 'CONFIRM', '09:02:00')]);
      expect(r.incomplete.map((i) => [i.payoutId, i.missing])).toEqual([['P2', ['PREVIEW']]]);
    });
  });

  it('does not report a regular lifecycle', () => {
    const r = replayPayouts([ev('P1', 'PREVIEW', '09:00:00'), ev('P1', 'CONFIRM', '09:01:00'), ev('P1', 'COMPLETED', '09:05:00')]);
    expect(r.incomplete).toEqual([]);
  });

  it('keeps the amount of the last applied event and the CONFIRM instant', () => {
    const r = replayPayouts([ev('P1', 'PREVIEW', '09:00:00', 100), ev('P1', 'CONFIRM', '09:01:00', 150)]);
    const [p] = r.payouts;
    expect(p.amountBs.toString()).toBe('150.00');
    expect(p.confirmedAt?.toISOString()).toBe('2026-10-05T13:01:00.000Z');
  });

  it('applies a REVERSED even when its amount differs from the COMPLETED one (the amount check is a break rule)', () => {
    const r = replayPayouts([
      ev('P1', 'PREVIEW', '09:00:00', 100),
      ev('P1', 'CONFIRM', '09:01:00', 100),
      ev('P1', 'COMPLETED', '09:05:00', 100),
      ev('P1', 'REVERSED', '10:00:00', 60, 'rev'),
    ]);
    expect(r.rejected).toEqual([]);
    expect(r.accepted.map((e) => e.eventId)).toContain('rev');
    expect(r.payouts[0].amountBs.toString()).toBe('60.00');
  });

  it('tracks each payout independently', () => {
    const r = replayPayouts([ev('P1', 'PREVIEW', '09:00:00'), ev('P2', 'PREVIEW', '09:00:00'), ev('P2', 'CONFIRM', '09:01:00')]);
    expect(r.payouts.map((p) => [p.payoutId, p.state])).toEqual([['P1', 'PREVIEWED'], ['P2', 'CONFIRMED']]);
  });
});
