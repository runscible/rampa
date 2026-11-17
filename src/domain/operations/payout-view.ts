import { Break } from '../breaks/break';
import { JournalEntry } from '../ledger/ledger';
import { payoutEntryId } from '../ledger/posting';
import { PayoutEventType } from '../payouts/payout-event';
import { PayoutHistoryEntry, PayoutState, ReplayResult } from '../payouts/payout-state';
import { Money } from '../shared/money';
import { Instant } from '../shared/time';

/**
 * Everything known about one pay-out, as facts: how far it got, every event received (applied or not, and why),
 * which steps are missing, how much money it moved in our ledger, and the breaks that concern it. Whoever reads this
 * decides what to do; the view does not.
 */
export interface PayoutView {
  payoutId: string;
  /** 'UNKNOWN' when none of its events could be applied. */
  state: PayoutState | 'UNKNOWN';
  /** Amount of the last applied event; null when there is none. */
  amountBs: Money | null;
  /** Bs this pay-out has moved in our ledger: completions minus reversals. */
  paidOutBs: Money;
  lastEventAt: Instant;
  /** Every event received, in processing order. */
  steps: PayoutHistoryEntry[];
  missingSteps: PayoutEventType[];
  /** Breaks about the pay-out itself or about any of its events. */
  breaks: Break[];
}

export function buildPayoutViews(lifecycle: ReplayResult, ledger: JournalEntry[], breaks: Break[]): PayoutView[] {
  const entries = new Map(ledger.map((entry) => [entry.id, entry]));
  const snapshots = new Map(lifecycle.payouts.map((p) => [p.payoutId, p]));
  const incomplete = new Map(lifecycle.incomplete.map((p) => [p.payoutId, p]));

  const historyOf = new Map<string, PayoutHistoryEntry[]>();
  for (const entry of lifecycle.history) {
    historyOf.set(entry.event.payoutId, [...(historyOf.get(entry.event.payoutId) ?? []), entry]);
  }

  const paidOut = (steps: PayoutHistoryEntry[]): Money =>
    steps
      .flatMap((step) => entries.get(payoutEntryId(step.event.eventId))?.lines ?? [])
      .filter((line) => line.account === 'BS_PAID_OUT')
      .reduce((sum, line) => sum.plus(line.amount), Money.zero('BS'));

  return [...historyOf.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([payoutId, steps]) => {
      const snapshot = snapshots.get(payoutId);
      const ids = new Set([payoutId, ...steps.map((s) => s.event.eventId)]);
      return {
        payoutId,
        state: snapshot?.state ?? 'UNKNOWN',
        amountBs: snapshot?.amountBs ?? null,
        paidOutBs: paidOut(steps),
        lastEventAt: new Date(Math.max(...steps.map((s) => s.event.at.getTime()))),
        steps,
        missingSteps: incomplete.get(payoutId)?.missing ?? [],
        breaks: breaks.filter((b) => ids.has(b.subject)),
      };
    });
}
