import { createFundingEvent, FundingEvent } from '../../domain/funding/funding-event';
import { JsonRecordsResult, parseJsonRecords, requireFields } from './json-records';

export type ParsedFundingEvents = JsonRecordsResult<FundingEvent>;

const FUNDING_FIELDS = ['event_id', 'deposit_tx_hash', 'amount_usdt', 'rate', 'amount_bs', 'timestamp'] as const;

/** Maps one JSON record to the domain: field names stay here, the rules live in createFundingEvent. */
function toFundingEvent(record: unknown): FundingEvent {
  const r = requireFields(record, FUNDING_FIELDS);
  return createFundingEvent({
    eventId: String(r.event_id),
    depositTxHash: String(r.deposit_tx_hash),
    amountUsdt: r.amount_usdt,
    rate: r.rate,
    amountBs: r.amount_bs,
    timestamp: String(r.timestamp),
  });
}

export function parseFundingEvents(json: string): ParsedFundingEvents {
  return parseJsonRecords(json, toFundingEvent);
}
