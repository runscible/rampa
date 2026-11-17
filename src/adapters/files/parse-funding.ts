import { createFundingEvent, FundingEvent } from '../../domain/funding/funding-event';
import { ParseError } from './csv';

export interface ParsedFundingEvents {
  records: FundingEvent[];
  /** `line` is the 1-based position of the record in the JSON array. */
  errors: ParseError[];
}

const FIELDS = ['event_id', 'deposit_tx_hash', 'amount_usdt', 'rate', 'amount_bs', 'timestamp'] as const;

/** Maps one JSON record to the domain: field names stay here, the rules live in createFundingEvent. */
function toFundingEvent(record: unknown): FundingEvent {
  if (typeof record !== 'object' || record === null) throw new TypeError('Record is not an object');
  const r = record as Record<string, unknown>;
  for (const field of FIELDS) {
    if (typeof r[field] !== 'string' && typeof r[field] !== 'number') {
      throw new TypeError(`Missing or invalid field: ${field}`);
    }
  }
  return createFundingEvent({
    eventId: String(r.event_id),
    depositTxHash: String(r.deposit_tx_hash),
    amountUsdt: r.amount_usdt as string | number,
    rate: r.rate as string | number,
    amountBs: r.amount_bs as string | number,
    timestamp: String(r.timestamp),
  });
}

export function parseFundingEvents(json: string): ParsedFundingEvents {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { records: [], errors: [{ line: 1, reason: 'Invalid JSON' }] };
  }
  if (!Array.isArray(data)) return { records: [], errors: [{ line: 1, reason: 'Expected a JSON array' }] };

  const records: FundingEvent[] = [];
  const errors: ParseError[] = [];
  data.forEach((item, index) => {
    try {
      records.push(toFundingEvent(item));
    } catch (e) {
      errors.push({ line: index + 1, reason: (e as Error).message });
    }
  });
  return { records, errors };
}
