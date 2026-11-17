import { parseFundingEvents } from '../../src/adapters/files/parse-funding';

const record = {
  event_id: 'fw_001',
  deposit_tx_hash: '0xabc',
  amount_usdt: 5000.0,
  rate: 9.7945,
  amount_bs: 48972.5,
  timestamp: '2026-10-05T08:18:00-04:00',
};

describe('parseFundingEvents', () => {
  it('parses valid records', () => {
    const { records, errors } = parseFundingEvents(JSON.stringify([record]));
    expect(errors).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0].eventId).toBe('fw_001');
    expect(records[0].amountBs.toString()).toBe('48972.50');
  });

  it('reports a bad record by position and keeps the good ones', () => {
    const bad = { ...record, event_id: 'fw_002', amount_bs: 'oops' };
    const { records, errors } = parseFundingEvents(JSON.stringify([record, bad]));
    expect(records.map((r) => r.eventId)).toEqual(['fw_001']);
    expect(errors).toEqual([{ line: 2, reason: expect.stringContaining('oops') }]);
  });

  it('reports a record with a missing field', () => {
    const { amount_bs: _omit, ...incomplete } = record;
    const { records, errors } = parseFundingEvents(JSON.stringify([incomplete]));
    expect(records).toEqual([]);
    expect(errors).toEqual([{ line: 1, reason: expect.stringContaining('amount_bs') }]);
  });

  it('reports invalid JSON', () => {
    expect(parseFundingEvents('{nope').errors).toEqual([{ line: 1, reason: expect.stringMatching(/JSON/i) }]);
  });

  it('reports a top-level value that is not an array', () => {
    expect(parseFundingEvents('{}').errors).toEqual([{ line: 1, reason: expect.stringMatching(/array/i) }]);
  });
});
