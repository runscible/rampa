import { Money } from '../shared/money';
import { Instant } from '../shared/time';
import { PAYOUT_EVENT_TYPES, PayoutEvent, PayoutEventType } from './payout-event';

export type PayoutState = 'PREVIEWED' | 'CONFIRMED' | 'COMPLETED' | 'FAILED' | 'REVERSED';

type Current = PayoutState | 'NONE';

/**
 * Legal transitions: event type -> (current state -> next state). Anything absent is illegal.
 *
 * A step that was lost does not stop the history from being recorded when it moves no money (CONFIRM, FAILED), and
 * COMPLETED is applied even without its predecessors because it means the provider already debited the balance.
 * What stays illegal is whatever would invent money (a REVERSED with nothing completed to undo) or contradict a
 * final state. The gaps themselves are reported by `incomplete`.
 */
const TRANSITIONS: Record<PayoutEventType, Partial<Record<Current, PayoutState>>> = {
  PREVIEW: { NONE: 'PREVIEWED' },
  CONFIRM: { NONE: 'CONFIRMED', PREVIEWED: 'CONFIRMED' },
  COMPLETED: { NONE: 'COMPLETED', PREVIEWED: 'COMPLETED', CONFIRMED: 'COMPLETED' },
  FAILED: { NONE: 'FAILED', PREVIEWED: 'FAILED', CONFIRMED: 'FAILED' },
  REVERSED: { COMPLETED: 'REVERSED' },
};

/** Steps a pay-out in each final state must have gone through. If one was never received, the history has a gap. */
const REQUIRED_STEPS: Record<PayoutState, PayoutEventType[]> = {
  PREVIEWED: ['PREVIEW'],
  CONFIRMED: ['PREVIEW', 'CONFIRM'],
  COMPLETED: ['PREVIEW', 'CONFIRM', 'COMPLETED'],
  FAILED: ['PREVIEW', 'CONFIRM', 'FAILED'],
  REVERSED: ['PREVIEW', 'CONFIRM', 'COMPLETED', 'REVERSED'],
};

/** Next state after an event, or undefined when the transition is illegal. */
export function nextState(current: PayoutState | undefined, type: PayoutEventType): PayoutState | undefined {
  return TRANSITIONS[type][current ?? 'NONE'];
}

export interface RejectedPayoutEvent {
  event: PayoutEvent;
  reason: string;
  /** State the payout was in when the event arrived (undefined: no previous event). */
  from: PayoutState | undefined;
}

export interface PayoutSnapshot {
  payoutId: string;
  state: PayoutState;
  /** Amount of the last accepted event. */
  amountBs: Money;
  /** Instant of the last accepted event. */
  lastEventAt: Instant;
  /** When the pay-out was confirmed, kept to measure how long it has been waiting for a terminal event. */
  confirmedAt?: Instant;
}

/** A pay-out whose final state implies steps that were never received. */
export interface IncompletePayout {
  payoutId: string;
  state: PayoutState;
  /** Required steps with no event at all, in lifecycle order. */
  missing: PayoutEventType[];
  lastEventAt: Instant;
}

export interface ReplayResult {
  /** Events that made a legal transition, in processing order. Only these may touch the ledger. */
  accepted: PayoutEvent[];
  /** Pay-outs with steps missing from their history. Their money effect, if any, is applied all the same. */
  incomplete: IncompletePayout[];
  /** Events that arrived in a state where they make no sense (never applied, needs review). */
  rejected: RejectedPayoutEvent[];
  /** Final state of every payout, ordered by payout id. */
  payouts: PayoutSnapshot[];
}

const typeRank = (type: PayoutEventType): number => PAYOUT_EVENT_TYPES.indexOf(type);

/** Total processing order: by instant, then lifecycle order, then event id. Independent of delivery order. */
function byLifecycle(a: PayoutEvent, b: PayoutEvent): number {
  return a.at.getTime() - b.at.getTime() || typeRank(a.type) - typeRank(b.type) || a.eventId.localeCompare(b.eventId);
}

/** Replays events through the state machine. Illegal transitions are rejected, so e.g. a payout is never debited twice. Gaps in the history are reported, not hidden. */
export function replayPayouts(events: PayoutEvent[]): ReplayResult {
  const accepted: PayoutEvent[] = [];
  const rejected: RejectedPayoutEvent[] = [];
  const payouts = new Map<string, PayoutSnapshot>();
  // Every step received for each pay-out, whether or not it could be applied: a step that came out of order was still
  // received, and the order problem is reported on its own.
  const received = new Map<string, Set<PayoutEventType>>();

  for (const event of [...events].sort(byLifecycle)) {
    received.set(event.payoutId, (received.get(event.payoutId) ?? new Set()).add(event.type));
    const current = payouts.get(event.payoutId);
    const next = nextState(current?.state, event.type);
    if (next === undefined) {
      rejected.push({ event, from: current?.state, reason: `${event.type} not allowed after ${current?.state ?? 'no previous event'}` });
      continue;
    }
    accepted.push(event);
    payouts.set(event.payoutId, {
      payoutId: event.payoutId,
      state: next,
      amountBs: event.amountBs,
      lastEventAt: event.at,
      confirmedAt: event.type === 'CONFIRM' ? event.at : current?.confirmedAt,
    });
  }

  const snapshots = [...payouts.values()].sort((a, b) => a.payoutId.localeCompare(b.payoutId));
  const incomplete = snapshots.flatMap((p): IncompletePayout[] => {
    const missing = REQUIRED_STEPS[p.state].filter((step) => !received.get(p.payoutId)?.has(step));
    return missing.length === 0 ? [] : [{ payoutId: p.payoutId, state: p.state, missing, lastEventAt: p.lastEventAt }];
  });

  return { accepted, incomplete, rejected, payouts: snapshots };
}

/** Bs in pay-outs that were confirmed but have no terminal event yet. A bare PREVIEW is not in flight. */
export function totalInFlight(payouts: PayoutSnapshot[]): Money {
  return payouts.filter((p) => p.state === 'CONFIRMED').reduce((sum, p) => sum.plus(p.amountBs), Money.zero('BS'));
}
