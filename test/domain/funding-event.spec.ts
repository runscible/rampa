import { createFundingEvent, fingerprintFundingEvent } from '../../src/domain/funding/funding-event';

const raw = {
  eventId: 'fw_001',
  depositTxHash: '0xabc',
  amountUsdt: 5000.0,
  rate: 9.7945,
  amountBs: 48972.5,
  timestamp: '2026-10-05T08:18:00-04:00',
};

describe('createFundingEvent', () => {
  it('builds an event from JSON numbers without float noise', () => {
    const e = createFundingEvent(raw);
    expect(e.amountUsdt.toString()).toBe('5000.00');
    expect(e.amountBs.toString()).toBe('48972.50');
    expect(e.rate.toString()).toBe('9.7945');
    expect(e.at.toISOString()).toBe('2026-10-05T12:18:00.000Z');
  });

  it.each([
    ['empty event id', { eventId: '' }, /event_id/],
    ['empty deposit tx hash', { depositTxHash: '' }, /deposit_tx_hash/],
    ['zero USDT', { amountUsdt: 0 }, /amount_usdt/],
    ['negative Bs', { amountBs: -1 }, /amount_bs/],
    ['zero rate', { rate: 0 }, /rate/i],
    ['rate with more than 6 decimals', { rate: '9.1234567' }, /decimals/],
    ['timestamp without offset', { timestamp: '2026-10-05T08:18:00' }, /offset/i],
  ])('rejects %s', (_name, override, message) => {
    expect(() => createFundingEvent({ ...raw, ...override })).toThrow(message);
  });
});

describe('fingerprintFundingEvent', () => {
  it('is equal for the same content written differently (5000 vs 5000.00)', () => {
    const a = createFundingEvent(raw);
    const b = createFundingEvent({ ...raw, amountUsdt: '5000.00', amountBs: '48972.50' });
    expect(fingerprintFundingEvent(a)).toBe(fingerprintFundingEvent(b));
  });

  it('differs when any financial field differs', () => {
    const a = createFundingEvent(raw);
    const b = createFundingEvent({ ...raw, amountBs: 48972.6 });
    expect(fingerprintFundingEvent(a)).not.toBe(fingerprintFundingEvent(b));
  });
});
