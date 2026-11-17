import { Delivery, DeliveryRepository } from '../../src/application/ports';
import { dep, rate } from './builders';

/** Behaviour every DeliveryRepository must have. Run it against each implementation. */
export function describeDeliveryRepositoryContract(name: string, create: () => DeliveryRepository | Promise<DeliveryRepository>): void {
  describe(`${name} (DeliveryRepository contract)`, () => {
    const d1 = dep('0x1', '10.00', '09:00');
    const d2 = dep('0x2', '20.00', '10:00');
    const d3 = dep('0x3', '30.00', '11:00');
    const ids = (deliveries: Array<Delivery<{ txHash: string }>>) => deliveries.map((d) => d.record.txHash);

    it('starts empty', async () => {
      expect(await (await create()).list('deposits')).toEqual([]);
    });

    it('returns deliveries in arrival order, across appends, with their batch', async () => {
      const repo = await create();
      await repo.append('deposits', [{ record: d1, batch: 1 }, { record: d2, batch: 1 }]);
      await repo.append('deposits', [{ record: d3, batch: 2 }]);
      const list = await repo.list('deposits');
      expect(ids(list)).toEqual(['0x1', '0x2', '0x3']);
      expect(list.map((d) => d.batch)).toEqual([1, 1, 2]);
    });

    it('keeps feeds independent', async () => {
      const repo = await create();
      await repo.append('deposits', [{ record: d1, batch: 1 }]);
      await repo.append('rates', [{ record: rate('07:00', '9.8467'), batch: 1 }]);
      expect(await repo.list('deposits')).toHaveLength(1);
      expect(await repo.list('rates')).toHaveLength(1);
      expect(await repo.list('payoutEvents')).toEqual([]);
    });

    it('restores records that behave like the originals', async () => {
      const repo = await create();
      await repo.append('deposits', [{ record: d1, batch: 1 }]);
      const [stored] = await repo.list('deposits');
      expect(stored.record.amount.equals(d1.amount)).toBe(true);
      expect(stored.record.at.getTime()).toBe(d1.at.getTime());
    });

    it('does not expose its internal state: changing a result changes nothing', async () => {
      const repo = await create();
      await repo.append('deposits', [{ record: d1, batch: 1 }]);
      (await repo.list('deposits')).pop();
      expect(await repo.list('deposits')).toHaveLength(1);
    });
  });
}
