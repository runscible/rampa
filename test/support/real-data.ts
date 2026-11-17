import { parseDeposits } from '../../src/adapters/files/parse-deposits';
import { parseFundingEvents } from '../../src/adapters/files/parse-funding';
import { parsePayoutEvents } from '../../src/adapters/files/parse-payouts';
import { parseRates } from '../../src/adapters/files/parse-rates';
import { InMemoryDeliveryRepository } from '../../src/adapters/memory/in-memory-delivery-repository';
import { ReconcileResult } from '../../src/application/reconcile';
import { ReconciliationService } from '../../src/application/reconciliation-service';
import { readData } from './app';
import { CUTOFF } from './builders';

/** A service that already ingested the four provided files. */
export async function serviceWithRealData(): Promise<ReconciliationService> {
  const service = new ReconciliationService(new InMemoryDeliveryRepository(), { cutoff: CUTOFF });
  await service.ingest('deposits', parseDeposits(readData('usdt_deposits.csv')).records);
  await service.ingest('rates', parseRates(readData('reference_rates.csv')).records);
  await service.ingest('fundingEvents', parseFundingEvents(readData('funding_webhooks.json')).records);
  await service.ingest('payoutEvents', parsePayoutEvents(readData('payout_events.json')).records);
  return service;
}

/** The reconciliation of the four provided files as of the configured cutoff. */
export async function reconcileRealData(): Promise<ReconcileResult> {
  return (await serviceWithRealData()).report();
}
