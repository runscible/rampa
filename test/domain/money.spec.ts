import { D } from '../../src/domain/shared/decimal';
import { Money } from '../../src/domain/shared/money';

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

  describe('convertAt', () => {
    const rate = (text: string) => new D(text);

    it('converts to another currency at a rate, with 2 decimals', () => {
      const bs = Money.parse('USDT', '2500.00').convertAt('BS', rate('9.7606'));
      expect(bs.currency).toBe('BS');
      expect(bs.toString()).toBe('24401.50');
    });

    it('rounds half up to 2 decimals', () => {
      expect(Money.parse('USDT', '0.01').convertAt('BS', rate('9.9999')).toString()).toBe('0.10');
      expect(Money.parse('USDT', '100.00').convertAt('BS', rate('9.99995')).toString()).toBe('1000.00');
    });
  });

  it('abs() drops the sign', () => {
    expect(Money.parse('BS', '-2480.55').abs().toString()).toBe('2480.55');
    expect(Money.parse('BS', '3.00').abs().toString()).toBe('3.00');
  });

  it('isGreaterThan compares amounts of the same currency', () => {
    const one = Money.parse('BS', '0.01');
    expect(Money.parse('BS', '0.02').isGreaterThan(one)).toBe(true);
    expect(one.isGreaterThan(one)).toBe(false);
    expect(() => one.isGreaterThan(Money.parse('USDT', '0.01'))).toThrow(/currency/i);
  });
});
