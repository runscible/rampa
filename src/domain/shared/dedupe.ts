export interface DedupeResult<T> {
  /** First occurrence of each id, in input order. */
  unique: T[];
  /** Later occurrences with the same id and identical content (safe to ignore). */
  duplicates: T[];
  /** Later occurrences with the same id but different content (needs human review). */
  conflicts: T[];
}

/** Idempotent ingestion rule: the first event for an id wins; repeats are classified, never applied. */
export function dedupeById<T>(items: T[], idOf: (item: T) => string, fingerprint: (item: T) => string): DedupeResult<T> {
  const firstSeen = new Map<string, string>();
  const result: DedupeResult<T> = { unique: [], duplicates: [], conflicts: [] };
  for (const item of items) {
    const id = idOf(item);
    const known = firstSeen.get(id);
    if (known === undefined) {
      firstSeen.set(id, fingerprint(item));
      result.unique.push(item);
    } else if (known === fingerprint(item)) {
      result.duplicates.push(item);
    } else {
      result.conflicts.push(item);
    }
  }
  return result;
}
