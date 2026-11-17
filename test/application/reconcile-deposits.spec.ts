import { createDeposit } from '../../src/domain/deposits/deposit';
import { assertBalanced } from '../../src/domain/ledger/ledger';
import { run } from '../support/builders';

const deposit = (txHash: string, amount: string, timestamp: string) => createDeposit({ txHash, amount, timestamp });
const unconverted = (deposits: ReturnType<typeof deposit>[], cutoff?: string) => run({ deposits }, cutoff).balances.usdtUnconverted.toString();

describe('reconcile: deposits only', () => {
  it('a single deposit is USDT sent but not yet converted', () => {
    expect(unconverted([deposit('0x1', '1500.00', '2026-10-05T17:40:00-04:00')])).toBe('1500.00');
  });

  it('sums several deposits', () => {
    expect(unconverted([deposit('0x1', '5000.00', '2026-10-05T08:10:00-04:00'), deposit('0x2', '3000.00', '2026-10-05T10:05:00-04:00')])).toBe('8000.00');
  });

  it('ignores deposits after the cutoff', () => {
    expect(unconverted([deposit('0x1', '100.00', '2026-10-05T19:59:59-04:00'), deposit('0x2', '900.00', '2026-10-05T20:00:01-04:00')])).toBe('100.00');
  });

  it('includes a deposit exactly at the cutoff', () => {
    expect(unconverted([deposit('0x1', '100.00', '2026-10-05T20:00:00-04:00')])).toBe('100.00');
  });

  it('is independent of the time zone the cutoff is written in', () => {
    const deposits = [deposit('0x1', '100.00', '2026-10-05T19:00:00-04:00')];
    expect(unconverted(deposits, '2026-10-06T00:00:00Z')).toBe('100.00'); // same instant as 20:00 La Paz
  });

  it('posts balanced double-entry journal entries', () => {
    const { ledger } = run({ deposits: [deposit('0x1', '5000.00', '2026-10-05T08:10:00-04:00'), deposit('0x2', '3000.00', '2026-10-05T10:05:00-04:00')] });
    expect(ledger).toHaveLength(2);
    expect(() => assertBalanced(ledger)).not.toThrow();
  });
});
