import { FeedName, FeedRecords } from './feeds';

/** A record as it arrived, tagged with the ingestion call (batch) that brought it. */
export interface Delivery<T> {
  record: T;
  batch: number;
}

/**
 * Where deliveries are kept: an append-only log per feed. The use cases never rewrite or delete history,
 * so every report can be rebuilt from it.
 */
export interface DeliveryRepository {
  /** Every delivery of the feed, in arrival order. */
  list<F extends FeedName>(feed: F): Promise<Array<Delivery<FeedRecords[F]>>>;
  /** Adds deliveries after the existing ones, keeping their order. */
  append<F extends FeedName>(feed: F, deliveries: Array<Delivery<FeedRecords[F]>>): Promise<void>;
}
