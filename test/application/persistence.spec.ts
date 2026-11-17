import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseDeposits } from '../../src/adapters/files/parse-deposits';
import { parseFundingEvents } from '../../src/adapters/files/parse-funding';
import { parsePayoutEvents } from '../../src/adapters/files/parse-payouts';
import { parseRates } from '../../src/adapters/files/parse-rates';
import { SqliteDeliveryRepository } from '../../src/adapters/sqlite/sqlite-delivery-repository';
import { ReconciliationService } from '../../src/application/reconciliation-service';
import { CUTOFF } from '../support/builders';
import { readData } from '../support/app';

describe('the service on a database file', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'recon-db-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const open = (file: string) => new ReconciliationService(new SqliteDeliveryRepository(file), { cutoff: CUTOFF });
  const ingestAll = async (service: ReconciliationService) => ({
    deposits: await service.ingest('deposits', parseDeposits(readData('usdt_deposits.csv')).records),
    rates: await service.ingest('rates', parseRates(readData('reference_rates.csv')).records),
    fundingEvents: await service.ingest('fundingEvents', parseFundingEvents(readData('funding_webhooks.json')).records),
    payoutEvents: await service.ingest('payoutEvents', parsePayoutEvents(readData('payout_events.json')).records),
  });

  it('gives the same report after a restart, and sending the files again after the restart stores nothing', async () => {
    const file = join(dir, 'recon.sqlite');
    const before = open(file);
    await ingestAll(before);
    const report = await before.report();
    expect(report.balances.bsPaidOut.toString()).toBe('129505.55');
    expect(report.breaks).toHaveLength(8);

    const after = open(file);
    expect(await after.report()).toEqual(report);
    const again = await ingestAll(after);
    expect(Object.values(again).map((s) => s.stored)).toEqual([0, 0, 0, 0]);
    expect(await after.report()).toEqual(report);
  });
});
