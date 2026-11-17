import { createPayoutEvent, fingerprintPayoutEvent } from '../../src/domain/payouts/payout-event';

const raw = {
  eventId: 'pe_0003',
  payoutId: 'P001',
  type: 'COMPLETED',
  amountBs: 6200.0,
  timestamp: '2026-10-05T08:46:00-04:00',
};

describe('createPayoutEvent', () => {
  it('builds an event from JSON values', () => {
    const e = createPayoutEvent(raw);
    expect(e.type).toBe('COMPLETED');
    expect(e.amountBs.toString()).toBe('6200.00');
    expect(e.at.toISOString()).toBe('2026-10-05T12:46:00.000Z');
  });

  it.each(['PREVIEW', 'CONFIRM', 'COMPLETED', 'FAILED', 'REVERSED'])('accepts type %s', (type) => {
    expect(createPayoutEvent({ ...raw, type }).type).toBe(type);
  });

  it.each([
    ['empty event id', { eventId: '' }, /event_id/],
    ['empty payout id', { payoutId: '' }, /payout_id/],
    ['unknown type', { type: 'REFUNDED' }, /type/i],
    ['zero amount', { amountBs: 0 }, /amount_bs/],
    ['more than 2 decimals', { amountBs: '10.123' }, /decimals/],
    ['timestamp without offset', { timestamp: '2026-10-05T08:46:00' }, /offset/i],
  ])('rejects %s', (_name, override, message) => {
    expect(() => createPayoutEvent({ ...raw, ...override })).toThrow(message);
  });
});

describe('fingerprintPayoutEvent', () => {
  it('is equal for the same content and differs when any field differs', () => {
    const a = createPayoutEvent(raw);
    expect(fingerprintPayoutEvent(a)).toBe(fingerprintPayoutEvent(createPayoutEvent({ ...raw, amountBs: '6200.00' })));
    expect(fingerprintPayoutEvent(a)).not.toBe(fingerprintPayoutEvent(createPayoutEvent({ ...raw, payoutId: 'P002' })));
    expect(fingerprintPayoutEvent(a)).not.toBe(fingerprintPayoutEvent(createPayoutEvent({ ...raw, type: 'FAILED' })));
  });
});
