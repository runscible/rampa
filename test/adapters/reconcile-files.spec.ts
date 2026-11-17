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

  it('real data: 14,500 USDT converted, 1,500 pending, 141,626.50 Bs funded, 129,505.55 Bs paid out, 12,120.95 available, 3,900 in flight', () => {
    const read = (name: string) => readFileSync(join(__dirname, '..', '..', 'data', name), 'utf8');
    const result = reconcileFiles(
      { deposits: read('usdt_deposits.csv'), fundingWebhooks: read('funding_webhooks.json'), payoutEvents: read('payout_events.json') },
      CUTOFF,
    );
    expect(result.balances.bsPaidOut.toString()).toBe('129505.55');
    expect(result.balances.bsAvailable.toString()).toBe('12120.95');
    expect(result.balances.bsInFlight.toString()).toBe('3900.00');
    expect(result.ingestion.rejectedPayoutEvents).toEqual([]);
    expect(result.ingestion.irregularPayoutEvents).toEqual([]);
    expect(result.ingestion.duplicateIds).toEqual(['pe_0029']);
    expect(result.balances.usdtUnconverted.toString()).toBe('1500.00');
    expect(result.balances.usdtConverted.toString()).toBe('14500.00');
    expect(result.balances.bsFunded.toString()).toBe('141626.50');
    expect(result.parseErrors).toEqual([]);
    expect(() => assertBalanced(result.ledger)).not.toThrow();
  });

  it('real data: the breaks report matches the plan (5 breaks, 1 review, 2 info)', () => {
    const read = (name: string) => readFileSync(join(__dirname, '..', '..', 'data', name), 'utf8');
    const result = reconcileFiles(
      {
        deposits: read('usdt_deposits.csv'),
        fundingWebhooks: read('funding_webhooks.json'),
        payoutEvents: read('payout_events.json'),
        referenceRates: read('reference_rates.csv'),
      },
      CUTOFF,
    );
    const summary = result.breaks.map((b) => `${b.severity} ${b.type} ${b.subject}`);
    expect(summary).toEqual([
      'BREAK SPREAD_EXCEEDED fw_003',
      'BREAK NEGATIVE_BALANCE BS_PROVIDER_BALANCE',
      'BREAK LATE_FUNDING_WEBHOOK fw_004',
      'BREAK DEPOSIT_WITHOUT_WEBHOOK 0x12a750139ca2e4c14287bb6ed9ece9ee75b556a911f19f91c2f0d59ef40e7597',
      'BREAK STUCK_PAYOUT P018',
      'REVIEW PAYOUT_REVERSED P005',
      'INFO UNCONFIRMED_PREVIEW P009',
      'INFO DUPLICATE_DELIVERY pe_0029',
    ]);
    const byType = (type: string) => result.breaks.find((b) => b.type === type)!;
    expect(byType('SPREAD_EXCEEDED').reason).toContain('1.20%');
    expect(byType('LATE_FUNDING_WEBHOOK').reason).toContain('145 min');
    expect(byType('NEGATIVE_BALANCE').reason).toContain('2480.55');
    expect(byType('NEGATIVE_BALANCE').at.toISOString()).toBe('2026-10-05T20:26:00.000Z');
    expect(byType('NEGATIVE_BALANCE').until?.toISOString()).toBe('2026-10-05T21:10:00.000Z');
    expect(byType('STUCK_PAYOUT').reason).toContain('49 min');
  });

  it('is repeatable: running the same files twice gives identical breaks', () => {
    const read = (name: string) => readFileSync(join(__dirname, '..', '..', 'data', name), 'utf8');
    const files = { deposits: read('usdt_deposits.csv'), fundingWebhooks: read('funding_webhooks.json'), payoutEvents: read('payout_events.json'), referenceRates: read('reference_rates.csv') };
    expect(reconcileFiles(files, CUTOFF).breaks).toEqual(reconcileFiles(files, CUTOFF).breaks);
  });

  it('surfaces payout parse errors with the file name', () => {
    const result = reconcileFiles({ deposits: HEADER, payoutEvents: '[{}]' }, CUTOFF);
    expect(result.parseErrors).toEqual([{ file: 'payout_events.json', line: 1, reason: expect.stringContaining('event_id') }]);
  });

  it('surfaces rate parse errors with the file name', () => {
    const result = reconcileFiles({ deposits: HEADER, referenceRates: 'timestamp,usdt_bs\n2026-10-05T07:00:00-04:00,abc' }, CUTOFF);
    expect(result.parseErrors).toEqual([{ file: 'reference_rates.csv', line: 2, reason: expect.stringContaining('abc') }]);
  });

  it('surfaces funding webhook parse errors with the file name', () => {
    const result = reconcileFiles({ deposits: HEADER, fundingWebhooks: '{nope' }, CUTOFF);
    expect(result.parseErrors).toEqual([{ file: 'funding_webhooks.json', line: 1, reason: expect.stringMatching(/JSON/i) }]);
  });
});
