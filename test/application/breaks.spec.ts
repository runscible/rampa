import { breaksOf, CUTOFF, dep, ev, fw, lifecycle, rate, run } from '../support/builders';

const REF = [rate('07:00', '10.000000')];

describe('break: SPREAD_EXCEEDED', () => {
  const spreadBreaks = (providerRate: string) =>
    breaksOf(run({ rates: REF, fundingEvents: [fw('fw_1', '0x1', 1000, providerRate, 9000, '09:00')] }), 'SPREAD_EXCEEDED');

  it('flags a spread above the limit and explains it', () => {
    const [b] = spreadBreaks('9.88');
    expect(b).toMatchObject({ id: 'SPREAD_EXCEEDED:fw_1', severity: 'BREAK', subject: 'fw_1' });
    expect(b.reason).toContain('1.20%');
  });

  it('exactly 0.5% is not a break, a hair above is', () => {
    expect(spreadBreaks('9.95')).toEqual([]);
    expect(spreadBreaks('9.949')).toHaveLength(1);
  });

  it('a provider rate better than the reference is not a break', () => {
    expect(spreadBreaks('10.10')).toEqual([]);
  });

  it('uses the reference rate in effect when the webhook was sent, not when the deposit arrived', () => {
    const rates = [rate('14:00', '9.8261'), rate('17:00', '9.8047')];
    const r = run({
      rates,
      deposits: [dep('0x1', '2500.00', '14:45')],
      fundingEvents: [fw('fw_4', '0x1', 2500, '9.7606', 24401.5, '17:10')],
    });
    expect(breaksOf(r, 'SPREAD_EXCEEDED')).toEqual([]);
  });
});

describe('break: MISSING_REFERENCE_RATE', () => {
  it('cannot validate the spread without a rate at or before the webhook', () => {
    const r = run({ rates: [rate('10:00', '10')], fundingEvents: [fw('fw_1', '0x1', 100, '10', 1000, '09:00')] });
    expect(breaksOf(r, 'MISSING_REFERENCE_RATE')).toEqual([expect.objectContaining({ subject: 'fw_1', severity: 'REVIEW' })]);
  });
});

describe('break: LATE_FUNDING_WEBHOOK', () => {
  const late = (webhookAt: string) =>
    breaksOf(run({ rates: REF, deposits: [dep('0x1', '1000.00', '09:00')], fundingEvents: [fw('fw_1', '0x1', 1000, '10', 10000, webhookAt)] }), 'LATE_FUNDING_WEBHOOK');

  it('flags a webhook later than 10 minutes after the deposit', () => {
    const [b] = late('09:11');
    expect(b).toMatchObject({ id: 'LATE_FUNDING_WEBHOOK:fw_1', severity: 'BREAK' });
    expect(b.reason).toContain('11 min');
  });

  it('exactly 10 minutes is fine', () => {
    expect(late('09:10')).toEqual([]);
  });
});

describe('break: DEPOSIT_WITHOUT_WEBHOOK', () => {
  const missing = (depositAt: string) => breaksOf(run({ deposits: [dep('0x1', '1500.00', depositAt)] }), 'DEPOSIT_WITHOUT_WEBHOOK');

  it('flags a deposit with no webhook that is older than 10 minutes at the cutoff', () => {
    expect(missing('17:40')).toEqual([expect.objectContaining({ id: 'DEPOSIT_WITHOUT_WEBHOOK:0x1', subject: '0x1', severity: 'BREAK' })]);
    expect(missing('19:49')).toHaveLength(1);
  });

  it('a deposit still inside the 10-minute window is not a break (19:55, and exactly 19:50)', () => {
    expect(missing('19:55')).toEqual([]);
    expect(missing('19:50')).toEqual([]);
  });

  it('a deposit that has its webhook is not a break', () => {
    const r = run({ rates: REF, deposits: [dep('0x1', '1000.00', '09:00')], fundingEvents: [fw('fw_1', '0x1', 1000, '10', 10000, '09:05')] });
    expect(breaksOf(r, 'DEPOSIT_WITHOUT_WEBHOOK')).toEqual([]);
  });

  it('a webhook that only arrives after the cutoff does not count', () => {
    const r = run({ rates: REF, deposits: [dep('0x1', '1000.00', '19:00')], fundingEvents: [fw('fw_1', '0x1', 1000, '10', 10000, '20:30')] });
    expect(breaksOf(r, 'DEPOSIT_WITHOUT_WEBHOOK')).toHaveLength(1);
  });
});

