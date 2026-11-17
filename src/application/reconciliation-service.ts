import { FEEDS, FeedKeys, FeedName, FeedRecords } from './feeds';
import { Delivery, DeliveryRepository } from './ports';
import { reconcile, ReconcileConfig, ReconcileResult } from './reconcile';

export interface IngestSummary {
  received: number;
  /** Deliveries added to the log. */
  stored: number;
  /** Deliveries identical to one from an earlier batch: nothing to do. */
  ignored: number;
}

/**
 * Deliveries to add for an incoming batch. One that is identical (same id, same content) to a delivery from an
 * earlier batch is a retry and is dropped, so sending the same data again changes nothing. Repeats inside the
 * batch itself are kept, so they can be reported, and so are deliveries whose content differs (conflicts).
 */
export function newDeliveries<F extends FeedName>(
  feed: F,
  existing: Array<Delivery<FeedRecords[F]>>,
  incoming: Array<FeedRecords[F]>,
  batch: number,
): Array<Delivery<FeedRecords[F]>> {
  const { idOf, fingerprint } = FEEDS[feed] as FeedKeys<FeedRecords[F]>;
  const keyOf = (record: FeedRecords[F]): string => `${idOf(record)}\u0000${fingerprint(record)}`;
  const alreadyStored = new Set(existing.map((d) => keyOf(d.record)));
  return incoming.filter((record) => !alreadyStored.has(keyOf(record))).map((record) => ({ record, batch }));
}

/** Application service: keeps what was delivered and answers reports about it. Knows nothing about HTTP or storage. */
export class ReconciliationService {
  constructor(
    private readonly repository: DeliveryRepository,
    private readonly config: ReconcileConfig,
  ) {}

  async ingest<F extends FeedName>(feed: F, records: Array<FeedRecords[F]>): Promise<IngestSummary> {
    const existing = await this.repository.list(feed);
    const batch = existing.reduce((latest, d) => Math.max(latest, d.batch), 0) + 1;
    const fresh = newDeliveries(feed, existing, records, batch);
    await this.repository.append(feed, fresh);
    return { received: records.length, stored: fresh.length, ignored: records.length - fresh.length };
  }

  /** The reconciliation as of `cutoff` (default: the configured one), rebuilt from everything delivered so far. */
  async report(cutoff: string = this.config.cutoff): Promise<ReconcileResult> {
    const records = async <F extends FeedName>(feed: F): Promise<Array<FeedRecords[F]>> =>
      (await this.repository.list(feed)).map((d) => d.record);
    return reconcile(
      {
        deposits: await records('deposits'),
        fundingEvents: await records('fundingEvents'),
        payoutEvents: await records('payoutEvents'),
        rates: await records('rates'),
      },
      { ...this.config, cutoff },
    );
  }
}
