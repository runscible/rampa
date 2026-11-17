/** Returns the value, or throws a readable error when it is empty. `label` is the source field name. */
export function requireNonEmpty(label: string, value: string): string {
  if (value === '') throw new TypeError(`${label} is empty`);
  return value;
}