describe('funding breaks against the deposit', () => {
  it('UNKNOWN_DEPOSIT: webhook for a tx hash that was never deposited', () => {
    const r = run({ rates: REF, fundingEvents: [fw('fw_1', '0xghost', 100, '10', 1000, '09:00')] });
    expect(breaksOf(r, 'UNKNOWN_DEPOSIT')).toEqual([expect.objectContaining({ subject: 'fw_1', severity: 'BREAK' })]);
  });

  it('AMOUNT_MISMATCH: webhook USDT differs from the deposit', () => {
    const r = run({ rates: REF, deposits: [dep('0x1', '1000.00', '09:00')], fundingEvents: [fw('fw_1', '0x1', 900, '10', 9000, '09:05')] });
    const [b] = breaksOf(r, 'AMOUNT_MISMATCH');
    expect(b.subject).toBe('fw_1');
    expect(b.reason).toMatch(/900\.00.*1000\.00/);
  });

  it('DOUBLE_FUNDING: two different webhooks for the same deposit', () => {
    const r = run({
      rates: REF,
      deposits: [dep('0x1', '1000.00', '09:00')],
      fundingEvents: [fw('fw_1', '0x1', 1000, '10', 10000, '09:05'), fw('fw_2', '0x1', 1000, '10', 10000, '09:06')],
    });
    const [b] = breaksOf(r, 'DOUBLE_FUNDING');
    expect(b).toMatchObject({ subject: '0x1', severity: 'BREAK' });
    expect(b.reason).toContain('fw_1');
    expect(b.reason).toContain('fw_2');
  });
});

describe('break: STUCK_PAYOUT', () => {
  const stuck = (confirmAt: string) => breaksOf(run({ payoutEvents: lifecycle('P1', 1000, ['19:00', confirmAt]) }), 'STUCK_PAYOUT');

  it('flags a confirmed payout without a terminal event for more than 15 minutes', () => {
    const [b] = stuck('19:11');
    expect(b).toMatchObject({ id: 'STUCK_PAYOUT:P1', severity: 'BREAK', subject: 'P1' });
    expect(b.reason).toContain('49 min');
  });

  it('exactly 15 minutes is fine', () => {
    expect(stuck('19:45')).toEqual([]);
    expect(stuck('19:44')).toHaveLength(1);
  });

  it('a payout that reached a terminal state is not stuck', () => {
    expect(breaksOf(run({ payoutEvents: lifecycle('P1', 1000, ['09:00', '09:01'], ['FAILED', '09:05']) }), 'STUCK_PAYOUT')).toEqual([]);
  });
});

describe('payout lifecycle breaks', () => {
  it('PAYOUT_REVERSED: a reversal needs human review', () => {
    const r = run({ payoutEvents: lifecycle('P1', 1000, ['09:00', '09:01'], ['COMPLETED', '09:05'], ['REVERSED', '10:00']) });
    expect(breaksOf(r, 'PAYOUT_REVERSED')).toEqual([expect.objectContaining({ subject: 'P1', severity: 'REVIEW' })]);
  });

  it('CONFIRM_AMOUNT_MISMATCH: confirmed for a different amount than previewed', () => {
    const r = run({ payoutEvents: [ev('a', 'P1', 'PREVIEW', 100, '09:00'), ev('b', 'P1', 'CONFIRM', 150, '09:01')] });
    const [b] = breaksOf(r, 'CONFIRM_AMOUNT_MISMATCH');
    expect(b).toMatchObject({ subject: 'P1', severity: 'BREAK' });
    expect(b.reason).toMatch(/100\.00.*150\.00/);
  });

  it('a CONFIRM with the same amount is fine', () => {
    expect(breaksOf(run({ payoutEvents: lifecycle('P1', 100, ['09:00', '09:01']) }), 'CONFIRM_AMOUNT_MISMATCH')).toEqual([]);
  });

  it('REVERSAL_WITHOUT_COMPLETED: reversed but never completed', () => {
    const r = run({ payoutEvents: [...lifecycle('P1', 100, ['09:00', '09:01']), ev('rev', 'P1', 'REVERSED', 100, '09:10')] });
    expect(breaksOf(r, 'REVERSAL_WITHOUT_COMPLETED')).toEqual([expect.objectContaining({ subject: 'rev', severity: 'BREAK' })]);
  });

  it('ILLEGAL_TRANSITION: a second COMPLETED with a different id', () => {
    const r = run({ payoutEvents: [...lifecycle('P1', 100, ['09:00', '09:01'], ['COMPLETED', '09:05']), ev('again', 'P1', 'COMPLETED', 100, '09:06')] });
    expect(breaksOf(r, 'ILLEGAL_TRANSITION')).toEqual([expect.objectContaining({ subject: 'again', severity: 'BREAK' })]);
  });

  it('IRREGULAR_PAYOUT_EVENT: COMPLETED without CONFIRM is applied but needs review', () => {
    const r = run({ payoutEvents: [ev('a', 'P1', 'PREVIEW', 100, '09:00'), ev('b', 'P1', 'COMPLETED', 100, '09:05')] });
    expect(breaksOf(r, 'IRREGULAR_PAYOUT_EVENT')).toEqual([expect.objectContaining({ subject: 'b', severity: 'REVIEW' })]);
  });

  it('UNCONFIRMED_PREVIEW is INFO, and a confirmed preview is not reported', () => {
    const r = run({ payoutEvents: [ev('a', 'P9', 'PREVIEW', 100, '09:00'), ...lifecycle('P1', 100, ['09:00', '09:01'], ['FAILED', '09:02'])] });
    expect(breaksOf(r, 'UNCONFIRMED_PREVIEW')).toEqual([expect.objectContaining({ subject: 'P9', severity: 'INFO' })]);
  });
});

