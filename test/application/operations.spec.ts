import { ReconcileResult } from '../../src/application/reconcile';
import { dep, ev, fw, lifecycle, rate, run } from '../support/builders';

const payout = (r: ReconcileResult, id: string) => r.operations.payouts.find((p) => p.payoutId === id)!;
const deposit = (r: ReconcileResult, tx: string) => r.operations.deposits.find((d) => d.txHash === tx)!;
const REF = [rate('07:00', '10.000000')];

describe('operations: one view per pay-out', () => {
  it('a complete chain: state, amount, every step applied, nothing missing, and the money it moved', () => {
    const v = payout(run({ payoutEvents: lifecycle('P1', 100, ['09:00', '09:01'], ['COMPLETED', '09:05']) }), 'P1');
    expect(v.state).toBe('COMPLETED');
    expect(v.amountBs?.toString()).toBe('100.00');
    expect(v.paidOutBs.toString()).toBe('100.00');
    expect(v.missingSteps).toEqual([]);
    expect(v.steps.map((s) => [s.event.type, s.applied])).toEqual([['PREVIEW', true], ['CONFIRM', true], ['COMPLETED', true]]);
    expect(v.breaks).toEqual([]);
  });

  it('a pay-out still in flight has not moved money', () => {
    const v = payout(run({ payoutEvents: lifecycle('P1', 300, ['19:00', '19:11']) }), 'P1');
    expect(v.state).toBe('CONFIRMED');
    expect(v.paidOutBs.toString()).toBe('0.00');
    expect(v.breaks.map((b) => b.type)).toEqual(['STUCK_PAYOUT']);
  });

  it('steps come in processing order whatever the delivery order', () => {
    const events = lifecycle('P1', 100, ['09:00', '09:01'], ['COMPLETED', '09:05']);
    const v = payout(run({ payoutEvents: [...events].reverse() }), 'P1');
    expect(v.steps.map((s) => s.event.type)).toEqual(['PREVIEW', 'CONFIRM', 'COMPLETED']);
  });

  it('a rejected event is kept in the history with its reason, and is not counted as applied', () => {
    const v = payout(run({ payoutEvents: [...lifecycle('P1', 100, ['09:00', '09:01'], ['COMPLETED', '09:05']), ev('again', 'P1', 'COMPLETED', 100, '09:06')] }), 'P1');
    const rejected = v.steps.find((s) => s.event.eventId === 'again')!;
    expect(rejected.applied).toBe(false);
    expect(rejected.reason).toMatch(/COMPLETED not allowed after COMPLETED/);
    expect(v.paidOutBs.toString()).toBe('100.00');
  });

  it('breaks are attached whether they point at the pay-out or at one of its events', () => {
    const v = payout(run({ payoutEvents: [...lifecycle('P1', 100, ['09:00', '09:01'], ['COMPLETED', '09:05']), ev('again', 'P1', 'COMPLETED', 100, '09:06')] }), 'P1');
    expect(v.breaks.map((b) => [b.type, b.subject])).toEqual([['ILLEGAL_TRANSITION', 'again']]);
  });

  it('missing steps are listed', () => {
    const v = payout(run({ payoutEvents: [ev('c', 'P1', 'COMPLETED', 100, '09:05')] }), 'P1');
    expect(v.missingSteps).toEqual(['PREVIEW', 'CONFIRM']);
    expect(v.breaks.map((b) => b.type)).toContain('INCOMPLETE_PAYOUT_CHAIN');
  });

  it('the money moved is the net of completions and reversals', () => {
    const all = lifecycle('P1', 100, ['09:00', '09:01'], ['COMPLETED', '09:05'], ['REVERSED', '10:00']);
    expect(payout(run({ payoutEvents: all }), 'P1').paidOutBs.toString()).toBe('0.00');
    const partial = [...lifecycle('P2', 100, ['09:00', '09:01'], ['COMPLETED', '09:05']), ev('rev', 'P2', 'REVERSED', 60, '10:00')];
    expect(payout(run({ payoutEvents: partial }), 'P2').paidOutBs.toString()).toBe('40.00');
  });

  it('a pay-out none of whose events could be applied has an unknown state', () => {
    const v = payout(run({ payoutEvents: [ev('r', 'P1', 'REVERSED', 100, '09:00')] }), 'P1');
    expect(v.state).toBe('UNKNOWN');
    expect(v.amountBs).toBeNull();
    expect(v.steps.map((s) => s.applied)).toEqual([false]);
    expect(v.breaks.map((b) => b.type)).toEqual(['REVERSAL_WITHOUT_COMPLETED']);
  });

  it('events after the cutoff are not part of the view', () => {
    const r = run({ payoutEvents: lifecycle('P1', 100, ['19:50', '19:55'], ['COMPLETED', '20:05']) });
    expect(payout(r, 'P1').state).toBe('CONFIRMED');
    expect(payout(r, 'P1').steps).toHaveLength(2);
  });

  it('there is one view per pay-out, ordered by id', () => {
    const r = run({ payoutEvents: [...lifecycle('P2', 1, ['09:00', '09:01']), ...lifecycle('P1', 1, ['09:00', '09:01'])] });
    expect(r.operations.payouts.map((p) => p.payoutId)).toEqual(['P1', 'P2']);
  });
});

