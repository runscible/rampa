import { Money } from '../shared/money';
import { Instant } from '../shared/time';
import { PAYOUT_EVENT_TYPES, PayoutEvent, PayoutEventType } from './payout-event';

export type PayoutState = 'PREVIEWED' | 'CONFIRMED' | 'COMPLETED' | 'FAILED' | 'REVERSED';

type Current = PayoutState | 'NONE';

/** Legal transitions: event type -> (current state -> next state). Anything absent is illegal. */
const TRANSITIONS: Record<PayoutEventType, Partial<Record<Current, PayoutState>>> = {
  PREVIEW: { NONE: 'PREVIEWED' },
  CONFIRM: { PREVIEWED: 'CONFIRMED' },
  // Lenient on purpose: COMPLETED means the provider already debited the balance, so it is applied
  // even if CONFIRM was lost, and reported as irregular instead of hiding a real movement.
  COMPLETED: { NONE: 'COMPLETED', PREVIEWED: 'COMPLETED', CONFIRMED: 'COMPLETED' },
  FAILED: { CONFIRMED: 'FAILED' },
  REVERSED: { COMPLETED: 'REVERSED' },
};

/** The predecessor a regular lifecycle has for an event; accepted events from any other state are irregular. */
const REGULAR_FROM: Partial<Record<PayoutEventType, Current>> = { COMPLETED: 'CONFIRMED' };

/** Next state after an event, or undefined when the transition is illegal. */
export function nextState(current: PayoutState | undefined, type: PayoutEventType): PayoutState | undefined {
  return TRANSITIONS[type][current ?? 'NONE'];
}

export interface FlaggedPayoutEvent {
  event: PayoutEvent;
  reason: string;
}

export interface PayoutSnapshot {
  payoutId: string;
  state: PayoutState;
  /** Amount of the last accepted event. */
  amountBs: Money;
  /** Amount announced at PREVIEW, kept to compare against the CONFIRM amount. */
  previewAmountBs?: Money;
  /** When the pay-out was confirmed, kept to measure how long it has been waiting for a terminal event. */
  confirmedAt?: Instant;
}

export interface ReplayResult {
  /** Events that made a legal transition, in processing order. Only these may touch the ledger. */
  accepted: PayoutEvent[];
  /** Accepted events that skipped a regular step (e.g. COMPLETED without CONFIRM): applied, but need review. */
  irregular: FlaggedPayoutEvent[];
  /** Events that arrived in a state where they make no sense (never applied, needs review). */
  rejected: FlaggedPayoutEvent[];
  /** Final state of every payout, ordered by payout id. */
  payouts: PayoutSnapshot[];
}

const typeRank = (type: PayoutEventType): number => PAYOUT_EVENT_TYPES.indexOf(type);

/** Total processing order: by instant, then lifecycle order, then event id. Independent of delivery order. */
function byLifecycle(a: PayoutEvent, b: PayoutEvent): number {
  return a.at.getTime() - b.at.getTime() || typeRank(a.type) - typeRank(b.type) || a.eventId.localeCompare(b.eventId);
}

/** Reasons why an accepted event deviates from a regular lifecycle (empty when it is regular). */
function irregularities(event: PayoutEvent, current: PayoutSnapshot | undefined): string[] {
  const previousState = current?.state ?? 'NONE';
  const expectedPrevious = REGULAR_FROM[event.type];
  const skippedRegularStep = expectedPrevious !== undefined && previousState !== expectedPrevious;
  const reversalAmountDiffers = event.type === 'REVERSED' && current !== undefined && !event.amountBs.equals(current.amountBs);

  const reasons: string[] = [];
  if (skippedRegularStep) reasons.push(`${event.type} without ${expectedPrevious} (was ${current?.state ?? 'no previous event'})`);
  if (reversalAmountDiffers) reasons.push(`REVERSED amount ${event.amountBs} differs from COMPLETED amount ${current.amountBs}`);
  return reasons;
}

/** Replays events through the state machine. Illegal transitions are rejected, so e.g. a payout is never debited twice. */
export function replayPayouts(events: PayoutEvent[]): ReplayResult {
  const accepted: PayoutEvent[] = [];
  const rejected: FlaggedPayoutEvent[] = [];
  const irregular: FlaggedPayoutEvent[] = [];
  const payouts = new Map<string, PayoutSnapshot>();

  for (const event of [...events].sort(byLifecycle)) {
    const current = payouts.get(event.payoutId);
    const next = nextState(current?.state, event.type);
    if (next === undefined) {
      rejected.push({ event, reason: `${event.type} not allowed after ${current?.state ?? 'no previous event'}` });
      continue;
    }
    for (const reason of irregularities(event, current)) irregular.push({ event, reason });
    accepted.push(event);
    payouts.set(event.payoutId, {
      payoutId: event.payoutId,
      state: next,
      amountBs: event.amountBs,
      previewAmountBs: event.type === 'PREVIEW' ? event.amountBs : current?.previewAmountBs,
      confirmedAt: event.type === 'CONFIRM' ? event.at : current?.confirmedAt,
    });
  }

  return { accepted, irregular, rejected, payouts: [...payouts.values()].sort((a, b) => a.payoutId.localeCompare(b.payoutId)) };
}

/** Bs in pay-outs that were confirmed but have no terminal event yet. A bare PREVIEW is not in flight. */
export function totalInFlight(payouts: PayoutSnapshot[]): Money {
  return payouts.filter((p) => p.state === 'CONFIRMED').reduce((sum, p) => sum.plus(p.amountBs), Money.zero('BS'));
}
