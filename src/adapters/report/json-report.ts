import { ACCOUNT_CURRENCY } from '../../domain/ledger/ledger';
import { formatInZone } from '../../domain/shared/time';
import { FileReconcileResult } from '../files/reconcile-files';
import { ReportOptions } from './text-report';

/** Machine-readable report. No clock and no randomness: the same inputs give the same bytes. */
export function renderJsonReport(result: FileReconcileResult, options: ReportOptions): string {
  const local = (instant: Date): string => formatInZone(instant, options.timeZone);
  const b = result.balances;
  const flagged = (items: Array<{ event: { eventId: string; payoutId: string }; reason: string }>) =>
    items.map(({ event, reason }) => ({ eventId: event.eventId, payoutId: event.payoutId, reason }));

  const report = {
    asOf: options.cutoff,
    timeZone: options.timeZone,
    balances: {
      usdtUnconverted: b.usdtUnconverted.toString(),
      usdtConverted: b.usdtConverted.toString(),
      bsFunded: b.bsFunded.toString(),
      bsAvailable: b.bsAvailable.toString(),
      bsPaidOut: b.bsPaidOut.toString(),
      bsInFlight: b.bsInFlight.toString(),
    },
    breaks: result.breaks.map((x) => ({
      id: x.id,
      type: x.type,
      severity: x.severity,
      subject: x.subject,
      reason: x.reason,
      at: x.at.toISOString(),
      atLocal: local(x.at),
      ...(x.until ? { until: x.until.toISOString(), untilLocal: local(x.until) } : {}),
    })),
    ingestion: {
      duplicateIds: result.ingestion.duplicateIds,
      conflictingIds: result.ingestion.conflictingIds,
      irregularPayoutEvents: flagged(result.ingestion.irregularPayoutEvents),
      rejectedPayoutEvents: flagged(result.ingestion.rejectedPayoutEvents),
    },
    parseErrors: result.parseErrors,
    ledger: result.ledger.map((entry) => ({
      id: entry.id,
      at: entry.at.toISOString(),
      lines: entry.lines.map((l) => ({ account: l.account, currency: ACCOUNT_CURRENCY[l.account], amount: l.amount.toString() })),
    })),
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}