describe('operations: one view per deposit', () => {
  it('a converted deposit: what came in, what the provider converted and credited', () => {
    const r = run({ rates: REF, deposits: [dep('0x1', '1000.00', '09:00')], fundingEvents: [fw('fw_1', '0x1', 1000, '9.98', 9980, '09:05')] });
    const v = deposit(r, '0x1');
    expect(v.deposit?.amount.toString()).toBe('1000.00');
    expect(v.depositedUsdt.toString()).toBe('1000.00');
    expect(v.convertedUsdt.toString()).toBe('1000.00');
    expect(v.creditedBs.toString()).toBe('9980.00');
    expect(v.fundings.map((f) => f.eventId)).toEqual(['fw_1']);
    expect(v.breaks).toEqual([]);
  });

  it('a deposit still waiting for its webhook', () => {
    const v = deposit(run({ deposits: [dep('0x1', '1500.00', '17:40')] }), '0x1');
    expect(v.convertedUsdt.toString()).toBe('0.00');
    expect(v.fundings).toEqual([]);
    expect(v.breaks.map((b) => b.type)).toEqual(['DEPOSIT_WITHOUT_WEBHOOK']);
  });

  it('a webhook for a deposit nobody saw has no deposit, and its break is attached through the event', () => {
    const v = deposit(run({ rates: REF, fundingEvents: [fw('fw_1', '0xghost', 100, '10', 1000, '09:00')] }), '0xghost');
    expect(v.deposit).toBeNull();
    expect(v.depositedUsdt.toString()).toBe('0.00');
    expect(v.convertedUsdt.toString()).toBe('100.00');
    expect(v.breaks.map((b) => b.type)).toEqual(['UNKNOWN_DEPOSIT']);
  });

  it('two webhooks for one deposit are both shown and both counted', () => {
    const r = run({
      rates: REF,
      deposits: [dep('0x1', '1000.00', '09:00')],
      fundingEvents: [fw('fw_1', '0x1', 1000, '10', 10000, '09:05'), fw('fw_2', '0x1', 1000, '10', 10000, '09:06')],
    });
    const v = deposit(r, '0x1');
    expect(v.fundings).toHaveLength(2);
    expect(v.convertedUsdt.toString()).toBe('2000.00');
    expect(v.breaks.map((b) => b.type)).toContain('DOUBLE_FUNDING');
  });

  it('views are ordered by transaction hash', () => {
    const r = run({ deposits: [dep('0xb', '1.00', '09:00'), dep('0xa', '1.00', '09:00')] });
    expect(r.operations.deposits.map((d) => d.txHash)).toEqual(['0xa', '0xb']);
  });
});
