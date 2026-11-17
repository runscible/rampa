import { Break, BreakSeverity } from './break';

/** Whether the figures can be taken as settled: RECONCILED has nothing to review, NEEDS_REVIEW has at least a break or a review. */
export type ReconciliationStatus = 'RECONCILED' | 'NEEDS_REVIEW';

/** Informational findings do not count: they do not put the figures in doubt. */
export const reconciliationStatus = (breaks: Break[]): ReconciliationStatus =>
  breaks.some((b) => b.severity !== 'INFO') ? 'NEEDS_REVIEW' : 'RECONCILED';

export function breakCounts(breaks: Break[]): Record<BreakSeverity, number> {
  const count = (severity: BreakSeverity): number => breaks.filter((b) => b.severity === severity).length;
  return { BREAK: count('BREAK'), REVIEW: count('REVIEW'), INFO: count('INFO') };
}
