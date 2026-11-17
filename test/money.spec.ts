import { Money } from '../src/money/money';

describe('Money', () => {
  it('parses a decimal string and prints with 2 decimals', () => {
    expect(Money.parse('USDT', '5000.00').toString()).toBe('5000.00');
    expect(Money.parse('BS', '48972.5').toString()).toBe('48972.50');
  });

  it('parses a JSON number without float noise', () => {
    expect(Money.parse('BS', 31515.05).toString()).toBe('31515.05');
  });

  it('rejects more than 2 decimals instead of silently rounding', () => {
    expect(() => Money.parse('BS', '1.005')).toThrow(RangeError);
  });

  it.each(['', 'abc', 'NaN', 'Infinity'])('rejects invalid amount %p', (bad) => {
    expect(() => Money.parse('BS', bad)).toThrow();
  });

  it('adds exactly (0.1 + 0.2 = 0.30)', () => {
    const sum = Money.parse('USDT', '0.10').plus(Money.parse('USDT', '0.20'));
    expect(sum.toString()).toBe('0.30');
  });

  it('subtracts, negates and detects sign/zero', () => {
    const a = Money.parse('BS', '10.00');
    const b = Money.parse('BS', '12.50');
    expect(a.minus(b).toString()).toBe('-2.50');
    expect(a.minus(b).isNegative()).toBe(true);
    expect(a.negate().toString()).toBe('-10.00');
    expect(a.minus(a).isZero()).toBe(true);
  });

  it('refuses to mix currencies', () => {
    expect(() => Money.parse('USDT', '1').plus(Money.parse('BS', '1'))).toThrow(/currency/i);
  });

  it('compares by currency and amount', () => {
    expect(Money.parse('BS', '1.0').equals(Money.parse('BS', '1.00'))).toBe(true);
    expect(Money.parse('BS', '1').equals(Money.parse('USDT', '1'))).toBe(false);
  });
});
