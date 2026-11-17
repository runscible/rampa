import { PayoutEvent } from '../payouts/payout-event';
import { Break, createBreak } from './break';
import { BreakRule, minutesBetween } from './context';

const stuckPayout: BreakRule = ({ lifecycle, cutoff, thresholds }) =>
  lifecycle.payouts.flatMap((p): Break[] => {
    if (p.state !== 'CONFIRMED' || p.confirmedAt === undefined) return [];
    const waiting = minutesBetween(p.confirmedAt, cutoff);
    if (waiting <= thresholds.payoutSlaMinutes) return [];
    return [createBreak('STUCK_PAYOUT', p.payoutId, `Confirmed ${Math.round(waiting)} min before the cutoff with no terminal event (limit ${thresholds.payoutSlaMinutes} min)`, p.confirmedAt)];
  });

const reversed: BreakRule = ({ lifecycle }) =>
  lifecycle.accepted
    .filter((e) => e.type === 'REVERSED')
    .map((e) => createBreak('PAYOUT_REVERSED', e.payoutId, `Completed pay-out reversed (${e.amountBs} Bs returned to the balance)`, e.at));

/**
 * Every event of a pay-out has to carry the amount of the one before it: what is previewed is what is confirmed,
 * completed (or failed) and, if reversed, what is given back. Each event is compared with the previous one that was
 * applied, so a deviation is reported once and not again by every event after it, and a lost step does not hide it.
 * The ledger uses the amount of the COMPLETED and REVERSED events themselves, which is what the provider moved.
 */
const payoutAmountMismatch: BreakRule = ({ lifecycle }) => {
  const previous = new Map<string, PayoutEvent>();
  const breaks: Break[] = [];
  for (const event of lifecycle.accepted) {
    const before = previous.get(event.payoutId);
    if (before && !before.amountBs.equals(event.amountBs)) {
      const reason = `${event.type} is ${event.amountBs} Bs but ${before.type} was ${before.amountBs} Bs`;
      breaks.push(createBreak('PAYOUT_AMOUNT_MISMATCH', event.payoutId, reason, event.at, { idKey: event.eventId }));
    }
    previous.set(event.payoutId, event);
  }
  return breaks;
};

const rejectedEvents: BreakRule = ({ lifecycle }) =>
  lifecycle.rejected.map(({ event, reason, from }) => {
    const reversalWithoutCompletion = event.type === 'REVERSED' && from !== 'REVERSED';
    return createBreak(reversalWithoutCompletion ? 'REVERSAL_WITHOUT_COMPLETED' : 'ILLEGAL_TRANSITION', event.eventId, `${reason} (pay-out ${event.payoutId})`, event.at);
  });

/** Money moved at these states, so the provider's word is applied to the ledger even though the history has a gap. */
const MONEY_MOVING_STATES = ['COMPLETED', 'REVERSED'];

const incompleteChain: BreakRule = ({ lifecycle }) =>
  lifecycle.incomplete.map((p) => {
    const events = `${p.missing.join(' and ')} event${p.missing.length > 1 ? 's' : ''}`;
    const applied = MONEY_MOVING_STATES.includes(p.state) ? '; applied to the ledger because the provider reports that the money moved' : '';
    return createBreak('INCOMPLETE_PAYOUT_CHAIN', p.payoutId, `Pay-out is ${p.state} but its ${events} never arrived${applied}`, p.lastEventAt);
  });

const unconfirmedPreview: BreakRule = ({ lifecycle }) =>
  lifecycle.payouts
    .filter((p) => p.state === 'PREVIEWED')
    .map((p) => createBreak('UNCONFIRMED_PREVIEW', p.payoutId, `Previewed ${p.amountBs} Bs and never confirmed (no financial effect)`, p.lastEventAt));

export const PAYOUT_RULES: BreakRule[] = [stuckPayout, reversed, payoutAmountMismatch, rejectedEvents, incompleteChain, unconfirmedPreview];
