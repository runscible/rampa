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

describe('break: AMOUNT_BS_MISMATCH', () => {
  // 1000 USDT at 9.98 is exactly 9980.00 Bs; the reference rate is 10, so the spread (0.2%) is fine.
  const credited = (amountBs: number) =>
    run({ rates: REF, deposits: [dep('0x1', '1000.00', '09:00')], fundingEvents: [fw('fw_1', '0x1', 1000, '9.98', amountBs, '09:05')] });

  it('flags a webhook that credits a different amount than its own rate implies, and explains it', () => {
    const [b] = breaksOf(credited(5000), 'AMOUNT_BS_MISMATCH');
    expect(b).toMatchObject({ id: 'AMOUNT_BS_MISMATCH:fw_1', severity: 'BREAK', subject: 'fw_1' });
    expect(b.reason).toContain('5000.00 Bs');
    expect(b.reason).toContain('9980.00 Bs');
    expect(b.reason).toContain('4980.00');
  });

  it('a consistent webhook is fine', () => {
    expect(breaksOf(credited(9980), 'AMOUNT_BS_MISMATCH')).toEqual([]);
  });

  it('tolerates a cent of rounding either way, and no more', () => {
    expect(breaksOf(credited(9980.01), 'AMOUNT_BS_MISMATCH')).toEqual([]);
    expect(breaksOf(credited(9979.99), 'AMOUNT_BS_MISMATCH')).toEqual([]);
    expect(breaksOf(credited(9980.02), 'AMOUNT_BS_MISMATCH')).toHaveLength(1);
    expect(breaksOf(credited(9979.98), 'AMOUNT_BS_MISMATCH')).toHaveLength(1);
  });

  it('crediting more than the rate implies is a break too', () => {
    expect(breaksOf(credited(12000), 'AMOUNT_BS_MISMATCH')).toHaveLength(1);
  });

  it('the ledger still records what the provider says it credited; the break reports the difference', () => {
    expect(credited(5000).balances.bsFunded.toString()).toBe('5000.00');
  });

  it('is independent of the spread check: each one reports its own problem', () => {
    // rate 9.88 is a 1.2% spread; 1000 USDT at 9.88 is 9880 Bs
    const spreadOnly = run({ rates: REF, fundingEvents: [fw('fw_1', '0x1', 1000, '9.88', 9880, '09:00')] });
    expect(breaksOf(spreadOnly, 'SPREAD_EXCEEDED')).toHaveLength(1);
    expect(breaksOf(spreadOnly, 'AMOUNT_BS_MISMATCH')).toEqual([]);
    const both = run({ rates: REF, fundingEvents: [fw('fw_1', '0x1', 1000, '9.88', 5000, '09:00')] });
    expect(breaksOf(both, 'SPREAD_EXCEEDED')).toHaveLength(1);
    expect(breaksOf(both, 'AMOUNT_BS_MISMATCH')).toHaveLength(1);
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

  describe('PAYOUT_AMOUNT_MISMATCH: every event carries the amount of the one before it', () => {
    const mismatches = (events: ReturnType<typeof ev>[]) => breaksOf(run({ payoutEvents: events }), 'PAYOUT_AMOUNT_MISMATCH');

    it('a CONFIRM for another amount than the PREVIEW', () => {
      const [b] = mismatches([ev('a', 'P1', 'PREVIEW', 100, '09:00'), ev('b', 'P1', 'CONFIRM', 150, '09:01')]);
      expect(b).toMatchObject({ subject: 'P1', severity: 'BREAK' });
      expect(b.reason).toMatch(/CONFIRM is 150\.00 Bs but PREVIEW was 100\.00 Bs/);
    });

    it('a COMPLETED for another amount than the CONFIRM, and the ledger debits the COMPLETED one', () => {
      const r = run({ payoutEvents: [...lifecycle('P1', 100, ['09:00', '09:01']), ev('c', 'P1', 'COMPLETED', 500, '09:05')] });
      const [b] = breaksOf(r, 'PAYOUT_AMOUNT_MISMATCH');
      expect(b.reason).toMatch(/COMPLETED is 500\.00 Bs but CONFIRM was 100\.00 Bs/);
      expect(r.balances.bsPaidOut.toString()).toBe('500.00');
    });

    it('a FAILED for another amount than the CONFIRM', () => {
      const [b] = mismatches([...lifecycle('P1', 100, ['09:00', '09:01']), ev('f', 'P1', 'FAILED', 90, '09:05')]);
      expect(b.reason).toMatch(/FAILED is 90\.00 Bs but CONFIRM was 100\.00 Bs/);
    });

    it('a REVERSED for another amount than the COMPLETED, which leaves part of it paid out', () => {
      const r = run({ payoutEvents: [...lifecycle('P1', 100, ['09:00', '09:01'], ['COMPLETED', '09:05']), ev('rev', 'P1', 'REVERSED', 60, '10:00')] });
      const [b] = breaksOf(r, 'PAYOUT_AMOUNT_MISMATCH');
      expect(b).toMatchObject({ severity: 'BREAK', subject: 'P1' });
      expect(b.reason).toMatch(/REVERSED is 60\.00 Bs but COMPLETED was 100\.00 Bs/);
      expect(r.balances.bsPaidOut.toString()).toBe('40.00');
    });

    it('a chain with the same amount all the way, reversal included, reports nothing', () => {
      expect(mismatches(lifecycle('P1', 100, ['09:00', '09:01'], ['COMPLETED', '09:05'], ['REVERSED', '10:00']))).toEqual([]);
    });

    it('one break per deviation: later events that agree with the deviating one are not reported again', () => {
      expect(mismatches([ev('a', 'P1', 'PREVIEW', 100, '09:00'), ev('b', 'P1', 'CONFIRM', 150, '09:01'), ev('c', 'P1', 'COMPLETED', 150, '09:05')])).toHaveLength(1);
    });

    it('two deviations in one chain are two breaks with different ids', () => {
      const found = mismatches([ev('a', 'P1', 'PREVIEW', 100, '09:00'), ev('b', 'P1', 'CONFIRM', 150, '09:01'), ev('c', 'P1', 'COMPLETED', 200, '09:05')]);
      expect(found).toHaveLength(2);
      expect(new Set(found.map((b) => b.id)).size).toBe(2);
    });

    it('when a step is missing the event is compared with the last one that was received', () => {
      const [b] = mismatches([ev('a', 'P1', 'PREVIEW', 100, '09:00'), ev('c', 'P1', 'COMPLETED', 500, '09:05')]);
      expect(b.reason).toMatch(/COMPLETED is 500\.00 Bs but PREVIEW was 100\.00 Bs/);
    });

    it('an event that was rejected is not compared: it is reported as an illegal transition instead', () => {
      const r = run({ payoutEvents: [...lifecycle('P1', 100, ['09:00', '09:01'], ['COMPLETED', '09:05']), ev('again', 'P1', 'COMPLETED', 999, '09:06')] });
      expect(breaksOf(r, 'ILLEGAL_TRANSITION')).toHaveLength(1);
      expect(breaksOf(r, 'PAYOUT_AMOUNT_MISMATCH')).toEqual([]);
    });

    it('different pay-outs are never compared with each other', () => {
      expect(mismatches([...lifecycle('P1', 100, ['09:00', '09:01']), ...lifecycle('P2', 999, ['09:00', '09:01'])])).toEqual([]);
    });
  });

  it('REVERSAL_WITHOUT_COMPLETED: reversed but never completed', () => {
    const r = run({ payoutEvents: [...lifecycle('P1', 100, ['09:00', '09:01']), ev('rev', 'P1', 'REVERSED', 100, '09:10')] });
    expect(breaksOf(r, 'REVERSAL_WITHOUT_COMPLETED')).toEqual([expect.objectContaining({ subject: 'rev', severity: 'BREAK' })]);
  });

  it('ILLEGAL_TRANSITION: a second COMPLETED with a different id', () => {
    const r = run({ payoutEvents: [...lifecycle('P1', 100, ['09:00', '09:01'], ['COMPLETED', '09:05']), ev('again', 'P1', 'COMPLETED', 100, '09:06')] });
    expect(breaksOf(r, 'ILLEGAL_TRANSITION')).toEqual([expect.objectContaining({ subject: 'again', severity: 'BREAK' })]);
  });

  it('INCOMPLETE_PAYOUT_CHAIN: a COMPLETED without CONFIRM is applied, and the missing step is named', () => {
    const r = run({ payoutEvents: [ev('a', 'P1', 'PREVIEW', 100, '09:00'), ev('b', 'P1', 'COMPLETED', 100, '09:05')] });
    const [b] = breaksOf(r, 'INCOMPLETE_PAYOUT_CHAIN');
    expect(b).toMatchObject({ id: 'INCOMPLETE_PAYOUT_CHAIN:P1', severity: 'REVIEW', subject: 'P1' });
    expect(b.reason).toContain('COMPLETED');
    expect(b.reason).toContain('CONFIRM');
    expect(r.balances.bsPaidOut.toString()).toBe('100.00');
  });

  it('INCOMPLETE_PAYOUT_CHAIN lists every step that is missing, not only the previous one', () => {
    const r = run({ payoutEvents: [ev('b', 'P1', 'COMPLETED', 100, '09:05')] });
    expect(breaksOf(r, 'INCOMPLETE_PAYOUT_CHAIN')[0].reason).toContain('PREVIEW and CONFIRM');
    expect(r.balances.bsPaidOut.toString()).toBe('100.00');
  });

  it('a confirmed pay-out whose PREVIEW never arrived still counts as in flight and can be stuck', () => {
    const r = run({ payoutEvents: [ev('c', 'P1', 'CONFIRM', 300, '19:00')] });
    expect(r.balances.bsInFlight.toString()).toBe('300.00');
    expect(breaksOf(r, 'STUCK_PAYOUT')).toHaveLength(1);
    expect(breaksOf(r, 'INCOMPLETE_PAYOUT_CHAIN')[0].reason).toContain('PREVIEW');
    expect(breaksOf(r, 'ILLEGAL_TRANSITION')).toEqual([]);
  });

  it('a pay-out that failed without a CONFIRM is a failure with a gap, not an unconfirmed preview', () => {
    const r = run({ payoutEvents: [ev('p', 'P1', 'PREVIEW', 100, '09:00'), ev('f', 'P1', 'FAILED', 100, '09:05')] });
    expect(breaksOf(r, 'UNCONFIRMED_PREVIEW')).toEqual([]);
    expect(breaksOf(r, 'ILLEGAL_TRANSITION')).toEqual([]);
    expect(breaksOf(r, 'INCOMPLETE_PAYOUT_CHAIN')[0].reason).toContain('CONFIRM');
  });

  it('a complete chain reports nothing', () => {
    const r = run({ payoutEvents: lifecycle('P1', 100, ['09:00', '09:01'], ['COMPLETED', '09:05']) });
    expect(breaksOf(r, 'INCOMPLETE_PAYOUT_CHAIN')).toEqual([]);
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

describe('ingestion breaks and the cutoff', () => {
  it('a duplicate or conflict that happens after the cutoff is not part of the report', () => {
    const [e] = lifecycle('P1', 100, ['20:10', '20:11']);
    const r = run({ payoutEvents: [e, e, ev('P1-CONFIRM', 'P1', 'CONFIRM', 1, '20:11'), ev('P1-CONFIRM', 'P1', 'CONFIRM', 2, '20:11')] });
    expect(breaksOf(r, 'DUPLICATE_DELIVERY')).toEqual([]);
    expect(breaksOf(r, 'EVENT_CONFLICT')).toEqual([]);
    expect(r.ingestion.duplicateIds).toEqual([]);
    expect(r.ingestion.conflictingIds).toEqual([]);
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
    expect(b.until?.toISOString()).toBe('2026-10-05T15:00:00.000Z');
    expect(b.subject).toBe('BS_PROVIDER_BALANCE');
    expect(b.id).toBe('NEGATIVE_BALANCE:2026-10-05T14:00:00.000Z');
    expect(b.reason).toContain('2000.00');
  });

  it('a balance of exactly zero is not negative', () => {
    expect(negative(10000)).toEqual([]);
  });

  it('an interval still open at the cutoff says so', () => {
    const [b] = negative(12000);
    expect(b.until).toBeUndefined();
    expect(b.reason).toMatch(/still negative at the cutoff/);
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
