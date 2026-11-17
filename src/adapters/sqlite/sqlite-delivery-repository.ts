import Database from 'better-sqlite3';
import { FeedName, FeedRecords } from '../../application/feeds';
import { Delivery, DeliveryRepository } from '../../application/ports';
import { CODECS, Codec } from './codecs';

/** Delivery log in SQLite: one append-only table, rows in arrival order. `':memory:'` gives a throwaway database. */
export class SqliteDeliveryRepository implements DeliveryRepository {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS deliveries (
        seq    INTEGER PRIMARY KEY AUTOINCREMENT,
        feed   TEXT    NOT NULL,
        batch  INTEGER NOT NULL,
        record TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS deliveries_by_feed ON deliveries (feed, seq);
    `);
  }

  async list<F extends FeedName>(feed: F): Promise<Array<Delivery<FeedRecords[F]>>> {
    const codec = CODECS[feed] as Codec<FeedRecords[F]>;
    const rows = this.db.prepare('SELECT batch, record FROM deliveries WHERE feed = ? ORDER BY seq').all(feed) as Array<{ batch: number; record: string }>;
    return rows.map((row) => ({ batch: row.batch, record: codec.decode(JSON.parse(row.record)) }));
  }

  async append<F extends FeedName>(feed: F, deliveries: Array<Delivery<FeedRecords[F]>>): Promise<void> {
    const codec = CODECS[feed] as Codec<FeedRecords[F]>;
    const insert = this.db.prepare('INSERT INTO deliveries (feed, batch, record) VALUES (?, ?, ?)');
    // One transaction: if any delivery cannot be encoded or written, none of them is stored.
    this.db.transaction(() => {
      for (const { batch, record } of deliveries) insert.run(feed, batch, JSON.stringify(codec.encode(record)));
    })();
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
