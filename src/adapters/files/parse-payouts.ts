import { createPayoutEvent, PayoutEvent } from '../../domain/payouts/payout-event';
import { JsonRecordsResult, mapRecords, parseJsonRecords, requireFields } from './json-records';

export type ParsedPayoutEvents = JsonRecordsResult<PayoutEvent>;

const PAYOUT_FIELDS = ['event_id', 'payout_id', 'type', 'amount_bs', 'timestamp'] as const;

/** Maps one JSON record to the domain: field names stay here, the rules live in createPayoutEvent. */
function toPayoutEvent(record: unknown): PayoutEvent {
  const r = requireFields(record, PAYOUT_FIELDS);
  return createPayoutEvent({
    eventId: String(r.event_id),
    payoutId: String(r.payout_id),
    type: String(r.type),
    amountBs: r.amount_bs,
    timestamp: String(r.timestamp),
  });
}

/** Records of an already parsed JSON body (e.g. an HTTP request). */
export function payoutEventsFromJson(data: unknown): ParsedPayoutEvents {
  return mapRecords(data, toPayoutEvent);
}

export function parsePayoutEvents(json: string): ParsedPayoutEvents {
  return parseJsonRecords(json, toPayoutEvent);
}
