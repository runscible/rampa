import { Break, BreakType, createBreak } from '../../src/domain/breaks/break';
import { breakCounts, reconciliationStatus } from '../../src/domain/breaks/status';

const at = new Date('2026-10-05T12:00:00Z');
const make = (...types: BreakType[]): Break[] => types.map((type, i) => createBreak(type, `s${i}`, 'reason', at));

describe('reconciliationStatus', () => {
  it('is RECONCILED when there is nothing at all', () => {
    expect(reconciliationStatus([])).toBe('RECONCILED');
  });

  it('is still RECONCILED when everything is informational', () => {
    expect(reconciliationStatus(make('DUPLICATE_DELIVERY', 'UNCONFIRMED_PREVIEW'))).toBe('RECONCILED');
  });

  it('needs review as soon as there is a review item', () => {
    expect(reconciliationStatus(make('PAYOUT_REVERSED'))).toBe('NEEDS_REVIEW');
  });

  it('needs review as soon as there is a break', () => {
    expect(reconciliationStatus(make('DUPLICATE_DELIVERY', 'SPREAD_EXCEEDED'))).toBe('NEEDS_REVIEW');
  });
});

describe('breakCounts', () => {
  it('counts every severity, including the ones with none', () => {
    expect(breakCounts([])).toEqual({ BREAK: 0, REVIEW: 0, INFO: 0 });
    expect(breakCounts(make('SPREAD_EXCEEDED', 'STUCK_PAYOUT', 'PAYOUT_REVERSED', 'DUPLICATE_DELIVERY'))).toEqual({ BREAK: 2, REVIEW: 1, INFO: 1 });
  });
});
