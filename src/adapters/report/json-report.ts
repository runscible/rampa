import { Balances } from '../../application/reconcile';
import { Break } from '../../domain/breaks/break';
import { ACCOUNT_CURRENCY, JournalEntry } from '../../domain/ledger/ledger';
import { formatInZone } from '../../domain/shared/time';
import { ReportInput, ReportOptions } from './text-report';

export const balancesJson = (b: Balances) => ({
  usdtUnconverted: b.usdtUnconverted.toString(),
  usdtConverted: b.usdtConverted.toString(),
  bsFunded: b.bsFunded.toString(),
  bsAvailable: b.bsAvailable.toString(),
  bsPaidOut: b.bsPaidOut.toString(),
  bsInFlight: b.bsInFlight.toString(),
});

/** Breaks with their instants both in UTC and in the given time zone. */
export const breaksJson = (breaks: Break[], timeZone: string) =>
  breaks.map((x) => ({
    id: x.id,
    type: x.type,
    severity: x.severity,
    subject: x.subject,
    reason: x.reason,
    at: x.at.toISOString(),
    atLocal: formatInZone(x.at, timeZone),
    ...(x.until ? { until: x.until.toISOString(), untilLocal: formatInZone(x.until, timeZone) } : {}),
  }));

export const ledgerJson = (ledger: JournalEntry[]) =>
  ledger.map((entry) => ({
    id: entry.id,
    at: entry.at.toISOString(),
    lines: entry.lines.map((l) => ({ account: l.account, currency: ACCOUNT_CURRENCY[l.account], amount: l.amount.toString() })),
  }));

/** Machine-readable report. No clock and no randomness: the same inputs give the same bytes. */
export function renderJsonReport(result: ReportInput, options: ReportOptions): string {
  const flagged = (items: Array<{ event: { eventId: string; payoutId: string }; reason: string }>) =>
    items.map(({ event, reason }) => ({ eventId: event.eventId, payoutId: event.payoutId, reason }));

  const report = {
    asOf: options.cutoff,
    timeZone: options.timeZone,
    balances: balancesJson(result.balances),
    breaks: breaksJson(result.breaks, options.timeZone),
    ingestion: {
      duplicateIds: result.ingestion.duplicateIds,
      conflictingIds: result.ingestion.conflictingIds,
      irregularPayoutEvents: flagged(result.ingestion.irregularPayoutEvents),
      rejectedPayoutEvents: flagged(result.ingestion.rejectedPayoutEvents),
    },
    parseErrors: result.parseErrors ?? [],
    ledger: ledgerJson(result.ledger),
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}
