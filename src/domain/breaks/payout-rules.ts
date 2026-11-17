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

const confirmAmountMismatch: BreakRule = ({ lifecycle }) => {
  const previews = new Map<string, PayoutEvent>();
  const breaks: Break[] = [];
  for (const e of lifecycle.accepted) {
    if (e.type === 'PREVIEW') previews.set(e.payoutId, e);
    const preview = previews.get(e.payoutId);
    if (e.type === 'CONFIRM' && preview && !preview.amountBs.equals(e.amountBs)) {
      breaks.push(createBreak('CONFIRM_AMOUNT_MISMATCH', e.payoutId, `Previewed ${preview.amountBs} Bs but confirmed ${e.amountBs} Bs`, e.at));
    }
  }
  return breaks;
};

const rejectedEvents: BreakRule = ({ lifecycle }) =>
  lifecycle.rejected.map(({ event, reason, from }) => {
    const reversalWithoutCompletion = event.type === 'REVERSED' && from !== 'REVERSED';
    return createBreak(reversalWithoutCompletion ? 'REVERSAL_WITHOUT_COMPLETED' : 'ILLEGAL_TRANSITION', event.eventId, `${reason} (pay-out ${event.payoutId})`, event.at);
  });

const irregularEvents: BreakRule = ({ lifecycle }) =>
  lifecycle.irregular.map(({ event, reason }) => createBreak('IRREGULAR_PAYOUT_EVENT', event.eventId, `${reason} (pay-out ${event.payoutId}); applied because the provider reports it`, event.at));

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

export const PAYOUT_RULES: BreakRule[] = [stuckPayout, reversed, confirmAmountMismatch, rejectedEvents, irregularEvents, incompleteChain, unconfirmedPreview];
