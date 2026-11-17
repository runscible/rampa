import { reconcile } from '../../src/application/reconcile';
import { createDeposit } from '../../src/domain/deposits/deposit';

const CONFIG = { cutoff: '2026-10-05T20:00:00-04:00' };
const deposit = (txHash: string, amount: string, timestamp: string) => createDeposit({ txHash, amount, timestamp });

describe('reconcile (use case, domain objects only)', () => {
  it('sums deposits up to the cutoff, inclusive', () => {
    const result = reconcile(
      {
        fundingEvents: [], payoutEvents: [], rates: [],
        deposits: [
          deposit('0x1', '100.00', '2026-10-05T20:00:00-04:00'),
          deposit('0x2', '900.00', '2026-10-05T20:00:01-04:00'),
        ],
      },
      CONFIG,
    );
    expect(result.balances.usdtUnconverted.toString()).toBe('100.00');
  });

  it('is idempotent for deposits: the same tx_hash delivered twice is counted once and reported', () => {
    const d = deposit('0x1', '100.00', '2026-10-05T09:00:00-04:00');
    const r = reconcile({ deposits: [d, d], fundingEvents: [], payoutEvents: [], rates: [] }, CONFIG);
    expect(r.balances.usdtUnconverted.toString()).toBe('100.00');
    expect(r.ingestion.duplicateIds).toEqual(['0x1']);
  });

  it('a tx_hash repeated with a different amount keeps the first and reports a conflict', () => {
    const first = deposit('0x1', '100.00', '2026-10-05T09:00:00-04:00');
    const other = deposit('0x1', '999.00', '2026-10-05T09:00:00-04:00');
    const r = reconcile({ deposits: [first, other], fundingEvents: [], payoutEvents: [], rates: [] }, CONFIG);
    expect(r.balances.usdtUnconverted.toString()).toBe('100.00');
    expect(r.ingestion.conflictingIds).toEqual(['0x1']);
  });
});
