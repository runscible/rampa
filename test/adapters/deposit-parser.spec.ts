import { parseDeposits } from '../../src/adapters/files/parse-deposits';

const HEADER = 'tx_hash,amount_usdt,timestamp';

describe('parseDeposits', () => {
  it('parses a valid row', () => {
    const { records, errors } = parseDeposits(`${HEADER}\n0xabc,5000.00,2026-10-05T08:10:00-04:00\n`);
    expect(errors).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0].txHash).toBe('0xabc');
    expect(records[0].amount.toString()).toBe('5000.00');
    expect(records[0].amount.currency).toBe('USDT');
    expect(records[0].at.toISOString()).toBe('2026-10-05T12:10:00.000Z');
  });

  it('reports bad rows with their line number and keeps the good ones', () => {
    const csv = [HEADER, '0xaaa,100.00,2026-10-05T08:10:00-04:00', '0xbbb,abc,2026-10-05T09:00:00-04:00', '0xccc,5.00,not-a-date'].join('\n');
    const { records, errors } = parseDeposits(csv);
    expect(records.map((r) => r.txHash)).toEqual(['0xaaa']);
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
  });

  it('rejects a file with the wrong header', () => {
    const { records, errors } = parseDeposits('hash,amount,ts\n0x1,1.00,2026-10-05T08:10:00-04:00');
    expect(records).toEqual([]);
    expect(errors[0].reason).toMatch(/tx_hash/);
  });

  it('rejects an empty tx_hash and non-positive amounts', () => {
    const { records, errors } = parseDeposits(`${HEADER}\n,5.00,2026-10-05T08:10:00-04:00\n0xz,0.00,2026-10-05T08:10:00-04:00\n0xn,-1.00,2026-10-05T08:10:00-04:00`);
    expect(records).toEqual([]);
    expect(errors).toHaveLength(3);
  });
});
