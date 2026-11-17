import { readFileSync } from 'fs';
import { join } from 'path';
import { assertBalanced } from '../../src/domain/ledger/ledger';
import { reconcileFiles } from '../../src/adapters/files/reconcile-files';

const CUTOFF = { cutoff: '2026-10-05T20:00:00-04:00' };
const HEADER = 'tx_hash,amount_usdt,timestamp';

describe('reconcileFiles: deposits only (slice 1)', () => {
  it('a single deposit is USDT sent but not yet converted', () => {
    const result = reconcileFiles({ deposits: `${HEADER}\n0x1,1500.00,2026-10-05T17:40:00-04:00` }, CUTOFF);
    expect(result.balances.usdtUnconverted.toString()).toBe('1500.00');
  });

  it('sums several deposits', () => {
    const csv = [HEADER, '0x1,5000.00,2026-10-05T08:10:00-04:00', '0x2,3000.00,2026-10-05T10:05:00-04:00'].join('\n');
    expect(reconcileFiles({ deposits: csv }, CUTOFF).balances.usdtUnconverted.toString()).toBe('8000.00');
  });

  it('ignores deposits after the cutoff', () => {
    const csv = [HEADER, '0x1,100.00,2026-10-05T19:59:59-04:00', '0x2,900.00,2026-10-05T20:00:01-04:00'].join('\n');
    expect(reconcileFiles({ deposits: csv }, CUTOFF).balances.usdtUnconverted.toString()).toBe('100.00');
  });

  it('includes a deposit exactly at the cutoff', () => {
    const csv = `${HEADER}\n0x1,100.00,2026-10-05T20:00:00-04:00`;
    expect(reconcileFiles({ deposits: csv }, CUTOFF).balances.usdtUnconverted.toString()).toBe('100.00');
  });

  it('is independent of the time zone the cutoff is written in', () => {
    const csv = `${HEADER}\n0x1,100.00,2026-10-05T19:00:00-04:00`;
    const utcCutoff = { cutoff: '2026-10-06T00:00:00Z' }; // same instant as 20:00 La Paz
    expect(reconcileFiles({ deposits: csv }, utcCutoff).balances.usdtUnconverted.toString()).toBe('100.00');
  });

  it('posts balanced double-entry journal entries', () => {
    const csv = [HEADER, '0x1,5000.00,2026-10-05T08:10:00-04:00', '0x2,3000.00,2026-10-05T10:05:00-04:00'].join('\n');
    const { ledger } = reconcileFiles({ deposits: csv }, CUTOFF);
    expect(ledger).toHaveLength(2);
    expect(() => assertBalanced(ledger)).not.toThrow();
  });

  it('surfaces parse errors instead of dropping rows silently', () => {
    const csv = [HEADER, '0x1,100.00,2026-10-05T08:10:00-04:00', '0x2,oops,2026-10-05T09:00:00-04:00'].join('\n');
    const result = reconcileFiles({ deposits: csv }, CUTOFF);
    expect(result.balances.usdtUnconverted.toString()).toBe('100.00');
    expect(result.parseErrors).toEqual([{ file: 'usdt_deposits.csv', line: 3, reason: expect.stringContaining('oops') }]);
  });

  it('real data: 16,000 USDT deposited, nothing converted yet in this slice', () => {
    const deposits = readFileSync(join(__dirname, '..', '..', 'data', 'usdt_deposits.csv'), 'utf8');
    const result = reconcileFiles({ deposits }, CUTOFF);
    expect(result.balances.usdtUnconverted.toString()).toBe('16000.00');
    expect(result.parseErrors).toEqual([]);
  });
});
