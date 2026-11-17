import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDeposits } from '../../src/adapters/files/parse-deposits';
import { parseFundingEvents } from '../../src/adapters/files/parse-funding';
import { parsePayoutEvents } from '../../src/adapters/files/parse-payouts';
import { parseRates } from '../../src/adapters/files/parse-rates';
import { InMemoryDeliveryRepository } from '../../src/adapters/memory/in-memory-delivery-repository';
import { ReconciliationService } from '../../src/application/reconciliation-service';
import { at, breaksOf, CUTOFF, dep, ev, fw, lifecycle, rate } from '../support/builders';

const newService = (cutoff = CUTOFF) => new ReconciliationService(new InMemoryDeliveryRepository(), { cutoff });

describe('ReconciliationService', () => {
  it('reports zeros and no breaks before anything is ingested', async () => {
    const r = await newService().report();
    expect(r.balances.usdtUnconverted.toString()).toBe('0.00');
    expect(r.breaks).toEqual([]);
  });

  it('ingests a feed and reports it, with a summary of what was stored', async () => {
    const service = newService();
    const summary = await service.ingest('deposits', [dep('0x1', '100.00', '09:00'), dep('0x2', '50.00', '09:30')]);
    expect(summary).toEqual({ received: 2, stored: 2, ignored: 0 });
    expect((await service.report()).balances.usdtUnconverted.toString()).toBe('150.00');
  });

  describe('idempotency', () => {
    const everything = async (service: ReconciliationService) => {
      await service.ingest('rates', [rate('07:00', '10.000000')]);
      await service.ingest('deposits', [dep('0x1', '1000.00', '09:00'), dep('0x2', '1500.00', '17:40')]);
      await service.ingest('fundingEvents', [fw('fw_1', '0x1', 1000, '9.88', 9880, '09:05')]);
      await service.ingest('payoutEvents', [...lifecycle('P1', 500, ['10:00', '10:01'], ['COMPLETED', '10:05']), ...lifecycle('P2', 300, ['19:00', '19:11'])]);
    };

    it('ingesting everything a second time changes no balance, break or ledger entry', async () => {
      const service = newService();
      await everything(service);
      const first = await service.report();
      expect(first.breaks.length).toBeGreaterThan(0);
      await everything(service);
      expect(await service.report()).toEqual(first);
    });

    it('a repeat delivered in a later batch is ignored silently', async () => {
      const service = newService();
      const e = ev('x', 'P1', 'PREVIEW', 100, '09:00');
      await service.ingest('payoutEvents', [e]);
      expect(await service.ingest('payoutEvents', [e])).toEqual({ received: 1, stored: 0, ignored: 1 });
      expect(breaksOf(await service.report(), 'DUPLICATE_DELIVERY')).toEqual([]);
    });

    it('a repeat inside one batch is reported as a duplicate, once, even if the batch is sent again', async () => {
      const service = newService();
      const e = ev('pe_0029', 'P10', 'COMPLETED', 100, '13:11');
      await service.ingest('payoutEvents', [e, e]);
      expect(breaksOf(await service.report(), 'DUPLICATE_DELIVERY')).toHaveLength(1);
      await service.ingest('payoutEvents', [e, e]);
      const r = await service.report();
      expect(breaksOf(r, 'DUPLICATE_DELIVERY')).toHaveLength(1);
      expect(r.ingestion.duplicateIds).toEqual(['pe_0029']);
    });

    it('the first delivery wins; a different later one is a conflict, and sending it again adds nothing', async () => {
      const service = newService();
      await service.ingest('deposits', [dep('0x1', '100.00', '09:00')]);
      await service.ingest('deposits', [dep('0x1', '999.00', '09:00')]);
      const once = await service.report();
      expect(once.balances.usdtUnconverted.toString()).toBe('100.00');
      expect(breaksOf(once, 'EVENT_CONFLICT')).toHaveLength(1);
      expect(await service.ingest('deposits', [dep('0x1', '999.00', '09:00')])).toEqual({ received: 1, stored: 0, ignored: 1 });
      expect(await service.report()).toEqual(once);
    });
  });

  it('does not depend on which feed arrives first', async () => {
    const deposits = [dep('0x1', '1000.00', '09:00')];
    const fundings = [fw('fw_1', '0x1', 1000, '9.95', 9950, '09:05')];
    const rates = [rate('07:00', '10.000000')];
    const a = newService();
    await a.ingest('deposits', deposits);
    await a.ingest('fundingEvents', fundings);
    await a.ingest('rates', rates);
    const b = newService();
    await b.ingest('rates', rates);
    await b.ingest('fundingEvents', fundings);
    await b.ingest('deposits', deposits);
    expect(await b.report()).toEqual(await a.report());
  });

  it('uses the configured cutoff by default and accepts another one per report', async () => {
    const service = newService();
    await service.ingest('deposits', [dep('0x1', '100.00', '09:00'), dep('0x2', '50.00', '15:00')]);
    expect((await service.report()).balances.usdtUnconverted.toString()).toBe('150.00');
    expect((await service.report(at('12:00'))).balances.usdtUnconverted.toString()).toBe('100.00');
  });
});

describe('ReconciliationService with the real files', () => {
  const read = (name: string) => readFileSync(join(__dirname, '..', '..', 'data', name), 'utf8');
  const ingestAll = async (service: ReconciliationService) => {
    await service.ingest('deposits', parseDeposits(read('usdt_deposits.csv')).records);
    await service.ingest('rates', parseRates(read('reference_rates.csv')).records);
    await service.ingest('fundingEvents', parseFundingEvents(read('funding_webhooks.json')).records);
    await service.ingest('payoutEvents', parsePayoutEvents(read('payout_events.json')).records);
  };

  it('gives the numbers of the plan, and the same report after ingesting the files again', async () => {
    const service = newService();
    await ingestAll(service);
    const first = await service.report();
    expect(first.balances.usdtUnconverted.toString()).toBe('1500.00');
    expect(first.balances.bsPaidOut.toString()).toBe('129505.55');
    expect(first.balances.bsAvailable.toString()).toBe('12120.95');
    expect(first.balances.bsInFlight.toString()).toBe('3900.00');
    expect(first.breaks.map((b) => `${b.severity} ${b.type}`)).toEqual([
      'BREAK SPREAD_EXCEEDED',
      'BREAK NEGATIVE_BALANCE',
      'BREAK LATE_FUNDING_WEBHOOK',
      'BREAK DEPOSIT_WITHOUT_WEBHOOK',
      'BREAK STUCK_PAYOUT',
      'REVIEW PAYOUT_REVERSED',
      'INFO UNCONFIRMED_PREVIEW',
      'INFO DUPLICATE_DELIVERY',
    ]);

    await ingestAll(service);
    expect(await service.report()).toEqual(first);
  });
});
