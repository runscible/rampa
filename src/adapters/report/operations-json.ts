import { DepositView } from '../../domain/operations/deposit-view';
import { PayoutView } from '../../domain/operations/payout-view';
import { formatInZone } from '../../domain/shared/time';
import { breaksJson } from './json-report';

/** A pay-out as a caller sees it: its state, every event received and why it was or was not applied, what is missing. */
export const payoutViewJson = (view: PayoutView, timeZone: string) => ({
  payoutId: view.payoutId,
  state: view.state,
  amountBs: view.amountBs?.toString() ?? null,
  paidOutBs: view.paidOutBs.toString(),
  lastEventAt: view.lastEventAt.toISOString(),
  lastEventAtLocal: formatInZone(view.lastEventAt, timeZone),
  missingSteps: view.missingSteps,
  steps: view.steps.map(({ event, applied, reason }) => ({
    eventId: event.eventId,
    type: event.type,
    amountBs: event.amountBs.toString(),
    at: event.at.toISOString(),
    atLocal: formatInZone(event.at, timeZone),
    applied,
    ...(reason ? { reason } : {}),
  })),
  breaks: breaksJson(view.breaks, timeZone),
});

/** A deposit as a caller sees it: what came in, every webhook that converted it, and what those credited. */
export const depositViewJson = (view: DepositView, timeZone: string) => ({
  txHash: view.txHash,
  ...(view.deposit ? { depositAt: view.deposit.at.toISOString(), depositAtLocal: formatInZone(view.deposit.at, timeZone) } : {}),
  depositedUsdt: view.depositedUsdt.toString(),
  convertedUsdt: view.convertedUsdt.toString(),
  creditedBs: view.creditedBs.toString(),
  fundings: view.fundings.map((f) => ({
    eventId: f.eventId,
    amountUsdt: f.amountUsdt.toString(),
    rate: f.rate.toString(),
    amountBs: f.amountBs.toString(),
    at: f.at.toISOString(),
    atLocal: formatInZone(f.at, timeZone),
  })),
  breaks: breaksJson(view.breaks, timeZone),
});
