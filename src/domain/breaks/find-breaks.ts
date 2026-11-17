import { BALANCE_RULES } from './balance-rules';
import { Break, BreakSeverity } from './break';
import { BreakContext, BreakRule } from './context';
import { FUNDING_RULES } from './funding-rules';
import { INGESTION_RULES } from './ingestion-rules';
import { PAYOUT_RULES } from './payout-rules';

const RULES: BreakRule[] = [...FUNDING_RULES, ...PAYOUT_RULES, ...BALANCE_RULES, ...INGESTION_RULES];

const SEVERITY_ORDER: Record<BreakSeverity, number> = { BREAK: 0, REVIEW: 1, INFO: 2 };

/** Report order: most severe first, then chronological, then by id. Total, so the report is deterministic. */
const byReportOrder = (a: Break, b: Break): number =>
  SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id);

/** Keeps ids unique when the same thing is reported twice (e.g. the third delivery of a conflicting event). */
function withUniqueIds(breaks: Break[]): Break[] {
  const seen = new Map<string, number>();
  return breaks.map((b) => {
    const count = (seen.get(b.id) ?? 0) + 1;
    seen.set(b.id, count);
    return count === 1 ? b : { ...b, id: `${b.id}#${count}` };
  });
}

export function findBreaks(context: BreakContext): Break[] {
  return withUniqueIds(RULES.flatMap((rule) => rule(context)).sort(byReportOrder));
}
