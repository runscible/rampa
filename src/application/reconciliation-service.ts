import { feedKeys, FeedName, FeedRecords } from './feeds';
import { Delivery, DeliveryRepository } from './ports';
import { reconcile, ReconcileConfig, ReconcileResult } from './reconcile';

export interface IngestSummary {
  received: number;
  /** Deliveries added to the log. */
  stored: number;
  /** Deliveries identical to one from an earlier batch: nothing to do. */
  ignored: number;
}

/** A reconciliation plus the version of the data it was computed from. */
export type Report = ReconcileResult & {
  /**
   * How many deliveries are stored, whatever the cutoff. It grows with every new delivery and does not move when the
   * same data is sent again, so the same version and cutoff always give the same answer.
   */
  version: number;
};

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
  const { idOf, fingerprint } = feedKeys(feed);
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

  /** Ingestions run one at a time: each one reads the log and then appends to it, so two at once would both miss the other. */
  private lastIngestion: Promise<unknown> = Promise.resolve();

  ingest<F extends FeedName>(feed: F, records: Array<FeedRecords[F]>): Promise<IngestSummary> {
    const run = this.lastIngestion.then(() => this.appendNewDeliveries(feed, records));
    this.lastIngestion = run.catch(() => undefined);
    return run;
  }

  private async appendNewDeliveries<F extends FeedName>(feed: F, records: Array<FeedRecords[F]>): Promise<IngestSummary> {
    const existing = await this.repository.list(feed);
    const batch = existing.reduce((latest, d) => Math.max(latest, d.batch), 0) + 1;
    const fresh = newDeliveries(feed, existing, records, batch);
    await this.repository.append(feed, fresh);
    return { received: records.length, stored: fresh.length, ignored: records.length - fresh.length };
  }

  /** The reconciliation as of `cutoff` (default: the configured one), rebuilt from everything delivered so far. */
  async report(cutoff: string = this.config.cutoff): Promise<Report> {
    const deposits = await this.repository.list('deposits');
    const fundingEvents = await this.repository.list('fundingEvents');
    const payoutEvents = await this.repository.list('payoutEvents');
    const rates = await this.repository.list('rates');
    const recordsOf = <T>(deliveries: Array<Delivery<T>>): T[] => deliveries.map((d) => d.record);

    const result = reconcile(
      { deposits: recordsOf(deposits), fundingEvents: recordsOf(fundingEvents), payoutEvents: recordsOf(payoutEvents), rates: recordsOf(rates) },
      { ...this.config, cutoff },
    );
    return { ...result, version: deposits.length + fundingEvents.length + payoutEvents.length + rates.length };
  }
}
