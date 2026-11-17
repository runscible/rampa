import { createDeposit } from '../../src/domain/deposits/deposit';

describe('createDeposit', () => {
  const ok = { txHash: '0x1', amount: '10.00', timestamp: '2026-10-05T08:10:00-04:00' };

  it('builds a deposit from valid raw values', () => {
    expect(createDeposit(ok).amount.toString()).toBe('10.00');
  });

  it.each([
    ['empty tx hash', { ...ok, txHash: '' }, /tx_hash/],
    ['zero amount', { ...ok, amount: '0' }, /positive/],
    ['negative amount', { ...ok, amount: '-5' }, /positive/],
    ['timestamp without offset', { ...ok, timestamp: '2026-10-05T08:10:00' }, /offset/i],
  ])('rejects %s', (_name, raw, message) => {
    expect(() => createDeposit(raw)).toThrow(message);
  });
});
