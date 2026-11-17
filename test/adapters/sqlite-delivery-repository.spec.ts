import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteDeliveryRepository } from '../../src/adapters/sqlite/sqlite-delivery-repository';
import { FeedName, FeedRecords } from '../../src/application/feeds';
import { describeDeliveryRepositoryContract } from '../support/delivery-repository-contract';
import { dep, ev, fw, rate } from '../support/builders';

describeDeliveryRepositoryContract('SqliteDeliveryRepository', () => new SqliteDeliveryRepository(':memory:'));

describe('SqliteDeliveryRepository on a file', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'recon-db-'));
    file = join(dir, 'recon.sqlite');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps every feed across a restart, in order and with its batch', async () => {
    const first = new SqliteDeliveryRepository(file);
    await first.append('deposits', [{ record: dep('0x1', '10.00', '09:00'), batch: 1 }, { record: dep('0x2', '20.00', '10:00'), batch: 1 }]);
    await first.append('fundingEvents', [{ record: fw('fw_1', '0x1', 10, '9.8', 98, '09:05'), batch: 1 }]);
    await first.append('payoutEvents', [{ record: ev('pe_1', 'P1', 'PREVIEW', 50, '10:00'), batch: 1 }]);
    await first.append('rates', [{ record: rate('07:00', '9.8467'), batch: 1 }]);
    await first.append('deposits', [{ record: dep('0x3', '30.00', '11:00'), batch: 2 }]);
    await first.close();

    const second = new SqliteDeliveryRepository(file);
    expect((await second.list('deposits')).map((d) => [d.record.txHash, d.batch])).toEqual([['0x1', 1], ['0x2', 1], ['0x3', 2]]);
    const [funding] = await second.list('fundingEvents');
    expect(funding.record).toMatchObject({ eventId: 'fw_1', depositTxHash: '0x1' });
    expect(funding.record.rate.toString()).toBe('9.8');
    expect(funding.record.amountBs.toString()).toBe('98.00');
    expect((await second.list('payoutEvents'))[0].record).toMatchObject({ eventId: 'pe_1', type: 'PREVIEW' });
    expect((await second.list('rates'))[0].record.rate).toBe('9.8467');
    await second.close();
  });

  it('is all or nothing: a delivery that cannot be stored cancels the whole append', async () => {
    const repo = new SqliteDeliveryRepository(file);
    const broken = { record: null as unknown as FeedRecords[FeedName], batch: 1 };
    await expect(repo.append('deposits', [{ record: dep('0x1', '10.00', '09:00'), batch: 1 }, broken as never])).rejects.toThrow();
    expect(await repo.list('deposits')).toEqual([]);
    await repo.close();
  });

  it('can be opened twice on the same file (second open sees the schema already there)', async () => {
    await new SqliteDeliveryRepository(file).close();
    const again = new SqliteDeliveryRepository(file);
    expect(await again.list('deposits')).toEqual([]);
    await again.close();
  });
});