describe('ingestion breaks', () => {
  it('DUPLICATE_DELIVERY is INFO', () => {
    const [e] = lifecycle('P1', 100, ['09:00', '09:01']);
    expect(breaksOf(run({ payoutEvents: [e, e] }), 'DUPLICATE_DELIVERY')).toEqual([expect.objectContaining({ subject: 'P1-PREVIEW', severity: 'INFO' })]);
  });

  it('EVENT_CONFLICT: same id, different content', () => {
    const r = run({ payoutEvents: [ev('x', 'P1', 'PREVIEW', 100, '09:00'), ev('x', 'P1', 'PREVIEW', 999, '09:00')] });
    expect(breaksOf(r, 'EVENT_CONFLICT')).toEqual([expect.objectContaining({ subject: 'x', severity: 'BREAK' })]);
  });

  it('a duplicated deposit and a conflicting rate are reported too', () => {
    const d = dep('0x1', '10.00', '09:00');
    const r = run({ deposits: [d, d], rates: [rate('07:00', '10'), rate('07:00', '11')] });
    expect(breaksOf(r, 'DUPLICATE_DELIVERY').map((b) => b.subject)).toEqual(['0x1']);
    expect(breaksOf(r, 'EVENT_CONFLICT')).toHaveLength(1);
  });
});

describe('break: NEGATIVE_BALANCE', () => {
  const funded = fw('fw_1', '0x1', 1000, '10', 10000, '09:00');
  const refill = fw('fw_2', '0x2', 500, '10', 5000, '11:00');
  const negative = (payoutAmount: number, ...extra: ReturnType<typeof fw>[]) =>
    breaksOf(run({ rates: REF, fundingEvents: [funded, ...extra], payoutEvents: lifecycle('P1', payoutAmount, ['09:50', '09:55'], ['COMPLETED', '10:00']) }), 'NEGATIVE_BALANCE');

  it('one break per interval, with the maximum shortfall and where it ends', () => {
    const [b] = negative(12000, refill);
    expect(b.severity).toBe('BREAK');
    expect(b.at.toISOString()).toBe('2026-10-05T14:00:00.000Z');
    expect(b.reason).toContain('2000.00');
    expect(b.reason).toContain('2026-10-05T15:00:00.000Z');
  });

  it('a balance of exactly zero is not negative', () => {
    expect(negative(10000)).toEqual([]);
  });

  it('an interval still open at the cutoff says so', () => {
    expect(negative(12000)[0].reason).toMatch(/still negative at the cutoff/);
  });

  it('entries at the same instant are netted before judging the balance', () => {
    const sameInstant = fw('fw_3', '0x3', 500, '10', 5000, '10:00');
    expect(negative(12000, sameInstant)).toEqual([]);
  });
});

describe('report', () => {
  it('is deterministic and independent of input order', () => {
    const payoutEvents = [...lifecycle('P1', 1000, ['19:00', '19:11']), ...lifecycle('P2', 500, ['09:00', '09:01'], ['COMPLETED', '09:05'], ['REVERSED', '10:00'])];
    const deposits = [dep('0x1', '1500.00', '17:40'), dep('0x2', '100.00', '17:30')];
    const a = run({ payoutEvents, deposits });
    const b = run({ payoutEvents: [...payoutEvents].reverse(), deposits: [...deposits].reverse() });
    expect(b.breaks).toEqual(a.breaks);
    expect(a.breaks.map((x) => x.severity)).toEqual([...a.breaks.map((x) => x.severity)].sort((p, q) => ['BREAK', 'REVIEW', 'INFO'].indexOf(p) - ['BREAK', 'REVIEW', 'INFO'].indexOf(q)));
  });

  it('every break id is unique', () => {
    const r = run({ payoutEvents: [ev('x', 'P1', 'PREVIEW', 1, '09:00'), ev('x', 'P1', 'PREVIEW', 2, '09:00'), ev('x', 'P1', 'PREVIEW', 3, '09:00')] });
    const ids = r.breaks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(breaksOf(r, 'EVENT_CONFLICT')).toHaveLength(2);
  });

  it('cutoff is inclusive of the config instant', () => {
    expect(CUTOFF).toBe('2026-10-05T20:00:00-04:00');
  });
});
