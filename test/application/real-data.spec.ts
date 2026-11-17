import { assertBalanced } from '../../src/domain/ledger/ledger';
import { reconcileRealData } from '../support/real-data';

describe('the four provided files (the numbers of the plan)', () => {
  it('balances', async () => {
    const { balances } = await reconcileRealData();
    expect(Object.fromEntries(Object.entries(balances).map(([name, money]) => [name, money.toString()]))).toEqual({
      usdtUnconverted: '1500.00',
      usdtConverted: '14500.00',
      bsFunded: '141626.50',
      bsAvailable: '12120.95',
      bsPaidOut: '129505.55',
      bsInFlight: '3900.00',
    });
  });

  it('the ledger balances in both currencies', async () => {
    const { ledger } = await reconcileRealData();
    expect(ledger).toHaveLength(24);
    expect(() => assertBalanced(ledger)).not.toThrow();
  });

  it('nothing was rejected, and the only duplicate is pe_0029', async () => {
    const { ingestion } = await reconcileRealData();
    expect(ingestion.rejectedPayoutEvents).toEqual([]);
    expect(ingestion.duplicateIds).toEqual(['pe_0029']);
    expect(ingestion.conflictingIds).toEqual([]);
  });

  it('breaks: 5 breaks, 1 review and 2 info, in report order', async () => {
    const { breaks } = await reconcileRealData();
    expect(breaks.map((b) => `${b.severity} ${b.type} ${b.subject}`)).toEqual([
      'BREAK SPREAD_EXCEEDED fw_003',
      'BREAK NEGATIVE_BALANCE BS_PROVIDER_BALANCE',
      'BREAK LATE_FUNDING_WEBHOOK fw_004',
      'BREAK DEPOSIT_WITHOUT_WEBHOOK 0x12a750139ca2e4c14287bb6ed9ece9ee75b556a911f19f91c2f0d59ef40e7597',
      'BREAK STUCK_PAYOUT P018',
      'REVIEW PAYOUT_REVERSED P005',
      'INFO UNCONFIRMED_PREVIEW P009',
      'INFO DUPLICATE_DELIVERY pe_0029',
    ]);
  });

  it('breaks explain themselves with the figures of the plan', async () => {
    const { breaks } = await reconcileRealData();
    const byType = (type: string) => breaks.find((b) => b.type === type)!;
    expect(byType('SPREAD_EXCEEDED').reason).toContain('1.20%');
    expect(byType('LATE_FUNDING_WEBHOOK').reason).toContain('145 min');
    expect(byType('NEGATIVE_BALANCE').reason).toContain('2480.55');
    expect(byType('NEGATIVE_BALANCE').at.toISOString()).toBe('2026-10-05T20:26:00.000Z');
    expect(byType('NEGATIVE_BALANCE').until?.toISOString()).toBe('2026-10-05T21:10:00.000Z');
    expect(byType('STUCK_PAYOUT').reason).toContain('49 min');
  });

  it('fw_004 is late but its spread is fine: the 17:00 rate applies, not the 14:00 one', async () => {
    const { breaks } = await reconcileRealData();
    expect(breaks.filter((b) => b.subject === 'fw_004').map((b) => b.type)).toEqual(['LATE_FUNDING_WEBHOOK']);
  });

  it('is repeatable', async () => {
    expect(await reconcileRealData()).toEqual(await reconcileRealData());
  });
});
