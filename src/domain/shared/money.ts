import { D } from './decimal';

export type Currency = 'USDT' | 'BS';

/** Both currencies are kept with 2 decimals. Rates use their own, wider scale (see RateTable). */
const SCALE = 2;

/** Validation rules applied in order to a parsed amount; the first one that fails produces the error. */
const AMOUNT_RULES: Array<{ fails: (value: D) => boolean; error: (text: string, original: string | number) => Error }> = [
  { fails: (v) => !v.isFinite(), error: (_, o) => new TypeError(`Invalid amount: ${JSON.stringify(o)}`) },
  { fails: (v) => v.decimalPlaces() > SCALE, error: (t) => new RangeError(`Amount ${t} has more than ${SCALE} decimals`) },
];

/** Immutable amount in a single currency. Exact decimal arithmetic, never floats. */
export class Money {
  private constructor(
    readonly currency: Currency,
    private readonly value: D,
  ) {}

  /**
   * Parses an amount from a string or a JSON number. Throws on invalid input and on more than
   * 2 decimals: silently rounding input would hide data problems.
   */
  static parse(currency: Currency, input: string | number): Money {
    const text = typeof input === 'number' ? String(input) : input.trim();
    if (text === '') throw new TypeError('Amount is empty');
    let value: D;
    try {
      value = new D(text);
    } catch {
      throw new TypeError(`Invalid amount: ${JSON.stringify(input)}`);
    }
    const broken = AMOUNT_RULES.find((rule) => rule.fails(value));
    if (broken) throw broken.error(text, input);
    return new Money(currency, value);
  }

  static zero(currency: Currency): Money {
    return new Money(currency, new D(0));
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.currency, this.value.plus(other.value));
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.currency, this.value.minus(other.value));
  }

  negate(): Money {
    return new Money(this.currency, this.value.negated());
  }

  /** This amount expressed in another currency at `rate` (units of the other currency per unit of this one), rounded half up to 2 decimals. */
  convertAt(currency: Currency, rate: D): Money {
    return new Money(currency, this.value.times(rate).toDecimalPlaces(SCALE, D.ROUND_HALF_UP));
  }

  abs(): Money {
    return new Money(this.currency, this.value.abs());
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.greaterThan(other.value);
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  /** Returns this amount, or throws naming the source field when it is zero or negative. */
  requirePositive(label: string): Money {
    if (this.isNegative() || this.isZero()) throw new RangeError(`${label} must be positive`);
    return this;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  toString(): string {
    return this.value.toFixed(SCALE);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new TypeError(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}
