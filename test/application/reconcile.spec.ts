import { reconcile } from '../../src/application/reconcile';
import { createDeposit } from '../../src/domain/deposits/deposit';

const CONFIG = { cutoff: '2026-10-05T20:00:00-04:00' };
const deposit = (txHash: string, amount: string, timestamp: string) => createDeposit({ txHash, amount, timestamp });

describe('reconcile (use case, domain objects only)', () => {
  it('sums deposits up to the cutoff, inclusive', () => {
    const result = reconcile(
      {
        fundingEvents: [],
        deposits: [
          deposit('0x1', '100.00', '2026-10-05T20:00:00-04:00'),
          deposit('0x2', '900.00', '2026-10-05T20:00:01-04:00'),
        ],
      },
      CONFIG,
    );
    expect(result.balances.usdtUnconverted.toString()).toBe('100.00');
  });
});
