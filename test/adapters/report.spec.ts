import { readFileSync } from 'fs';
import { join } from 'path';
import { reconcileFiles } from '../../src/adapters/files/reconcile-files';
import { renderJsonReport } from '../../src/adapters/report/json-report';
import { formatAmount, renderTextReport } from '../../src/adapters/report/text-report';

const OPTIONS = { cutoff: '2026-10-05T20:00:00-04:00', timeZone: 'America/La_Paz' };
const read = (name: string) => readFileSync(join(__dirname, '..', '..', 'data', name), 'utf8');
const result = reconcileFiles(
  { deposits: read('usdt_deposits.csv'), fundingWebhooks: read('funding_webhooks.json'), payoutEvents: read('payout_events.json'), referenceRates: read('reference_rates.csv') },
  { cutoff: OPTIONS.cutoff },
);

describe('formatAmount', () => {
  it.each([
    ['0.00', '0.00'],
    ['999.99', '999.99'],
    ['1500.00', '1,500.00'],
    ['141626.50', '141,626.50'],
    ['-2480.55', '-2,480.55'],
    ['-0.50', '-0.50'],
  ])('%s -> %s', (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });
});

describe('renderTextReport', () => {
  const text = renderTextReport(result, OPTIONS);

  it('states the cutoff and time zone', () => {
    expect(text).toContain('As of 2026-10-05T20:00:00-04:00 (America/La_Paz)');
  });

  it('lists the balances of the plan', () => {
    expect(text).toMatch(/USDT sent, not yet converted\s+1,500\.00 USDT/);
    expect(text).toMatch(/USDT converted\s+14,500\.00 USDT/);
    expect(text).toMatch(/Bs funded\s+141,626\.50 Bs/);
    expect(text).toMatch(/Bs paid out\s+129,505\.55 Bs/);
    expect(text).toMatch(/Bs available at provider\s+12,120\.95 Bs/);
    expect(text).toMatch(/Bs in pay-outs not final\s+3,900\.00 Bs/);
  });

  it('summarises and lists every break with local times', () => {
    expect(text).toContain('BREAKS (5 breaks, 1 review, 2 info)');
    expect(text).toMatch(/BREAK\s+2026-10-05 12:36:00\s+SPREAD_EXCEEDED\s+fw_003/);
    expect(text).toMatch(/BREAK\s+2026-10-05 17:10:00\s+LATE_FUNDING_WEBHOOK\s+fw_004/);
    expect(text).toMatch(/INFO\s+2026-10-05 13:11:00\s+DUPLICATE_DELIVERY\s+pe_0029/);
  });

  it('shows the negative balance interval in local time', () => {
    expect(text).toMatch(/NEGATIVE_BALANCE\s+BS_PROVIDER_BALANCE/);
    expect(text).toContain('2026-10-05 16:26:00 -> 2026-10-05 17:10:00');
    expect(text).toContain('maximum shortfall 2480.55 Bs');
  });

  it('shows the ledger accounts and that it balances', () => {
    expect(text).toMatch(/BS_PROVIDER_BALANCE\s+12,120\.95 Bs/);
    expect(text).toMatch(/Ledger balanced:\s+yes/);
  });

  it('says so when there is nothing wrong and when inputs were clean', () => {
    const clean = renderTextReport(reconcileFiles({ deposits: 'tx_hash,amount_usdt,timestamp' }, { cutoff: OPTIONS.cutoff }), OPTIONS);
    expect(clean).toContain('BREAKS (none)');
    expect(clean).toContain('INPUT PROBLEMS (none)');
  });

  it('lists input problems with file and line', () => {
    const bad = renderTextReport(reconcileFiles({ deposits: 'tx_hash,amount_usdt,timestamp\n0x1,oops,2026-10-05T08:00:00-04:00' }, { cutoff: OPTIONS.cutoff }), OPTIONS);
    expect(bad).toMatch(/usdt_deposits\.csv:2\s+.*oops/);
  });

  it('is deterministic: no clock, no randomness', () => {
    expect(renderTextReport(result, OPTIONS)).toBe(text);
  });
});

describe('renderJsonReport', () => {
  const json = JSON.parse(renderJsonReport(result, OPTIONS));

  it('carries the cutoff, zone and balances as exact strings', () => {
    expect(json.asOf).toBe(OPTIONS.cutoff);
    expect(json.timeZone).toBe('America/La_Paz');
    expect(json.balances).toEqual({
      usdtUnconverted: '1500.00',
      usdtConverted: '14500.00',
      bsFunded: '141626.50',
      bsAvailable: '12120.95',
      bsPaidOut: '129505.55',
      bsInFlight: '3900.00',
    });
  });

  it('lists breaks with UTC and local instants', () => {
    expect(json.breaks).toHaveLength(8);
    expect(json.breaks[0]).toMatchObject({ id: 'SPREAD_EXCEEDED:fw_003', severity: 'BREAK', at: '2026-10-05T16:36:00.000Z', atLocal: '2026-10-05T12:36:00-04:00' });
    const negative = json.breaks.find((b: { type: string }) => b.type === 'NEGATIVE_BALANCE');
    expect(negative).toMatchObject({ untilLocal: '2026-10-05T17:10:00-04:00' });
  });

  it('includes the full ledger and it balances per currency', () => {
    expect(json.ledger).toHaveLength(24);
    const totals: Record<string, number> = {};
    for (const entry of json.ledger) {
      for (const line of entry.lines) totals[line.currency] = (totals[line.currency] ?? 0) + Math.round(Number(line.amount) * 100);
    }
    expect(totals).toEqual({ USDT: 0, BS: 0 });
  });

  it('is byte-for-byte repeatable', () => {
    expect(renderJsonReport(result, OPTIONS)).toBe(renderJsonReport(result, OPTIONS));
  });
});
