import { parsePayoutEvents } from '../../src/adapters/files/parse-payouts';

const record = { event_id: 'pe_0003', payout_id: 'P001', type: 'COMPLETED', amount_bs: 6200.0, timestamp: '2026-10-05T08:46:00-04:00' };

describe('parsePayoutEvents', () => {
  it('parses valid records', () => {
    const { records, errors } = parsePayoutEvents(JSON.stringify([record]));
    expect(errors).toEqual([]);
    expect(records[0]).toMatchObject({ eventId: 'pe_0003', payoutId: 'P001', type: 'COMPLETED' });
  });

  it('reports a record with an unknown type and a record with a missing field', () => {
    const { amount_bs: _omit, ...incomplete } = record;
    const { records, errors } = parsePayoutEvents(JSON.stringify([{ ...record, type: 'NOPE' }, incomplete, record]));
    expect(records).toHaveLength(1);
    expect(errors).toEqual([
      { line: 1, reason: expect.stringMatching(/type/i) },
      { line: 2, reason: expect.stringContaining('amount_bs') },
    ]);
  });
});
