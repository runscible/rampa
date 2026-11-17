import { assertBalanced } from '../../src/domain/ledger/ledger';

describe('assertBalanced', () => {
  it('throws when a currency does not sum to zero', () => {
    const { Money } = jest.requireActual('../../src/domain/shared/money');
    const entry = {
      id: 'bad',
      at: new Date(0),
      lines: [{ account: 'USDT_WALLET_PENDING' as const, amount: Money.parse('USDT', '10.00') }],
    };
    expect(() => assertBalanced([entry])).toThrow(/not balanced/i);
  });
});
