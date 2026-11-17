import { Money } from '../../src/domain/shared/money';
import { requireNonEmpty } from '../../src/domain/shared/validation';

describe('requireNonEmpty', () => {
  it('returns a non-empty value and throws naming the field when empty', () => {
    expect(requireNonEmpty('event_id', 'fw_1')).toBe('fw_1');
    expect(() => requireNonEmpty('event_id', '')).toThrow('event_id is empty');
  });
});

describe('Money.requirePositive', () => {
  it('returns the same amount when positive', () => {
    const m = Money.parse('BS', '1.00');
    expect(m.requirePositive('amount_bs')).toBe(m);
  });

  it.each(['0', '-1.00'])('throws naming the field for %s', (value) => {
    expect(() => Money.parse('BS', value).requirePositive('amount_bs')).toThrow('amount_bs must be positive');
  });
});
