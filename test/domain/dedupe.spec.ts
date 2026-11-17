import { dedupeById } from '../../src/domain/shared/dedupe';

interface Item {
  id: string;
  value: number;
}
const run = (items: Item[]) =>
  dedupeById(items, (i) => i.id, (i) => String(i.value));

describe('dedupeById', () => {
  it('keeps every item when ids are distinct', () => {
    const items = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }];
    expect(run(items)).toEqual({ unique: items, duplicates: [], conflicts: [] });
  });

  it('ignores a repeated id with identical content', () => {
    const result = run([{ id: 'a', value: 1 }, { id: 'a', value: 1 }]);
    expect(result.unique).toEqual([{ id: 'a', value: 1 }]);
    expect(result.duplicates).toEqual([{ id: 'a', value: 1 }]);
    expect(result.conflicts).toEqual([]);
  });

  it('keeps the first and reports a repeated id with different content as a conflict', () => {
    const result = run([{ id: 'a', value: 1 }, { id: 'a', value: 9 }]);
    expect(result.unique).toEqual([{ id: 'a', value: 1 }]);
    expect(result.conflicts).toEqual([{ id: 'a', value: 9 }]);
    expect(result.duplicates).toEqual([]);
  });
});
