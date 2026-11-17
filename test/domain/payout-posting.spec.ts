import { accountBalance, assertBalanced } from '../../src/domain/ledger/ledger';
import { postPayout } from '../../src/domain/ledger/posting';
import { createPayoutEvent } from '../../src/domain/payouts/payout-event';

const event = (type: string) =>
  createPayoutEvent({ eventId: 'pe_1', payoutId: 'P001', type, amountBs: 6200, timestamp: '2026-10-05T08:46:00-04:00' });

describe('postPayout', () => {
  it('COMPLETED debits the provider balance into paid out, balanced in Bs', () => {
    const entry = postPayout(event('COMPLETED'));
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe('payout:pe_1');
    expect(() => assertBalanced([entry!])).not.toThrow();
    expect(accountBalance([entry!], 'BS_PAID_OUT').toString()).toBe('6200.00');
    expect(accountBalance([entry!], 'BS_PROVIDER_BALANCE').toString()).toBe('-6200.00');
  });

  it('REVERSED is the exact inverse of COMPLETED: funds return to the balance', () => {
    const done = postPayout(event('COMPLETED'))!;
    const reversed = postPayout(event('REVERSED'))!;
    expect(() => assertBalanced([reversed])).not.toThrow();
    expect(accountBalance([done, reversed], 'BS_PAID_OUT').isZero()).toBe(true);
    expect(accountBalance([done, reversed], 'BS_PROVIDER_BALANCE').isZero()).toBe(true);
  });

  it.each(['PREVIEW', 'CONFIRM', 'FAILED'])('%s has no financial effect', (type) => {
    expect(postPayout(event(type))).toBeNull();
  });
});
