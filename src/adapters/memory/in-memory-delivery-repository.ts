import { FeedName, FeedRecords } from '../../application/feeds';
import { Delivery, DeliveryRepository } from '../../application/ports';

/** Delivery log kept in process memory. Used by tests and as the default when no database is configured. */
export class InMemoryDeliveryRepository implements DeliveryRepository {
  private readonly logs = new Map<FeedName, Array<Delivery<unknown>>>();

  async list<F extends FeedName>(feed: F): Promise<Array<Delivery<FeedRecords[F]>>> {
    return [...(this.logs.get(feed) ?? [])] as Array<Delivery<FeedRecords[F]>>;
  }

  async append<F extends FeedName>(feed: F, deliveries: Array<Delivery<FeedRecords[F]>>): Promise<void> {
    this.logs.set(feed, [...(this.logs.get(feed) ?? []), ...deliveries]);
  }

  async close(): Promise<void> {
    // nothing to release
  }
}
